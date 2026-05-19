import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { createApp } from '../app.js'
import { initDatabase } from '../db/database.js'

let server: Server
let base = ''

describe('platform admin API for Control Center', () => {
  beforeAll(async () => {
    process.env.CONTROL_CENTER_API_TOKEN = 'test-cc-token-secret'
    initDatabase()
    const app = createApp()
    server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    base = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
  })

  it('GET /api/admin/health without token returns JSON 401', async () => {
    const res = await fetch(`${base}/api/admin/health`)
    const text = await res.text()
    expect(res.headers.get('content-type') ?? '').toMatch(/json/i)
    const body = JSON.parse(text) as { ok: boolean; error: string }
    expect(res.status).toBe(401)
    expect(body.ok).toBe(false)
    expect(body.error).toBe('unauthorized')
  })

  it('GET /api/admin/health with valid Bearer returns JSON 200', async () => {
    const res = await fetch(`${base}/api/admin/health`, {
      headers: { Authorization: 'Bearer test-cc-token-secret', Accept: 'application/json' },
    })
    const text = await res.text()
    expect(text.trim().startsWith('<')).toBe(false)
    const body = JSON.parse(text) as { ok: boolean; data: { overallStatus: string } }
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.overallStatus).toBeTruthy()
  })

  it('GET /api/admin/tenants with valid token returns JSON', async () => {
    const res = await fetch(`${base}/api/admin/tenants`, {
      headers: { Authorization: 'Bearer test-cc-token-secret' },
    })
    expect(res.headers.get('content-type') ?? '').toMatch(/json/i)
    const body = (await res.json()) as { ok: boolean; data: { tenants: unknown[] } }
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.data.tenants)).toBe(true)
  })

  it('unknown /api/admin route returns JSON 404', async () => {
    const res = await fetch(`${base}/api/admin/no-such-route`, {
      headers: { Authorization: 'Bearer test-cc-token-secret' },
    })
    const body = (await res.json()) as { ok: boolean }
    expect(res.status).toBe(404)
    expect(body.ok).toBe(false)
  })

})
