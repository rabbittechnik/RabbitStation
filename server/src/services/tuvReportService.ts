import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { nowIso } from '../utils/timestamps.js'
import { formatTuvItemLabel, TUV_REPORT_TEMPLATE_ITEMS } from '../data/tuvReportTemplate.js'
import { findTemplateDocument } from './stationDocumentService.js'

export type TuvReportRow = {
  id: string
  station_id: string
  month: number
  year: number
  report_date: string | null
  status: string
  created_by: string | null
  created_by_name: string | null
  inspector_role: string | null
  weather_note: string | null
  general_note: string | null
  completed_by: string | null
  completed_by_name: string | null
  completed_at: string | null
  confirmed_by: string | null
  confirmed_by_name: string | null
  confirmed_at: string | null
  confirmation_text: string | null
  signature_data_url: string | null
  printed_at: string | null
  form_json: string | null
  source_template_document_id: string | null
  created_at: string | null
  updated_at: string | null
}

export type TuvDefectRow = {
  id: string
  position: string
  defectText: string
  doneByName: string
  dueUntil: string
  fixedAt: string
  fixedBySignature: string
}

export type TuvSignatureBlock = {
  name: string
  role: string
  date: string
  signatureDataUrl: string
}

export type TuvReportFormData = {
  defects: TuvDefectRow[]
  safetyCheck: TuvSignatureBlock
  hsseInspection: TuvSignatureBlock
  additionalNotes: string
}

export function emptyTuvFormData(): TuvReportFormData {
  return {
    defects: [],
    safetyCheck: { name: '', role: '', date: '', signatureDataUrl: '' },
    hsseInspection: { name: '', role: '', date: '', signatureDataUrl: '' },
    additionalNotes: '',
  }
}

function parseFormJson(raw: string | null | undefined): TuvReportFormData {
  if (!raw?.trim()) return emptyTuvFormData()
  try {
    const p = JSON.parse(raw) as Partial<TuvReportFormData>
    return {
      defects: Array.isArray(p.defects) ? p.defects : [],
      safetyCheck: { ...emptyTuvFormData().safetyCheck, ...(p.safetyCheck ?? {}) },
      hsseInspection: { ...emptyTuvFormData().hsseInspection, ...(p.hsseInspection ?? {}) },
      additionalNotes: String(p.additionalNotes ?? ''),
    }
  } catch {
    return emptyTuvFormData()
  }
}

export type TuvReportItemRow = {
  id: string
  report_id: string
  sort_order: number
  category: string | null
  question: string
  status: string | null
  note: string | null
  action_required: string | null
  responsible: string | null
  due_date: string | null
  photo_url: string | null
  created_at: string | null
  updated_at: string | null
}

function rowToReportApi(r: TuvReportRow) {
  return {
    id: r.id,
    stationId: r.station_id,
    month: r.month,
    year: r.year,
    reportDate: r.report_date ?? '',
    status: r.status,
    createdBy: r.created_by ?? undefined,
    createdByName: r.created_by_name ?? '',
    inspectorRole: r.inspector_role ?? '',
    weatherNote: r.weather_note ?? '',
    generalNote: r.general_note ?? '',
    completedBy: r.completed_by ?? undefined,
    completedByName: r.completed_by_name ?? '',
    completedAt: r.completed_at ?? undefined,
    confirmedBy: r.confirmed_by ?? undefined,
    confirmedByName: r.confirmed_by_name ?? '',
    confirmedAt: r.confirmed_at ?? undefined,
    confirmationText: r.confirmation_text ?? '',
    signatureDataUrl: r.signature_data_url ?? '',
    printedAt: r.printed_at ?? undefined,
    formData: parseFormJson(r.form_json),
    sourceTemplateDocumentId: r.source_template_document_id ?? undefined,
    createdAt: r.created_at ?? '',
    updatedAt: r.updated_at ?? '',
  }
}

function rowToItemApi(r: TuvReportItemRow) {
  return {
    id: r.id,
    reportId: r.report_id,
    sortOrder: r.sort_order,
    category: r.category ?? '',
    question: r.question,
    status: (r.status ?? '') as 'ok' | 'not_ok' | 'not_applicable' | '',
    note: r.note ?? '',
    actionRequired: r.action_required ?? '',
    responsible: r.responsible ?? '',
    dueDate: r.due_date ?? '',
    photoUrl: r.photo_url ?? '',
  }
}

