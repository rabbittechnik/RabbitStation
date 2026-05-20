import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import {
  createStationExtraHoliday,
  listStationExtraHolidays,
  regenerateStationHolidays,
  updateStationExtraHoliday,
} from './stationExtraHolidayService.js'

describe('regenerateStationHolidays', () => {
  let db: Database.Database
  const stationId = 'test-station-holidays'

  before(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE stations (
        id TEXT PRIMARY KEY,
        name TEXT,
        federal_state TEXT DEFAULT 'BW',
        station_holiday_options_json TEXT DEFAULT '{}',
        federal_state_setup_completed INTEGER DEFAULT 1,
        updated_at TEXT
      );
      CREATE TABLE station_extra_holidays (
        id TEXT PRIMARY KEY,
        station_id TEXT,
        date TEXT,
        name TEXT,
        federal_state TEXT,
        is_legal INTEGER,
        is_special INTEGER,
        counts_as_public INTEGER,
        counts_as_special INTEGER,
        opening_hours_note TEXT,
        remark TEXT,
        active INTEGER,
        payroll_category TEXT,
        reference_percent REAL,
        all_day INTEGER,
        time_start TEXT,
        time_end TEXT,
        source TEXT,
        statutory_template_id TEXT,
        is_manual_override INTEGER,
        special_rule_tier TEXT,
        created_at TEXT,
        updated_at TEXT,
        created_by TEXT
      );
    `)
    db.prepare(`INSERT INTO stations (id, name, federal_state) VALUES (?, 'Test', 'BW')`).run(stationId)
  })

  after(() => {
    db.close()
  })

  it('seeds BW then switches to BE with different holidays', () => {
    regenerateStationHolidays(db, stationId, 2026, 'BW', true)
    const bw = listStationExtraHolidays(db, stationId, true, 2026)
    assert.ok(bw.some((h) => h.name === 'Heilige Drei Könige'))

    regenerateStationHolidays(db, stationId, 2026, 'BE', true)
    const be = listStationExtraHolidays(db, stationId, true, 2026)
    assert.ok(be.some((h) => h.name.includes('Frauentag')))
    assert.ok(!be.some((h) => h.name === 'Heilige Drei Könige'))
  })

  it('preserves manually edited holidays on regenerate', () => {
    regenerateStationHolidays(db, stationId, 2026, 'BW', true)
    const neujahr = listStationExtraHolidays(db, stationId, true, 2026).find((h) => h.name === 'Neujahr')
    assert.ok(neujahr)
    updateStationExtraHoliday(db, neujahr!.id, { name: 'Neujahr (angepasst)' })

    regenerateStationHolidays(db, stationId, 2026, 'BW', true)
    const after = listStationExtraHolidays(db, stationId, true, 2026)
    assert.ok(after.some((h) => h.name === 'Neujahr (angepasst)'))
  })

  it('preserves custom extra holidays', () => {
    createStationExtraHoliday(db, stationId, {
      date: '2026-07-15',
      name: 'Betriebsfest',
      payrollCategory: 'regular',
    })
    regenerateStationHolidays(db, stationId, 2026, 'BW', true)
    const list = listStationExtraHolidays(db, stationId, true, 2026)
    assert.ok(list.some((h) => h.name === 'Betriebsfest' && h.source === 'custom'))
  })
})
