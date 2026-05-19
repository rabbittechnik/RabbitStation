import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import {
  formatBackupFileName,
  resolveBackupDownloadPath,
  runRetentionCleanup,
  loadBackupState,
} from './backupService.js'

describe('backupService helpers', () => {
  let tmp = ''
  const envBackup = { ...process.env }

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-backup-'))
    process.env.BACKUP_DIR = tmp
    process.env.DATABASE_PATH = path.join(tmp, 'rabbitstation.db')
    process.env.NODE_ENV = 'test'
    const db = new Database(process.env.DATABASE_PATH)
    db.exec(`CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)`)
    db.prepare(`INSERT INTO t (name) VALUES ('a')`).run()
    db.close()
  })

  after(() => {
    process.env = envBackup
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('formats backup file names', () => {
    const name = formatBackupFileName(new Date('2026-05-19T21:00:00'))
    assert.equal(name, 'rabbitstation-backup-2026-05-19-2100.zip')
  })

  it('blocks path traversal in download path', () => {
    assert.equal(resolveBackupDownloadPath('../etc/passwd'), null)
    assert.equal(resolveBackupDownloadPath('not-a-backup.zip'), null)
    const valid = 'rabbitstation-backup-2026-05-19-2100.zip'
    fs.writeFileSync(path.join(tmp, valid), 'zip')
    assert.ok(resolveBackupDownloadPath(valid))
    assert.ok(resolveBackupDownloadPath(`../../${valid}`))
  })

  it('deletes old backups by retention', () => {
    const oldName = 'rabbitstation-backup-2020-01-01-1200.zip'
    const newName = 'rabbitstation-backup-2026-05-19-2100.zip'
    fs.writeFileSync(path.join(tmp, oldName), 'old')
    fs.writeFileSync(path.join(tmp, newName), 'new')
    const oldPath = path.join(tmp, oldName)
    const oldTime = new Date('2020-01-01')
    fs.utimesSync(oldPath, oldTime, oldTime)
    process.env.BACKUP_RETENTION_DAYS = '30'
    const { deleted } = runRetentionCleanup()
    assert.ok(deleted.includes(oldName))
    assert.ok(fs.existsSync(path.join(tmp, newName)))
  })

  it('loads default backup state', () => {
    const state = loadBackupState()
    assert.equal(state.lastBackupStatus, 'not_configured')
  })
})
