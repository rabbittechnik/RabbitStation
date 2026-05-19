import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import {
  getBackupDir,
  getDatabaseFileInfo,
  getDatabasePath,
  isDirectoryWritable,
  isProductionEnv,
  isUnderPersistentVolume,
  PRODUCTION_DATA_ROOT,
} from './dataPaths.js'

const BACKUP_ZIP_RE = /^rabbitstation-backup-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/

function isPathUnderRoot(targetPath: string, rootPath: string): boolean {
  const t = path.resolve(targetPath).replace(/\\/g, '/').toLowerCase()
  const r = path.resolve(rootPath).replace(/\\/g, '/').toLowerCase().replace(/\/$/, '')
  return t === r || t.startsWith(`${r}/`)
}

export class DatabasePersistenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatabasePersistenceError'
  }
}

function shellArg(p: string): string {
  if (process.platform === 'win32') {
    return `'${p.replace(/'/g, "''")}'`
  }
  return `'${p.replace(/'/g, `'\\''`)}'`
}

function latestBackupZip(): string | null {
  const dir = getBackupDir()
  if (!fs.existsSync(dir)) return null
  const entries = fs
    .readdirSync(dir)
    .filter((f) => BACKUP_ZIP_RE.test(f))
    .map((f) => {
      const full = path.join(dir, f)
      return { full, mtime: fs.statSync(full).mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
  return entries[0]?.full ?? null
}

/** Entpackt rabbitstation.db aus dem neuesten Backup-ZIP (nur wenn DB fehlt). */
export function tryRestoreDatabaseFromLatestBackup(dbPath: string): boolean {
  const zipPath = latestBackupZip()
  if (!zipPath) return false

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-db-restore-'))
  const extracted = path.join(tmpDir, 'rabbitstation.db')

  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })

    if (process.platform === 'win32') {
      execSync(
        `powershell -NoProfile -Command "Expand-Archive -LiteralPath ${shellArg(zipPath)} -DestinationPath ${shellArg(tmpDir)} -Force"`,
        { stdio: 'pipe' },
      )
    } else {
      execSync(`unzip -o -q ${shellArg(zipPath)} rabbitstation.db -d ${shellArg(tmpDir)}`, {
        stdio: 'pipe',
      })
    }

    if (!fs.existsSync(extracted)) {
      console.warn('[db:persist] Backup-ZIP enthält keine rabbitstation.db:', zipPath)
      return false
    }

    fs.copyFileSync(extracted, dbPath)
    const size = fs.statSync(dbPath).size
    console.warn(
      `[db:persist] Datenbank aus Backup wiederhergestellt: ${path.basename(zipPath)} → ${dbPath} (${size} Bytes)`,
    )
    return true
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[db:persist] Wiederherstellung aus Backup fehlgeschlagen:', msg)
    return false
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

/**
 * Production: Volume muss existieren und beschreibbar sein.
 * Fehlt die DB, wird optional aus dem letzten Backup unter BACKUP_DIR wiederhergestellt.
 */
export function prepareDatabaseFileBeforeOpen(): void {
  const dbPath = getDatabasePath()
  const info = getDatabaseFileInfo(dbPath)

  if (!info.exists) {
    const restored = tryRestoreDatabaseFromLatestBackup(dbPath)
    if (restored) {
      return
    }
  }

  if (!isProductionEnv()) return

  const volumeMount = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim()
  const dataRoot = volumeMount || PRODUCTION_DATA_ROOT
  const dataExists = fs.existsSync(dataRoot)
  const dataWritable = dataExists && isDirectoryWritable(dataRoot)

  if (!dataExists || !dataWritable) {
    throw new DatabasePersistenceError(
      `Persistentes Volume ${dataRoot} fehlt oder ist nicht beschreibbar. ` +
        'In Railway am Server-Service ein Volume mit Mount Path /data anbinden (siehe DEPLOYMENT.md). ' +
        'Ohne Volume gehen Registrierungen bei jedem Deploy verloren.',
    )
  }

  if (!isPathUnderRoot(dbPath, dataRoot) && !isUnderPersistentVolume(dbPath)) {
    throw new DatabasePersistenceError(
      `DATABASE_PATH (${dbPath}) liegt nicht im persistenten Volume (${dataRoot}). ` +
        'Bitte DATABASE_PATH=/data/rabbitstation.db und Volume-Mount /data verwenden.',
    )
  }

  if (!info.exists) {
    console.warn(
      `[db:persist] Neue Datenbank wird angelegt unter ${dbPath}. ` +
        'Kein Backup zum Wiederherstellen gefunden — Registrierungen bitte erneut anlegen oder Volume prüfen.',
    )
  }
}
