import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import pg from 'pg'
import type { WorkspaceData } from '../src/domain/types'
import { seedData } from '../src/data/seed'

export type WorkspaceRepository = {
  read: () => Promise<WorkspaceData>
  write: (workspace: WorkspaceData) => Promise<void>
  update: <T>(mutator: (workspace: WorkspaceData) => { workspace: WorkspaceData; result: T } | Promise<{ workspace: WorkspaceData; result: T }>) => Promise<T>
  reset: () => Promise<WorkspaceData>
}

const getDataPath = () => resolve(process.cwd(), process.env.WORKSPACE_DATA_PATH ?? 'data/workspace.json')
const normalizeWorkspace = (workspace: WorkspaceData): WorkspaceData => ({
  ...workspace,
  outboundMessages: workspace.outboundMessages ?? [],
  consentEvents: workspace.consentEvents ?? [],
  revenueRecoveryLinks: workspace.revenueRecoveryLinks ?? [],
  subscriptions: workspace.subscriptions ?? [],
  revenuePayments: workspace.revenuePayments ?? [],
  onboarding: workspace.onboarding ?? [],
  onboardingSubmissions: workspace.onboardingSubmissions ?? [],
  pilotOutcomes: workspace.pilotOutcomes ?? [],
  salesProspects: workspace.salesProspects ?? [],
  salesOutreachPacks: workspace.salesOutreachPacks ?? [],
  salesCheckoutHandoffs: workspace.salesCheckoutHandoffs ?? [],
  salesActivities: workspace.salesActivities ?? [],
})

export class JsonWorkspaceRepository implements WorkspaceRepository {
  private readonly dataPath: string
  private updateQueue = Promise.resolve()

  constructor(dataPath = getDataPath()) {
    this.dataPath = dataPath
  }

  async read() {
    return readJsonWorkspace(this.dataPath)
  }

  async write(workspace: WorkspaceData) {
    writeJsonWorkspace(normalizeWorkspace(workspace), this.dataPath)
  }

  async update<T>(mutator: (workspace: WorkspaceData) => { workspace: WorkspaceData; result: T } | Promise<{ workspace: WorkspaceData; result: T }>) {
    const run = this.updateQueue.then(async () => {
      const current = readJsonWorkspace(this.dataPath)
      const update = await mutator(current)
      const nextWorkspace = normalizeWorkspace(update.workspace)
      writeJsonWorkspace(nextWorkspace, this.dataPath)
      return update.result
    })
    this.updateQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async reset() {
    await this.write(seedData)
    return seedData
  }
}

export class PostgresWorkspaceRepository implements WorkspaceRepository {
  private readonly pool: pg.Pool
  private readonly workspaceId: string

  constructor(connectionString = process.env.DATABASE_URL, workspaceId = process.env.WORKSPACE_ID ?? 'local-growth-os') {
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for PostgresWorkspaceRepository.')
    }

    this.pool = new pg.Pool({ connectionString })
    this.workspaceId = workspaceId
  }

  async read() {
    await this.ensureSchema()
    const result = await this.pool.query<{ data: WorkspaceData }>('select data from workspaces where id = $1', [this.workspaceId])
    if (!result.rows[0]) {
      await this.write(seedData)
      return seedData
    }

    return normalizeWorkspace(result.rows[0].data)
  }

  async write(workspace: WorkspaceData) {
    await this.ensureSchema()
    await this.pool.query(
      `insert into workspaces (id, organization_id, data, updated_at)
       values ($1, $2, $3::jsonb, now())
       on conflict (id)
       do update set organization_id = excluded.organization_id, data = excluded.data, updated_at = now()`,
      [this.workspaceId, workspace.business.id, JSON.stringify(normalizeWorkspace(workspace))],
    )
  }

  async update<T>(mutator: (workspace: WorkspaceData) => { workspace: WorkspaceData; result: T } | Promise<{ workspace: WorkspaceData; result: T }>) {
    await this.ensureSchema()
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      await client.query(
        `insert into workspaces (id, organization_id, data, updated_at)
         values ($1, $2, $3::jsonb, now())
         on conflict (id) do nothing`,
        [this.workspaceId, seedData.business.id, JSON.stringify(normalizeWorkspace(seedData))],
      )
      const result = await client.query<{ data: WorkspaceData }>('select data from workspaces where id = $1 for update', [this.workspaceId])
      const current = normalizeWorkspace(result.rows[0].data)
      const update = await mutator(current)
      const nextWorkspace = normalizeWorkspace(update.workspace)
      await client.query(
        `insert into workspaces (id, organization_id, data, updated_at)
         values ($1, $2, $3::jsonb, now())
         on conflict (id)
         do update set organization_id = excluded.organization_id, data = excluded.data, updated_at = now()`,
        [this.workspaceId, nextWorkspace.business.id, JSON.stringify(nextWorkspace)],
      )
      await client.query('commit')
      return update.result
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }

  async reset() {
    await this.write(seedData)
    return seedData
  }

  async close() {
    await this.pool.end()
  }

  private async ensureSchema() {
    await this.pool.query(`
      create table if not exists workspaces (
        id text primary key,
        organization_id text not null,
        data jsonb not null,
        updated_at timestamptz not null default now()
      );
      create index if not exists workspaces_organization_idx on workspaces (organization_id);
    `)
  }
}

export function createWorkspaceRepository(env = process.env): WorkspaceRepository {
  if (env.DATABASE_URL) {
    return new PostgresWorkspaceRepository(env.DATABASE_URL, env.WORKSPACE_ID)
  }

  return new JsonWorkspaceRepository(resolve(process.cwd(), env.WORKSPACE_DATA_PATH ?? 'data/workspace.json'))
}

export function readWorkspace(): WorkspaceData {
  return readJsonWorkspace(getDataPath())
}

export function writeWorkspace(data: WorkspaceData) {
  writeJsonWorkspace(normalizeWorkspace(data), getDataPath())
}

export function resetWorkspace() {
  writeWorkspace(seedData)
  return seedData
}

function readJsonWorkspace(dataPath: string): WorkspaceData {
  if (!existsSync(dataPath)) {
    writeJsonWorkspace(seedData, dataPath)
    return seedData
  }

  const workspace = JSON.parse(readFileSync(dataPath, 'utf8')) as WorkspaceData
  return normalizeWorkspace(workspace)
}

function writeJsonWorkspace(data: WorkspaceData, dataPath: string) {
  mkdirSync(dirname(dataPath), { recursive: true })
  writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}
