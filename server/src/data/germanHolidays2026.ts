/** Feiertagslogik für Planungs-Assistent — nutzt zentrale Generierung. */

import type { GermanState } from './germanFederalStates.js'
import { generateGermanHolidays } from './generateGermanHolidays.js'

export type { GermanState } from './germanFederalStates.js'
export { GERMAN_FEDERAL_STATES, GERMAN_STATE_LABELS, parseGermanState } from './germanFederalStates.js'

export type GermanHoliday = {
  id: string
  name: string
  date: string
  scope: 'nationwide' | 'state'
  states: GermanState[] | 'ALL'
  payrollTier?: 'regular' | 'special'
}

function toLegacyHoliday(h: ReturnType<typeof generateGermanHolidays>[number]): GermanHoliday {
  return {
    id: h.statutoryTemplateId,
    name: h.name,
    date: h.date,
    scope: 'nationwide',
    states: 'ALL',
    payrollTier: h.category === 'special_holiday' ? 'special' : h.category === 'holiday' ? 'regular' : undefined,
  }
}

export const GERMAN_HOLIDAYS_2026: GermanHoliday[] = generateGermanHolidays(2026, 'BW').map(toLegacyHoliday)

export function holidaysForYearAndState(year: number, state: GermanState): GermanHoliday[] {
  return generateGermanHolidays(year, state).map(toLegacyHoliday)
}

export function holidayAppliesToState(h: GermanHoliday, state: GermanState): boolean {
  if (h.scope === 'nationwide' || h.states === 'ALL') return true
  return Array.isArray(h.states) && h.states.includes(state)
}

export function getHolidayBadgeForDate(date: string, state: GermanState): {
  severity: 'strong' | 'soft' | 'none'
  label: string
} {
  const year = Number(date.slice(0, 4)) || 2026
  const all = holidaysForYearAndState(year, state).filter((h) => h.date === date)
  const relevant = all.filter((h) => holidayAppliesToState(h, state))
  if (relevant.length > 0) {
    return { severity: 'strong', label: relevant.map((h) => h.name).join(' · ') }
  }
  const other = holidaysForYearAndState(year, 'BW').filter((h) => h.date === date && !holidayAppliesToState(h, state))
  if (other.length > 0) {
    return { severity: 'soft', label: other.map((h) => h.name).join(' · ') }
  }
  return { severity: 'none', label: '' }
}
