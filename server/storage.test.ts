import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data/seed'
import type { AuditLog } from '../src/domain/types'
import { createWorkspaceRepository, JsonWorkspaceRepository, PostgresWorkspaceRepository } from './storage'

describe('workspace repositories', () => {
  it('persists workspace state through the JSON repository', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'local-growth-os-'))
    const path = join(dir, 'workspace.json')
    const repo = new JsonWorkspaceRepository(path)

    const initial = await repo.read()
    expect(initial.business.id).toBe('org_evergreen')

    await repo.write({
      ...initial,
      business: { ...initial.business, name: 'Changed Business' },
      subscriptions: [
        {
          id: 'sub_local',
          organizationId: initial.business.id,
          product: 'bidflow',
          planId: 'bidflow-growth',
          stripeCustomerId: 'cus_local',
          stripeSubscriptionId: 'stripe_sub_local',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    })

    const changed = await repo.read()
    expect(changed.business.name).toBe('Changed Business')
    expect(changed.subscriptions).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it('selects Postgres repository when DATABASE_URL is present', () => {
    const repo = createWorkspaceRepository({ DATABASE_URL: 'postgres://user:pass@localhost:5432/db', WORKSPACE_ID: 'test' } as NodeJS.ProcessEnv)

    expect(repo).toBeInstanceOf(PostgresWorkspaceRepository)
  })

  it('selects JSON repository by default', () => {
    const repo = createWorkspaceRepository({ WORKSPACE_DATA_PATH: 'data/test-repo.json' } as NodeJS.ProcessEnv)

    expect(repo).toBeInstanceOf(JsonWorkspaceRepository)
  })

  it('serializes JSON repository updates without losing concurrent writes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'local-growth-os-update-'))
    const path = join(dir, 'workspace.json')
    const repo = new JsonWorkspaceRepository(path)
    const auditOne: AuditLog = {
      id: 'audit_update_one',
      actor: 'test',
      action: 'update_one',
      entityType: 'workspace',
      entityId: 'local-growth-os',
      summary: 'First concurrent update.',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const auditTwo: AuditLog = {
      id: 'audit_update_two',
      actor: 'test',
      action: 'update_two',
      entityType: 'workspace',
      entityId: 'local-growth-os',
      summary: 'Second concurrent update.',
      createdAt: '2026-01-01T00:00:01.000Z',
    }

    const results = await Promise.all([
      repo.update((workspace) => ({
        workspace: { ...workspace, auditLogs: [auditOne, ...workspace.auditLogs] },
        result: auditOne.id,
      })),
      repo.update((workspace) => ({
        workspace: { ...workspace, auditLogs: [auditTwo, ...workspace.auditLogs] },
        result: auditTwo.id,
      })),
    ])

    const changed = await repo.read()
    expect(results).toEqual(['audit_update_one', 'audit_update_two'])
    expect(changed.auditLogs.map((log) => log.id)).toEqual(expect.arrayContaining(['audit_update_one', 'audit_update_two']))
    rmSync(dir, { recursive: true, force: true })
  })

  it('requires a DATABASE_URL for direct Postgres construction', () => {
    expect(() => new PostgresWorkspaceRepository(undefined)).toThrow('DATABASE_URL')
  })

  it('resets repository state to seed data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'local-growth-os-reset-'))
    const path = join(dir, 'workspace.json')
    const repo = new JsonWorkspaceRepository(path)
    await repo.write({ ...seedData, business: { ...seedData.business, name: 'Temporary' } })

    const reset = await repo.reset()
    expect(reset.business.name).toBe(seedData.business.name)
    rmSync(dir, { recursive: true, force: true })
  })
})
