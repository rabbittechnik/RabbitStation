/**
 * Standard-Schichtbedarf (Früh/Spät) mit Abdeckungsprüfung über zusammengeführte Mitarbeiter-Intervalle.
 * Sollzeiten: Kalender-Defaults und optional `stations.standard_work_times_json` (Stationseinstellungen).
 */

import type { GermanState } from './germanHolidays'
import type { DayRequirement, DayRequirementSlot } from '../types/scheduleAssistant'
import { getRelevantHolidayForState } from '../utils/holidayUtils'
import type { ResolvedShiftBlock, ScheduleShift } from './mockSchedule'
import { dayIndexInWeek, toISODate } from './mockSchedule'

/** Stationen mit Feiertags-Sonderlogik (Früh: 07:30 oder 08:30), falls keine Feiertagszeiten in den Stammdaten. */
export const DEFAULT_SHIFT_REQUIREMENTS_STATION_IDS = ['aral-bodelshausen'] as const

export type RequiredShiftType = 'early' | 'late' | 'middle' | 'night' | 'office' | 'custom'

export type ShiftTemplateRef = {
  id: string
  name: string
  type: string
  startTime: string
  endTime: string
}

export type ShiftRequirementOptions = {
  setupCompleted?: boolean
  shiftSetupCompleted?: boolean
  shiftTemplates?: ShiftTemplateRef[]
}

export type TimeRange = { startTime: string; endTime: string }

export type DefaultRequirementSlot = {
  id: string
  shiftType: RequiredShiftType
  label: string
  /** Anzeige bei fehlender Besetzung (Hauptzeitraum) */
  displayRange: TimeRange
  /** Eine dieser Zeiträume erfüllt die Anforderung (ODER), jeweils mit Toleranz an den Rändern. */
  acceptedRanges: TimeRange[]
  /** Zusatztext (z. B. Feiertag-Früh mit zwei Varianten) */
  detailHint?: string
}

export type MissingRequiredShift = {
  date: string
  shiftType: RequiredShiftType
  label: string
  startTime: string
  endTime: string
  detailHint?: string
  /** Nur ein Teil der Soll-Zeit offen (Rest durch andere Schichten abgedeckt). */
  partialGap?: boolean
}

export type OpenShiftWeekSummary = {
  totalMissingRequired: number
  earlyMissing: number
  lateMissing: number
  missingRequiredFlat: MissingRequiredShift[]
  missingByDay: { date: string; items: MissingRequiredShift[] }[]
  /** Offene DB-Schichten (employee_id leer), die nicht vollständig durch besetzte Schichten abgedeckt sind. */
  openDbShifts: ScheduleShift[]
  totalOpenDb: number
  /** Summe: sichtbare offene DB-Zeilen + fehlende Soll-Besetzung (Lücken). */
  totalCount: number
  summaryLine: string
}

export type StationStandardWorkTimesJson = {
  early?: { start?: string; end?: string }
  late?: { start?: string; end?: string }
  night?: { start?: string; end?: string }
  holiday?: { start?: string; end?: string }
}

/** Übergangstoleranz zwischen zwei Schichten (Minuten). */
export const SHIFT_COVERAGE_TOLERANCE_MINUTES = 15

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

function isoWeekdayKey(dateIso: string) {
  const d = new Date(`${dateIso}T12:00:00`)
  const i = d.getDay()
  const map = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
  return map[i]
}

function timeToMinutes(t: string): number {
  const raw = String(t ?? '').trim()
  const short = raw.length >= 5 ? raw.slice(0, 5) : raw
  const [h, m] = short.split(':').map(Number)
  return (Number.isFinite(h) ? h! : 0) * 60 + (Number.isFinite(m) ? m! : 0)
}

