import type { Database } from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  DOCUMENT_TEMPLATE_CATALOG,
  getDocumentTemplateByKey,
  type DocumentTemplateKey,
} from '../data/documentTemplateCatalog.js'
import { getStationDocumentsDir, getDocumentsDir } from '../config/dataPaths.js'
import { nowIso } from '../utils/timestamps.js'

export type StationDocumentRow = {
  id: string
  station_id: string
  global_document: number
  title: string
  description: string | null
  category: string | null
  document_type: string
  file_name: string
  file_path: string
  mime_type: string
  file_size: number
  preview_path: string | null
  is_template: number
  active: number
  previous_file_path: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
  template_key: string | null
  version_label: string | null
}

/** Stations-Uploads unter DOCUMENTS_DIR/station-documents (Production: /data/documents/...). */
export function documentsRootDir(): string {
  return getStationDocumentsDir()
}

/** PDF-Vorlagen aus dem Repo (server/data/document-templates). */
export function documentTemplatesRoot(): string {
  const fromEnv = process.env.DOCUMENT_TEMPLATES_DIR?.trim()
  if (fromEnv) return path.isAbsolute(fromEnv) ? fromEnv : path.join(process.cwd(), fromEnv)
  const direct = path.join(process.cwd(), 'data', 'document-templates')
  const nested = path.join(process.cwd(), 'server', 'data', 'document-templates')
  if (fs.existsSync(direct) || !fs.existsSync(nested)) return direct
  return nested
}

function allowedDocumentRoots(): string[] {
  const roots = new Set<string>()
  for (const r of [
    path.resolve(documentsRootDir()),
    path.resolve(getDocumentsDir()),
    path.resolve(process.cwd(), 'data', 'station-documents'),
    path.resolve(process.cwd(), 'server', 'data', 'station-documents'),
  ]) {
    roots.add(r)
  }
  return [...roots]
}

