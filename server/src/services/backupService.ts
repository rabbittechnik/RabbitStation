import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import type { Archiver as ArchiverInstance } from 'archiver'

const require = createRequire(import.meta.url)
const { ZipArchive } = require('archiver') as {
  ZipArchive: new (options?: { zlib?: { level?: number } }) => ArchiverInstance
}
import type { Request } from 'express'
import {
  getBackupDir,
  getDatabasePath,
  getDocumentsDir,
  getUploadDir,
  ensurePersistentDirectories,
  isDirectoryWritable,
} from '../config/dataPaths.js'
import {
  getBackupRetentionDays,
  isBackupEnabled,
  isRemoteBackupConfigured,
  isRemoteBackupEnabled,
} from '../config/backupConfig.js'
import { getDb } from '../db/database.js'
import { nowIso } from '../utils/timestamps.js'
import { appendTenantAudit } from './tenantAuditService.js'
import { uploadBackupToRemote } from './backupRemoteService.js'

const BACKUP_FILE_RE = /^rabbitstation-backup-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/
const STATE_FILE = 'backup-state.json'

export type BackupManifest = {
  createdAt: string
  databasePath: string
  databaseSizeBytes: number
  includedFolders: string[]
  appVersion: string
  environment: string
  checksumSha256: string
  type: 'manual' | 'scheduled'
}

export type BackupState = {
  lastBackupAt: string | null
  lastBackupStatus: 'success' | 'failed' | 'not_configured'
  lastBackupFile: string | null
  lastBackupSizeBytes: number
  failedBackups: number
  lastRemoteStatus: 'success' | 'failed' | 'skipped' | null
  lastError: string | null
  remoteUploads: Record<string, boolean>
}

export type BackupEntry = {
  fileName: string
  sizeBytes: number
  createdAt: string
  type: 'manual' | 'scheduled' | 'unknown'
  localAvailable: boolean
  remoteUploaded: boolean
}

export type CreateBackupResult = {
  fileName: string
  path: string
  sizeBytes: number
  createdAt: string
}

function statePath(): string {
  return path.join(getBackupDir(), STATE_FILE)
}

function defaultState(): BackupState {
  return {
    lastBackupAt: null,
    lastBackupStatus: 'not_configured',
    lastBackupFile: null,
    lastBackupSizeBytes: 0,
    failedBackups: 0,
    lastRemoteStatus: null,
    lastError: null,
    remoteUploads: {},
  }
}

export function loadBackupState(): BackupState {
  ensurePersistentDirectories()
  const p = statePath()
  try {
    if (!fs.existsSync(p)) return defaultState()
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as BackupState
    return { ...defaultState(), ...raw, remoteUploads: raw.remoteUploads ?? {} }
  } catch {
    return defaultState()
  }
}

function saveBackupState(state: BackupState): void {
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8')
}

function auditSystem(action: string, metadata: Record<string, unknown>, req?: Request) {
  try {
    appendTenantAudit(getDb(), {
      tenantId: null,
      userId: req?.adminUser?.sub ?? null,
      action,
      entityType: 'system',
      entityId: 'backup',
      metadata,
      req,
    })
  } catch (e) {
    console.error(`[backup:audit] ${action}:`, e instanceof Error ? e.message : e)
  }
}

export function formatBackupFileName(d = new Date()): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `rabbitstation-backup-${y}-${mo}-${day}-${h}${mi}.zip`
}