function minutesToHHMM(total: number): string {
  const m = Math.max(0, Math.min(total, 24 * 60 - 1))
  const h = Math.floor(m / 60)
  const mi = m % 60
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

export function parseStationStandardWorkTimes(json: string | null | undefined): StationStandardWorkTimesJson {
  if (!json || !json.trim()) return {}
  try {
    return JSON.parse(json) as StationStandardWorkTimesJson
  } catch {
    return {}
  }
}

export function stationUsesDefaultShiftRequirements(stationId: string): boolean {
  return (DEFAULT_SHIFT_REQUIREMENTS_STATION_IDS as readonly string[]).includes(stationId)
}

/** Werktag / Wochenende ohne Feiertags-Override (Kalender-Defaults). */
function slotsForCalendarWeekday(date: string): DefaultRequirementSlot[] {
  const wd = isoWeekdayKey(date)
  if (wd === 'saturday') {
    return [
      {
        id: 'sat-early',
        shiftType: 'early',
        label: 'Frühschicht',
        displayRange: { startTime: '06:30', endTime: '14:00' },
        acceptedRanges: [{ startTime: '06:30', endTime: '14:00' }],
      },
      {
        id: 'sat-late',
        shiftType: 'late',
        label: 'Spätschicht',
        displayRange: { startTime: '14:00', endTime: '20:15' },
        acceptedRanges: [{ startTime: '14:00', endTime: '20:15' }],
      },
    ]
  }
  if (wd === 'sunday') {
    return [
      {
        id: 'sun-early',
        shiftType: 'early',
        label: 'Frühschicht',
        displayRange: { startTime: '07:30', endTime: '14:00' },
        acceptedRanges: [{ startTime: '07:30', endTime: '14:00' }],
      },
      {
        id: 'sun-late',
        shiftType: 'late',
        label: 'Spätschicht',
        displayRange: { startTime: '14:00', endTime: '20:15' },
        acceptedRanges: [{ startTime: '14:00', endTime: '20:15' }],
      },
    ]
  }
  return [
    {
      id: 'wd-early',
      shiftType: 'early',
      label: 'Frühschicht',
      displayRange: { startTime: '05:30', endTime: '14:00' },
      acceptedRanges: [{ startTime: '05:30', endTime: '14:00' }],
    },
    {
      id: 'wd-late',
      shiftType: 'late',
      label: 'Spätschicht',
      displayRange: { startTime: '14:00', endTime: '21:15' },
      acceptedRanges: [{ startTime: '14:00', endTime: '21:15' }],
    },
  ]
}

function slotsForConfiguredHoliday(): DefaultRequirementSlot[] {
  return [
    {
      id: 'holiday-early',
      shiftType: 'early',
      label: 'Frühschicht',
      displayRange: { startTime: '07:30', endTime: '14:00' },
      acceptedRanges: [
        { startTime: '07:30', endTime: '14:00' },
        { startTime: '08:30', endTime: '14:00' },
      ],
      detailHint: '07:30–14:00 Uhr oder 08:30–14:00 Uhr',
    },
    {
      id: 'holiday-late',
      shiftType: 'late',
      label: 'Spätschicht',
      displayRange: { startTime: '14:00', endTime: '20:15' },
      acceptedRanges: [{ startTime: '14:00', endTime: '20:15' }],
    },
  ]
}

function normSlotTime(t?: string): string {
  const s = String(t ?? '').trim()
  if (!s) return ''
  return s.length >= 5 ? s.slice(0, 5) : s
}

function slotsFromEarlyLateJson(
  early: { start?: string; end?: string },
  late: { start?: string; end?: string },
  idPrefix: string,
): DefaultRequirementSlot[] | null {
  const es = normSlotTime(early.start)
  const ee = normSlotTime(early.end)
  const ls = normSlotTime(late.start)
  const le = normSlotTime(late.end)
  if (!es || !ee || !ls || !le) return null
  return [
    {
      id: `${idPrefix}-early`,
      shiftType: 'early',
      label: 'Frühschicht',
      displayRange: { startTime: es, endTime: ee },
      acceptedRanges: [{ startTime: es, endTime: ee }],
    },
    {
      id: `${idPrefix}-late`,
      shiftType: 'late',
      label: 'Spätschicht',
      displayRange: { startTime: ls, endTime: le },
      acceptedRanges: [{ startTime: ls, endTime: le }],
    },
  ]
}

function slotsFromShiftTemplates(templates: ShiftTemplateRef[]): DefaultRequirementSlot[] {
  return templates.map((t, i) => {
    const st = normSlotTime(t.startTime)
    const en = normSlotTime(t.endTime)
    const type = (['early', 'late', 'middle', 'night', 'office', 'custom'].includes(t.type) ?
      t.type
    : 'custom') as RequiredShiftType
    return {
      id: `tpl-${t.id || i}`,
      shiftType: type,
      label: t.name,
      displayRange: { startTime: st, endTime: en },
      acceptedRanges: [{ startTime: st, endTime: en }],
    }
  })
}

/**
 * Soll-Schichten für ein Kalenderdatum (Früh/Spät).
 * Optional: `standardWorkTimesJson` aus der Station (`standard_work_times_json`).
 */
export function getDefaultShiftRequirementsForDate(
  date: string,
  stationId: string,
  federalState: GermanState,
  standardWorkTimesJson?: string | null,
  options?: ShiftRequirementOptions,
): DefaultRequirementSlot[] {
  if (options) {
    if (!options.setupCompleted || !options.shiftSetupCompleted) return []
    if (options.shiftTemplates && options.shiftTemplates.length > 0) {
      return slotsFromShiftTemplates(options.shiftTemplates)
    }
  }

  const wt = parseStationStandardWorkTimes(standardWorkTimesJson)
  const fromStation = wt.early && wt.late ? slotsFromEarlyLateJson(wt.early, wt.late, 'station') : null

  const { hasHoliday } = getRelevantHolidayForState(date, federalState)

  if (hasHoliday) {
    const hStart = normSlotTime(wt.holiday?.start)
    const hEnd = normSlotTime(wt.holiday?.end)
    if (fromStation && hStart && hEnd) {
      return [
        {
          id: 'station-holiday-early',
          shiftType: 'early',
          label: 'Frühschicht',
          displayRange: { startTime: hStart, endTime: hEnd },
          acceptedRanges: [{ startTime: hStart, endTime: hEnd }],
        },
        fromStation[1]!,
      ]
    }
    if (stationUsesDefaultShiftRequirements(stationId)) {
      return slotsForConfiguredHoliday()
    }
    if (fromStation) return fromStation
    return slotsForCalendarWeekday(date)
  }

  if (fromStation) return fromStation

  if (!stationUsesDefaultShiftRequirements(stationId)) return []
  return slotsForCalendarWeekday(date)
}

function isAssignedCoverageShift(s: ScheduleShift): boolean {
  if (!s.employeeId || !String(s.employeeId).trim()) return false
  if (s.shiftType === 'frei') return false
  return true
}

/** Schnitt der Schicht mit [reqStart, reqEnd] als halboffenes Minutenintervall [a, b). */
function clipShiftToRequirementWindow(
  shift: ScheduleShift,
  reqStartMin: number,
  reqEndMin: number,
): { start: number; end: number } | null {
  if (!isAssignedCoverageShift(shift)) return null
  const sm = timeToMinutes(shift.startTime)
  let em = timeToMinutes(shift.endTime)
  const overnight = shift.shiftType === 'nacht'
  if (overnight && em <= sm) em += 24 * 60

  const a = Math.max(sm, reqStartMin)
  const b = Math.min(em, reqEndMin)
  if (b <= a) return null
  return { start: a, end: b }
}

/**
 * Echte Lücken in [requiredStart, requiredEnd] nach Zusammenführung überlappender / nahe liegender Besetzungen.
 */
export function calculateCoverageGaps(
  requiredStart: string,
  requiredEnd: string,
  assignedShifts: ScheduleShift[],
  tolMinutes = SHIFT_COVERAGE_TOLERANCE_MINUTES,
): TimeRange[] {
  const reqS = timeToMinutes(requiredStart)
  const reqE = timeToMinutes(requiredEnd)
  if (reqE <= reqS) return []

  const clips: { start: number; end: number }[] = []
  for (const s of assignedShifts) {
    const c = clipShiftToRequirementWindow(s, reqS, reqE)
    if (c) clips.push(c)
  }
  clips.sort((x, y) => x.start - y.start)

  const merged: { start: number; end: number }[] = []
  for (const iv of clips) {
    const last = merged[merged.length - 1]
    if (!last) {
      merged.push({ ...iv })
      continue
    }
    if (iv.start <= last.end + tolMinutes) {
      last.end = Math.max(last.end, iv.end)
    } else {
      merged.push({ ...iv })
    }
  }

  const gaps: TimeRange[] = []
  let cursor = reqS
  for (const m of merged) {
    if (m.start > cursor + tolMinutes) {
      gaps.push({ startTime: minutesToHHMM(cursor), endTime: minutesToHHMM(Math.min(m.start, reqE)) })
    }
    cursor = Math.max(cursor, m.end)
  }
  if (reqE > cursor + tolMinutes) {
    gaps.push({ startTime: minutesToHHMM(cursor), endTime: minutesToHHMM(reqE) })
  }
  return gaps
}

function acceptedSlotFullyCovered(
  range: TimeRange,
  dayShifts: ScheduleShift[],
  tolMinutes: number,
): boolean {
  return calculateCoverageGaps(range.startTime, range.endTime, dayShifts, tolMinutes).length === 0
}

function displayRangeEquals(a: TimeRange, b: TimeRange): boolean {
  return a.startTime === b.startTime && a.endTime === b.endTime
}

export function detectMissingRequiredShifts(
  date: string,
  existingShifts: ScheduleShift[],
  requirements: DefaultRequirementSlot[],
  tolMinutes = SHIFT_COVERAGE_TOLERANCE_MINUTES,
): MissingRequiredShift[] {
  const dayShifts = existingShifts.filter((s) => s.date === date)
  const out: MissingRequiredShift[] = []
  for (const req of requirements) {
    const coveredByOr = req.acceptedRanges.some((range) => acceptedSlotFullyCovered(range, dayShifts, tolMinutes))
    if (coveredByOr) continue

    const gaps = calculateCoverageGaps(
      req.displayRange.startTime,
      req.displayRange.endTime,
      dayShifts,
      tolMinutes,
    )
    if (gaps.length === 0) continue

    for (const g of gaps) {
      const fullMissing = gaps.length === 1 && displayRangeEquals(g, req.displayRange)
      out.push({
        date,
        shiftType: req.shiftType,
        label: req.label,
        startTime: g.startTime,
        endTime: g.endTime,
        detailHint: req.detailHint,
        partialGap: !fullMissing,
      })
    }
  }
  return out
}

/** Offene DB-Schicht, deren Zeitfenster vollständig durch besetzte Schichten abgedeckt ist (falsch/überholt). */
export function isOpenDbShiftRedundantWithCoverage(
  open: ScheduleShift,
  allShiftsOnDay: ScheduleShift[],
  tolMinutes = SHIFT_COVERAGE_TOLERANCE_MINUTES,
): boolean {
  if (open.employeeId && String(open.employeeId).trim()) return false
  const assigned = allShiftsOnDay.filter((s) => s.date === open.date)
  return calculateCoverageGaps(open.startTime, open.endTime, assigned, tolMinutes).length === 0
}

function formatMissingSummary(missing: MissingRequiredShift[]): string {
  if (missing.length === 0) return ''
  const counts = new Map<string, number>()
  for (const m of missing) {
    counts.set(m.label, (counts.get(m.label) ?? 0) + 1)
  }
  return [...counts.entries()].map(([label, n]) => `${n}× ${label}`).join(' · ') + ' fehlen'
}

export function calculateOpenShiftsForWeek(
  weekStart: string,
  shifts: ScheduleShift[],
  openDbShifts: ScheduleShift[],
  stationId: string,
  federalState: GermanState,
  standardWorkTimesJson?: string | null,
  options?: ShiftRequirementOptions,
): OpenShiftWeekSummary {
  const weekEnd = addDaysIso(weekStart, 6)
  const inWeek = (s: ScheduleShift) => s.date >= weekStart && s.date <= weekEnd
  const weekShifts = shifts.filter(inWeek)
  const openDbRaw = openDbShifts.filter(inWeek)

  const shiftsByDate = new Map<string, ScheduleShift[]>()
  for (const s of weekShifts) {
    const arr = shiftsByDate.get(s.date) ?? []
    arr.push(s)
    shiftsByDate.set(s.date, arr)
  }

  const openDb = openDbRaw.filter((o) => !isOpenDbShiftRedundantWithCoverage(o, shiftsByDate.get(o.date) ?? []))

  const missingFlat: MissingRequiredShift[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDaysIso(weekStart, i)
    const req = getDefaultShiftRequirementsForDate(date, stationId, federalState, standardWorkTimesJson, options)
    missingFlat.push(...detectMissingRequiredShifts(date, weekShifts, req))
  }

  const earlyMissing = missingFlat.filter((m) => m.shiftType === 'early').length
  const lateMissing = missingFlat.filter((m) => m.shiftType === 'late').length

  const byDayMap = new Map<string, MissingRequiredShift[]>()
  for (const m of missingFlat) {
    const arr = byDayMap.get(m.date) ?? []
    arr.push(m)
    byDayMap.set(m.date, arr)
  }
  const missingByDay = [...byDayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items }))

  const totalMissingRequired = missingFlat.length
  const totalOpenDb = openDb.length
  const totalNum = totalOpenDb + totalMissingRequired

  return {
    totalMissingRequired,
    earlyMissing,
    lateMissing,
    missingRequiredFlat: missingFlat,
    missingByDay,
    openDbShifts: openDb,
    totalOpenDb,
    totalCount: totalNum,
    summaryLine: formatMissingSummary(missingFlat),
  }
}

