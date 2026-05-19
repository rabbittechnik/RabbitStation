import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createApp } from '../app.js'
import { initDatabase, getDb } from '../db/database.js'
import { appendTenantAudit } from '../services/tenantAuditService.js'

let server: Server
let base = ''
let seededUserEmail = ''
const CC = 'test-cc-admin-logs'

describe('platform admin logs API', () => {
  const envBackup = { ...process.env }

  before(async () => {
    process.env.CONTROL_CENTER_API_TOKEN = CC
    initDatabase()
    const db = getDb()
    const tenantId = randomUUID()
    const userId = randomUUID()
    const slug = `rabbit-technik-${tenantId.slice(0, 8)}`
    seededUserEmail = `rabbit.technik+${tenantId.slice(0, 8)}@test.local`
    const email = seededUserEmail
    const ts = new Date().toISOString()
    db.prepare(
      `INSERT INTO tenants (id, company_name, slug, plan, subscription_status, trial_start, trial_end, setup_completed, created_at, updated_at)
       VALUES (?, 'Rabbit-Technik', ?, 'pro', 'trial', ?, ?, 0, ?, ?)`,
    ).run(tenantId, slug, ts, ts, ts, ts)
    db.prepare(
      `INSERT INTO users (id, username, display_name, email, password_hash, role_id, tenant_id, global_admin, active, created_at, updated_at)
       VALUES (?, ?, 'Mathias Eike Raselowski', ?, 'hash', 'role-admin', ?, 0, 1, ?, ?)`,
    ).run(userId, email, email, tenantId, ts, ts)
    appendTenantAudit(db, {
      tenantId,
      userId,
      action: 'registration_welcome_email_failed',
      entityType: 'user',
      entityId: userId,
      metadata: {
        tenantName: 'Rabbit-Technik',
        stationName: 'rabbit-technik',
        userName: 'Mathias Eike Raselowski',
        userEmail: email,
        recipientEmail: email,
        errorCode: 'smtp_timeout',
        safeMessage: 'SMTP Timeout',
        mailType: 'registration_welcome',
        mailStatus: 'failed',
      },
    })

    const app = createApp()
    server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    base = `http://127.0.0.1:${port}`
  })

  after(async () => {
    process.env = { ...envBackup }
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
  })

  it('GET /api/admin/logs without token returns 401', async () => {
    const res = await fetch(`${base}/api/admin/logs`)
    assert.equal(res.status, 401)
  })

  it('GET /api/admin/logs returns enriched user fields', async () => {
    const res = await fetch(`${base}/api/admin/logs?limit=20`, {
      headers: { Authorization: `Bearer ${CC}` },
    })
    assert.equal(res.status, 200)
    const body = (await res.json()) as {
      ok: boolean
      data: {
        logs: Array<{
          action: string
          userId: string | null
          user_id: string | null
          userName: string | null
          userEmail: string | null
          metadata_json: string | null
        }>
      }
    }
    assert.equal(body.ok, true)
    const failed = body.data.logs.find((l) => l.action === 'registration_welcome_email_failed')
    assert.ok(failed)
    assert.ok(failed.userId)
    assert.equal(failed.user_id, failed.userId)
    assert.equal(failed.userName, 'Mathias Eike Raselowski')
    assert.equal(failed.userEmail, seededUserEmail)
    assert.ok(failed.metadata_json?.includes(seededUserEmail))
    assert.ok(!failed.metadata_json?.includes('hash'))
  })
})
