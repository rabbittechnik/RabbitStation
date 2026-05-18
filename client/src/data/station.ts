import type { GermanState } from './germanHolidays'
import { DEMO_STATION_ID } from './demoStation'

/** Physisches Tablet / Terminal ohne Admin-Session: feste Demo-Station. */
export const DEFAULT_TABLET_STATION_ID = DEMO_STATION_ID

/** @deprecated Nutze useStation() in der Admin-App. */
export const STATION = {
  id: DEFAULT_TABLET_STATION_ID,
  name: 'Demo Station Süd',
  federalState: 'BW' as GermanState,
} as const

export const STATION_NAME = STATION.name
export const STATION_FEDERAL_STATE = STATION.federalState
