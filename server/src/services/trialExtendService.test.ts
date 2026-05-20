import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { runSchema } from '../db/schema.js'
import { runSaasMigrations } from '../db/saasMigrations.js'
import { extendTenantTrial, isTrialExpiredByDate } from './trialExtendService.js'
import { getSubscriptionWriteState } from './subscriptionService.js'
import { adminTenantToApi, getTenantById } from './tenantService.js'

const ACTOR = {
  isSuperAdmin: false,
  extendedByUserId: null,
  extendedByEmail: 'admin@test.local',
  source: 'control_center' as const,
}

function seedDb() {
  const db = new Database(':memory:')
  runSchema(db)
  runSaasMigrations(db)
  return db
}

function insertTrialTenant(
  db: Database.Database,
  opts: {
    status?: string
    trialEnd: string
    plan?: string
    cancelledAt?: string | null
  },
) {
  const id = `tenant-trial-test-${randomUUID().slice(0, 8)}`
  const ts = new Date().toISOString()
  db.prepare(
    `INSERT INTO tenants (
      id, company_name, slug, plan, subscription_status, trial_start, trial_end,
      cancelled_at, setup_completed, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(
    id,
    'Trial Test GmbH',
    `trial-test-${id.slice(-6)}`,
    opts.plan ?? 'rabbitstation_starter',
    opts.status ?? 'trial',
    ts,
    opts.trialEnd,
    opts.cancelledAt ?? null,
    ts,
    ts,
  )
  return id
}

describe('trialExtendService', () => {
  let db: Database.Database

  beforeEach(() => {
    db = seedDb()
  })

  it('extends active trial by 7 days from max(trial_end, now)', () => {
    const future = new Date(Date.now() + 3 * 86400000).toISOString()
    const tenantId = insertTrialTenant(db, { trialEnd: future })
    const before = getTenantById(db, tenantId)!
    const result = extendTenantTrial(db, tenantId, { days: 7, reason: 'Beratung' }, ACTOR)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.data.daysAdded, 7)
    const after = getTenantById(db, tenantId)!
    assert.equal(after.subscription_status, 'trial')
    assert.equal(after.plan, before.plan)
    const oldEnd = new Date(before.trial_end!).getTime()
    const newEnd = new Date(after.trial_end!).getTime()
    assert.ok(newEnd >= oldEnd + 6 * 86400000)
    assert.equal(after.trial_extended_count, 1)
  })

  it('reactivates expired trial and restores write access', () => {
    const past = new Date(Date.now() - 2 * 86400000).toISOString()
    const tenantId = insertTrialTenant(db, { trialEnd: past })
    const before = getTenantById(db, tenantId)!
    assert.equal(isTrialExpiredByDate(before), true)
    assert.equal(getSubscriptionWriteState(before).canWrite, false)
    const result = extendTenantTrial(
      db,
      tenantId,
      { days: 7, reason: 'Nach Ablauf verlängert' },
      ACTOR,
    )
    assert.equal(result.ok, true)
    const after = getTenantById(db, tenantId)!
    assert.equal(after.subscription_status, 'trial')
    assert.equal(getSubscriptionWriteState(after).canWrite, true)
    assert.ok(new Date(after.trial_end!).getTime() > Date.now())
  })

  it('rejects active subscription', () => {
    const tenantId = insertTrialTenant(db, {
      status: 'active',
      trialEnd: new Date(Date.now() + 86400000).toISOString(),
    })
    const result = extendTenantTrial(db, tenantId, { days: 7, reason: 'Test' }, ACTOR)
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.error, 'tenant_already_active')
  })

  it('rejects invalid days', () => {
    const tenantId = insertTrialTenant(db, {
      trialEnd: new Date(Date.now() + 86400000).toISOString(),
    })
    for (const days of [0, 31, 1.5]) {
      const result = extendTenantTrial(db, tenantId, { days, reason: 'x' }, ACTOR)
      assert.equal(result.ok, false)
      if (result.ok) continue
      assert.equal(result.error, 'invalid_days')
    }
  })

  it('rejects missing reason', () => {
    const tenantId = insertTrialTenant(db, {
      trialEnd: new Date(Date.now() + 86400000).toISOString(),
    })
    const result = extendTenantTrial(db, tenantId, { days: 7, reason: '  ' }, ACTOR)
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.error, 'reason_required')
  })

  it('exposes extended trial in admin tenant list shape', () => {
    const trialEnd = new Date(Date.now() + 86400000).toISOString()
    const tenantId = insertTrialTenant(db, { trialEnd })
    const result = extendTenantTrial(db, tenantId, { days: 5, reason: 'Liste' }, ACTOR)
    assert.equal(result.ok, true)
    const row = db
      .prepare(
        `SELECT t.*,
          (SELECT COUNT(*) FROM stations s WHERE s.tenant_id = t.id) as station_count,
          (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) as user_count,
          (SELECT COUNT(*) FROM employees e
             INNER JOIN stations s ON s.id = e.station_id
             WHERE s.tenant_id = t.id AND (e.deleted_at IS NULL OR trim(e.deleted_at) = '')) as employee_count,
          (SELECT s.name FROM stations s WHERE s.tenant_id = t.id ORDER BY s.created_at ASC LIMIT 1) as primary_station_name
         FROM tenants t WHERE t.id = ?`,
      )
      .get(tenantId) as import('./tenantService.js').AdminTenantListRow
    const api = adminTenantToApi(row)
    assert.equal(api.tenantId, tenantId)
    assert.equal(api.trialExtendedCount, 1)
    assert.ok(api.remainingDays != null && api.remainingDays >= 5)
  })

  it('writes trial_extended audit without secrets', () => {
    const tenantId = insertTrialTenant(db, {
      trialEnd: new Date(Date.now() + 86400000).toISOString(),
    })
    extendTenantTrial(
      db,
      tenantId,
      { days: 3, reason: 'Audit test', note: 'Telefonat mit Team' },
      ACTOR,
    )
    const row = db
      .prepare(
        `SELECT action, metadata_json FROM tenant_audit_logs
         WHERE tenant_id = ? AND action = 'trial_extended' ORDER BY created_at DESC LIMIT 1`,
      )
      .get(tenantId) as { action: string; metadata_json: string }
    assert.equal(row.action, 'trial_extended')
    const meta = JSON.parse(row.metadata_json) as Record<string, unknown>
    assert.equal(meta.source, 'control_center')
    assert.equal(meta.reason, 'Audit test')
    const raw = JSON.stringify(meta).toLowerCase()
    assert.ok(!raw.includes('password'))
    assert.ok(!raw.includes('authorization'))
  })
})
