import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { getStationHolidaySeedTemplates, type StationHolidayOptions } from '../data/stationHolidayDefaults.js'
import { GERMAN_STATE_LABELS, parseGermanState, type GermanState } from '../data/germanFederalStates.js'
import {
  categoryToPayrollTier,
  referencePercentForCategory,
  type PayrollHolidayCategory,
  type PayrollHolidaySpecialRuleTier,
} from '../types/payrollHolidayCategory.js'
import {
  emptyStationHolidayOverlay,
  type StationHolidayOverlay,
  type StationHolidayRule,
} from '../types/stationHolidayOverlay.js'
import { nowIso } from '../utils/timestamps.js'

export type StationExtraHolidayRow = {
  id: string
  station_id: string
  date: string
  name: string
  federal_state: string | null
  is_legal: number | null
  is_special: number | null
  counts_as_public: number | null
  counts_as_special: number | null
  opening_hours_note: string | null
  remark: string | null
  active: number | null
  payroll_category: string | null
  reference_percent: number | null
  all_day: number | null
  time_start: string | null
  time_end: string | null
  source: string | null
  statutory_template_id: string | null
  is_manual_override: number | null
  special_rule_tier: string | null
  created_at: string | null
  updated_at: string | null
  created_by: string | null
}

export type StationHolidayApi = {
  id: string
  date: string
  name: string
  federalState: string
  payrollCategory: PayrollHolidayCategory
  specialRuleTier: PayrollHolidaySpecialRuleTier | null
  referencePercent: number
  allDay: boolean
  timeStart: string | null
  timeEnd: string | null
  source: 'statutory' | 'custom'
  statutoryTemplateId: string | null
  isManualOverride: boolean
  active: boolean
  note: string
  /** Legacy */
  countsAsPublic: boolean
  countsAsSpecial: boolean
  isLegal: boolean
  isSpecial: boolean
  openingHoursNote: string
  createdAt: string | null
  updatedAt: string | null
  createdBy: string | null
}

function parseCategory(v: string | null | undefined): PayrollHolidayCategory {
  const s = String(v ?? 'regular').toLowerCase()
  if (s === 'none' || s === 'regular' || s === 'special' || s === 'special_rule') return s
  return 'regular'
}

function parseSpecialRuleTier(v: string | null | undefined): PayrollHolidaySpecialRuleTier | null {
  if (v === 'regular' || v === 'special') return v
  return null
}

function legacyCategoryFromRow(r: StationExtraHolidayRow): PayrollHolidayCategory {
  if ((r.counts_as_special ?? 0) === 1) return 'special'
  if ((r.counts_as_public ?? 1) === 0) return 'none'
  return 'regular'
}

function rowToApi(r: StationExtraHolidayRow): StationHolidayApi {
  const payrollCategory = r.payroll_category ? parseCategory(r.payroll_category) : legacyCategoryFromRow(r)
  const specialRuleTier = parseSpecialRuleTier(r.special_rule_tier)
  const referencePercent =
    r.reference_percent != null && Number.isFinite(Number(r.reference_percent))
      ? Number(r.reference_percent)
      : referencePercentForCategory(payrollCategory, specialRuleTier)
  const allDay = (r.all_day ?? 1) === 1
  const tier = categoryToPayrollTier(payrollCategory, specialRuleTier)

  return {
    id: r.id,
    date: r.date,
    name: r.name,
    federalState: r.federal_state ?? '',
    payrollCategory,
    specialRuleTier,
    referencePercent,
    allDay,
    timeStart: r.time_start ?? null,
    timeEnd: r.time_end ?? null,
    source: r.source === 'statutory' ? 'statutory' : 'custom',
    statutoryTemplateId: r.statutory_template_id ?? null,
    isManualOverride: (r.is_manual_override ?? 0) === 1,
    active: (r.active ?? 1) === 1,
    note: r.remark ?? '',
    countsAsPublic: tier !== 'none',
    countsAsSpecial: tier === 'special',
    isLegal: (r.is_legal ?? 0) === 1,
    isSpecial: tier === 'special',
    openingHoursNote: r.opening_hours_note ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by,
  }
}

function rowToRule(r: StationExtraHolidayRow): StationHolidayRule {
  const api = rowToApi(r)
  return {
    date: api.date,
    name: api.name,
    payrollCategory: api.payrollCategory,
    specialRuleTier: api.specialRuleTier,
    allDay: api.allDay,
    timeStart: api.timeStart,
    timeEnd: api.timeEnd,
    referencePercent: api.referencePercent,
    active: api.active,
  }
}

