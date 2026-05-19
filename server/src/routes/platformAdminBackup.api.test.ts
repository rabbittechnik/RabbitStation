import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer, type Server } from 'node:http'
import { createApp } from '../app.js'
import { initDatabase, closeDatabase } from '../db/database.js'

let server: Server
let base = ''
let backupDir = ''

describe('platform admin backup API', () => {
  const envBackup = { ...process.env }

  before(async () => {
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-backup-api-'))
    process.env.CONTROL_CENTER_API_TOKEN = 'test-cc-backup-token'
    process.env.BACKUP_DIR = backupDir
    process.env.DATABASE_PATH = path.join(backupDir, 'rabbitstation.db')
    process.env.BACKUP_ENABLED = 'false'
    process.env.NODE_ENV = 'test'
    initDatabase()
    const app = createApp()
    server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    base = `http://127.0.0.1:${port}`
  })

  after(async () => {
    closeDatabase()
    process.env = envBackup
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
    if (backupDir) fs.rmSync(backupDir, { recursive: true, force: true })
  })

  it('GET /api/admin/backups/status', async () => {
    const res = await fetch(`${base}/api/admin/backups/status`, {
      headers: { Authorization: 'Bearer test-cc-backup-token' },
    })
    const body = (await res.json()) as { ok: boolean; backupDir: string; enabled: boolean }
    assert.equal(res.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.backupDir, backupDir)
    assert.equal(body.enabled, true)
  })

  it('POST /api/admin/backups/create creates zip with database', async () => {
    const res = await fetch(`${base}/api/admin/backups/create`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-cc-backup-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ includeUploads: false, includeDocuments: false }),
    })
    const body = (await res.json()) as {
      ok: boolean
      backup?: { fileName: string; sizeBytes: number }
    }
    assert.equal(res.status, 201)
    assert.equal(body.ok, true)
    assert.ok(body.backup?.fileName?.endsWith('.zip'))
    const zipPath = path.join(backupDir, body.backup!.fileName)
    assert.ok(fs.existsSync(zipPath))
    assert.ok(body.backup!.sizeBytes > 100)
  })

  it('GET /api/admin/backups lists backups', async () => {
    const res = await fetch(`${base}/api/admin/backups`, {
      headers: { Authorization: 'Bearer test-cc-backup-token' },
    })
    const body = (await res.json()) as { ok: boolean; backups: { fileName: string }[] }
    assert.equal(res.status, 200)
    assert.ok(body.backups.length >= 1)
  })

  it('GET /api/admin/health includes backup details', async () => {
    const res = await fetch(`${base}/api/admin/health`, {
      headers: { Authorization: 'Bearer test-cc-backup-token' },
    })
    const body = (await res.json()) as {
      ok: boolean
      data: { backups: { backupDir: string }; storage: { backupDirWritable: boolean } }
    }
    assert.equal(res.status, 200)
    assert.equal(body.data.backups.backupDir, backupDir)
    assert.equal(body.data.storage.backupDirWritable, true)
  })
})
