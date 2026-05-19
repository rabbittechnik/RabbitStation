import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { isDemoSeedEnabled } from '../config/dataPaths.js'
import { DEFAULT_STATION_ID } from '../constants.js'
import { nowIso } from '../utils/timestamps.js'
import {
  stationGuideImportedAbsences,
  stationGuideImportedShifts,
} from './stationGuideScheduleData.js'

const STATION_ID = DEFAULT_STATION_ID

const NAME_ALIASES: Record<string, string> = {}

function normalizeEmployeeName(input: string): string {
  const t = input.trim()
  const key = t.toLowerCase().replace(/\s+/g, ' ')
  return NAME_ALIASES[key] ?? t
}

function findEmployeeIdByName(db: Database.Database, displayName: string): string | undefined {
  const canon = normalizeEmployeeName(displayName)
  const row = db
    .prepare(
      `SELECT id FROM employees WHERE station_id = ? AND lower(trim(display_name)) = lower(trim(?)) LIMIT 1`,
    )
    .get(STATION_ID, canon) as { id: string } | undefined
  return row?.id
}

function ensureImportedEmployee(db: Database.Database, displayName: string): string {
  const canon = normalizeEmployeeName(displayName)
  const existing = findEmployeeIdByName(db, canon)
  if (existing) return existing

  const id = `e-imp-${randomUUID().slice(0, 8)}`
  const ts = nowIso()
  const parts = canon.split(/\s+/).filter(Boolean)
  const first = parts[0] ?? 'Import'
  const last = parts.length > 1 ? parts.slice(1).join(' ') : 'Mitarbeiter'
  const card = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`

  db.prepare(
    `INSERT INTO employees (
      id, station_id, first_name, last_name, display_name, email, phone, birthday, role, employment_type,
      hourly_wage, monthly_salary, weekly_hours, monthly_hours, vacation_days_total, vacation_days_used,
      color, status, cash_register_card_number, terminal_enabled, time_tracking_enabled,
      start_date, end_date, notes, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, '', '', 'Verkäufer', 'teilzeit', 14, NULL, 20, 80, 25, 0, '#94a3b8', 'active', ?, 1, 1, date('now'), NULL, ?, 1, ?, ?)`,
  ).run(
    id,
    STATION_ID,
    first,
    last,
    canon,
    `${id}@import.local`,
    card,
    'Automatisch angelegt (StationGuide-Import)',
    ts,
    ts,
  )

  const buero = db
    .prepare(`SELECT id FROM work_areas WHERE station_id = ? AND id = 'buero' LIMIT 1`)
    .get(STATION_ID) as { id: string } | undefined
  const fallback = db
    .prepare(`SELECT id FROM work_areas WHERE station_id = ? LIMIT 1`)
    .get(STATION_ID) as { id: string } | undefined
  const wid = buero?.id ?? fallback?.id
  if (wid) {
    db.prepare(`INSERT INTO employee_work_areas (id, employee_id, work_area_id) VALUES (?, ?, ?)`).run(
      randomUUID(),
      id,
      wid,
    )
  }
  return id
}

function workAreaIdForCode(db: Database.Database, code: string): string {
  const row = db
    .prepare(
      `SELECT id FROM work_areas WHERE station_id = ? AND upper(trim(short_code)) = upper(trim(?)) LIMIT 1`,
    )
    .get(STATION_ID, code) as { id: string } | undefined
  if (row) return row.id
  const buero = db
    .prepare(`SELECT id FROM work_areas WHERE station_id = ? AND id = 'buero' LIMIT 1`)
    .get(STATION_ID) as { id: string } | undefined
  if (buero) return buero.id
  throw new Error(`Arbeitsbereich „${code}“ nicht gefunden`)
}

function shiftExists(
  db: Database.Database,
  employeeId: string,
  date: string,
  start: string,
  end: string,
  workAreaId: string,
): boolean {
  const r = db
    .prepare(
      `SELECT 1 FROM shifts WHERE employee_id = ? AND date = ? AND start_time = ? AND end_time = ? AND work_area_id = ? LIMIT 1`,
    )
    .get(employeeId, date, start, end, workAreaId) as { 1: number } | undefined
  return Boolean(r)
}

function absenceVacationExists(
  db: Database.Database,
  employeeId: string,
  start: string,
  end: string,
): boolean {
  const r = db
    .prepare(
      `SELECT 1 FROM absences WHERE employee_id = ? AND type = 'paid_vacation' AND start_date = ? AND end_date = ? LIMIT 1`,
    )
    .get(employeeId, start, end) as { 1: number } | undefined
  return Boolean(r)
}

function alreadyImported(db: Database.Database): boolean {
  const r = db
    .prepare(`SELECT COUNT(*) as c FROM shifts WHERE import_source = ?`)
    .get('stationguide_import') as { c: number }
  return (r?.c ?? 0) > 0
}

export type SeedImportedStationGuideResult = {
  skipped: boolean
  reason?: string
  shiftsInserted: number
  absencesInserted: number
}

/**
 * Einmaliger Import der StationGuide-Beispieldaten (idempotent über import_source).
 */
export function seedImportedStationGuideSchedule(
  db: Database.Database,
): SeedImportedStationGuideResult {
  if (!isDemoSeedEnabled()) {
    return {
      skipped: true,
      reason: 'demo_seed_disabled',
      shiftsInserted: 0,
      absencesInserted: 0,
    }
  }
  const empty = db.prepare(`SELECT COUNT(*) as c FROM employees`).get() as { c: number }
  if ((empty?.c ?? 0) === 0) {
    return { skipped: true, reason: 'no_employees', shiftsInserted: 0, absencesInserted: 0 }
  }

  if (alreadyImported(db)) {
    return {
      skipped: true,
      reason: 'stationguide_already_present',
      shiftsInserted: 0,
      absencesInserted: 0,
    }
  }

  const waB = workAreaIdForCode(db, 'B')
  const ts = nowIso()
  let shiftsInserted = 0
  let absencesInserted = 0

  const tx = db.transaction(() => {
    const insShift = db.prepare(
      `INSERT INTO shifts (
        id, station_id, employee_id, work_area_id, date, start_time, end_time, break_minutes,
        shift_type, title, note, color, status, published, conflict, import_source, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '', NULL, 'published', 1, 0, ?, NULL, NULL, ?, ?)`,
    )

    for (const sh of stationGuideImportedShifts) {
      const empId = ensureImportedEmployee(db, sh.employeeName)
      if (shiftExists(db, empId, sh.date, sh.startTime, sh.endTime, waB)) continue
      const id = `sg-sh-${sh.date}-${empId}-${sh.startTime.replace(':', '')}-${sh.endTime.replace(':', '')}`
      insShift.run(
        id,
        STATION_ID,
        empId,
        waB,
        sh.date,
        sh.startTime,
        sh.endTime,
        0,
        sh.shiftType,
        'stationguide_import',
        ts,
        ts,
      )
      shiftsInserted += 1
    }

    const insAbs = db.prepare(
      `INSERT INTO absences (id, station_id, employee_id, type, start_date, end_date, half_day, status, comment, requested_at, approved_by, approved_at, rejected_by, rejected_at, rejected_reason, paid, counts_against_vacation, paid_hours_per_day, paid_hours_total, absence_days, created_at, updated_at)
       VALUES (?, ?, ?, 'paid_vacation', ?, ?, 0, 'approved', ?, ?, ?, ?, NULL, NULL, NULL, 1, 1, 8, ?, ?, ?, ?)`,
    )

    for (const ab of stationGuideImportedAbsences) {
      const empId = ensureImportedEmployee(db, ab.employeeName)
      if (absenceVacationExists(db, empId, ab.startDate, ab.endDate)) continue
      const id = `sg-abs-${empId}-${ab.startDate}-${ab.endDate}`
      const s = new Date(`${ab.startDate}T12:00:00`)
      const e = new Date(`${ab.endDate}T12:00:00`)
      const absenceDays = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1)
      const paidHoursTotal = absenceDays * 8
      insAbs.run(
        id,
        STATION_ID,
        empId,
        ab.startDate,
        ab.endDate,
        `${ab.note} [${ab.source}]`,
        ts,
        'Import',
        ts,
        paidHoursTotal,
        absenceDays,
        ts,
        ts,
      )
      absencesInserted += 1
    }
  })

  tx()

  return { skipped: false, shiftsInserted, absencesInserted }
}
