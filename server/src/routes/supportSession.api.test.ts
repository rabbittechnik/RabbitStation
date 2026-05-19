import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { createApp } from '../app.js'
import { initDatabase, getDb } from '../db/database.js'
import { hashSupportToken } from '../services/supportSessionService.js'
import { DEMO_TENANT_ID } from '../db/saasMigrations.js'
import { DEMO_ADMIN_PASSWORD_DEFAULT, DEMO_ADMIN_USERNAME } from '../constants/demo.js'

let server: Server
let base = ''
const CC = 'test-cc-support-token'

async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, rememberMe: false }),
  })
  const body = (await res.json()) as { ok: boolean; data?: { token: string } }
  assert.equal(res.status, 200)
  assert.equal(body.ok, true)
  return body.data!.token
}

async function startSession(
  auth: string,
  opts: { accessMode?: string; durationMinutes?: number; reason?: string } = {},
) {
  const res = await fetch(`${base}/api/admin/tenants/${DEMO_TENANT_ID}/support-sessions/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      reason: opts.reason ?? 'Test Support',
      accessMode: opts.accessMode ?? 'read_only',
      durationMinutes: opts.durationMinutes ?? 60,
    }),
  })
  const body = (await res.json()) as {
    ok: boolean
    supportSession?: { id: string; status: string }
    impersonationUrl?: string
  }
  return { res, body }
}

describe('support sessions API', () => {
  before(async () => {
    process.env.CONTROL_CENTER_API_TOKEN = CC
    process.env.PUBLIC_APP_URL = 'http://localhost:5173'
    initDatabase()
    const app = createApp()
    server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    base = `http://127.0.0.1:${port}`
  })

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
  })

  it('saas_owner can start support session via login token', async () => {
    const jwt = await login(DEMO_ADMIN_USERNAME, DEMO_ADMIN_PASSWORD_DEFAULT)
    const { res, body } = await startSession(jwt, { reason: 'Owner test' })
    assert.equal(res.status, 201)
    assert.equal(body.ok, true)
    assert.equal(body.supportSession?.status, 'active')
    assert.match(body.impersonationUrl ?? '', /\/support\/impersonate\?token=/)
  })

  it('normal tenant user cannot start support session', async () => {
    const jwt = await login('laura', DEMO_ADMIN_PASSWORD_DEFAULT)
    const { res, body } = await startSession(jwt)
    assert.equal(res.status, 403)
    assert.equal(body.ok, false)
  })

  it('Control Center token starts session and stores only token hash', async () => {
    const { res, body } = await startSession(CC)
    assert.equal(res.status, 201)
    const plain = new URL(body.impersonationUrl!).searchParams.get('token')
    assert.ok(plain && plain.length > 20)

    const db = getDb()
    const row = db
      .prepare(`SELECT token_hash FROM support_sessions WHERE id = ?`)
      .get(body.supportSession!.id) as { token_hash: string }
    assert.notEqual(row.token_hash, plain)
    assert.equal(row.token_hash, hashSupportToken(plain!))
  })

  it('lists support sessions as JSON', async () => {
    const res = await fetch(`${base}/api/admin/support-sessions`, {
      headers: { Authorization: `Bearer ${CC}`, Accept: 'application/json' },
    })
    const body = (await res.json()) as { ok: boolean; data: { sessions: unknown[] } }
    assert.equal(res.status, 200)
    assert.equal(body.ok, true)
    assert.ok(Array.isArray(body.data.sessions))
  })

  it('rejects invalid and expired impersonation tokens', async () => {
    const bad = await fetch(`${base}/api/support/impersonate?token=not-a-valid-token`)
    const badBody = (await bad.json()) as { ok: boolean }
    assert.equal(bad.status, 401)
    assert.equal(badBody.ok, false)

    const { body } = await startSession(CC, { reason: 'Expiry test', durationMinutes: 5 })
    const plain = new URL(body.impersonationUrl!).searchParams.get('token')!
    const db = getDb()
    db.prepare(`UPDATE support_sessions SET expires_at = ? WHERE id = ?`).run(
      '2000-01-01T00:00:00.000Z',
      body.supportSession!.id,
    )
    const expired = await fetch(`${base}/api/support/impersonate?token=${encodeURIComponent(plain)}`)
    assert.equal(expired.status, 401)
  })

  it('valid token exchanges for JWT with supportMode', async () => {
    const { body } = await startSession(CC, { reason: 'Impersonation' })
    const plain = new URL(body.impersonationUrl!).searchParams.get('token')!
    const ex = await fetch(`${base}/api/support/impersonate?token=${encodeURIComponent(plain)}`)
    const exBody = (await ex.json()) as {
      ok: boolean
      data: { token: string; supportMode: { sessionId: string } }
    }
    assert.equal(ex.status, 200)
    assert.equal(exBody.ok, true)
    assert.ok(exBody.data.token.length > 10)
    assert.ok(exBody.data.supportMode.sessionId)

    const me = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${exBody.data.token}` },
    })
    const meBody = (await me.json()) as { ok: boolean; data: { supportMode?: unknown; subscription?: { canWrite: boolean } } }
    assert.equal(me.status, 200)
    assert.ok(meBody.data.supportMode)
    assert.equal(meBody.data.subscription?.canWrite, false)
  })

  it('read_only blocks write requests in support mode', async () => {
    const { body } = await startSession(CC, { accessMode: 'read_only', reason: 'Read only' })
    const plain = new URL(body.impersonationUrl!).searchParams.get('token')!
    const ex = await fetch(`${base}/api/support/impersonate?token=${encodeURIComponent(plain)}`)
    const { token } = ((await ex.json()) as { data: { token: string } }).data

    const write = await fetch(`${base}/api/stations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Support Test Station' }),
    })
    const wBody = (await write.json()) as { code?: string }
    assert.equal(write.status, 403)
    assert.equal(wBody.code, 'support_read_only')
  })

  it('support_write audits write actions', async () => {
    const db = getDb()
    const station = db
      .prepare(`SELECT id FROM stations WHERE tenant_id = ? LIMIT 1`)
      .get(DEMO_TENANT_ID) as { id: string } | undefined
    assert.ok(station?.id, 'demo station required')

    const { body } = await startSession(CC, { accessMode: 'support_write', reason: 'Write audit' })
    const plain = new URL(body.impersonationUrl!).searchParams.get('token')!
    const ex = await fetch(`${base}/api/support/impersonate?token=${encodeURIComponent(plain)}`)
    const { token } = ((await ex.json()) as { data: { token: string } }).data

    const write = await fetch(`${base}/api/stations/${station.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notes: 'support-write-test' }),
    })
    const wBody = (await write.json()) as { code?: string; ok?: boolean }
    assert.notEqual(wBody.code, 'support_read_only')

    const audit = db
      .prepare(
        `SELECT action FROM tenant_audit_logs
         WHERE action = 'support_action_performed' AND entity_id = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(`/api/stations/${station.id}`) as { action: string } | undefined
    assert.equal(audit?.action, 'support_action_performed')
  })

  it('ends support session and writes audit log', async () => {
    const { body } = await startSession(CC, { reason: 'End test' })
    const sessionId = body.supportSession!.id
    const end = await fetch(`${base}/api/admin/support-sessions/${sessionId}/end`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CC}` },
    })
    const endBody = (await end.json()) as { ok: boolean; data: { ok: boolean } }
    assert.equal(end.status, 200)
    assert.equal(endBody.ok, true)
    assert.equal(endBody.data.ok, true)

    const db = getDb()
    const row = db.prepare(`SELECT status FROM support_sessions WHERE id = ?`).get(sessionId) as {
      status: string
    }
    assert.equal(row.status, 'ended')

    const audit = db
      .prepare(
        `SELECT action FROM tenant_audit_logs WHERE entity_id = ? AND action = 'support_session_ended'`,
      )
      .get(sessionId) as { action: string } | undefined
    assert.equal(audit?.action, 'support_session_ended')
  })

  it('writes audit on session start and impersonation', async () => {
    const { body } = await startSession(CC, { reason: 'Audit trail' })
    const sessionId = body.supportSession!.id
    const db = getDb()
    const started = db
      .prepare(
        `SELECT action FROM tenant_audit_logs WHERE entity_id = ? AND action = 'support_session_started'`,
      )
      .get(sessionId) as { action: string } | undefined
    assert.equal(started?.action, 'support_session_started')

    const plain = new URL(body.impersonationUrl!).searchParams.get('token')!
    await fetch(`${base}/api/support/impersonate?token=${encodeURIComponent(plain)}`)
    const opened = db
      .prepare(
        `SELECT action FROM tenant_audit_logs WHERE entity_id = ? AND action = 'support_impersonation_opened'`,
      )
      .get(sessionId) as { action: string } | undefined
    assert.equal(opened?.action, 'support_impersonation_opened')
  })
})
