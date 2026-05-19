import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { createApp } from '../app.js'
import { initDatabase } from '../db/database.js'
import { resetSmtpTransportCache } from '../services/smtpMailTransport.js'

let server: Server
let base = ''

describe('platform admin mail test API', () => {
  const envBackup = { ...process.env }

  before(async () => {
    process.env.CONTROL_CENTER_API_TOKEN = 'test-cc-mail-token'
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

  it('POST /api/admin/mail/test without token returns 401', async () => {
    const res = await fetch(`${base}/api/admin/mail/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: 'info.neonlink@gmail.com' }),
    })
    assert.equal(res.status, 401)
  })

  it('POST /api/admin/mail/test without SMTP returns 502 with errorCode', async () => {
    delete process.env.SMTP_HOST
    resetSmtpTransportCache()
    const res = await fetch(`${base}/api/admin/mail/test`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-cc-mail-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: 'info.neonlink@gmail.com' }),
    })
    const body = (await res.json()) as {
      ok: boolean
      errorCode?: string
      safeMessage?: string
      message?: string
    }
    assert.equal(res.status, 502)
    assert.equal(body.ok, false)
    assert.equal(body.errorCode, 'smtp_not_configured')
    assert.ok(body.safeMessage)
    assert.match(body.message ?? '', /Testmail/)
    assert.equal(res.headers.get('content-type')?.includes('json'), true)
  })

  it('POST /api/admin/mail/test rejects invalid recipient', async () => {
    const res = await fetch(`${base}/api/admin/mail/test`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-cc-mail-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: 'invalid' }),
    })
    const body = (await res.json()) as { ok: boolean; errorCode?: string }
    assert.equal(res.status, 502)
    assert.equal(body.ok, false)
    assert.equal(body.errorCode, 'invalid_recipient')
  })

  it('GET /api/admin/health shows mail status with CC token', async () => {
    const res = await fetch(`${base}/api/admin/health`, {
      headers: { Authorization: 'Bearer test-cc-mail-token' },
    })
    const body = (await res.json()) as { ok: boolean; data: { mail: { status: string } } }
    assert.equal(res.status, 200)
    assert.equal(body.ok, true)
    assert.ok(body.data.mail.status === 'ok' || body.data.mail.status === 'warning')
  })
})
