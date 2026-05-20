import type { GermanState } from './germanFederalStates.js'

export type GeneratedHolidayCategory = 'holiday' | 'special_holiday' | 'special_rule'

export type GeneratedGermanHoliday = {
  date: string
  name: string
  category: GeneratedHolidayCategory
  surchargePercent: number
  periodType: 'all_day' | 'partial'
  startTime?: string
  endTime?: string
  isSystemGenerated: true
  federalState: GermanState
  year: number
  statutoryTemplateId: string
}

export type GenerateHolidayOptions = {
  /** Mariä Himmelfahrt (BY) — nur in bestimmten Gemeinden */
  bavariaAssumptionDayEnabled?: boolean
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() + days)
  return x
}

/** Ostersonntag (Gregorian). */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function firstAdventSunday(year: number): Date {
  const dec25 = new Date(year, 11, 25)
  const dow = dec25.getDay()
  return new Date(year, 11, 25 - dow - 21)
}

/** Buß- und Bettag (Sachsen): Mittwoch 11 Tage vor dem 1. Adventssonntag. */
export function bussUndBettag(year: number): Date {
  const advent = firstAdventSunday(year)
  return addDays(advent, -11)
}

function templateId(slug: string, year: number): string {
  return `de-${year}-${slug}`
}

type HolidayDef = Omit<GeneratedGermanHoliday, 'year' | 'federalState' | 'isSystemGenerated' | 'statutoryTemplateId'> & {
  slug: string
  states: GermanState[] | 'ALL'
}

function toGenerated(
  year: number,
  state: GermanState,
  def: HolidayDef,
): GeneratedGermanHoliday {
  return {
    date: def.date,
    name: def.name,
    category: def.category,
    surchargePercent: def.surchargePercent,
    periodType: def.periodType,
    startTime: def.startTime,
    endTime: def.endTime,
    isSystemGenerated: true,
    federalState: state,
    year,
    statutoryTemplateId: templateId(def.slug, year),
  }
}

function applies(states: GermanState[] | 'ALL', state: GermanState): boolean {
  return states === 'ALL' || states.includes(state)
}

/**
 * Gesetzliche Feiertage für Jahr und Bundesland.
 * Bewegliche Feiertage werden per Osterformel berechnet.
 */
