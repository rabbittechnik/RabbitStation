import type { Database } from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getPayrollDocumentsDir, getDocumentsDir } from '../config/dataPaths.js'
import { nowIso } from '../utils/timestamps.js'

const MAX_BYTES = 15 * 1024 * 1024
const PDF_MIME = 'application/pdf'

export type EmployeePayrollDocumentRow = {
  id: string
  station_id: string
  employee_id: string
  year: number
  month: number
  title: string
  original_filename: string
  stored_filename: string
  file_path: string
  mime_type: string
  file_size: number
  note: string | null
  uploaded_by_user_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type EmployeePayrollDocumentApi = {
  id: string
  stationId: string
  employeeId: string
  year: number
  month: number
  title: string
  originalFilename: string
  mimeType: string
  fileSize: number
  note: string
  uploadedByUserId: string | null
  uploadedByName: string | null
  createdAt: string
  updatedAt: string
}

function payrollDocsRoot(): string {
  const fromEnv = process.env.EMPLOYEE_PAYROLL_DOCUMENTS_DIR?.trim()
  if (fromEnv) return path.isAbsolute(fromEnv) ? fromEnv : path.join(process.cwd(), fromEnv)
  return getPayrollDocumentsDir()
}

function allowedRoots(): string[] {
  return [
    path.resolve(payrollDocsRoot()),
    path.resolve(getPayrollDocumentsDir()),
    path.resolve(getDocumentsDir()),
    path.resolve(process.cwd(), 'data', 'payroll-documents'),
    path.resolve(process.cwd(), 'server', 'data', 'payroll-documents'),
  ]
}

export function resolvePayrollDocumentAbsolutePath(storedRelative: string): string {
  const rel = String(storedRelative ?? '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!rel || rel.includes('..')) throw new Error('Ungültiger Dateipfad')

  const candidates = [path.resolve(process.cwd(), rel)]
  if (rel.startsWith('server/')) candidates.push(path.resolve(process.cwd(), rel.slice('server/'.length)))
  else candidates.push(path.resolve(process.cwd(), 'server', rel))

  const allowed = allowedRoots()
  for (const abs of candidates) {
    if (!fs.existsSync(abs)) continue
    if (allowed.some((root) => abs === root || abs.startsWith(root + path.sep))) return abs
  }
  throw new Error('Datei nicht gefunden')
}

function rowToApi(r: EmployeePayrollDocumentRow, uploadedByName?: string | null): EmployeePayrollDocumentApi {
  return {
    id: r.id,
    stationId: r.station_id,
    employeeId: r.employee_id,
    year: r.year,
    month: r.month,
    title: r.title,
    originalFilename: r.original_filename,
    mimeType: r.mime_type,
    fileSize: r.file_size,
    note: r.note ?? '',
    uploadedByUserId: r.uploaded_by_user_id,
    uploadedByName: uploadedByName ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function ensureEmployeeInStation(db: Database, employeeId: string, stationId: string): void {
  const r = db
    .prepare(`SELECT id, status, deleted_at FROM employees WHERE id = ? AND station_id = ?`)
    .get(employeeId, stationId) as { id: string; status: string | null; deleted_at: string | null } | undefined
  if (!r) throw new Error('Mitarbeiter nicht gefunden')
  const st = String(r.status ?? '').toLowerCase()
  if (st === 'geloescht' || st === 'deleted' || String(r.deleted_at ?? '').trim()) {
    throw new Error('Mitarbeiter nicht gefunden')
  }
}

function getRow(db: Database, id: string): EmployeePayrollDocumentRow | undefined {
  return db.prepare(`SELECT * FROM employee_payroll_documents WHERE id = ?`).get(id) as
    | EmployeePayrollDocumentRow
    | undefined
}

function uploaderName(db: Database, userId: string | null): string | null {
  if (!userId) return null
  const u = db.prepare(`SELECT display_name, email FROM users WHERE id = ?`).get(userId) as
    | { display_name: string | null; email: string | null }
    | undefined
  return (u?.display_name ?? u?.email ?? '').trim() || null
}

export function listEmployeePayrollDocuments(
  db: Database,
  stationId: string,
  employeeId: string,
  includeDeleted = false,
): EmployeePayrollDocumentApi[] {
  ensureEmployeeInStation(db, employeeId, stationId)
  const clauses = ['station_id = ?', 'employee_id = ?']
  const params: unknown[] = [stationId, employeeId]
  if (!includeDeleted) clauses.push(`(deleted_at IS NULL OR trim(deleted_at) = '')`)
  const rows = db
    .prepare(
      `SELECT * FROM employee_payroll_documents WHERE ${clauses.join(' AND ')} ORDER BY year DESC, month DESC, created_at DESC`,
    )
    .all(...params) as EmployeePayrollDocumentRow[]
  return rows.map((r) => rowToApi(r, uploaderName(db, r.uploaded_by_user_id)))
}

export function getEmployeePayrollDocumentForAccess(
  db: Database,
  documentId: string,
  opts: { stationId: string; employeeId: string },
): EmployeePayrollDocumentRow {
  const row = getRow(db, documentId)
  if (!row || row.deleted_at) throw new Error('Lohnabrechnung nicht gefunden')
  if (row.station_id !== opts.stationId || row.employee_id !== opts.employeeId) {
    throw new Error('Keine Berechtigung')
  }
  return row
}

export function createEmployeePayrollDocument(
  db: Database,
  input: {
    stationId: string
    employeeId: string
    year: number
    month: number
    note?: string
    uploadedByUserId: string | null
    originalFilename: string
    buffer: Buffer
  },
): EmployeePayrollDocumentApi {
  ensureEmployeeInStation(db, input.stationId, input.employeeId)
  const mime = PDF_MIME
  if (input.buffer.length > MAX_BYTES) throw new Error('PDF zu groß (max. 15 MB).')
  if (input.month < 1 || input.month > 12) throw new Error('Monat muss zwischen 1 und 12 liegen.')
  if (input.year < 2000 || input.year > 2100) throw new Error('Ungültiges Jahr.')

  const id = randomUUID()
  const ts = nowIso()
  const safeOriginal = path.basename(String(input.originalFilename || 'lohnabrechnung.pdf').replace(/[^a-zA-Z0-9._-]+/g, '_'))
  const storedFilename = `${id}.pdf`
  const absDir = path.join(payrollDocsRoot(), input.stationId, input.employeeId)
  fs.mkdirSync(absDir, { recursive: true })
  const absPath = path.join(absDir, storedFilename)
  fs.writeFileSync(absPath, input.buffer)
  const relPath = path.relative(process.cwd(), absPath).replace(/\\/g, '/')

  const monthNames = [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ]
  const title = `Lohnabrechnung ${monthNames[input.month - 1] ?? input.month} ${input.year}`

  db.prepare(
    `INSERT INTO employee_payroll_documents (
      id, station_id, employee_id, year, month, title, original_filename, stored_filename,
      file_path, mime_type, file_size, note, uploaded_by_user_id, created_at, updated_at, deleted_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    input.stationId,
    input.employeeId,
    input.year,
    input.month,
    title,
    safeOriginal,
    storedFilename,
    relPath,
    mime,
    input.buffer.length,
    input.note?.trim() || null,
    input.uploadedByUserId,
    ts,
    ts,
    null,
  )

  const row = getRow(db, id)!
  return rowToApi(row, uploaderName(db, row.uploaded_by_user_id))
}

export function replaceEmployeePayrollDocument(
  db: Database,
  documentId: string,
  input: {
    stationId: string
    employeeId: string
    uploadedByUserId: string | null
    originalFilename: string
    buffer: Buffer
    year?: number
    month?: number
    note?: string
  },
): EmployeePayrollDocumentApi {
  const existing = getEmployeePayrollDocumentForAccess(db, documentId, {
    stationId: input.stationId,
    employeeId: input.employeeId,
  })
  if (input.buffer.length > MAX_BYTES) throw new Error('PDF zu groß (max. 15 MB).')

  const year = input.year ?? existing.year
  const month = input.month ?? existing.month
  const safeOriginal = path.basename(String(input.originalFilename || existing.original_filename).replace(/[^a-zA-Z0-9._-]+/g, '_'))
  const absPath = resolvePayrollDocumentAbsolutePath(existing.file_path)
  fs.writeFileSync(absPath, input.buffer)
  const ts = nowIso()

  db.prepare(
    `UPDATE employee_payroll_documents SET
      year = ?, month = ?, original_filename = ?, file_size = ?, note = COALESCE(?, note),
      uploaded_by_user_id = ?, updated_at = ?
    WHERE id = ?`,
  ).run(
    year,
    month,
    safeOriginal,
    input.buffer.length,
    input.note !== undefined ? input.note.trim() || null : null,
    input.uploadedByUserId,
    ts,
    documentId,
  )

  const row = getRow(db, documentId)!
  return rowToApi(row, uploaderName(db, row.uploaded_by_user_id))
}

export function softDeleteEmployeePayrollDocument(
  db: Database,
  documentId: string,
  stationId: string,
  employeeId: string,
): void {
  getEmployeePayrollDocumentForAccess(db, documentId, { stationId, employeeId })
  const ts = nowIso()
  db.prepare(`UPDATE employee_payroll_documents SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(
    ts,
    ts,
    documentId,
  )
}
