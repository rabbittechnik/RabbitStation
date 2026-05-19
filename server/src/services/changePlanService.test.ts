import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { runSchema } from '../db/schema.js'
import { runSaasMigrations } from '../db/saasMigrations.js'
import { changeTenantPlan, ChangePlanError } from './changePlanService.js'
import { getTenantById } from './tenantService.js'

function seedTenantDb() {
  const db = new Database(':memory:')
  process.env.DEMO_SEED = 'false'
  runSchema(db)
  runSaasMigrations(db)
  return db
}

function insertStarterTrialTenant(db: Database.Database) {
  const tenantId = randomUUID()
  const userId = randomUUID()
  const trialStart = new Date()
  const trialEnd = new Date(trialStart)
  trialEnd.setDate(trialEnd.getDate() + 7)
  const ts = trialStart.toISOString()
  db.prepare(
    `INSERT INTO tenants (
      id, company_name, slug, plan, subscription_status,
      trial_start, trial_end, setup_completed, created_at, updated_at
    ) VALUES (?, 'Test GmbH', 'test-gmbh', 'starter', 'trial', ?, ?, 1, ?, ?)`,
  ).run(tenantId, ts, trialEnd.toISOString(), ts, ts)
  db.prepare(
    `INSERT INTO users (id, username, password_hash, role_id, tenant_id, active, created_at, updated_at)
     VALUES (?, 'owner@test.local', 'x', 'role-tenant-owner', ?, 1, ?, ?)`,
  ).run(userId, tenantId, ts, ts)
  return { tenantId, userId }
}

describe('changePlanService', () => {
  let db: Database.Database

  beforeEach(() => {
    db = seedTenantDb()
  })

  it('upgrades starter trial to pro on same tenant', () => {
    const { tenantId, userId } = insertStarterTrialTenant(db)
    const beforeUsers = db.prepare(`SELECT COUNT(*) as c FROM users`).get() as { c: number }
    const beforeTenants = db.prepare(`SELECT COUNT(*) as c FROM tenants`).get() as { c: number }

    const result = changeTenantPlan(db, userId, 'pro')
    assert.equal(result.changed, true)
    assert.equal(result.plan.planId, 'pro')

    const tenant = getTenantById(db, tenantId)!
    assert.equal(tenant.plan, 'pro')
    assert.equal(tenant.pro_trial_used, 1)
    assert.ok(tenant.pro_trial_started_at)

    const afterUsers = db.prepare(`SELECT COUNT(*) as c FROM users`).get() as { c: number }
    const afterTenants = db.prepare(`SELECT COUNT(*) as c FROM tenants`).get() as { c: number }
    assert.equal(afterUsers.c, beforeUsers.c)
    assert.equal(afterTenants.c, beforeTenants.c)

    const audit = db
      .prepare(`SELECT action, metadata_json FROM tenant_audit_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`)
      .get(tenantId) as { action: string; metadata_json: string }
    assert.equal(audit.action, 'subscription_plan_changed')
    const meta = JSON.parse(audit.metadata_json) as { oldPlan: string; newPlan: string; source: string }
    assert.equal(meta.oldPlan, 'starter')
    assert.equal(meta.newPlan, 'pro')
    assert.equal(meta.source, 'self_service_upgrade')
  })

  it('does not extend trial_end on repeated pro upgrade', () => {
    const { tenantId, userId } = insertStarterTrialTenant(db)
    changeTenantPlan(db, userId, 'pro')
    const afterFirst = getTenantById(db, tenantId)!
    const end1 = afterFirst.trial_end

    const second = changeTenantPlan(db, userId, 'pro')
    assert.equal(second.changed, false)
    const afterSecond = getTenantById(db, tenantId)!
    assert.equal(afterSecond.trial_end, end1)
  })

  it('blocks second pro trial after downgrade when pro_trial_used', () => {
    const { tenantId, userId } = insertStarterTrialTenant(db)
    changeTenantPlan(db, userId, 'pro')
    db.prepare(`UPDATE tenants SET plan = 'starter' WHERE id = ?`).run(tenantId)
    assert.throws(
      () => changeTenantPlan(db, userId, 'pro'),
      (e: unknown) => e instanceof ChangePlanError && e.code === 'trial_already_used',
    )
  })

  it('writes audit without secrets', () => {
    const { tenantId, userId } = insertStarterTrialTenant(db)
    changeTenantPlan(db, userId, 'pro')
    const row = db
      .prepare(`SELECT metadata_json FROM tenant_audit_logs WHERE tenant_id = ? LIMIT 1`)
      .get(tenantId) as { metadata_json: string }
    assert.ok(!row.metadata_json.includes('password'))
    assert.ok(!row.metadata_json.includes('SECRET'))
  })
})
