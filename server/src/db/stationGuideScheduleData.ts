/**
 * Demo-Schichtimport (neutral) – kleine Beispielwoche für Entwicklung.
 */

export type StationGuideShiftSeed = {
  date: string
  employeeName: string
  startTime: string
  endTime: string
  workAreaCode: string
  shiftType: 'regular'
  source: 'stationguide_import'
}

export type StationGuideAbsenceSeed = {
  employeeName: string
  type: 'vacation'
  startDate: string
  endDate: string
  status: 'approved'
  source: 'stationguide_import'
  note: string
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Demo-Schichten (Früh/Spät) – nur neutrale Namen. */
export const stationGuideImportedShifts: StationGuideShiftSeed[] = [
  { date: iso(2026, 5, 19), employeeName: 'Max Becker', startTime: '06:00', endTime: '14:00', workAreaCode: 'K', shiftType: 'regular', source: 'stationguide_import' },
  { date: iso(2026, 5, 19), employeeName: 'Tim Wagner', startTime: '14:00', endTime: '22:00', workAreaCode: 'K', shiftType: 'regular', source: 'stationguide_import' },
  { date: iso(2026, 5, 20), employeeName: 'Laura Sommer', startTime: '08:00', endTime: '16:00', workAreaCode: 'B', shiftType: 'regular', source: 'stationguide_import' },
  { date: iso(2026, 5, 20), employeeName: 'Nina Keller', startTime: '14:00', endTime: '22:00', workAreaCode: 'S', shiftType: 'regular', source: 'stationguide_import' },
  { date: iso(2026, 5, 21), employeeName: 'Max Becker', startTime: '06:00', endTime: '14:00', workAreaCode: 'K', shiftType: 'regular', source: 'stationguide_import' },
  { date: iso(2026, 5, 21), employeeName: 'Jonas Weber', startTime: '14:00', endTime: '22:00', workAreaCode: 'K', shiftType: 'regular', source: 'stationguide_import' },
  { date: iso(2026, 5, 22), employeeName: 'Mia Fischer', startTime: '10:00', endTime: '18:00', workAreaCode: 'W', shiftType: 'regular', source: 'stationguide_import' },
]

export const stationGuideImportedAbsences: StationGuideAbsenceSeed[] = [
  {
    employeeName: 'Jonas Weber',
    type: 'vacation',
    startDate: iso(2026, 6, 10),
    endDate: iso(2026, 6, 14),
    status: 'approved',
    source: 'stationguide_import',
    note: 'Demo-Urlaub',
  },
]
