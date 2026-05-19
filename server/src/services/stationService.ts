import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { nowIso } from '../utils/timestamps.js'
import { seedStationShiftCloseChecklistDefsFromBuiltInCatalog } from './stationShiftChecklistDefService.js'

export function listStations(db: Database) {
  return db.prepare(`SELECT * FROM stations ORDER BY name`).all()
}

export function getStation(db: Database, id: string) {
  return db.prepare(`SELECT * FROM stations WHERE id = ?`).get(id) as Record<string, unknown> | undefined
}

export type StationSummaryCounts = {
  employeeCount: number
  openShiftsCount: number
  hasHistoricalData: boolean
}

export function getStationSummary(db: Database, stationId: string): StationSummaryCounts {
  const emp =
    (db.prepare(`SELECT COUNT(*) as c FROM employees WHERE station_id = ?`).get(stationId) as { c: number })
      ?.c ?? 0
  const openShifts =
    (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM shifts WHERE station_id = ? AND date >= date('now') AND (published IS NULL OR published = 0 OR lower(trim(status)) = 'draft')`,
        )
        .get(stationId) as { c: number }
    )?.c ?? 0
  const hasHistoricalData = stationHasHistoricalData(db, stationId)
  return { employeeCount: emp, openShiftsCount: openShifts, hasHistoricalData }
}

/** Liegt mindestens ein „historischer“ Datensatz zur Station vor? */
export function stationHasHistoricalData(db: Database, stationId: string): boolean {
  const one = (sql: string) =>
    ((db.prepare(sql).get(stationId) as { c: number } | undefined)?.c ?? 0) > 0
  return (
    one(`SELECT COUNT(*) as c FROM employees WHERE station_id = ?`) ||
    one(`SELECT COUNT(*) as c FROM shifts WHERE station_id = ?`) ||
    one(`SELECT COUNT(*) as c FROM time_entries WHERE station_id = ?`) ||
    one(`SELECT COUNT(*) as c FROM absences WHERE station_id = ?`) ||
    one(`SELECT COUNT(*) as c FROM tasks WHERE station_id = ?`) ||
    one(`SELECT COUNT(*) as c FROM tuv_reports WHERE station_id = ?`) ||
    one(`SELECT COUNT(*) as c FROM payroll_adjustments WHERE station_id = ?`) ||
    one(`SELECT COUNT(*) as c FROM station_tablet_devices WHERE station_id = ?`) ||
    one(`SELECT COUNT(*) as c FROM card_entry_events WHERE station_id = ?`) ||
    one(`SELECT COUNT(*) as c FROM vacation_blocks WHERE station_id = ?`) ||
    one(`SELECT COUNT(*) as c FROM station_extra_holidays WHERE station_id = ?`) ||
    one(`SELECT COUNT(*) as c FROM station_announcements WHERE station_id = ?`) ||
    one(`SELECT COUNT(*) as c FROM employee_shift_warnings WHERE station_id = ?`) ||
    one(`SELECT COUNT(*) as c FROM shift_checklist_review_items WHERE station_id = ?`)
  )
}

function purgeStationData(db: Database, stationId: string) {
  db.prepare(`DELETE FROM station_meter_readings WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM station_meters WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM station_org_contacts WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM station_calendar_events WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM station_org_list_items WHERE list_id IN (SELECT id FROM station_org_lists WHERE station_id = ?)`).run(
    stationId,
  )
  db.prepare(`DELETE FROM station_org_lists WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM station_chat_group_members WHERE group_id IN (SELECT id FROM station_chat_groups WHERE station_id = ?)`).run(
    stationId,
  )
  db.prepare(`DELETE FROM station_chat_groups WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM station_announcements WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM station_extra_holidays WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM account_billing_documents WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM account_invoices WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM task_logs WHERE task_id IN (SELECT id FROM tasks WHERE station_id = ?)`).run(stationId)
  db.prepare(`DELETE FROM tasks WHERE station_id = ?`).run(stationId)
  db.prepare(
    `DELETE FROM shift_close_checklist_runs WHERE time_entry_id IN (SELECT id FROM time_entries WHERE station_id = ?)`,
  ).run(stationId)
  db.prepare(
    `DELETE FROM shift_close_checklists WHERE time_entry_id IN (SELECT id FROM time_entries WHERE station_id = ?)`,
  ).run(stationId)
  db.prepare(`DELETE FROM time_entry_corrections WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM time_entries WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM shifts WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM absences WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM vacation_blocks WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM payroll_adjustments WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM tuv_report_items WHERE report_id IN (SELECT id FROM tuv_reports WHERE station_id = ?)`).run(
    stationId,
  )
  db.prepare(`DELETE FROM tuv_reports WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM card_entry_events WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM employee_shift_warnings WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM shift_checklist_review_items WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM station_shift_close_checklist_defs WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM employee_app_devices WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM fuel_price_cache WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM station_tablet_devices WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM employee_work_areas WHERE station_id = ? OR employee_id IN (SELECT id FROM employees WHERE station_id = ?)`).run(
    stationId,
    stationId,
  )
  db.prepare(`DELETE FROM employees WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM work_areas WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM settings WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM user_station_access WHERE station_id = ?`).run(stationId)
  db.prepare(`DELETE FROM stations WHERE id = ?`).run(stationId)
}

/** Endgültiges Löschen nur ohne Historie; sonst wirft Fehler. */
export function hardDeleteStationIfEmpty(db: Database, id: string) {
  if (stationHasHistoricalData(db, id)) {
    throw new Error('Station hat historische Daten und kann nicht endgültig gelöscht werden.')
  }
  const tx = db.transaction(() => {
    purgeStationData(db, id)
  })
  tx()
}

/** Aus Dropdown ausblenden: deaktivieren + Zeitstempel. */
export function archiveStation(db: Database, id: string) {
  const ts = nowIso()
  const r = db
    .prepare(
      `UPDATE stations SET active = 0, archived_at = COALESCE(archived_at, ?), deleted_at = ?, updated_at = ? WHERE id = ?`,
    )
    .run(ts, ts, ts, id)
  if (r.changes === 0) throw new Error('Station nicht gefunden')
}

export function restoreStation(db: Database, id: string) {
  const ts = nowIso()
  const r = db
    .prepare(
      `UPDATE stations SET active = 1, archived_at = NULL, deleted_at = NULL, updated_at = ? WHERE id = ?`,
    )
    .run(ts, id)
  if (r.changes === 0) throw new Error('Station nicht gefunden')
}

/**
 * DELETE: ohne Historie → hard delete; mit Historie → archivieren (kein Hard-Delete).
 * Rückgabe: { mode: 'deleted' | 'archived', message?: string }
 */
export function deleteStationSmart(db: Database, id: string): { mode: 'deleted' | 'archived'; message?: string } {
  if (stationHasHistoricalData(db, id)) {
    archiveStation(db, id)
    return {
      mode: 'archived',
      message:
        'Diese Station hat historische Daten und kann nicht endgültig gelöscht werden. Sie wurde deaktiviert und im normalen Stationswechsel ausgeblendet.',
    }
  }
  hardDeleteStationIfEmpty(db, id)
  return { mode: 'deleted' }
}

export function createStation(db: Database, body: Record<string, unknown>) {
  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID()
  const name = String(body.name ?? '').trim()
  if (!name) throw new Error('name erforderlich')
  const ts = nowIso()
  const street = body.street != null ? String(body.street).trim() || null : null
  const houseNumber = body.houseNumber != null ? String(body.houseNumber).trim() || null : null
  const combinedAddress =
    [street, houseNumber].filter(Boolean).join(' ').trim() || (body.address != null ? String(body.address) : null)

  const cols = new Set(
    (db.prepare(`PRAGMA table_info(stations)`).all() as { name: string }[]).map((c) => c.name),
  )
  const hasStreet = cols.has('street')

  if (hasStreet) {
    db.prepare(
      `INSERT INTO stations (id, name, brand, address, street, house_number, city, postal_code, phone, email, contact_person, notes, federal_state, tankerkoenig_station_id, standard_work_times_json, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(
      id,
      name,
      body.brand != null ? String(body.brand).trim() || null : null,
      combinedAddress,
      street,
      houseNumber,
      body.city != null ? String(body.city).trim() || null : null,
      body.postalCode != null ? String(body.postalCode).trim() || null : null,
      body.phone != null ? String(body.phone).trim() || null : null,
      body.email != null ? String(body.email).trim() || null : null,
      body.contactPerson != null ? String(body.contactPerson).trim() || null : null,
      body.notes != null ? String(body.notes).trim() || null : null,
      String(body.federalState ?? 'BW'),
      body.tankerkoenigStationId != null ? String(body.tankerkoenigStationId).trim() || null : null,
      body.standardWorkTimesJson != null ? String(body.standardWorkTimesJson) : null,
      ts,
      ts,
    )
  } else {
    db.prepare(
      `INSERT INTO stations (id, name, brand, address, city, postal_code, phone, email, federal_state, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(
      id,
      name,
      body.brand != null ? String(body.brand) : null,
      combinedAddress,
      body.city != null ? String(body.city) : null,
      body.postalCode != null ? String(body.postalCode) : null,
      body.phone != null ? String(body.phone) : null,
      body.email != null ? String(body.email) : null,
      String(body.federalState ?? 'BW'),
      ts,
      ts,
    )
  }
  const tenantId = body.tenantId != null ? String(body.tenantId).trim() : ''
  if (tenantId && cols.has('tenant_id')) {
    db.prepare(`UPDATE stations SET tenant_id = ? WHERE id = ?`).run(tenantId, id)
  }
  seedStationShiftCloseChecklistDefsFromBuiltInCatalog(db, id)
  return getStation(db, id)
}

export function updateStation(db: Database, id: string, body: Record<string, unknown>) {
  const ts = nowIso()
  const row = getStation(db, id)
  if (!row) throw new Error('Station nicht gefunden')

  const setPart: string[] = []
  const vals: unknown[] = []

  const set = (col: string, val: unknown) => {
    setPart.push(`${col} = ?`)
    vals.push(val)
  }

  if (body.name !== undefined)
    set('name', String(body.name ?? '').trim() || String(row.name ?? 'Station'))
  if (body.brand !== undefined) set('brand', body.brand == null ? null : String(body.brand).trim() || null)
  if (body.street !== undefined) set('street', body.street == null ? null : String(body.street).trim() || null)
  if (body.houseNumber !== undefined)
    set('house_number', body.houseNumber == null ? null : String(body.houseNumber).trim() || null)
  if (body.city !== undefined) set('city', body.city == null ? null : String(body.city).trim() || null)
  if (body.postalCode !== undefined)
    set('postal_code', body.postalCode == null ? null : String(body.postalCode).trim() || null)
  if (body.phone !== undefined) set('phone', body.phone == null ? null : String(body.phone).trim() || null)
  if (body.email !== undefined) set('email', body.email == null ? null : String(body.email).trim() || null)
  if (body.contactPerson !== undefined)
    set('contact_person', body.contactPerson == null ? null : String(body.contactPerson).trim() || null)
  if (body.notes !== undefined) set('notes', body.notes == null ? null : String(body.notes).trim() || null)
  if (body.federalState !== undefined) set('federal_state', String(body.federalState ?? 'BW'))
  if (Object.prototype.hasOwnProperty.call(body, 'tankerkoenigStationId')) {
    const raw = body.tankerkoenigStationId
    set(
      'tankerkoenig_station_id',
      raw == null || (typeof raw === 'string' && raw.trim() === '') ? null : String(raw).trim(),
    )
  }
  if (body.timezone !== undefined) set('timezone', body.timezone == null ? 'Europe/Berlin' : String(body.timezone).trim() || 'Europe/Berlin')
  if (body.fuelPriceRefreshMinutes !== undefined) {
    const n = Number(body.fuelPriceRefreshMinutes)
    set('fuel_price_refresh_minutes', Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1)
  }
  if (body.tabletSettingsJson !== undefined) {
    set('tablet_settings_json', body.tabletSettingsJson == null ? null : String(body.tabletSettingsJson))
  }
  if (body.backshopRulesJson !== undefined) {
    set('backshop_rules_json', body.backshopRulesJson == null ? null : String(body.backshopRulesJson))
  }
  if (body.automaticBreakDeduction !== undefined) {
    const a = body.automaticBreakDeduction
    const num = typeof a === 'boolean' ? (a ? 1 : 0) : Number(a)
    set('automatic_break_deduction', Number.isFinite(num) ? num : 0)
  }
  if (body.defaultBreakMinutes !== undefined) {
    const n = Number(body.defaultBreakMinutes)
    set('default_break_minutes', Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0)
  }
  if (body.autoClockOutEnabled !== undefined) {
    const a = body.autoClockOutEnabled
    const num = typeof a === 'boolean' ? (a ? 1 : 0) : Number(a)
    set('auto_clock_out_enabled', Number.isFinite(num) ? num : 1)
  }
  if (body.autoClockOutTime !== undefined) {
    const s = String(body.autoClockOutTime ?? '22:45').trim() || '22:45'
    set('auto_clock_out_time', s)
  }
  if (body.standardWorkTimesJson !== undefined) {
    set(
      'standard_work_times_json',
      body.standardWorkTimesJson == null ? null : String(body.standardWorkTimesJson),
    )
  }
  if (Object.prototype.hasOwnProperty.call(body, 'active')) {
    const a = body.active
    const num = typeof a === 'boolean' ? (a ? 1 : 0) : Number(a)
    set('active', Number.isFinite(num) ? num : 1)
  }

  if (body.street !== undefined || body.houseNumber !== undefined) {
    const st = body.street !== undefined ? (body.street == null ? null : String(body.street).trim()) : (row.street as string | null)
    const hn =
      body.houseNumber !== undefined
        ? body.houseNumber == null
          ? null
          : String(body.houseNumber).trim()
        : (row.house_number as string | null)
    const line = [st, hn].filter(Boolean).join(' ').trim()
    if (line || body.street !== undefined || body.houseNumber !== undefined) set('address', line || null)
  }

  if (setPart.length === 0) {
    return row
  }

  setPart.push('updated_at = ?')
  vals.push(ts, id)

  const sql = `UPDATE stations SET ${setPart.join(', ')} WHERE id = ?`
  db.prepare(sql).run(...vals)
  return getStation(db, id)
}

/** @deprecated Nutze deleteStationSmart */
export function deleteStation(db: Database, id: string) {
  archiveStation(db, id)
}