function syncLegacyFlags(
  payrollCategory: PayrollHolidayCategory,
  specialRuleTier: PayrollHolidaySpecialRuleTier | null,
): { countsAsPublic: number; countsAsSpecial: number; isSpecial: number } {
  const tier = categoryToPayrollTier(payrollCategory, specialRuleTier)
  return {
    countsAsPublic: tier === 'none' ? 0 : 1,
    countsAsSpecial: tier === 'special' ? 1 : 0,
    isSpecial: tier === 'special' ? 1 : 0,
  }
}

export function getStationFederalState(db: Database, stationId: string): GermanState {
  const row = db.prepare(`SELECT federal_state FROM stations WHERE id = ?`).get(stationId) as
    | { federal_state: string | null }
    | undefined
  return parseGermanState(row?.federal_state, 'BW')
}

export function getStationHolidayOptions(db: Database, stationId: string): StationHolidayOptions {
  const row = db.prepare(`SELECT station_holiday_options_json FROM stations WHERE id = ?`).get(stationId) as
    | { station_holiday_options_json: string | null }
    | undefined
  if (!row?.station_holiday_options_json?.trim()) return {}
  try {
    const parsed = JSON.parse(row.station_holiday_options_json) as StationHolidayOptions
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveStationHolidayOptions(db: Database, stationId: string, options: StationHolidayOptions): void {
  db.prepare(`UPDATE stations SET station_holiday_options_json = ?, updated_at = ? WHERE id = ?`).run(
    JSON.stringify(options),
    nowIso(),
    stationId,
  )
}

export type StationHolidaySettingsApi = {
  federalState: GermanState
  federalStateLabel: string
  options: StationHolidayOptions
}

export function getStationHolidaySettings(db: Database, stationId: string): StationHolidaySettingsApi {
  const federalState = getStationFederalState(db, stationId)
  return {
    federalState,
    federalStateLabel: GERMAN_STATE_LABELS[federalState],
    options: getStationHolidayOptions(db, stationId),
  }
}

export function updateStationHolidaySettings(
  db: Database,
  stationId: string,
  body: { federalState?: string; options?: StationHolidayOptions },
): StationHolidaySettingsApi {
  if (body.federalState != null) {
    const state = parseGermanState(body.federalState)
    db.prepare(`UPDATE stations SET federal_state = ?, updated_at = ? WHERE id = ?`).run(state, nowIso(), stationId)
  }
  if (body.options != null) {
    const current = getStationHolidayOptions(db, stationId)
    saveStationHolidayOptions(db, stationId, { ...current, ...body.options })
  }
  return getStationHolidaySettings(db, stationId)
}

export type RegenerateHolidaysResult = {
  year: number
  federalState: GermanState
  inserted: number
  removed: number
  skippedManualOrCustom: number
  conflicts: string[]
}

/** Ersetzt systemgenerierte Feiertage eines Jahres; manuelle und Zusatz-Feiertage bleiben. */
export function regenerateStationHolidays(
  db: Database,
  stationId: string,
  year: number,
  federalStateInput?: string,
  preserveManualChanges = true,
): RegenerateHolidaysResult {
  const federalState =
    federalStateInput != null ? parseGermanState(federalStateInput) : getStationFederalState(db, stationId)
  if (federalStateInput != null) {
    db.prepare(`UPDATE stations SET federal_state = ?, updated_at = ? WHERE id = ?`).run(federalState, nowIso(), stationId)
  }
  const options = getStationHolidayOptions(db, stationId)
  const templates = getStationHolidaySeedTemplates(federalState, year, options)
  const yearPrefix = `${year}-`

  const removed = db
    .prepare(
      `DELETE FROM station_extra_holidays
       WHERE station_id = ? AND source = 'statutory' AND date LIKE ?
       AND (is_manual_override IS NULL OR is_manual_override = 0)`,
    )
    .run(stationId, `${yearPrefix}%`).changes

  let inserted = 0
  let skippedManualOrCustom = 0
  const conflicts: string[] = []
  const ts = nowIso()

  const insert = db.prepare(
    `INSERT INTO station_extra_holidays (
      id, station_id, date, name, federal_state, is_legal, is_special,
      counts_as_public, counts_as_special, opening_hours_note, remark, active,
      payroll_category, reference_percent, all_day, time_start, time_end,
      source, statutory_template_id, is_manual_override, special_rule_tier,
      created_at, updated_at, created_by
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, NULL, NULL, 1, ?, ?, ?, ?, ?, 'statutory', ?, 0, ?, ?, ?, NULL)`,
  )

  for (const t of templates) {
    const blocked = db
      .prepare(
        `SELECT id, source, is_manual_override, name FROM station_extra_holidays
         WHERE station_id = ? AND date = ? LIMIT 1`,
      )
      .get(stationId, t.date) as
      | { id: string; source: string | null; is_manual_override: number | null; name: string }
      | undefined

    if (blocked) {
      if (blocked.source === 'custom' || (preserveManualChanges && (blocked.is_manual_override ?? 0) === 1)) {
        skippedManualOrCustom += 1
        continue
      }
      if (preserveManualChanges) {
        conflicts.push(`${t.date}: ${blocked.name}`)
        skippedManualOrCustom += 1
        continue
      }
    }

    const flags = syncLegacyFlags(t.payrollCategory, t.specialRuleTier ?? null)
    insert.run(
      `seh-${randomUUID()}`,
      stationId,
      t.date,
      t.name,
      federalState,
      flags.isSpecial,
      flags.countsAsPublic,
      flags.countsAsSpecial,
      t.payrollCategory,
      t.referencePercent,
      t.allDay ? 1 : 0,
      t.timeStart ?? null,
      t.timeEnd ?? null,
      t.statutoryTemplateId,
      t.specialRuleTier ?? null,
      ts,
      ts,
    )
    inserted += 1
  }

  return { year, federalState, inserted, removed, skippedManualOrCustom, conflicts }
}

export function seedStationHolidaysForYears(
  db: Database,
  stationId: string,
  years: number[],
  federalState?: GermanState,
): void {
  for (const year of years) {
    regenerateStationHolidays(db, stationId, year, federalState, true)
  }
}

/** Gesetzliche Feiertage für Station/Jahr anlegen, sofern noch kein Eintrag existiert. */
export function ensureStationStatutoryHolidaysSeeded(db: Database, stationId: string, year = 2026): void {
  const state = getStationFederalState(db, stationId)
  const options = getStationHolidayOptions(db, stationId)
  const templates = getStationHolidaySeedTemplates(state, year, options)
  const ts = nowIso()
  const insert = db.prepare(
    `INSERT INTO station_extra_holidays (
      id, station_id, date, name, federal_state, is_legal, is_special,
      counts_as_public, counts_as_special, opening_hours_note, remark, active,
      payroll_category, reference_percent, all_day, time_start, time_end,
      source, statutory_template_id, is_manual_override, special_rule_tier,
      created_at, updated_at, created_by
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, NULL, NULL, 1, ?, ?, ?, ?, ?, 'statutory', ?, 0, ?, ?, ?, NULL)`,
  )

  for (const t of templates) {
    const existing = db
      .prepare(
        `SELECT id FROM station_extra_holidays WHERE station_id = ? AND date = ? AND source = 'statutory' LIMIT 1`,
      )
      .get(stationId, t.date) as { id: string } | undefined
    if (existing) continue

    const byTemplate = t.statutoryTemplateId
      ? (db
          .prepare(
            `SELECT id FROM station_extra_holidays WHERE station_id = ? AND statutory_template_id = ? LIMIT 1`,
          )
          .get(stationId, t.statutoryTemplateId) as { id: string } | undefined)
      : undefined
    if (byTemplate) continue

    const legacy = db
      .prepare(`SELECT id FROM station_extra_holidays WHERE station_id = ? AND date = ? LIMIT 1`)
      .get(stationId, t.date) as { id: string } | undefined
    if (legacy) {
      db.prepare(
        `UPDATE station_extra_holidays SET
          statutory_template_id = COALESCE(statutory_template_id, ?),
          source = CASE WHEN source IS NULL OR source = '' THEN 'statutory' ELSE source END,
          payroll_category = COALESCE(payroll_category, ?),
          reference_percent = COALESCE(reference_percent, ?),
          all_day = COALESCE(all_day, ?),
          time_start = COALESCE(time_start, ?),
          time_end = COALESCE(time_end, ?),
          special_rule_tier = COALESCE(special_rule_tier, ?),
          updated_at = ?
        WHERE id = ? AND (is_manual_override IS NULL OR is_manual_override = 0)`,
      ).run(
        t.statutoryTemplateId,
        t.payrollCategory,
        t.referencePercent,
        t.allDay ? 1 : 0,
        t.timeStart ?? null,
        t.timeEnd ?? null,
        t.specialRuleTier ?? null,
        ts,
        legacy.id,
      )
      continue
    }

    const flags = syncLegacyFlags(t.payrollCategory, t.specialRuleTier ?? null)
    insert.run(
      `seh-${randomUUID()}`,
      stationId,
      t.date,
      t.name,
      state,
      flags.isSpecial,
      flags.countsAsPublic,
      flags.countsAsSpecial,
      t.payrollCategory,
      t.referencePercent,
      t.allDay ? 1 : 0,
      t.timeStart ?? null,
      t.timeEnd ?? null,
      t.statutoryTemplateId,
      t.specialRuleTier ?? null,
      ts,
      ts,
    )
  }
}

export function listStationExtraHolidays(
  db: Database,
  stationId: string,
  includeInactive?: boolean,
  year = 2026,
): StationHolidayApi[] {
  ensureStationStatutoryHolidaysSeeded(db, stationId, year)
  let sql = `SELECT * FROM station_extra_holidays WHERE station_id = ?`
  const params: unknown[] = [stationId]
  if (!includeInactive) sql += ` AND (active IS NULL OR active = 1)`
  sql += ` ORDER BY date, name`
  const rows = db.prepare(sql).all(...params) as StationExtraHolidayRow[]
  return rows.map(rowToApi)
}

export function createStationExtraHoliday(
  db: Database,
  stationId: string,
  body: Record<string, unknown>,
  createdBy?: string | null,
) {
  const date = String(body.date ?? '').trim()
  const name = String(body.name ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date als YYYY-MM-DD')
  if (!name) throw new Error('name erforderlich')

  const payrollCategory = parseCategory(body.payrollCategory != null ? String(body.payrollCategory) : 'regular')
  const specialRuleTier = parseSpecialRuleTier(
    body.specialRuleTier != null ? String(body.specialRuleTier) : null,
  )
  const referencePercent =
    body.referencePercent != null && body.referencePercent !== ''
      ? Number(body.referencePercent)
      : referencePercentForCategory(payrollCategory, specialRuleTier)
  const allDay = body.allDay === false || Number(body.allDay) === 0 ? false : true
  const timeStart = allDay ? null : body.timeStart != null ? String(body.timeStart).trim() || null : null
  const timeEnd = allDay ? null : body.timeEnd != null ? String(body.timeEnd).trim() || null : null
  const flags = syncLegacyFlags(payrollCategory, specialRuleTier)

  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `seh-${randomUUID()}`
  const ts = nowIso()
  const state = body.federalState != null ? String(body.federalState).trim() || getStationFederalState(db, stationId) : getStationFederalState(db, stationId)

  db.prepare(
    `INSERT INTO station_extra_holidays (
      id, station_id, date, name, federal_state, is_legal, is_special,
      counts_as_public, counts_as_special, opening_hours_note, remark, active,
      payroll_category, reference_percent, all_day, time_start, time_end,
      source, statutory_template_id, is_manual_override, special_rule_tier,
      created_at, updated_at, created_by
    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'custom', NULL, 1, ?, ?, ?, ?)`,
  ).run(
    id,
    stationId,
    date,
    name,
    state,
    flags.isSpecial,
    flags.countsAsPublic,
    flags.countsAsSpecial,
    body.openingHoursNote != null ? String(body.openingHoursNote) : null,
    body.note != null ? String(body.note) : body.remark != null ? String(body.remark) : null,
    payrollCategory,
    referencePercent,
    allDay ? 1 : 0,
    timeStart,
    timeEnd,
    specialRuleTier,
    ts,
    ts,
    createdBy ?? null,
  )
  return rowToApi(db.prepare(`SELECT * FROM station_extra_holidays WHERE id = ?`).get(id) as StationExtraHolidayRow)
}

export function updateStationExtraHoliday(db: Database, id: string, body: Record<string, unknown>) {
  const existing = db.prepare(`SELECT * FROM station_extra_holidays WHERE id = ?`).get(id) as StationExtraHolidayRow | undefined
  if (!existing) throw new Error('Eintrag nicht gefunden')

  const current = rowToApi(existing)
  const payrollCategory =
    body.payrollCategory != null ? parseCategory(String(body.payrollCategory)) : current.payrollCategory
  const specialRuleTier =
    body.specialRuleTier !== undefined
      ? parseSpecialRuleTier(body.specialRuleTier == null ? null : String(body.specialRuleTier))
      : current.specialRuleTier
  const allDay = body.allDay != null ? body.allDay !== false && Number(body.allDay) !== 0 : current.allDay
  const referencePercent =
    body.referencePercent != null && body.referencePercent !== ''
      ? Number(body.referencePercent)
      : current.referencePercent
  const flags = syncLegacyFlags(payrollCategory, specialRuleTier)
  const ts = nowIso()

  db.prepare(
    `UPDATE station_extra_holidays SET
      date = COALESCE(?, date),
      name = COALESCE(?, name),
      federal_state = COALESCE(?, federal_state),
      is_legal = COALESCE(?, is_legal),
      is_special = ?,
      counts_as_public = ?,
      counts_as_special = ?,
      opening_hours_note = COALESCE(?, opening_hours_note),
      remark = COALESCE(?, remark),
      active = COALESCE(?, active),
      payroll_category = ?,
      reference_percent = ?,
      all_day = ?,
      time_start = ?,
      time_end = ?,
      special_rule_tier = ?,
      is_manual_override = 1,
      updated_at = ?
    WHERE id = ?`,
  ).run(
    body.date != null ? String(body.date) : null,
    body.name != null ? String(body.name) : null,
    body.federalState !== undefined ? (body.federalState == null ? null : String(body.federalState)) : null,
    body.isLegal != null ? (body.isLegal === true || Number(body.isLegal) === 1 ? 1 : 0) : null,
    flags.isSpecial,
    flags.countsAsPublic,
    flags.countsAsSpecial,
    body.openingHoursNote !== undefined ? (body.openingHoursNote == null ? null : String(body.openingHoursNote)) : null,
    body.note !== undefined ? (body.note == null ? null : String(body.note)) : body.remark !== undefined ? (body.remark == null ? null : String(body.remark)) : null,
    body.active != null ? (body.active === false || Number(body.active) === 0 ? 0 : 1) : null,
    payrollCategory,
    referencePercent,
    allDay ? 1 : 0,
    allDay ? null : body.timeStart !== undefined ? (body.timeStart == null ? null : String(body.timeStart)) : existing.time_start,
    allDay ? null : body.timeEnd !== undefined ? (body.timeEnd == null ? null : String(body.timeEnd)) : existing.time_end,
    specialRuleTier,
    ts,
    id,
  )
  return rowToApi(db.prepare(`SELECT * FROM station_extra_holidays WHERE id = ?`).get(id) as StationExtraHolidayRow)
}

export function getStationExtraHolidayStationId(db: Database, id: string): string | undefined {
  const r = db.prepare(`SELECT station_id FROM station_extra_holidays WHERE id = ?`).get(id) as { station_id: string } | undefined
  return r?.station_id
}

/** Für Lohn-/Zuschlagslogik: aktive Feiertagsregeln aus der Stationsverwaltung. */
export function buildStationHolidayOverlay(db: Database, stationId: string, year = 2026): StationHolidayOverlay {
  ensureStationStatutoryHolidaysSeeded(db, stationId, year)
  const rows = db
    .prepare(
      `SELECT * FROM station_extra_holidays WHERE station_id = ? AND (active IS NULL OR active = 1) ORDER BY date`,
    )
    .all(stationId) as StationExtraHolidayRow[]

  if (!rows.length) return emptyStationHolidayOverlay()

  const rules: StationHolidayRule[] = []
  const extraPublicDates = new Set<string>()
  const extraNames = new Map<string, string>()
  const specialAllDayDates = new Set<string>()

  for (const r of rows) {
    const rule = rowToRule(r)
    rules.push(rule)
    const tier = categoryToPayrollTier(rule.payrollCategory, rule.specialRuleTier)
    if (tier !== 'none') {
      extraPublicDates.add(rule.date)
      extraNames.set(rule.date, rule.name)
    }
    if (tier === 'special' && rule.allDay) specialAllDayDates.add(rule.date)
  }

  return { rules, extraPublicDates, extraNames, specialAllDayDates }
}
