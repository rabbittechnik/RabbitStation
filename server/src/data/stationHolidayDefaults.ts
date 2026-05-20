import type { GermanState } from './germanFederalStates.js'
import { generateGermanHolidays, type GeneratedGermanHoliday } from './generateGermanHolidays.js'
import type { StationHolidaySeedTemplate } from '../types/payrollHolidayCategory.js'
import type { PayrollHolidayCategory, PayrollHolidaySpecialRuleTier } from '../types/payrollHolidayCategory.js'

export type StationHolidayOptions = {
  bavariaAssumptionDayEnabled?: boolean
}

function mapCategory(
  h: GeneratedGermanHoliday,
): { payrollCategory: PayrollHolidayCategory; specialRuleTier?: PayrollHolidaySpecialRuleTier } {
  if (h.category === 'special_holiday') return { payrollCategory: 'special' }
  if (h.category === 'special_rule') {
    return {
      payrollCategory: 'special_rule',
      specialRuleTier: h.surchargePercent >= 150 ? 'special' : 'regular',
    }
  }
  return { payrollCategory: 'regular' }
}

function templateFromGenerated(h: GeneratedGermanHoliday): StationHolidaySeedTemplate {
  const { payrollCategory, specialRuleTier } = mapCategory(h)
  return {
    statutoryTemplateId: h.statutoryTemplateId,
    name: h.name,
    date: h.date,
    payrollCategory,
    specialRuleTier,
    referencePercent: h.surchargePercent,
    allDay: h.periodType === 'all_day',
    timeStart: h.startTime,
    timeEnd: h.endTime,
  }
}

/** Gesetzliche + ergänzende Feiertags-Vorlagen pro Bundesland und Jahr. */
export function getStationHolidaySeedTemplates(
  state: GermanState,
  year: number,
  options: StationHolidayOptions = {},
): StationHolidaySeedTemplate[] {
  const generated = generateGermanHolidays(year, state, {
    bavariaAssumptionDayEnabled: options.bavariaAssumptionDayEnabled === true,
  })
  return generated.map(templateFromGenerated)
}
