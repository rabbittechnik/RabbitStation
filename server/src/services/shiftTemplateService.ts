import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { nowIso } from '../utils/timestamps.js'
import { assertStationBelongsToTenant } from './tenantService.js'

export type ShiftTemplateType = 'early' | 'middle' | 'late' | 'night' | 'office' | 'custom'

export type ShiftTemplateRow = {
  id: string
  tenant_id: string
  station_id: string
  name: string
  type: string
  start_time: string
  end_time: string
  color: string | null
  work_area_id: string | null
  active: number
  sort_order: number
  created_at: string
  updated_at: string
}

export type ShiftTemplateInput = {
  type: ShiftTemplateType
  name?: string
  startTime: string
  endTime: string
  color?: string | null
  workAreaId?: string | null
}

const PRESET_LABELS: Record<Exclude<ShiftTemplateType, 'custom'>, string> = {
  early: 'Frühschicht',
  middle: 'Mittelschicht',
  late: 'Spätschicht',
  night: 'Nachtschicht',
  office: 'Büro / Verwaltung',
}

export function templateToApi(row: ShiftTemplateRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    stationId: row.station_id,
    name: row.name,
    type: row.type,
    startTime: row.start_time,
    endTime: row.end_time,
    color: row.color,
    workAreaId: row.work_area_id,
    active: row.active === 1,
    sortOrder: row.sort_order,
  }
}

export function listShiftTemplates(db: Database, stationId: string, tenantId: string) {
  if (!assertStationBelongsToTenant(db, stationId, tenantId)) return []
  const rows = db
    .prepare(
      `SELECT * FROM shift_templates
       WHERE station_id = ? AND tenant_id = ? AND active = 1
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all(stationId, tenantId) as ShiftTemplateRow[]
  return rows.map(templateToApi)
}

function normTime(t: string): string {
  const s = String(t ?? '').trim()
  if (!/^\d{1,2}:\d{2}/.test(s)) throw new Error('Ungültige Uhrzeit')
  const [h, m] = s.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error('Ungültige Uhrzeit')
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function validateShiftTemplateInputs(templates: ShiftTemplateInput[]) {
  if (!Array.isArray(templates) || templates.length === 0) {
    throw new Error('Mindestens eine Schicht auswählen')
  }
  for (const t of templates) {
    const type = String(t.type ?? '').trim() as ShiftTemplateType
    if (!['early', 'middle', 'late', 'night', 'office', 'custom'].includes(type)) {
      throw new Error(`Unbekannter Schichttyp: ${type}`)
    }
    normTime(t.startTime)
    normTime(t.endTime)
    if (type === 'custom' && !String(t.name ?? '').trim()) {
      throw new Error('Eigene Schichten benötigen einen Namen')
    }
  }
}

export function templatesToStandardWorkTimesJson(templates: ShiftTemplateInput[]): string {
  const o: Record<string, unknown> = {}
  const customs: Array<{ name: string; start: string; end: string }> = []
  for (const t of templates) {
    const start = normTime(t.startTime)
    const end = normTime(t.endTime)
    if (t.type === 'custom') {
      customs.push({ name: String(t.name ?? '').trim(), start, end })
    } else {
      o[t.type] = { start, end }
    }
  }
  if (customs.length) o.customShifts = customs
  return JSON.stringify(o)
}

export function replaceShiftTemplates(
  db: Database,
  tenantId: string,
  stationId: string,
  templates: ShiftTemplateInput[],
) {
  if (!assertStationBelongsToTenant(db, stationId, tenantId)) {
    throw new Error('Station gehört nicht zum Tenant')
  }
  validateShiftTemplateInputs(templates)
  const ts = nowIso()
  const json = templatesToStandardWorkTimesJson(templates)

  const run = db.transaction(() => {
    db.prepare(`DELETE FROM shift_templates WHERE station_id = ? AND tenant_id = ?`).run(stationId, tenantId)
    const ins = db.prepare(
      `INSERT INTO shift_templates (
        id, tenant_id, station_id, name, type, start_time, end_time, color, work_area_id,
        active, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    )
    templates.forEach((t, i) => {
      const type = t.type
      const name =
        type === 'custom' ? String(t.name ?? '').trim() : PRESET_LABELS[type as Exclude<ShiftTemplateType, 'custom'>]
      ins.run(
        randomUUID(),
        tenantId,
        stationId,
        name,
        type,
        normTime(t.startTime),
        normTime(t.endTime),
        t.color?.trim() || null,
        t.workAreaId?.trim() || null,
        i,
        ts,
        ts,
      )
    })
    db.prepare(
      `UPDATE stations SET standard_work_times_json = ?, shift_setup_completed = 1, updated_at = ? WHERE id = ? AND tenant_id = ?`,
    ).run(json, ts, stationId, tenantId)
  })
  run()
  return listShiftTemplates(db, stationId, tenantId)
}
