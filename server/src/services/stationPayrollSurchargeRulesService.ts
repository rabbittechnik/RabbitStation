import type { Database } from 'better-sqlite3'
import { DEMO_STATION_ID } from '../constants/demo.js'
import {
  DEMO_STATION_PAYROLL_SURCHARGE_RULES,
  DEFAULT_STATION_PAYROLL_SURCHARGE_RULES,
  type StationPayrollSurchargeRules,
} from '../types/stationPayrollSurchargeRules.js'

type StationRulesRow = {
  normal_weekday_night_bonus_enabled: number | null
  normal_weekday_evening_bonus_enabled: number | null
  saturday_surcharge_enabled: number | null
  sunday_surcharge_enabled: number | null
  payroll_supplements_prefer_schedule: number | null
  default_special_holiday_percent: number | null
  payroll_only_sunday_holiday_supplements: number | null
}

function flag(v: number | null | undefined, defaultOn: boolean): boolean {
  if (v == null) return defaultOn
  return v === 1
}

function numOr(v: number | null | undefined, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function rulesFromStationRow(
  row: StationRulesRow | undefined | null,
  stationId: string,
): StationPayrollSurchargeRules {
  const preset =
    stationId === DEMO_STATION_ID || stationId === 'aral-bodelshausen'
      ? DEMO_STATION_PAYROLL_SURCHARGE_RULES
      : DEFAULT_STATION_PAYROLL_SURCHARGE_RULES
  if (!row) return { ...preset }

  return {
    normalWeekdayNightBonusEnabled: flag(
      row.normal_weekday_night_bonus_enabled,
      preset.normalWeekdayNightBonusEnabled,
    ),
    normalWeekdayEveningBonusEnabled: flag(
      row.normal_weekday_evening_bonus_enabled,
      preset.normalWeekdayEveningBonusEnabled,
    ),
    saturdaySurchargeEnabled: flag(row.saturday_surcharge_enabled, preset.saturdaySurchargeEnabled),
    sundaySurchargeEnabled: flag(row.sunday_surcharge_enabled, preset.sundaySurchargeEnabled),
    supplementsPreferSchedule: flag(row.payroll_supplements_prefer_schedule, preset.supplementsPreferSchedule),
    defaultSpecialHolidayPercent: numOr(row.default_special_holiday_percent, preset.defaultSpecialHolidayPercent),
    onlySundayAndHolidaySupplements: flag(
      row.payroll_only_sunday_holiday_supplements,
      preset.onlySundayAndHolidaySupplements,
    ),
  }
}

export function loadStationPayrollSurchargeRules(db: Database, stationId: string): StationPayrollSurchargeRules {
  const row = db
    .prepare(
      `SELECT normal_weekday_night_bonus_enabled, normal_weekday_evening_bonus_enabled,
              saturday_surcharge_enabled, sunday_surcharge_enabled,
              payroll_supplements_prefer_schedule, default_special_holiday_percent,
              payroll_only_sunday_holiday_supplements
       FROM stations WHERE id = ?`,
    )
    .get(stationId) as StationRulesRow | undefined
  return rulesFromStationRow(row, stationId)
}
