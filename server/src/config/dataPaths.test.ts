import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildStorageHealthSnapshot,
  getBackupDir,
  getDatabasePath,
  getDocumentsDir,
  getLogDir,
  getUploadDir,
  isDemoSeedEnabled,
  isUnderPersistentVolume,
} from './dataPaths.js'
import { initDatabase, closeDatabase, getDb } from '../db/database.js'

describe('dataPaths', () => {
  let tmp = ''

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-data-'))
  })

  after(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('uses DATABASE_PATH when set', () => {
    const prev = { ...process.env }
    process.env.DATABASE_PATH = path.join(tmp, 'custom', 'rabbitstation.db')
    delete process.env.NODE_ENV
    assert.equal(getDatabasePath(), path.join(tmp, 'custom', 'rabbitstation.db'))
    process.env = prev
  })

  it('defaults production database to /data/rabbitstation.db', () => {
    const prev = { ...process.env }
    process.env.NODE_ENV = 'production'
    delete process.env.DATABASE_PATH
    assert.equal(getDatabasePath(), '/data/rabbitstation.db')
    process.env = prev
  })

  it('defaults production dirs under /data', () => {
    const prev = { ...process.env }
    process.env.NODE_ENV = 'production'
    delete process.env.UPLOAD_DIR
    delete process.env.DOCUMENTS_DIR
    delete process.env.BACKUP_DIR
    delete process.env.LOG_DIR
    assert.equal(getUploadDir(), '/data/uploads')
    assert.equal(getDocumentsDir(), '/data/documents')
    assert.equal(getBackupDir(), '/data/backups')
    assert.equal(getLogDir(), '/data/logs')
    process.env = prev
  })

  it('demo seed disabled in production by default', () => {
    const prev = { ...process.env }
    process.env.NODE_ENV = 'production'
    delete process.env.DEMO_SEED_ENABLED
    delete process.env.SEED_DEMO
    assert.equal(isDemoSeedEnabled(), false)
    process.env = prev
  })

  it('detects paths under /data volume', () => {
    assert.equal(isUnderPersistentVolume('/data/rabbitstation.db'), true)
    assert.equal(isUnderPersistentVolume('/tmp/db.sqlite'), false)
  })
})

describe('database persistence', () => {
  let tmp = ''

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-db-'))
  })

  after(() => {
    closeDatabase()
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('creates database at DATABASE_PATH and keeps data after re-init', () => {
    const dbPath = path.join(tmp, 'rabbitstation.db')
    const prev = { ...process.env }
    process.env.DATABASE_PATH = dbPath
    process.env.DEMO_SEED_ENABLED = 'false'
    delete process.env.NODE_ENV

    initDatabase()
    const tenantId = 'tenant-persist-test'
    getDb()
      .prepare(
        `INSERT INTO tenants (id, company_name, slug, plan, subscription_status, setup_completed, created_at, updated_at)
         VALUES (?, 'Persist GmbH', 'persist', 'pro', 'active', 1, datetime('now'), datetime('now'))`,
      )
      .run(tenantId)

    closeDatabase()
    assert.ok(fs.existsSync(dbPath))

    initDatabase()
    const row = getDb()
      .prepare(`SELECT company_name FROM tenants WHERE id = ?`)
      .get(tenantId) as { company_name: string }
    assert.equal(row.company_name, 'Persist GmbH')

    closeDatabase()
    process.env = prev
  })
})

describe('storage health snapshot', () => {
  it('reports persistentVolume for /data database path in production', () => {
    const prev = { ...process.env }
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_PATH = '/data/rabbitstation.db'
    const snap = buildStorageHealthSnapshot()
    assert.equal(snap.database.persistentVolume, true)
    assert.equal(snap.database.path, '/data/rabbitstation.db')
    process.env = prev
  })
})
