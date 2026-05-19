import fs from 'node:fs'
import path from 'node:path'

export const PRODUCTION_DATA_ROOT = '/data'
export const DEFAULT_DATABASE_FILENAME = 'rabbitstation.db'

const posix = path.posix

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production'
}

/** Production: default off. Development: default on (unless DEMO_SEED_ENABLED=false). */
export function isDemoSeedEnabled(): boolean {
  const v = process.env.DEMO_SEED_ENABLED?.trim().toLowerCase()
  if (v === 'true' || v === '1' || v === 'yes') return true
  if (v === 'false' || v === '0' || v === 'no') return false
  if (process.env.SEED_DEMO === '1') return true
  return !isProductionEnv()
}

export function getDatabasePath(): string {
  const fromEnv = process.env.DATABASE_PATH?.trim()
  if (fromEnv) {
    const posixPath = fromEnv.replace(/\\/g, '/')
    if (isProductionEnv() && isPosixUnderDataRoot(posixPath)) {
      return posixPath
    }
    return path.resolve(fromEnv)
  }
  if (isProductionEnv()) {
    return posix.join(PRODUCTION_DATA_ROOT, DEFAULT_DATABASE_FILENAME)
  }
  return path.resolve(process.cwd(), 'data', DEFAULT_DATABASE_FILENAME)
}

export function getDataRoot(): string {
  if (isProductionEnv()) return PRODUCTION_DATA_ROOT
  return path.resolve(process.cwd(), 'data')
}

function resolveDir(envKey: string, productionSubdir: string, devSubdir: string): string {
  const fromEnv = process.env[envKey]?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  if (isProductionEnv()) return posix.join(PRODUCTION_DATA_ROOT, productionSubdir)
  return path.resolve(process.cwd(), 'data', devSubdir)
}

export function getUploadDir(): string {
  return resolveDir('UPLOAD_DIR', 'uploads', 'uploads')
}

export function getDocumentsDir(): string {
  const stationDocs = process.env.STATION_DOCUMENTS_DIR?.trim()
  if (stationDocs) return path.resolve(stationDocs)
  return resolveDir('DOCUMENTS_DIR', 'documents', 'documents')
}

export function getBackupDir(): string {
  const backupDir = process.env.BACKUP_DIR?.trim()
  if (backupDir) return path.resolve(backupDir)
  const legacy = process.env.BACKUP_PATH?.trim()
  if (legacy) return path.resolve(legacy)
  return resolveDir('BACKUP_DIR', 'backups', 'backups')
}

export function getLogDir(): string {
  return resolveDir('LOG_DIR', 'logs', 'logs')
}

export function getStationDocumentsDir(): string {
  return path.join(getDocumentsDir(), 'station-documents')
}

export function getPayrollDocumentsDir(): string {
  return path.join(getDocumentsDir(), 'payroll-documents')
}

export function getAbsenceUploadsDir(): string {
  return path.join(getUploadDir(), 'absence-uploads')
}

export function getBillingDocumentsDir(): string {
  return path.join(getDocumentsDir(), 'station-billing')
}

function isPosixUnderDataRoot(p: string): boolean {
  const n = p.replace(/\\/g, '/')
  return n === PRODUCTION_DATA_ROOT || n.startsWith(`${PRODUCTION_DATA_ROOT}/`)
}

/** Erkennt Railway-Volume-Pfade (/data/...). Auf Windows bleibt DATABASE_PATH=/data/... logisch unter /data. */
export function isUnderPersistentVolume(targetPath: string): boolean {
  if (isPosixUnderDataRoot(targetPath)) return true
  const resolved = path.resolve(targetPath).replace(/\\/g, '/')
  if (isPosixUnderDataRoot(resolved)) return true
  // Windows: path.resolve('/data/foo') → C:/data/foo
  return /^([a-zA-Z]:)?\/data(\/|$)/.test(resolved)
}

