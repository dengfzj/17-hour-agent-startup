import type { RequestHandler } from 'express'
import { jwtVerify, importSPKI } from 'jose'
import type { WorkspaceData } from '../src/domain/types'

export type Role = 'owner' | 'admin' | 'manager' | 'staff'

export type Principal = {
  userId: string
  organizationId: string
  role: Role
}

export type Permission =
  | 'workspace:read'
  | 'workspace:write'
  | 'revenue_pack:create'
  | 'response_pack:create'
  | 'billing:manage'
  | 'message:send'

const rolePermissions: Record<Role, Permission[]> = {
  owner: [
    'workspace:read',
    'workspace:write',
    'revenue_pack:create',
    'response_pack:create',
    'billing:manage',
    'message:send',
  ],
  admin: ['workspace:read', 'workspace:write', 'revenue_pack:create', 'response_pack:create', 'billing:manage', 'message:send'],
  manager: ['workspace:read', 'workspace:write', 'revenue_pack:create', 'response_pack:create', 'message:send'],
  staff: ['workspace:read', 'revenue_pack:create', 'response_pack:create'],
}

function isProduction(env = process.env) {
  return env.NODE_ENV === 'production'
}

function headerAuthAllowed(env = process.env) {
  return env.LOCAL_GROWTH_ALLOW_HEADER_AUTH === 'true' && !isProduction(env)
}

export function missingProductionJwtConfig(env = process.env) {
  if (!isProduction(env)) return []
  return ['JWT_PUBLIC_KEY', 'JWT_ISSUER', 'JWT_AUDIENCE'].filter((key) => !env[key]?.trim())
}

export function parsePrincipal(headers: {
  userId?: string | string[]
  organizationId?: string | string[]
  role?: string | string[]
}): Principal {
  const role = Array.isArray(headers.role) ? headers.role[0] : headers.role
  const normalizedRole = ['owner', 'admin', 'manager', 'staff'].includes(role ?? '') ? (role as Role) : 'owner'

  return {
    userId: String(Array.isArray(headers.userId) ? headers.userId[0] : headers.userId || 'local-owner'),
    organizationId: String(
      Array.isArray(headers.organizationId) ? headers.organizationId[0] : headers.organizationId || 'org_evergreen',
    ),
    role: normalizedRole,
  }
}

export async function verifyJwtPrincipal(token: string, env = process.env): Promise<Principal> {
  if (!env.JWT_PUBLIC_KEY) {
    throw new Error('JWT_PUBLIC_KEY is not configured.')
  }

  const publicKey = await importSPKI(env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n'), env.JWT_ALGORITHM ?? 'RS256')
  const result = await jwtVerify(token, publicKey, {
    issuer: env.JWT_ISSUER || undefined,
    audience: env.JWT_AUDIENCE || undefined,
  })
  const payload = result.payload
  const role = typeof payload.role === 'string' && ['owner', 'admin', 'manager', 'staff'].includes(payload.role) ? payload.role : 'staff'
  const organizationId =
    typeof payload.organization_id === 'string'
      ? payload.organization_id
      : typeof payload.org_id === 'string'
        ? payload.org_id
        : ''

  if (!organizationId) {
    throw new Error('JWT is missing organization_id.')
  }

  return {
    userId: typeof payload.sub === 'string' ? payload.sub : 'jwt-user',
    organizationId,
    role: role as Role,
  }
}

export function hasPermission(role: Role, permission: Permission) {
  return rolePermissions[role].includes(permission)
}

declare global {
  // Express request augmentation uses declaration merging.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: Principal
    }
  }
}

export const attachPrincipal: RequestHandler = async (request, response, next) => {
  const authHeader = request.header('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined
  const missingJwtConfig = missingProductionJwtConfig()

  if (missingJwtConfig.length > 0) {
    response.status(503).json({
      error: 'production_jwt_not_configured',
      message: 'Production API access requires JWT_PUBLIC_KEY, JWT_ISSUER, and JWT_AUDIENCE.',
      missing: missingJwtConfig,
    })
    return
  }

  if (process.env.JWT_PUBLIC_KEY) {
    if (!bearerToken) {
      response.status(401).json({ error: 'jwt_required', message: 'Bearer token required.' })
      return
    }

    try {
      request.principal = await verifyJwtPrincipal(bearerToken)
      next()
      return
    } catch {
      response.status(401).json({ error: 'jwt_invalid', message: 'Bearer token could not be verified.' })
      return
    }
  }

  if (!headerAuthAllowed()) {
    response.status(503).json({
      error: 'local_header_auth_disabled',
      message: 'Set LOCAL_GROWTH_ALLOW_HEADER_AUTH=true outside production, or configure JWT auth.',
    })
    return
  }

  request.principal = parsePrincipal({
    userId: request.header('x-user-id') ?? undefined,
    organizationId: request.header('x-organization-id') ?? undefined,
    role: request.header('x-user-role') ?? undefined,
  })
  next()
}

export function requirePermission(permission: Permission): RequestHandler {
  return (request, response, next) => {
    const principal = request.principal
    if (!principal || !hasPermission(principal.role, permission)) {
      response.status(403).json({ error: 'permission_denied', permission })
      return
    }

    next()
  }
}

export function assertOrganizationScope(principal: Principal | undefined, workspace: WorkspaceData) {
  return Boolean(principal && principal.organizationId === workspace.business.id)
}
