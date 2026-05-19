import { getDb, getDbPath } from '../db/database.js'
import { buildStorageHealthSnapshot, getBackupDir, isProductionEnv } from '../config/dataPaths.js'
import { nowIso } from '../utils/timestamps.js'
import os from 'node:os'

type StatusLevel = 'ok' | 'warning' | 'error'

function component(status: StatusLevel, message?: string) {
  return message ? { status, message } : { status }
}

export function buildAdminHealthPayload() {
  const checkedAt = nowIso()
  const storageSnap = buildStorageHealthSnapshot()

  let dbStatus: StatusLevel = 'ok'
  let dbMessage: string | undefined
  try {
    getDb().prepare(`SELECT 1 as ok`).get()
  } catch (e) {
    dbStatus = 'error'
    dbMessage = e instanceof Error ? e.message : 'Database unreachable'
  }

  if (storageSnap.database.status === 'warning' && dbStatus === 'ok') {
    dbStatus = 'warning'
    dbMessage = storageSnap.database.message
  }
  if (storageSnap.database.status === 'error') {
    dbStatus = 'error'
    dbMessage = storageSnap.database.message ?? dbMessage
  }

  const smtpConfigured = Boolean(
    process.env.SMTP_HOST?.trim() && (process.env.SMTP_USER?.trim() || process.env.MAIL_FROM_ADDRESS?.trim()),
  )
  const paymentsConfigured = Boolean(process.env.PAYMENT_PROVIDER?.trim() && process.env.PAYMENT_API_KEY?.trim())
  const backupConfigured = Boolean(getBackupDir() && (process.env.BACKUP_DIR?.trim() || process.env.BACKUP_PATH?.trim() || isProductionEnv()))

  const uptimeSec = os.uptime()
  const days = Math.floor(uptimeSec / 86400)
  const hours = Math.floor((uptimeSec % 86400) / 3600)

  const coreOk =
    dbStatus === 'ok' &&
    storageSnap.storage.status !== 'error'

  const parts = [
    component(coreOk ? 'ok' : 'error', coreOk ? 'RabbitStation Haupt-App online' : 'Systemproblem'),
    component(dbStatus === 'ok' ? 'ok' : dbStatus === 'warning' ? 'warning' : 'error', dbMessage),
    component(smtpConfigured ? 'ok' : 'warning', smtpConfigured ? undefined : 'SMTP not configured'),
    component(paymentsConfigured ? 'ok' : 'warning', paymentsConfigured ? undefined : 'Payment provider not configured'),
    component(backupConfigured ? 'ok' : 'warning', backupConfigured ? undefined : 'Backup system not configured'),
  ]

  const overallStatus: StatusLevel =
    parts.some((p) => p.status === 'error') ? 'error'
    : parts.some((p) => p.status === 'warning') ? 'warning'
    : 'ok'

  return {
    overallStatus,
    checkedAt,
    app: {
      status: coreOk ? ('ok' as const) : ('error' as const),
      message: coreOk ? 'RabbitStation Haupt-App online' : 'System nicht vollständig bereit',
    },
    api: {
      status: 'ok' as const,
    },
    database: {
      status: dbStatus,
      path: storageSnap.database.path || getDbPath(),
      exists: storageSnap.database.exists,
      sizeBytes: storageSnap.database.sizeBytes,
      persistentVolume: storageSnap.database.persistentVolume,
      connections: 1,
      ...(dbMessage ? { message: dbMessage } : {}),
    },
    mail: smtpConfigured ?
      { status: 'ok' as const }
    : { status: 'warning' as const, message: 'SMTP not configured' },
    payments: paymentsConfigured ?
      { status: 'ok' as const }
    : { status: 'warning' as const, message: 'Payment provider not configured' },
    backups: backupConfigured ?
      { status: 'ok' as const }
    : { status: 'warning' as const, message: 'Backup system not configured' },
    storage: {
      status: storageSnap.storage.status,
      dataPath: storageSnap.storage.dataPath,
      dataPathExists: storageSnap.storage.dataPathExists,
      dataPathWritable: storageSnap.storage.dataPathWritable,
      uploadDir: storageSnap.storage.uploadDir,
      documentsDir: storageSnap.storage.documentsDir,
      backupDir: storageSnap.storage.backupDir,
      logDir: storageSnap.storage.logDir,
      ...(storageSnap.storage.message ? { message: storageSnap.storage.message } : {}),
    },
    uptime: `${days} Tage, ${hours} Std.`,
    environment: process.env.NODE_ENV ?? 'production',
    version: process.env.APP_VERSION ?? '1.0.0',
  }
}
