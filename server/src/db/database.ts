import fs from 'node:fs'
import Database from 'better-sqlite3'
import {
  ensurePersistentDirectories,
  getDatabasePath,
  isDemoSeedEnabled,
  logPersistentStorageStartup,
} from '../config/dataPaths.js'
import { prepareDatabaseFileBeforeOpen } from '../config/databasePersistence.js'
import { runSchema } from './schema.js'
import { runMigrations } from './migrations.js'
import { seedIfEmpty } from './seed.js'
import { seedImportedStationGuideSchedule } from './seedSchedule.js'
import { processAutoClockOutsForAllStations } from '../services/timeEntryCorrectionService.js'

let dbInstance: Database.Database | null = null
let autoClockOutTimer: ReturnType<typeof setInterval> | null = null

export function getDbPath(): string {
  return getDatabasePath()
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return dbInstance
}

export function initDatabase(): Database.Database {
  const t0 = Date.now()
  logPersistentStorageStartup()
  prepareDatabaseFileBeforeOpen()

  const dbPath = getDatabasePath()
  const dbExisted = fs.existsSync(dbPath)

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runSchema(db)
  runMigrations(db)

  seedIfEmpty(db)

  if (isDemoSeedEnabled()) {
    seedImportedStationGuideSchedule(db)
  }

  dbInstance = db

  try {
    processAutoClockOutsForAllStations(db)
  } catch (e) {
    console.error('[auto-clock-out] initial run:', e)
  }
  if (autoClockOutTimer) clearInterval(autoClockOutTimer)
  autoClockOutTimer = setInterval(() => {
    try {
      processAutoClockOutsForAllStations(db)
    } catch (e) {
      console.error('[auto-clock-out]:', e)
    }
  }, 90_000)

  console.log('Migrations completed')
  if (!dbExisted) {
    console.log('Database created (new file)')
  }

  const ms = Date.now() - t0
  console.info(`[startup] database init ${ms}ms (${dbPath})`)
  return db
}

export function closeDatabase() {
  if (autoClockOutTimer) {
    clearInterval(autoClockOutTimer)
    autoClockOutTimer = null
  }
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}