export function listTuvReports(
  db: Database,
  q: { stationId: string; year?: number; status?: string },
) {
  let sql = `SELECT * FROM tuv_reports WHERE station_id = ?`
  const params: (string | number)[] = [q.stationId]
  if (q.year != null && Number.isFinite(q.year)) {
    sql += ` AND year = ?`
    params.push(q.year)
  }
  if (q.status && q.status !== 'all') {
    if (q.status === 'open') {
      sql += ` AND status IN ('draft','in_progress')`
    } else {
      sql += ` AND status = ?`
      params.push(q.status)
    }
  }
  sql += ` ORDER BY year DESC, month DESC`
  const rows = db.prepare(sql).all(...params) as TuvReportRow[]
  return rows.map(rowToReportApi)
}

export function findReportByStationMonth(db: Database, stationId: string, month: number, year: number) {
  return db
    .prepare(`SELECT * FROM tuv_reports WHERE station_id = ? AND month = ? AND year = ?`)
    .get(stationId, month, year) as TuvReportRow | undefined
}

export function getTuvReportWithItems(db: Database, id: string) {
  const r = db.prepare(`SELECT * FROM tuv_reports WHERE id = ?`).get(id) as TuvReportRow | undefined
  if (!r) return undefined
  const items = db
    .prepare(`SELECT * FROM tuv_report_items WHERE report_id = ? ORDER BY sort_order, id`)
    .all(id) as TuvReportItemRow[]
  return { report: rowToReportApi(r), items: items.map(rowToItemApi) }
}

export type CreateTuvReportInput = {
  stationId: string
  month: number
  year: number
  reportDate: string
  createdBy: string
  createdByName: string
  inspectorRole?: string
  weatherNote?: string
  generalNote?: string
}