function sha256File(filePath: string): string {
  const hash = createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

async function backupDatabaseFile(destPath: string): Promise<void> {
  await getDb().backup(destPath)
}

function addDirToArchive(archive: ArchiverInstance, dir: string, archivePath: string): boolean {
  if (!fs.existsSync(dir)) return false
  try {
    const st = fs.statSync(dir)
    if (!st.isDirectory()) return false
    archive.directory(dir, archivePath)
    return true
  } catch {
    return false
  }
}

async function zipBackupBundle(opts: {
  zipPath: string
  dbCopyPath: string
  manifest: BackupManifest
  includeUploads: boolean
  includeDocuments: boolean
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(opts.zipPath)
    const archive = new ZipArchive({ zlib: { level: 6 } })
    output.on('close', () => resolve())
    output.on('error', reject)
    archive.on('error', reject)
    archive.pipe(output)
    archive.file(opts.dbCopyPath, { name: 'rabbitstation.db' })
    const manifestPath = path.join(path.dirname(opts.dbCopyPath), 'backup-manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify(opts.manifest, null, 2), 'utf8')
    archive.file(manifestPath, { name: 'backup-manifest.json' })
    if (opts.includeUploads) addDirToArchive(archive, getUploadDir(), 'uploads')
    if (opts.includeDocuments) addDirToArchive(archive, getDocumentsDir(), 'documents')
    void archive.finalize()
  })
}

function readManifestTypeFromZip(_zipPath: string): 'manual' | 'scheduled' | 'unknown' {
  return 'unknown'
}

export function resolveBackupDownloadPath(fileName: string): string | null {
  const safe = path.basename(String(fileName ?? ''))
  if (!BACKUP_FILE_RE.test(safe)) return null
  const root = path.resolve(getBackupDir())
  const full = path.resolve(root, safe)
  const rel = path.relative(root, full)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null
  return full
}

export function listBackupFiles(): BackupEntry[] {
  ensurePersistentDirectories()
  const dir = getBackupDir()
  const state = loadBackupState()
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((f) => BACKUP_FILE_RE.test(f))
  return files
    .map((fileName) => {
      const full = path.join(dir, fileName)
      const st = fs.statSync(full)
      return {
        fileName,
        sizeBytes: st.size,
        createdAt: st.mtime.toISOString(),
        type: readManifestTypeFromZip(full),
        localAvailable: true,
        remoteUploaded: Boolean(state.remoteUploads[fileName]),
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getBackupStatusResponse() {
  const state = loadBackupState()
  const backupDir = getBackupDir()
  const dirOk = fs.existsSync(backupDir) && isDirectoryWritable(backupDir)
  const enabled = dirOk
  const automatic = isBackupEnabled()

  let message = 'Lokales Backup bereit'
  if (!dirOk) message = 'Backup-Verzeichnis nicht beschreibbar'
  else if (!automatic && state.lastBackupStatus === 'not_configured') message = 'Manuelles Backup möglich (Automatik deaktiviert)'
  else if (automatic) message = 'Lokales Backup aktiv'

  return {
    ok: true,
    enabled,
    automaticEnabled: automatic,
    backupDir,
    lastBackupAt: state.lastBackupAt,
    lastBackupStatus: state.lastBackupStatus,
    lastBackupFile: state.lastBackupFile,
    lastBackupSizeBytes: state.lastBackupSizeBytes,
    failedBackups: state.failedBackups,
    remoteEnabled: isRemoteBackupEnabled(),
    remoteConfigured: isRemoteBackupConfigured(),
    localBackupsCount: listBackupFiles().length,
    message,
  }
}

export function runRetentionCleanup(): { deleted: string[] } {
  const retentionDays = getBackupRetentionDays()
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const deleted: string[] = []
  for (const entry of listBackupFiles()) {
    const t = new Date(entry.createdAt).getTime()
    if (t < cutoff) {
      const full = path.join(getBackupDir(), entry.fileName)
      try {
        fs.unlinkSync(full)
        deleted.push(entry.fileName)
      } catch (e) {
        console.warn(`[backup:retention] Löschen fehlgeschlagen ${entry.fileName}:`, e)
      }
    }
  }
  if (deleted.length) {
    auditSystem('backup_retention_cleanup', { deletedCount: deleted.length, files: deleted })
  }
  return { deleted }
}

export async function createBackup(opts?: {
  includeUploads?: boolean
  includeDocuments?: boolean
  type?: 'manual' | 'scheduled'
  req?: Request
}): Promise<CreateBackupResult> {
  ensurePersistentDirectories()
  const backupDir = getBackupDir()
  if (!isDirectoryWritable(backupDir)) {
    throw new Error('Backup-Verzeichnis ist nicht beschreibbar')
  }

  const dbPath = getDatabasePath()
  if (!fs.existsSync(dbPath)) {
    throw new Error('Datenbankdatei nicht gefunden')
  }

  const includeUploads = opts?.includeUploads !== false
  const includeDocuments = opts?.includeDocuments !== false
  const type = opts?.type ?? 'manual'
  const createdAt = nowIso()
  const fileName = formatBackupFileName(new Date())
  const zipPath = path.join(backupDir, fileName)
  const tmpDir = path.join(backupDir, `.tmp-${Date.now()}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  const dbCopyPath = path.join(tmpDir, 'rabbitstation.db')

  try {
    await backupDatabaseFile(dbCopyPath)
    const dbSize = fs.statSync(dbCopyPath).size
    const checksum = sha256File(dbCopyPath)
    const includedFolders: string[] = []
    if (includeUploads && fs.existsSync(getUploadDir())) includedFolders.push('uploads')
    if (includeDocuments && fs.existsSync(getDocumentsDir())) includedFolders.push('documents')

    const manifest: BackupManifest = {
      createdAt,
      databasePath: dbPath,
      databaseSizeBytes: dbSize,
      includedFolders,
      appVersion: process.env.APP_VERSION ?? '1.0.0',
      environment: process.env.NODE_ENV ?? 'development',
      checksumSha256: checksum,
      type,
    }

    await zipBackupBundle({
      zipPath,
      dbCopyPath,
      manifest,
      includeUploads,
      includeDocuments,
    })

    const sizeBytes = fs.statSync(zipPath).size
    const state = loadBackupState()
    state.lastBackupAt = createdAt
    state.lastBackupStatus = 'success'
    state.lastBackupFile = fileName
    state.lastBackupSizeBytes = sizeBytes
    state.failedBackups = 0
    state.lastError = null

    let remoteStatus: BackupState['lastRemoteStatus'] = 'skipped'
    if (isRemoteBackupConfigured()) {
      const remote = await uploadBackupToRemote(zipPath, fileName)
      if (remote.ok) {
        remoteStatus = 'success'
        state.remoteUploads[fileName] = true
        auditSystem('backup_remote_uploaded', { fileName, key: remote.key }, opts?.req)
      } else {
        remoteStatus = 'failed'
        auditSystem('backup_remote_upload_failed', {
          fileName,
          errorCode: remote.errorCode,
          safeMessage: remote.safeMessage,
        }, opts?.req)
      }
    }
    state.lastRemoteStatus = remoteStatus
    saveBackupState(state)

    auditSystem(
      'backup_created',
      {
        fileName,
        path: zipPath,
        sizeBytes,
        type,
        includedFolders,
        remoteStatus,
      },
      opts?.req,
    )

    if (type === 'scheduled' || isBackupEnabled()) {
      runRetentionCleanup()
    }

    console.info(`[backup] Erstellt ${fileName} (${sizeBytes} bytes)`)
    return { fileName, path: zipPath, sizeBytes, createdAt }
  } catch (err) {
    const safeMessage = err instanceof Error ? err.message : String(err)
    const state = loadBackupState()
    state.lastBackupAt = nowIso()
    state.lastBackupStatus = 'failed'
    state.failedBackups = (state.failedBackups ?? 0) + 1
    state.lastError = safeMessage.slice(0, 500)
    saveBackupState(state)
    auditSystem('backup_failed', { safeMessage: state.lastError, type }, opts?.req)
    console.error('[backup] Fehler:', safeMessage)
    throw err
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

export function buildBackupHealthSnapshot() {
  const state = loadBackupState()
  const backupDir = getBackupDir()
  const backupDirExists = fs.existsSync(backupDir)
  const backupDirWritable = backupDirExists && isDirectoryWritable(backupDir)
  const automatic = isBackupEnabled()
  const localCount = listBackupFiles().length

  let status: 'ok' | 'warning' | 'error' | 'not_configured' = 'not_configured'
  let message = 'Automatisches Backup deaktiviert'

  if (!backupDirWritable) {
    status = 'warning'
    message = 'Backup-Verzeichnis nicht beschreibbar'
  } else if (!automatic && state.lastBackupStatus === 'not_configured') {
    status = 'not_configured'
    message = 'Backup manuell verfügbar (BACKUP_ENABLED=false)'
  } else if (automatic && state.lastBackupStatus === 'failed') {
    status = 'error'
    message = state.lastError ?? 'Letztes Backup fehlgeschlagen'
  } else if (automatic && state.lastBackupStatus === 'success') {
    status = 'ok'
    message = 'Lokales Backup aktiv'
  } else if (automatic) {
    status = 'warning'
    message = 'Automatisches Backup aktiv, noch kein erfolgreiches Backup'
  } else if (state.lastBackupStatus === 'success') {
    status = 'ok'
    message = 'Letztes manuelles Backup erfolgreich'
  }

  return {
    status,
    message,
    backupDir,
    backupDirWritable,
    lastBackupAt: state.lastBackupAt,
    lastBackupStatus: state.lastBackupStatus,
    localBackupsCount: localCount,
    remoteEnabled: isRemoteBackupEnabled(),
    remoteConfigured: isRemoteBackupConfigured(),
    failedBackups: state.failedBackups,
  }
}