export function generateGermanHolidays(
  year: number,
  federalState: GermanState,
  options: GenerateHolidayOptions = {},
): GeneratedGermanHoliday[] {
  const easter = easterSunday(year)
  const defs: HolidayDef[] = [
  // Bundesweit
    {
      slug: 'neujahr',
      date: `${year}-01-01`,
      name: 'Neujahr',
      category: 'special_holiday',
      surchargePercent: 150,
      periodType: 'all_day',
      states: 'ALL',
    },
    {
      slug: 'karfreitag',
      date: formatYmd(addDays(easter, -2)),
      name: 'Karfreitag',
      category: 'holiday',
      surchargePercent: 125,
      periodType: 'all_day',
      states: 'ALL',
    },
    {
      slug: 'ostermontag',
      date: formatYmd(addDays(easter, 1)),
      name: 'Ostermontag',
      category: 'holiday',
      surchargePercent: 125,
      periodType: 'all_day',
      states: 'ALL',
    },
    {
      slug: 'tag-der-arbeit',
      date: `${year}-05-01`,
      name: 'Tag der Arbeit',
      category: 'special_holiday',
      surchargePercent: 150,
      periodType: 'all_day',
      states: 'ALL',
    },
    {
      slug: 'christi-himmelfahrt',
      date: formatYmd(addDays(easter, 39)),
      name: 'Christi Himmelfahrt',
      category: 'holiday',
      surchargePercent: 125,
      periodType: 'all_day',
      states: 'ALL',
    },
    {
      slug: 'pfingstmontag',
      date: formatYmd(addDays(easter, 50)),
      name: 'Pfingstmontag',
      category: 'holiday',
      surchargePercent: 125,
      periodType: 'all_day',
      states: 'ALL',
    },
    {
      slug: 'tag-der-deutschen-einheit',
      date: `${year}-10-03`,
      name: 'Tag der Deutschen Einheit',
      category: 'holiday',
      surchargePercent: 125,
      periodType: 'all_day',
      states: 'ALL',
    },
    {
      slug: 'weihnachten-1',
      date: `${year}-12-25`,
      name: '1. Weihnachtsfeiertag',
      category: 'special_holiday',
      surchargePercent: 150,
      periodType: 'all_day',
      states: 'ALL',
    },
    {
      slug: 'weihnachten-2',
      date: `${year}-12-26`,
      name: '2. Weihnachtsfeiertag',
      category: 'special_holiday',
      surchargePercent: 150,
      periodType: 'all_day',
      states: 'ALL',
    },
    {
      slug: 'heiligabend',
      date: `${year}-12-24`,
      name: 'Heiligabend',
      category: 'special_rule',
      surchargePercent: 150,
      periodType: 'partial',
      startTime: '14:00',
      endTime: '23:59',
      states: 'ALL',
    },
    {
      slug: 'silvester',
      date: `${year}-12-31`,
      name: 'Silvester',
      category: 'special_rule',
      surchargePercent: 125,
      periodType: 'partial',
      startTime: '14:00',
      endTime: '23:59',
      states: 'ALL',
    },
    // Bundesland-spezifisch (fest)
    {
      slug: 'heilige-drei-koenige',
      date: `${year}-01-06`,
      name: 'Heilige Drei Könige',
      category: 'holiday',
      surchargePercent: 125,
      periodType: 'all_day',
      states: ['BW', 'BY', 'ST'],
    },
    {
      slug: 'frauentag',
      date: `${year}-03-08`,
      name: 'Internationaler Frauentag',
      category: 'holiday',
      surchargePercent: 125,
      periodType: 'all_day',
      states: ['BE', 'MV'],
    },
    {
      slug: 'fronleichnam',
      date: formatYmd(addDays(easter, 60)),
      name: 'Fronleichnam',
      category: 'holiday',
      surchargePercent: 125,
      periodType: 'all_day',
      states: ['BW', 'BY', 'HE', 'NW', 'RP', 'SL'],
    },
    {
      slug: 'maria-himmelfahrt',
      date: `${year}-08-15`,
      name: 'Mariä Himmelfahrt',
      category: 'holiday',
      surchargePercent: 125,
      periodType: 'all_day',
      states: ['SL'],
    },
    {
      slug: 'weltkindertag',
      date: `${year}-09-20`,
      name: 'Weltkindertag',
      category: 'holiday',
      surchargePercent: 125,
      periodType: 'all_day',
      states: ['TH'],
    },
    {
      slug: 'reformationstag',
      date: `${year}-10-31`,
      name: 'Reformationstag',
      category: 'holiday',
      surchargePercent: 125,
      periodType: 'all_day',
      states: ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'SH', 'ST', 'TH'],
    },
    {
      slug: 'allerheiligen',
      date: `${year}-11-01`,
      name: 'Allerheiligen',
      category: 'holiday',
      surchargePercent: 125,
      periodType: 'all_day',
      states: ['BW', 'BY', 'NW', 'RP', 'SL'],
    },
    {
      slug: 'buss-und-bettag',
      date: formatYmd(bussUndBettag(year)),
      name: 'Buß- und Bettag',
      category: 'holiday',
      surchargePercent: 125,
      periodType: 'all_day',
      states: ['SN'],
    },
  ]

  if (federalState === 'BY' && options.bavariaAssumptionDayEnabled) {
    defs.push({
      slug: 'maria-himmelfahrt-by',
      date: `${year}-08-15`,
      name: 'Mariä Himmelfahrt',
      category: 'holiday',
      surchargePercent: 125,
      periodType: 'all_day',
      states: ['BY'],
    })
  }

  const byDate = new Map<string, GeneratedGermanHoliday>()
  for (const def of defs) {
    if (!applies(def.states, federalState)) continue
    byDate.set(def.date, toGenerated(year, federalState, def))
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
}
