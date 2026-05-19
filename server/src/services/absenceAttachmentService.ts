import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getAbsenceUploadsDir } from '../config/dataPaths.js'
import { nowIso } from '../utils/timestamps.js'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'])

function uploadsRoot(): string {
  return getAbsenceUploadsDir()
}

export function ensureAbsenceUploadsDir(stationId: string, absenceId: string): string {
  const dir = path.join(uploadsRoot(), stationId, absenceId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export type SaveAbsenceAttachmentInput = {
  db: Database
  absenceId: string
  employeeId: string
  stationId: string
  fileName: string
  mimeType: string
  buffer: Buffer
  uploadedBy: string
  source: string
}

export function saveAbsenceAttachment(p: SaveAbsenceAttachmentInput): { id: string; relativePath: string } {
  const mime = String(p.mimeType ?? '').trim().toLowerCase()
  if (!ALLOWED.has(mime)) throw new Error('Nur JPG, PNG oder PDF erlaubt.')
  if (p.buffer.length > MAX_BYTES) throw new Error('Datei zu groß (max. 10 MB).')

  const ext =
    mime === 'image/png'
      ? '.png'
      : mime === 'image/jpeg' || mime === 'image/jpg'
        ? '.jpg'
        : '.pdf'
  const id = `att-${randomUUID()}`
  const safeBase = path.basename(String(p.fileName ?? 'upload').replace(/[^a-zA-Z0-9._-]+/g, '_')).slice(0, 120)
  const diskName = `${id}${ext}`
  const dir = ensureAbsenceUploadsDir(p.stationId, p.absenceId)
  const absPath = path.join(dir, diskName)
  const relativePath = path.posix.join('server', 'data', 'absence-uploads', p.stationId, p.absenceId, diskName)
  fs.writeFileSync(absPath, p.buffer)

  const ts = nowIso()
  p.db
    .prepare(
      `INSERT INTO absence_attachments (
        id, absence_id, employee_id, station_id, file_name, file_mime_type, file_path, uploaded_at, uploaded_by, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      p.absenceId,
      p.employeeId,
      p.stationId,
      safeBase || 'upload',
      mime,
      relativePath,
      ts,
      p.uploadedBy,
      String(p.source ?? 'upload').slice(0, 40),
    )
  return { id, relativePath }
}
