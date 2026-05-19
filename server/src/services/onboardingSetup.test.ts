import { describe, expect, it, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { runOnboardingMigrations } from '../db/onboardingMigrations.js'
import { validateShiftTemplateInputs, templatesToStandardWorkTimesJson } from './shiftTemplateService.js'
import { checkCurrentMonth } from './tuvReportService.js'

function openTestDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE stations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      standard_work_times_json TEXT,
      shift_setup_completed INTEGER DEFAULT 0,
      monthly_tuv_report_enabled INTEGER,
      owner_as_employee_enabled INTEGER DEFAULT 0,
      setup_owner_answered INTEGER DEFAULT 0,
      created_at TEXT
    );
    CREATE TABLE tenants (id TEXT PRIMARY KEY, setup_completed INTEGER DEFAULT 0, onboarding_tour_completed INTEGER DEFAULT 0);
    CREATE TABLE tuv_reports (id TEXT PRIMARY KEY, station_id TEXT, month INTEGER, year INTEGER, status TEXT);
  `)
  runOnboardingMigrations(db)
  return db
}

describe('validateShiftTemplateInputs', () => {
  it('requires at least one template', () => {
    expect(() => validateShiftTemplateInputs([])).toThrow(/Mindestens/)
  })

  it('allows overnight night shift', () => {
    expect(() =>
      validateShiftTemplateInputs([{ type: 'night', startTime: '22:00', endTime: '06:00' }]),
    ).not.toThrow()
  })

  it('requires name for custom', () => {
    expect(() =>
      validateShiftTemplateInputs([{ type: 'custom', startTime: '10:00', endTime: '14:00' }]),
    ).toThrow(/Name/)
  })
})

describe('templatesToStandardWorkTimesJson', () => {
  it('maps early/late and custom shifts', () => {
    const json = templatesToStandardWorkTimesJson([
      { type: 'early', startTime: '06:00', endTime: '14:00' },
      { type: 'custom', name: 'Sonder', startTime: '10:00', endTime: '12:00' },
    ])
    const o = JSON.parse(json) as { early?: { start: string }; customShifts?: { name: string }[] }
    expect(o.early?.start).toBe('06:00')
    expect(o.customShifts?.[0]?.name).toBe('Sonder')
  })
})

describe('checkCurrentMonth tuv gate', () => {
  let db: Database.Database

  beforeEach(() => {
    db = openTestDb()
    db.prepare(`INSERT INTO stations (id, tenant_id, monthly_tuv_report_enabled, created_at) VALUES ('s1', 't1', 0, '2026-01-01')`).run()
  })

  it('returns disabled when monthly_tuv_report_enabled is not 1', () => {
    const r = checkCurrentMonth(db, 's1')
    expect(r.required).toBe(false)
    expect(r.disabled).toBe(true)
    expect(r.status).toBe('disabled')
  })

  it('returns required missing when enabled and no report', () => {
    db.prepare(`UPDATE stations SET monthly_tuv_report_enabled = 1 WHERE id = 's1'`).run()
    const r = checkCurrentMonth(db, 's1')
    expect(r.required).toBe(true)
    expect(r.status).toBe('missing')
  })
})
