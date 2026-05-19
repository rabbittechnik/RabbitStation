import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { createApp } from '../app.js'
import { initDatabase, getDb } from '../db/database.js'
import { resetSmtpTransportCache } from '../services/smtpMailTransport.js'
import { DEMO_TENANT_ID } from '../db/saasMigrations.js'

let server: Server
let base = ''
const CC = 'test-cc-resend-welcome'

describe('platform admin resend welcome email API', () => {
  const envBackup = { ...process.env }

  before(async () => {
    process.env.CONTROL_CENTER_API_TOKEN = CC
    initDatabase()
    const app = createApp()
    server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    base = `http://127.0.0.1:${port}`
  })

  after(async () => {
    process.env = { ...envBackup }
    resetSmtpTransportCache()
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
  })

  it('POST without token returns 401 JSON', async () => {
    const res = await fetch(`${base}/api/admin/tenants/x/users/y/resend-welcome-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(res.status, 401)
    const body = (await res.json()) as { ok: boolean }
    assert.equal(body.ok, false)
    assert.match(res.headers.get('content-type') ?? '', /json/i)
  })

  it('returns 404 for unknown tenant', async () => {
    const res = await fetch(`${base}/api/admin/tenants/unknown-tenant/users/u1/resend-welcome-email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CC}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Test' }),
    })
    const body = (await res.json()) as { ok: boolean; error?: string }
    assert.equal(res.status, 404)
    assert.equal(body.ok, false)
    assert.equal(body.error, 'tenant_not_found')
  })

  it('returns smtp_not_available when SMTP not configured', async () => {
    delete process.env.SMTP_HOST
    resetSmtpTransportCache()
    const db = getDb()
    const user = db
      .prepare(`SELECT id FROM users WHERE tenant_id = ? LIMIT 1`)
      .get(DEMO_TENANT_ID) as { id: string } | undefined
    assert.ok(user?.id)
    const res = await fetch(
      `${base}/api/admin/tenants/${DEMO_TENANT_ID}/users/${user!.id}/resend-welcome-email`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CC}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Manuell aus Control Center erneut gesendet' }),
      },
    )
    const body = (await res.json()) as { ok: boolean; error?: string; message?: string }
    assert.equal(res.status, 502)
    assert.equal(body.ok, false)
    assert.equal(body.error, 'smtp_not_available')
    assert.match(body.message ?? '', /SMTP/)
  })
})