/**
 * Synthetische Timeline-Blöcke für fehlende Soll-Besetzung (keine DB-Zeile).
 */
function requirementTypeToBlockType(shiftType: string): import('./mockSchedule').ShiftTypeId {
  if (shiftType === 'early') return 'frueh'
  if (shiftType === 'late') return 'spaet'
  if (shiftType === 'night') return 'nacht'
  if (shiftType === 'middle') return 'mittel'
  if (shiftType === 'office') return 'regular'
  return 'sonderdienst'
}

export function buildRequirementGapResolvedBlocks(
  weekMonday: Date,
  stationId: string,
  federalState: GermanState,
  weekShifts: ScheduleShift[],
  standardWorkTimesJson?: string | null,
  options?: ShiftRequirementOptions,
): ResolvedShiftBlock[] {
  const weekStart = toISODate(weekMonday)
  const summary = calculateOpenShiftsForWeek(
    weekStart,
    weekShifts,
    [],
    stationId,
    federalState,
    standardWorkTimesJson,
    options,
  )
  const out: ResolvedShiftBlock[] = []
  for (let idx = 0; idx < summary.missingRequiredFlat.length; idx++) {
    const m = summary.missingRequiredFlat[idx]!
    const di = dayIndexInWeek(m.date, weekMonday)
    if (di === null) continue
    out.push({
      id: `synthetic-req-${m.date}-${m.shiftType}-${idx}`,
      dayIndex: di,
      type: requirementTypeToBlockType(m.shiftType),
      start: m.startTime,
      end: m.endTime,
      workAreaCode: 'K',
      dateISO: m.date,
      open: true,
      requirementGap: true,
      requirementGapPartial: Boolean(m.partialGap),
    })
  }
  return out
}

function toAssistantSlotKind(shiftType: RequiredShiftType): import('../types/scheduleAssistant').AssistantSlotKind {
  if (shiftType === 'office' || shiftType === 'custom') return 'middle'
  if (shiftType === 'early' || shiftType === 'late' || shiftType === 'night' || shiftType === 'middle') {
    return shiftType
  }
  return 'middle'
}

function toDayRequirementSlot(s: DefaultRequirementSlot): DayRequirementSlot {
  return {
    kind: toAssistantSlotKind(s.shiftType),
    startTime: s.displayRange.startTime,
    endTime: s.displayRange.endTime,
    workAreaId: 'kasse',
    required: true,
  }
}

/** Wochenbedarf für Schichtplan-Assistent (nur early/late). */
export function buildDefaultWeekRequirements(
  weekStart: string,
  stationId: string,
  federalState: GermanState,
  standardWorkTimesJson?: string | null,
  options?: ShiftRequirementOptions,
): DayRequirement[] {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const date = addDaysIso(weekStart, i)
    const req = getDefaultShiftRequirementsForDate(date, stationId, federalState, standardWorkTimesJson, options)
    return {
      date,
      slots: req.map(toDayRequirementSlot),
    }
  })
}
