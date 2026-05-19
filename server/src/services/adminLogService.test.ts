import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { initDatabase, getDb } from '../db/database.js'
import { appendTenantAudit } from './tenantAuditService.js'
import { listAdminLogs, mapAdminLogRow } from './adminLogService.js'

describe('adminLogService', () => {
  before(() => {
    initDatabase()
  })

  it('maps metadata user fields to API response and metadata_json', () => {
    const entry = mapAdminLogRow({
      id: 'log-1',
      tenant_id: 't1',
      user_id: 'u1',
      action: 'registration_welcome_email_failed',
      entity_type: 'user',
      entity_id: 'u1',
      metadata_json: JSON.stringify({
        recipientEmail: 'user@test.local',
        safeMessage: 'SMTP Timeout',
        errorCode: 'smtp_timeout',
        tenantName: 'Rabbit-Technik',
        stationName: 'rabbit-technik',
        userName: 'Mathias Test',
      }),
      created_at: new Date().toISOString(),
      user_display_name: null,
      user_email: null,
      user_username: null,
      user_role_key: null,
      tenant_company_name: 'Rabbit-Technik',
      tenant_slug: 'rabbit-technik',
      primary_station_name: 'rabbit-technik',
    })

    assert.equal(entry.userId, 'u1')
    assert.equal(entry.userEmail, 'user@test.local')
    assert.equal(entry.recipientEmail, 'user@test.local')
    assert.equal(entry.userName, 'Mathias Test')
    assert.equal(entry.stationName, 'rabbit-technik')
    assert.equal(entry.safeMessage, 'SMTP Timeout')
    assert.equal(entry.mailType, 'registration_welcome')
    assert.equal(entry.mailStatus, 'failed')
    assert.equal(entry.user_id, 'u1')
    assert.match(entry.metadata_json ?? '', /user@test\.local/)
  })

  it('joins user name and email when metadata is sparse', () => {
    const db = getDb()
    const tenantId = randomUUID()
    const userId = randomUUID()
    const slug = `join-gmbh-${tenantId.slice(0, 8)}`
    const email = `join+${tenantId.slice(0, 8)}@test.local`
    const ts = new Date().toISOString()

    db.prepare(
      `INSERT INTO tenants (id, company_name, slug, plan, subscription_status, trial_start, trial_end, setup_completed, created_at, updated_at)
       VALUES (?, 'Join GmbH', ?, 'starter', 'trial', ?, ?, 0, ?, ?)`,
    ).run(tenantId, slug, ts, ts, ts, ts)

    db.prepare(
      `INSERT INTO users (id, username, display_name, email, password_hash, role_id, tenant_id, global_admin, active, created_at, updated_at)
       VALUES (?, ?, 'Join User', ?, 'x', 'role-admin', ?, 0, 1, ?, ?)`,
    ).run(userId, email, email, tenantId, ts, ts)

    appendTenantAudit(db, {
      tenantId,
      userId,
      action: 'registration_welcome_email_failed',
      entityType: 'user',
      entityId: userId,
      metadata: { errorCode: 'smtp_timeout', safeMessage: 'Timeout' },
    })

    const logs = listAdminLogs(db, 5)
    const hit = logs.find((l) => l.userId === userId)
    assert.ok(hit)
    assert.equal(hit.userName, 'Join User')
    assert.equal(hit.userEmail, email)
    assert.equal(hit.tenantName, 'Join GmbH')
    assert.equal(hit.safeMessage, 'Timeout')
  })

  it('does not expose password fields from metadata', () => {
    const entry = mapAdminLogRow({
      id: 'log-2',
      tenant_id: null,
      user_id: null,
      action: 'login.failed',
      entity_type: null,
      entity_id: null,
      metadata_json: JSON.stringify({ password: 'secret', token: 'abc', safeMessage: 'ok' }),
      created_at: new Date().toISOString(),
      user_display_name: null,
      user_email: null,
      user_username: null,
      user_role_key: null,
      tenant_company_name: null,
      tenant_slug: null,
      primary_station_name: null,
    })
    assert.equal(entry.safeMessage, 'ok')
    assert.ok(!entry.metadata_json?.includes('secret'))
    assert.ok(!entry.metadata_json?.includes('abc'))
  })
})
