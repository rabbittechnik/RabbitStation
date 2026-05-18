import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { runSchema } from './schema.js'
import { runMigrations } from './migrations.js'
import { seedIfEmpty } from './seed.js'
import { seedImportedStationGuideSchedule } from './seedSchedule.js'
import { processAutoClockOutsForAllStations } from '../services/timeEntryCorrectionService.js'

let dbInstance: Database.Database | null = null

export function getDbPath(): string {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH
  return path.join(process.cwd(), 'data', 'demo.sqlite')
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return dbInstance
}

export function initDatabase(): Database.Database {
  const t0 = Date.now()
  const dbPath = getDbPath()
  const dir = path.dirname(dbPath)
  fs.mkdirSync(dir, { recursive: true })
  // Keine Secrets — nur der aufgelöste Pfad (Railway: DATABASE_PATH=/data/neonshift.sqlite)
  console.log(`Using database path: ${dbPath}`)
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_PATH) {
    console.warn(
      'WARNUNG: DATABASE_PATH ist in Produktion nicht gesetzt. Daten könnten bei Redeploy verloren gehen.',
    )
  }

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runSchema(db)
  runMigrations(db)
  seedIfEmpty(db)
  runMigrations(db)
  seedImportedStationGuideSchedule(db)
  dbInstance = db
  try {
    processAutoClockOutsForAllStations(db)
  } catch (e) {
    console.error('[auto-clock-out] initial run:', e)
  }
  setInterval(() => {
    try {
      processAutoClockOutsForAllStations(db)
    } catch (e) {
      console.error('[auto-clock-out]:', e)
    }
  }, 90_000)
  const ms = Date.now() - t0
  console.info(`[startup] database init ${ms}ms (${dbPath})`)
  return db
}

export function closeDatabase() {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}
