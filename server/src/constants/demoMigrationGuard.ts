import type Database from 'better-sqlite3'
import { LEGACY_REAL_STATION_ID } from './demo.js'

/** True, wenn noch Daten der alten Echt-Station in der DB liegen. */
export function hasLegacyRealStation(db: Database.Database): boolean {
  const row = db
    .prepare(`SELECT 1 AS ok FROM stations WHERE id = ? LIMIT 1`)
    .get(LEGACY_REAL_STATION_ID) as { ok: number } | undefined
  return Boolean(row?.ok)
}

/** Legacy-Migrationen (Bodelshausen/Aral) nur bei bestehender Alt-Station ausführen. */
export function shouldRunLegacyRealStationMigrations(db: Database.Database): boolean {
  return hasLegacyRealStation(db)
}
