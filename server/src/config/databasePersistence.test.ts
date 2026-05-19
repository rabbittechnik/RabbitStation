import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import type { Archiver as ArchiverInstance } from 'archiver'
import { prepareDatabaseFileBeforeOpen, tryRestoreDatabaseFromLatestBackup } from './databasePersistence.js'

const require = createRequire(import.meta.url)
const { ZipArchive } = require('archiver') as {
  ZipArchive: new (options?: { zlib?: { level?: number } }) => ArchiverInstance
}

describe('databasePersistence', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-persist-'))
  const envBackup = { ...process.env }

  before(() => {
    process.env.NODE_ENV = 'production'
    process.env.DEMO_SEED_ENABLED = 'false'
    process.env.RAILWAY_VOLUME_MOUNT_PATH = tmp
    process.env.DATABASE_PATH = path.join(tmp, 'rabbitstation.db')
    process.env.BACKUP_DIR = path.join(tmp, 'backups')
    fs.mkdirSync(process.env.BACKUP_DIR, { recursive: true })
  })

  after(() => {
    process.env = { ...envBackup }
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('restores missing database from latest backup zip', async () => {
    const dbPath = process.env.DATABASE_PATH!
    const backupDir = process.env.BACKUP_DIR!
    const seedDb = path.join(tmp, 'seed.db')
    fs.writeFileSync(seedDb, 'sqlite-test-content')

    const zipPath = path.join(backupDir, 'rabbitstation-backup-2026-05-19-1200.zip')
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(zipPath)
      const archive = new ZipArchive({ zlib: { level: 9 } })
      out.on('close', () => resolve())
      archive.on('error', reject)
      archive.pipe(out)
      archive.file(seedDb, { name: 'rabbitstation.db' })
      void archive.finalize()
    })

    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)

    const ok = tryRestoreDatabaseFromLatestBackup(dbPath)
    assert.equal(ok, true)
    assert.equal(fs.readFileSync(dbPath, 'utf8'), 'sqlite-test-content')
  })

  it('prepareDatabaseFileBeforeOpen passes when volume exists', () => {
    assert.doesNotThrow(() => prepareDatabaseFileBeforeOpen())
  })
})