export function isDirectoryWritable(dir: string): boolean {
  try {
    fs.accessSync(dir, fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

export function getDatabaseFileInfo(dbPath: string): { exists: boolean; sizeBytes: number } {
  try {
    const st = fs.statSync(dbPath)
    return { exists: st.isFile(), sizeBytes: st.size }
  } catch {
    return { exists: false, sizeBytes: 0 }
  }
}

/** Erstellt alle persistenten Verzeichnisse (idempotent). */
export function ensurePersistentDirectories(): void {
  const dirs = [
    getDataRoot(),
    path.dirname(getDatabasePath()),
    getUploadDir(),
    getDocumentsDir(),
    getBackupDir(),
    getLogDir(),
    getStationDocumentsDir(),
    getPayrollDocumentsDir(),
    getAbsenceUploadsDir(),
    getBillingDocumentsDir(),
  ]
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export type StorageHealthSnapshot = {
  database: {
    status: 'ok' | 'warning' | 'error'
    path: string
    exists: boolean
    sizeBytes: number
    persistentVolume: boolean
    message?: string
  }
  storage: {
    status: 'ok' | 'warning' | 'error'
    dataPath: string
    dataPathExists: boolean
    dataPathWritable: boolean
    backupDir: string
    backupDirWritable: boolean
    databasePath: string
    uploadDir: string
    documentsDir: string
    logDir: string
    message?: string
  }
}

export function buildStorageHealthSnapshot(): StorageHealthSnapshot {
  const dbPath = getDatabasePath()
  const dbInfo = getDatabaseFileInfo(dbPath)
  const persistentVolume = isProductionEnv() && isUnderPersistentVolume(dbPath)

  let dbStatus: 'ok' | 'warning' | 'error' = 'ok'
  let dbMessage: string | undefined
  if (!dbInfo.exists && isProductionEnv()) {
    dbStatus = 'warning'
    dbMessage = 'Datenbankdatei wird beim ersten Start angelegt.'
  }
  if (isProductionEnv() && !persistentVolume) {
    dbStatus = 'warning'
    dbMessage =
      'Datenbank liegt nicht im persistenten Volume /data. Datenverlust bei Deploy möglich.'
  }

  const dataPath = isProductionEnv() ? PRODUCTION_DATA_ROOT : getDataRoot()
  const dataPathExists = fs.existsSync(dataPath)
  const dataPathWritable = dataPathExists && isDirectoryWritable(dataPath)
  const backupDir = getBackupDir()
  const backupDirExists = fs.existsSync(backupDir)
  const backupDirWritable = backupDirExists && isDirectoryWritable(backupDir)

  let storageStatus: 'ok' | 'warning' | 'error' = 'ok'
  let storageMessage: string | undefined
  if (isProductionEnv() && !dataPathExists) {
    storageStatus = 'warning'
    storageMessage = 'Persistentes Volume /data ist nicht gemountet.'
  } else if (isProductionEnv() && !dataPathWritable) {
    storageStatus = 'error'
    storageMessage = 'Volume /data ist nicht beschreibbar.'
  }

  return {
    database: {
      status: dbStatus,
      path: dbPath,
      exists: dbInfo.exists,
      sizeBytes: dbInfo.sizeBytes,
      persistentVolume,
      ...(dbMessage ? { message: dbMessage } : {}),
    },
    storage: {
      status: storageStatus,
      dataPath,
      dataPathExists,
      dataPathWritable,
      backupDir,
      backupDirWritable,
      databasePath: dbPath,
      uploadDir: getUploadDir(),
      documentsDir: getDocumentsDir(),
      logDir: getLogDir(),
      ...(storageMessage ? { message: storageMessage } : {}),
    },
  }
}

export function logPersistentStorageStartup(): void {
  ensurePersistentDirectories()
  const dbPath = getDatabasePath()
  const dbInfo = getDatabaseFileInfo(dbPath)
  const dataPath = isProductionEnv() ? PRODUCTION_DATA_ROOT : getDataRoot()
  const dataExists = fs.existsSync(dataPath)
  const dataWritable = dataExists && isDirectoryWritable(dataPath)

  console.log(`RabbitStation database path: ${dbPath}`)
  console.log(`Persistent volume ${dataPath} exists: ${dataExists ? 'yes' : 'no'}`)
  console.log(`Persistent volume writable: ${dataWritable ? 'yes' : 'no'}`)
  console.log(`Database exists: ${dbInfo.exists ? 'yes' : 'no'}`)
  if (dbInfo.exists) {
    console.log(`Database size bytes: ${dbInfo.sizeBytes}`)
  }
  console.log(`Upload dir: ${getUploadDir()}`)
  console.log(`Documents dir: ${getDocumentsDir()}`)
  console.log(`Backup dir: ${getBackupDir()}`)
  console.log(`Log dir: ${getLogDir()}`)
  console.log(`Demo seed enabled: ${isDemoSeedEnabled() ? 'true' : 'false'}`)

  if (isProductionEnv() && !isUnderPersistentVolume(dbPath)) {
    console.warn(
      'WARNUNG: Datenbank liegt nicht unter /data. Bei Railway-Redeploy können Daten verloren gehen.',
    )
  }
}