export function createTuvReport(db: Database, input: CreateTuvReportInput) {
  const existing = findReportByStationMonth(db, input.stationId, input.month, input.year)
  if (existing) {
    const err = new Error('DUPLICATE_TUV_REPORT') as Error & { code?: string; existingId?: string }
    err.code = 'DUPLICATE_TUV_REPORT'
    err.existingId = existing.id
    throw err
  }
  const id = `tuv-${randomUUID()}`
  const ts = nowIso()
  db.prepare(
    `INSERT INTO tuv_reports (
      id, station_id, month, year, report_date, status, created_by, created_by_name,
      inspector_role, weather_note, general_note,
      completed_by, completed_by_name, completed_at,
      confirmed_by, confirmed_by_name, confirmed_at, confirmation_text, signature_data_url,
      printed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
  ).run(
    id,
    input.stationId,
    input.month,
    input.year,
    input.reportDate || null,
    input.createdBy,
    input.createdByName,
    input.inspectorRole ?? null,
    input.weatherNote ?? null,
    input.generalNote ?? null,
    ts,
    ts,
  )
  const insItem = db.prepare(
    `INSERT INTO tuv_report_items (id, report_id, sort_order, category, question, status, note, action_required, responsible, due_date, photo_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, '', '', '', '', NULL, ?, ?)`,
  )
  for (const tpl of TUV_REPORT_TEMPLATE_ITEMS) {
    insItem.run(
      `tuvi-${randomUUID()}`,
      id,
      tpl.sortOrder,
      tpl.category,
      formatTuvItemLabel(tpl),
      ts,
      ts,
    )
  }
  const tplDoc = findTemplateDocument(db, input.stationId, 'tuv_monatscheckliste')
  if (tplDoc) {
    db.prepare(`UPDATE tuv_reports SET source_template_document_id = ? WHERE id = ?`).run(tplDoc.id, id)
  }
  return getTuvReportWithItems(db, id)!
}

/** Monatsbericht öffnen: vorhandenen laden oder neuen leeren Bericht anlegen. */
export function getOrOpenTuvReportForMonth(
  db: Database,
  input: CreateTuvReportInput,
): { report: ReturnType<typeof getTuvReportWithItems>; created: boolean } {
  const existing = findReportByStationMonth(db, input.stationId, input.month, input.year)
  if (existing) {
    const detail = getTuvReportWithItems(db, existing.id)!
    return { report: detail, created: false }
  }
  const detail = createTuvReport(db, input)
  return { report: detail, created: true }
}

export type TuvReportItemInput = {
  id: string
  status?: string
  note?: string
  actionRequired?: string
  responsible?: string
  dueDate?: string
}

export function updateTuvReport(
  db: Database,
  id: string,
  body: {
    reportDate?: string
    inspectorRole?: string
    weatherNote?: string
    generalNote?: string
    status?: string
    items?: TuvReportItemInput[]
    formData?: TuvReportFormData
  },
  opts?: { allowWhenCompleted?: boolean; auditUserId?: string; auditUserName?: string },
) {
  const row = db.prepare(`SELECT * FROM tuv_reports WHERE id = ?`).get(id) as TuvReportRow | undefined
  if (!row) throw new Error('Bericht nicht gefunden')
  if (row.status === 'completed' || row.status === 'printed') {
    if (!opts?.allowWhenCompleted) throw new Error('Abgeschlossene Berichte können nicht bearbeitet werden')
  }
  const ts = nowIso()
  const nextStatus = body.status && ['draft', 'in_progress', 'completed', 'printed'].includes(body.status) ? body.status : row.status
  const formJson =
    body.formData !== undefined ? JSON.stringify(body.formData) : row.form_json

  if (opts?.allowWhenCompleted && opts.auditUserId && body.formData !== undefined) {
    logTuvReportAudit(db, id, opts.auditUserId, opts.auditUserName ?? '', 'form_data', row.form_json, formJson)
  }

  db.prepare(
    `UPDATE tuv_reports SET
      report_date = COALESCE(?, report_date),
      inspector_role = ?,
      weather_note = ?,
      general_note = ?,
      status = ?,
      form_json = ?,
      updated_at = ?
    WHERE id = ?`,
  ).run(
    body.reportDate !== undefined ? body.reportDate || null : row.report_date,
    body.inspectorRole !== undefined ? body.inspectorRole || null : row.inspector_role,
    body.weatherNote !== undefined ? body.weatherNote || null : row.weather_note,
    body.generalNote !== undefined ? body.generalNote || null : row.general_note,
    nextStatus,
    formJson,
    ts,
    id,
  )

  if (body.items && Array.isArray(body.items)) {
    const upd = db.prepare(
      `UPDATE tuv_report_items SET
        status = ?,
        note = ?,
        action_required = ?,
        responsible = ?,
        due_date = ?,
        updated_at = ?
      WHERE id = ? AND report_id = ?`,
    )
    for (const it of body.items) {
      if (!it.id) continue
      const st = it.status != null ? String(it.status) : null
      upd.run(
        st,
        it.note ?? '',
        it.actionRequired ?? '',
        it.responsible ?? '',
        it.dueDate ?? '',
        ts,
        it.id,
        id,
      )
    }
  }
  return getTuvReportWithItems(db, id)!
}

export function confirmTuvReport(
  db: Database,
  id: string,
  body: {
    signatureDataUrl?: string
    confirmationText?: string
    confirmedBy: string
    confirmedByName: string
  },
) {
  const row = db.prepare(`SELECT * FROM tuv_reports WHERE id = ?`).get(id) as TuvReportRow | undefined
  if (!row) throw new Error('Bericht nicht gefunden')
  if (row.status === 'printed') throw new Error('Bericht ist archiviert (gedruckt)')
  const ts = nowIso()
  const sig = String(body.signatureDataUrl ?? '').trim()
  const txt =
    String(body.confirmationText ?? '').trim() ||
    'Mit dem Drücken dieses Buttons bestätige ich, dass ich diesen TÜV-Bericht sorgfältig und nach bestem Wissen ausgefüllt habe.'
  db.prepare(
    `UPDATE tuv_reports SET
      confirmed_by = ?,
      confirmed_by_name = ?,
      confirmed_at = ?,
      confirmation_text = ?,
      signature_data_url = ?,
      updated_at = ?
    WHERE id = ?`,
  ).run(body.confirmedBy, body.confirmedByName, ts, txt, sig || null, ts, id)
  return getTuvReportWithItems(db, id)!
}

function validateItemsForComplete(db: Database, reportId: string) {
  const items = db.prepare(`SELECT * FROM tuv_report_items WHERE report_id = ?`).all(reportId) as TuvReportItemRow[]
  for (const it of items) {
    const st = (it.status ?? '').trim()
    if (!st) throw new Error(`Prüfpunkt nicht bewertet: ${it.question}`)
    if (st === 'not_ok') {
      const note = (it.note ?? '').trim()
      if (!note) throw new Error(`Mangeltext fehlt bei: ${it.question}`)
    }
  }
  const rep = db.prepare(`SELECT form_json FROM tuv_reports WHERE id = ?`).get(reportId) as { form_json: string | null }
  const form = parseFormJson(rep?.form_json)
  const safety = form.safetyCheck
  if (!safety.name.trim() || !safety.role.trim() || !safety.date.trim()) {
    throw new Error('Sicherheits-Check: Name, Funktion und Datum sind Pflicht.')
  }
}

function logTuvReportAudit(
  db: Database,
  reportId: string,
  userId: string,
  userName: string,
  fieldName: string,
  oldValue: string | null,
  newValue: string | null,
) {
  db.prepare(
    `INSERT INTO tuv_report_audit_log (id, report_id, user_id, user_name, field_name, old_value, new_value, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(`tuva-${randomUUID()}`, reportId, userId, userName, fieldName, oldValue, newValue, nowIso())
}

export function completeTuvReport(db: Database, id: string, userId: string, displayName: string) {
  const row = db.prepare(`SELECT * FROM tuv_reports WHERE id = ?`).get(id) as TuvReportRow | undefined
  if (!row) throw new Error('Bericht nicht gefunden')
  if (row.status === 'completed' || row.status === 'printed') throw new Error('Bericht ist bereits abgeschlossen')
  const hasConfirm = Boolean((row.confirmed_at ?? '').trim()) || Boolean((row.signature_data_url ?? '').trim())
  if (!hasConfirm) throw new Error('Bitte zuerst per Unterschrift oder Bestätigungsbutton bestätigen')
  validateItemsForComplete(db, id)
  const ts = nowIso()
  db.prepare(
    `UPDATE tuv_reports SET
      status = 'completed',
      completed_by = ?,
      completed_by_name = ?,
      completed_at = ?,
      updated_at = ?
    WHERE id = ?`,
  ).run(userId, displayName, ts, ts, id)
  return getTuvReportWithItems(db, id)!
}

export function markTuvReportPrinted(db: Database, id: string) {
  const row = db.prepare(`SELECT * FROM tuv_reports WHERE id = ?`).get(id) as TuvReportRow | undefined
  if (!row) throw new Error('Bericht nicht gefunden')
  if (row.status !== 'completed') throw new Error('Bericht muss zuerst abgeschlossen sein')
  const ts = nowIso()
  db.prepare(`UPDATE tuv_reports SET status = 'printed', printed_at = ?, updated_at = ? WHERE id = ?`).run(ts, ts, id)
  return getTuvReportWithItems(db, id)!
}

export function deleteTuvReport(db: Database, id: string) {
  db.prepare(`DELETE FROM tuv_report_items WHERE report_id = ?`).run(id)
  const r = db.prepare(`DELETE FROM tuv_reports WHERE id = ?`).run(id)
  if (r.changes === 0) throw new Error('Bericht nicht gefunden')
}

export function checkCurrentMonth(db: Database, stationId: string) {
  const d = new Date()
  const month = d.getMonth() + 1
  const year = d.getFullYear()
  const st = db
    .prepare(`SELECT monthly_tuv_report_enabled FROM stations WHERE id = ?`)
    .get(stationId) as { monthly_tuv_report_enabled: number | null } | undefined
  if (st?.monthly_tuv_report_enabled !== 1) {
    return {
      required: false,
      disabled: true,
      month,
      year,
      status: 'disabled' as const,
    }
  }
  const rep = findReportByStationMonth(db, stationId, month, year)
  if (!rep) {
    return { required: true, month, year, status: 'missing' as const }
  }
  if (rep.status === 'draft' || rep.status === 'in_progress') {
    return { required: true, month, year, status: 'in_progress' as const, reportId: rep.id }
  }
  if (rep.status === 'completed') {
    return { required: false, month, year, status: 'completed' as const, reportId: rep.id }
  }
  return { required: false, month, year, status: 'printed' as const, reportId: rep.id }
}
