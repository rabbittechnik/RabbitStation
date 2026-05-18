import { DEMO_STATION, DEMO_STATION_ID } from './demo.js'

/** Bekannte Stationen für Bootstrap (nur neutrale Demo-Daten). */
export const KNOWN_STATIONS = [
  {
    id: DEMO_STATION_ID,
    name: DEMO_STATION.name,
    brand: DEMO_STATION.brand,
    city: DEMO_STATION.city,
    federalState: DEMO_STATION.federalState,
  },
] as const
