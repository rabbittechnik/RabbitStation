export function isBackupEnabled(): boolean {
  const v = process.env.BACKUP_ENABLED?.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

export function getBackupRetentionDays(): number {
  const n = Number(process.env.BACKUP_RETENTION_DAYS)
  if (Number.isFinite(n) && n > 0) return Math.min(Math.floor(n), 3650)
  return 30
}

export function getBackupScheduleCron(): string {
  return process.env.BACKUP_SCHEDULE_CRON?.trim() || '0 3 * * *'
}

export function isRemoteBackupEnabled(): boolean {
  const v = process.env.BACKUP_REMOTE_ENABLED?.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

export function isRemoteBackupConfigured(): boolean {
  if (!isRemoteBackupEnabled()) return false
  return Boolean(
    process.env.BACKUP_S3_BUCKET?.trim() &&
      process.env.BACKUP_S3_ACCESS_KEY_ID?.trim() &&
      process.env.BACKUP_S3_SECRET_ACCESS_KEY?.trim(),
  )
}
