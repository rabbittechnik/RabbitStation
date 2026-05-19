import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { runSchema } from '../db/schema.js'
import { runSaasMigrations } from '../db/saasMigrations.js'
import { countWelcomeResendsLast24h, resendWelcomeEmail } from './resendWelcomeEmailService.js'
import { appendTenantAudit } from './tenantAuditService.js'
import { nowIso } from '../utils/timestamps.js'
import { resetSmtpTransportCache } from './smtpMailTransport.js'

function seedDb() {
  const db = new Database(':memory:')
  process.env.DEMO_SEED = 'false'
  runSchema(db)
  runSaasMigrations(db)
  return db
}

function insertTenantUser(db: Database.Database, opts?: { email?: string; tenantId?: string }) {
  const tenantId = opts?.tenantId ?? randomUUID()
  const userId = randomUUID()
  const ts = nowIso()
  const slug = `test-${tenantId.slice(0, 8)}`
  db.prepare(
    `INSERT INTO tenants (
      id, company_name, slug, plan, subscription_status,
      trial_start, trial_end, setup_completed, created_at, updated_at
    ) VALUES (?, 'Test GmbH', ?, 'starter', 'trial', ?, ?, 1, ?, ?)`,
  ).run(tenantId, slug, ts, ts, ts, ts)
  db.prepare(`INSERT INTO stations (id, name, tenant_id, active, created_at, updated_at)
    VALUES (?, 'Station Nord', ?, 1, ?, ?)`).run(randomUUID(), tenantId, ts, ts)
  const email = opts?.email ?? 'owner@test.local'
  db.prepare(
    `INSERT INTO users (id, username, email, password_hash, role_id, tenant_id, active, created_at, updated_at)
     VALUES (?, ?, ?, 'x', 'role-tenant-owner', ?, 1, ?, ?)`,
  ).run(userId, email, email, tenantId, ts, ts)
  return { tenantId, userId, email }
}

describe('resendWelcomeEmailService', () => {
  const envBackup = { ...process.env }

  beforeEach(() => {
    resetSmtpTransportCache()
    delete process.env.SMTP_HOST
  })

  afterEach(() => {
    process.env = { ...envBackup }
    resetSmtpTransportCache()
  })

  it('rejects unknown tenant', async () => {
    const db = seedDb()
    const { userId } = insertTenantUser(db)
    const result = await resendWelcomeEmail(db, {
      tenantId: randomUUID(),
      userId,
      triggeredBy: 'control_center',
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.error, 'tenant_not_found')
    }
  })

  it('rejects user from another tenant', async () => {
    const db = seedDb()
    const a = insertTenantUser(db)
    const b = insertTenantUser(db)
    const result = await resendWelcomeEmail(db, {
      tenantId: a.tenantId,
      userId: b.userId,
      triggeredBy: 'control_center',
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error, 'user_not_found')
  })

  it('rejects missing email', async () => {
    const db = seedDb()
    const { tenantId, userId } = insertTenantUser(db, { email: '' })
    db.prepare(`UPDATE users SET email = NULL, username = 'nouser' WHERE id = ?`).run(userId)
    const result = await resendWelcomeEmail(db, {
      tenantId,
      userId,
      triggeredBy: 'control_center',
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error, 'missing_email')
  })

  it('returns smtp_not_available without SMTP_HOST', async () => {
    const db = seedDb()
    const { tenantId, userId } = insertTenantUser(db)
    const result = await resendWelcomeEmail(db, {
      tenantId,
      userId,
      triggeredBy: 'control_center',
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error, 'smtp_not_available')
  })

  it('enforces rate limit of 3 resends per 24h', async () => {
    const db = seedDb()
    const { tenantId, userId, email } = insertTenantUser(db)
    const ts = nowIso()
    for (let i = 0; i < 3; i++) {
      appendTenantAudit(db, {
        tenantId,
        userId,
        action: 'registration_welcome_email_resent',
        entityType: 'user',
        entityId: userId,
        metadata: { userEmail: email, triggeredBy: 'control_center' },
      })
    }
    assert.equal(countWelcomeResendsLast24h(db, tenantId, userId), 3)
    const result = await resendWelcomeEmail(db, {
      tenantId,
      userId,
      triggeredBy: 'control_center',
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error, 'rate_limit')
  })

  it('audit metadata does not include secrets', async () => {
    const db = seedDb()
    const { tenantId, userId } = insertTenantUser(db)
    appendTenantAudit(db, {
      tenantId,
      userId,
      action: 'registration_welcome_email_resend_failed',
      metadata: {
        tenantId,
        userEmail: 'owner@test.local',
        errorCode: 'smtp_not_configured',
        safeMessage: 'SMTP fehlt',
        triggeredBy: 'control_center',
        reason: 'Test',
      },
    })
    const row = db
      .prepare(`SELECT metadata_json FROM tenant_audit_logs WHERE tenant_id = ? LIMIT 1`)
      .get(tenantId) as { metadata_json: string }
    const meta = row.metadata_json.toLowerCase()
    assert.ok(!meta.includes('password'))
    assert.ok(!meta.includes('smtp_pass'))
  })
})
