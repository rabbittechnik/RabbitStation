import { getDb } from '../db/database.js'
import { nowIso } from '../utils/timestamps.js'
import os from 'node:os'

type StatusLevel = 'ok' | 'warning' | 'error'

function component(status: StatusLevel, message?: string) {
  return message ? { status, message } : { status }
}

export function buildAdminHealthPayload() {
  const checkedAt = nowIso()
  let dbStatus: StatusLevel = 'ok'
  let dbMessage: string | undefined
  try {
    getDb().prepare(`SELECT 1 as ok`).get()
  } catch (e) {
    dbStatus = 'error'
    dbMessage = e instanceof Error ? e.message : 'Database unreachable'
  }

  const smtpConfigured = Boolean(
    process.env.SMTP_HOST?.trim() && (process.env.SMTP_USER?.trim() || process.env.MAIL_FROM_ADDRESS?.trim()),
  )
  const paymentsConfigured = Boolean(process.env.PAYMENT_PROVIDER?.trim() && process.env.PAYMENT_API_KEY?.trim())
  const backupConfigured = Boolean(process.env.BACKUP_PATH?.trim())

  const uptimeSec = os.uptime()
  const days = Math.floor(uptimeSec / 86400)
  const hours = Math.floor((uptimeSec % 86400) / 3600)

  const parts = [
    component('ok', 'RabbitStation Haupt-App online'),
    component(dbStatus === 'ok' ? 'ok' : 'error', dbMessage),
    component(smtpConfigured ? 'ok' : 'warning', smtpConfigured ? undefined : 'SMTP not configured'),
    component(paymentsConfigured ? 'ok' : 'warning', paymentsConfigured ? undefined : 'Payment provider not configured'),
    component(backupConfigured ? 'ok' : 'warning', backupConfigured ? undefined : 'Backup system not configured'),
  ]
  const overallStatus: StatusLevel = parts.some((p) => p.status === 'error') ? 'error' : parts.some((p) => p.status === 'warning') ? 'warning' : 'ok'

  return {
    overallStatus,
    checkedAt,
    app: {
      status: 'ok' as const,
      message: 'RabbitStation Haupt-App online',
    },
    api: {
      status: 'ok' as const,
    },
    database: {
      status: dbStatus,
      ...(dbMessage ? { message: dbMessage } : {}),
      connections: 1,
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
      status: 'ok' as const,
    },
    uptime: `${days} Tage, ${hours} Std.`,
    environment: process.env.NODE_ENV ?? 'production',
    version: process.env.APP_VERSION ?? '1.0.0',
  }
}
