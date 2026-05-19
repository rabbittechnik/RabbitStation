import fs from 'node:fs'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { isRemoteBackupConfigured, isRemoteBackupEnabled } from '../config/backupConfig.js'

export type RemoteUploadResult =
  | { ok: true; key: string }
  | { ok: false; errorCode: string; safeMessage: string }

/** Lädt eine lokale Backup-ZIP zu S3-kompatiblem Speicher hoch (R2, B2, AWS). Keine Secrets loggen. */
export async function uploadBackupToRemote(localZipPath: string, fileName: string): Promise<RemoteUploadResult> {
  if (!isRemoteBackupEnabled()) {
    return { ok: false, errorCode: 'remote_disabled', safeMessage: 'Remote-Backup ist deaktiviert.' }
  }
  if (!isRemoteBackupConfigured()) {
    return {
      ok: false,
      errorCode: 'remote_not_configured',
      safeMessage: 'Remote-Backup ENV unvollständig (Bucket/Zugangsdaten).',
    }
  }

  const endpoint = process.env.BACKUP_S3_ENDPOINT?.trim()
  const bucket = process.env.BACKUP_S3_BUCKET!.trim()
  const region = process.env.BACKUP_S3_REGION?.trim() || 'auto'
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID!.trim()
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY!.trim()
  const key = `backups/${fileName}`

  const client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: Boolean(endpoint),
  })

  try {
    const body = fs.createReadStream(localZipPath)
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'application/zip',
      }),
    )
    console.info(`[backup:remote] Upload OK → s3://${bucket}/${key}`)
    return { ok: true, key }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[backup:remote] Upload fehlgeschlagen:', message.slice(0, 200))
    return {
      ok: false,
      errorCode: 'remote_upload_failed',
      safeMessage: 'Remote-Upload fehlgeschlagen. Lokales Backup bleibt erhalten.',
    }
  }
}