export function resolveDocumentAbsolutePath(storedRelative: string): string {
  const rel = String(storedRelative ?? '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!rel || rel.includes('..')) throw new Error('Ungültiger Dateipfad')

  const candidates = [path.resolve(process.cwd(), rel)]
  if (rel.startsWith('server/')) {
    candidates.push(path.resolve(process.cwd(), rel.slice('server/'.length)))
  } else {
    candidates.push(path.resolve(process.cwd(), 'server', rel))
  }

  const allowed = allowedDocumentRoots()
  for (const abs of candidates) {
    if (!fs.existsSync(abs)) continue
    if (allowed.some((root) => abs === root || abs.startsWith(root + path.sep))) return abs
  }

  const fallback = candidates[0]!
  if (allowed.some((root) => fallback === root || fallback.startsWith(root + path.sep))) return fallback
  throw new Error('Pfad außerhalb des Dokumentenordners')
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
}

export function relativePathForNewDocument(stationId: string, documentId: string, safeFileName: string): string {
  const abs = path.join(documentsRootDir(), stationId, documentId, safeFileName)
  return path.relative(process.cwd(), abs).replace(/\\/g, '/')
}

export function listStationDocuments(
  db: Database,
  opts: {
    stationId: string
    q?: string
    category?: string
    documentType?: string
    includeArchived?: boolean
    linkedEmployeeId?: string
  },
): StationDocumentRow[] {
  const { stationId, q, category, documentType, includeArchived, linkedEmployeeId } = opts
  const terms = (q ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  let sql = `SELECT DISTINCT d.* FROM station_documents d`
  const params: (string | number)[] = []

  if (linkedEmployeeId) {
    sql += ` INNER JOIN station_document_employees l ON l.document_id = d.id AND l.employee_id = ?`
    params.push(linkedEmployeeId)
  }

  sql += ` WHERE (d.station_id = ? OR d.global_document = 1)`
  params.push(stationId)

  if (!includeArchived) {
    sql += ` AND (d.archived_at IS NULL OR trim(d.archived_at) = '')`
  }

  if (category?.trim()) {
    sql += ` AND lower(trim(d.category)) = lower(trim(?))`
    params.push(category.trim())
  }

  if (documentType?.trim()) {
    sql += ` AND d.document_type = ?`
    params.push(documentType.trim())
  }

  sql += ` ORDER BY d.updated_at DESC, d.created_at DESC`

  const rows = db.prepare(sql).all(...params) as StationDocumentRow[]

  if (terms.length === 0) return rows

  return rows.filter((d) => {
    const hay = [
      d.title,
      d.description ?? '',
      d.category ?? '',
      d.document_type ?? '',
      d.file_name ?? '',
    ]
      .join(' ')
      .toLowerCase()
    return terms.every((t) => hay.includes(t))
  })
}

export function getStationDocument(db: Database, id: string): StationDocumentRow | undefined {
  return db.prepare(`SELECT * FROM station_documents WHERE id = ?`).get(id) as StationDocumentRow | undefined
}

/** Zugriff: Station passt oder globales Dokument (für Anzeige in dieser Station). */
export function canAccessDocumentRow(row: StationDocumentRow, stationId: string): boolean {
  if (row.global_document === 1) return true
  return row.station_id === stationId
}

export function listLinkedEmployeeIds(db: Database, documentId: string): string[] {
  return (
    db.prepare(`SELECT employee_id FROM station_document_employees WHERE document_id = ?`).all(documentId) as {
      employee_id: string
    }[]
  ).map((r) => r.employee_id)
}

export function insertStationDocument(
  db: Database,
  p: {
    id?: string
    stationId: string
    globalDocument: boolean
    title: string
    description?: string | null
    category?: string | null
    documentType: string
    fileName: string
    relativePath: string
    mimeType: string
    fileSize: number
    isTemplate?: boolean
    active?: boolean
    createdBy?: string | null
  },
): StationDocumentRow {
  const id = p.id?.trim() || randomUUID()
  const ts = nowIso()
  const rel = p.relativePath.replace(/\\/g, '/')
  db.prepare(
    `INSERT INTO station_documents (
      id, station_id, global_document, title, description, category, document_type,
      file_name, file_path, mime_type, file_size, preview_path, is_template, active,
      previous_file_path, created_by, created_at, updated_at, archived_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    p.stationId,
    p.globalDocument ? 1 : 0,
    p.title.trim(),
    p.description?.trim() || null,
    p.category?.trim() || null,
    p.documentType.trim() || 'other',
    p.fileName,
    rel,
    p.mimeType,
    Math.max(0, Math.floor(p.fileSize)),
    null,
    p.isTemplate ? 1 : 0,
    p.active === false ? 0 : 1,
    null,
    p.createdBy ?? null,
    ts,
    ts,
    null,
  )
  return getStationDocument(db, id)!
}

export function updateStationDocumentMeta(
  db: Database,
  id: string,
  patch: Partial<{
    title: string
    description: string | null
    category: string | null
    documentType: string
    stationId: string
    globalDocument: boolean
    active: boolean
    isTemplate: boolean
  }>,
): StationDocumentRow | undefined {
  const row = getStationDocument(db, id)
  if (!row) return undefined
  const ts = nowIso()
  const title = patch.title !== undefined ? patch.title.trim() : row.title
  const description = patch.description !== undefined ? patch.description : row.description
  const category = patch.category !== undefined ? patch.category : row.category
  const documentType = patch.documentType !== undefined ? patch.documentType.trim() : row.document_type
  const stationId = patch.stationId !== undefined ? patch.stationId.trim() : row.station_id
  const globalDocument = patch.globalDocument !== undefined ? (patch.globalDocument ? 1 : 0) : row.global_document
  const active = patch.active !== undefined ? (patch.active ? 1 : 0) : row.active
  const isTemplate = patch.isTemplate !== undefined ? (patch.isTemplate ? 1 : 0) : row.is_template

  db.prepare(
    `UPDATE station_documents SET
      title = ?, description = ?, category = ?, document_type = ?,
      station_id = ?, global_document = ?, active = ?, is_template = ?,
      updated_at = ?
    WHERE id = ?`,
  ).run(title, description, category, documentType, stationId, globalDocument, active, isTemplate, ts, id)
  return getStationDocument(db, id)
}

export function replaceStationDocumentFile(
  db: Database,
  id: string,
  p: { fileName: string; relativePath: string; mimeType: string; fileSize: number },
): StationDocumentRow | undefined {
  const row = getStationDocument(db, id)
  if (!row) return undefined
  const ts = nowIso()
  const oldRel = row.file_path
  const newRel = p.relativePath.replace(/\\/g, '/')
  const archiveDir = path.join(documentsRootDir(), row.station_id, id, 'replaced')
  ensureDir(archiveDir)
  let previous = row.previous_file_path
  try {
    const oldAbs = resolveDocumentAbsolutePath(oldRel)
    if (fs.existsSync(oldAbs)) {
      const stamp = ts.replace(/[:.]/g, '-')
      const base = path.basename(oldAbs)
      const dest = path.join(archiveDir, `${stamp}_${base}`)
      fs.renameSync(oldAbs, dest)
      const prevRel = path.relative(process.cwd(), dest).replace(/\\/g, '/')
      previous = prevRel
    }
  } catch {
    /* alte Datei fehlt — ignorieren */
  }

  db.prepare(
    `UPDATE station_documents SET
      file_name = ?, file_path = ?, mime_type = ?, file_size = ?,
      previous_file_path = ?, preview_path = NULL, updated_at = ?
    WHERE id = ?`,
  ).run(p.fileName, newRel, p.mimeType, Math.max(0, Math.floor(p.fileSize)), previous, ts, id)
  return getStationDocument(db, id)
}

export function archiveStationDocument(db: Database, id: string): StationDocumentRow | undefined {
  const row = getStationDocument(db, id)
  if (!row) return undefined
  const ts = nowIso()
  db.prepare(`UPDATE station_documents SET archived_at = ?, active = 0, updated_at = ? WHERE id = ?`).run(ts, ts, id)
  return getStationDocument(db, id)
}

export function linkDocumentToEmployee(db: Database, documentId: string, employeeId: string): void {
  const id = randomUUID()
  const ts = nowIso()
  db.prepare(
    `INSERT OR IGNORE INTO station_document_employees (id, document_id, employee_id, created_at) VALUES (?,?,?,?)`,
  ).run(id, documentId, employeeId, ts)
}

export function unlinkDocumentFromEmployee(db: Database, documentId: string, employeeId: string): void {
  db.prepare(`DELETE FROM station_document_employees WHERE document_id = ? AND employee_id = ?`).run(documentId, employeeId)
}

export function writeDocumentBufferToDisk(relativePosix: string, buf: Buffer): void {
  const abs = path.join(process.cwd(), ...relativePosix.split('/'))
  ensureDir(path.dirname(abs))
  fs.writeFileSync(abs, buf)
}

function copyFileToStationDocument(stationId: string, documentId: string, fileName: string, sourceAbs: string): string {
  const rel = relativePathForNewDocument(stationId, documentId, fileName)
  const destAbs = path.join(process.cwd(), ...rel.split('/'))
  ensureDir(path.dirname(destAbs))
  fs.copyFileSync(sourceAbs, destAbs)
  return rel
}

/** Legt die drei festen PDF-Vorlagen pro Station an (Original bleibt unverändert). */
export function ensureStationDocumentTemplates(db: Database, stationId: string, createdBy?: string | null): void {
  const root = documentTemplatesRoot()
  if (!fs.existsSync(root)) {
    console.warn(`[documents] Vorlagenordner nicht gefunden: ${root} (cwd=${process.cwd()})`)
  }
  for (const tpl of DOCUMENT_TEMPLATE_CATALOG) {
    const existing = db
      .prepare(`SELECT id FROM station_documents WHERE station_id = ? AND template_key = ? AND is_template = 1 LIMIT 1`)
      .get(stationId, tpl.key) as { id: string } | undefined

    const sourceAbs = path.join(root, tpl.sourceFile)
    if (!fs.existsSync(sourceAbs)) {
      console.warn(`[documents] Vorlage fehlt auf Disk: ${sourceAbs}`)
      continue
    }

    if (existing) {
      try {
        const row = getStationDocument(db, existing.id)
        if (row && !fs.existsSync(resolveDocumentAbsolutePath(row.file_path))) {
          copyFileToStationDocument(stationId, existing.id, tpl.fileName, sourceAbs)
          db.prepare(`UPDATE station_documents SET file_name = ?, updated_at = ? WHERE id = ?`).run(
            tpl.fileName,
            nowIso(),
            existing.id,
          )
        }
      } catch {
        /* ignore repair errors */
      }
      continue
    }
    const docId = `doc-tpl-${tpl.key}-${stationId}`
    const rel = copyFileToStationDocument(stationId, docId, tpl.fileName, sourceAbs)
    const stat = fs.statSync(sourceAbs)
    insertStationDocument(db, {
      id: docId,
      stationId,
      globalDocument: false,
      title: tpl.title,
      description: tpl.description,
      category: tpl.category,
      documentType: tpl.documentType,
      fileName: tpl.fileName,
      relativePath: rel,
      mimeType: tpl.mimeType,
      fileSize: stat.size,
      isTemplate: true,
      active: true,
      createdBy,
    })
    db.prepare(`UPDATE station_documents SET template_key = ?, version_label = ? WHERE id = ?`).run(
      tpl.key,
      tpl.version,
      docId,
    )
  }
}

export function listStationDocumentTemplates(db: Database, stationId: string) {
  ensureStationDocumentTemplates(db, stationId)
  return db
    .prepare(
      `SELECT * FROM station_documents WHERE station_id = ? AND is_template = 1 AND (archived_at IS NULL OR trim(archived_at) = '') ORDER BY category, title`,
    )
    .all(stationId) as StationDocumentRow[]
}

export function findTemplateDocument(db: Database, stationId: string, templateKey: DocumentTemplateKey) {
  ensureStationDocumentTemplates(db, stationId)
  return db
    .prepare(
      `SELECT * FROM station_documents WHERE station_id = ? AND template_key = ? AND is_template = 1 LIMIT 1`,
    )
    .get(stationId, templateKey) as StationDocumentRow | undefined
}

/** Neue ausfüllbare Kopie – Originalvorlage wird nicht verändert. */
export function copyStationDocumentFromTemplate(
  db: Database,
  stationId: string,
  templateKey: DocumentTemplateKey,
  opts?: { titleSuffix?: string; linkedEmployeeId?: string; createdBy?: string | null },
): StationDocumentRow {
  const tplDef = getDocumentTemplateByKey(templateKey)
  if (!tplDef) throw new Error('Unbekannte Vorlage')
  const source = findTemplateDocument(db, stationId, templateKey)
  if (!source) throw new Error('Vorlage nicht gefunden – bitte Server neu starten (Migration).')

  const sourceAbs = resolveDocumentAbsolutePath(source.file_path)
  const newId = randomUUID()
  const stamp = new Date().toISOString().slice(0, 10)
  const base = path.basename(source.file_name, path.extname(source.file_name))
  const ext = path.extname(source.file_name) || '.pdf'
  const copyName = `${base}_Kopie_${stamp}${ext}`
  const rel = copyFileToStationDocument(stationId, newId, copyName, sourceAbs)
  const stat = fs.statSync(path.join(process.cwd(), ...rel.split('/')))

  const title = opts?.titleSuffix
    ? `${source.title} – ${opts.titleSuffix}`
    : `${source.title} – Kopie ${stamp}`

  const row = insertStationDocument(db, {
    id: newId,
    stationId,
    globalDocument: false,
    title,
    description: source.description,
    category: source.category,
    documentType: source.document_type,
    fileName: copyName,
    relativePath: rel,
    mimeType: source.mime_type,
    fileSize: stat.size,
    isTemplate: false,
    active: true,
    createdBy: opts?.createdBy ?? null,
  })
  db.prepare(`UPDATE station_documents SET template_key = NULL, version_label = ? WHERE id = ?`).run(
    source.version_label ?? tplDef.version,
    newId,
  )
  if (opts?.linkedEmployeeId) linkDocumentToEmployee(db, newId, opts.linkedEmployeeId)
  return row
}
