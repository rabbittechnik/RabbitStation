import type Database from 'better-sqlite3'
import { randomBytes, randomUUID } from 'node:crypto'
import { nowIso } from '../utils/timestamps.js'
import { TEAMLEAD_PERMISSIONS } from '../constants/permissions.js'
import { mathiasStationsleiterPermissions } from '../constants/mathiasStationsleiterPermissions.js'
import { STATION_RADIO_DEFAULTS_ARAL_BODELSHAUSEN } from '../constants/stationRadioDefaults.js'
import { TABLET_RADIO_DEFAULT_PRESET_ID } from '../constants/tabletRadioPresetIds.js'
import { ensureDefaultUserStationAccess, ensureKnownStationsAndWorkAreas } from '../services/stationAccessService.js'
import { seedAllStationsShiftCloseChecklistDefsIfMissing } from '../services/stationShiftChecklistDefService.js'
import { calculateVacationImpact, normalizeAbsenceDbType } from '../utils/vacationImpactCalculator.js'
import { applyMay2026BodelshausenOfficeShifts } from '../services/may2026BodelshausenShiftImport.js'
import { applyPersonalstammBodelshausen2026 } from '../services/personalstammBodelshausenImport.js'
import { ensureBodelshausenStationGuideVacations2026 } from '../services/stationGuideVacationImportService.js'
import { seedTaskTemplatesIfMissing } from '../services/taskTemplateService.js'
import { ensureStationStatutoryHolidaysSeeded } from '../services/stationExtraHolidayService.js'
import { ensureStationDocumentTemplates } from '../services/stationDocumentService.js'
import { seedAralBodelshausenRepresentatives } from '../services/representativeSeedService.js'
import { shouldRunLegacyRealStationMigrations } from '../constants/demoMigrationGuard.js'
import { DEMO_STATION_ID } from '../constants/demo.js'
import { runSaasMigrations } from './saasMigrations.js'
import { runOnboardingMigrations } from './onboardingMigrations.js'

function employeesColumnNames(db: Database.Database): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(employees)`).all() as { name: string }[]
  return new Set(rows.map((r) => r.name))
}

function addEmployeeColumn(db: Database.Database, names: Set<string>, col: string, ddl: string) {
  if (!names.has(col)) {
    db.exec(`ALTER TABLE employees ADD COLUMN ${ddl}`)
    names.add(col)
  }
}

/** Lightweight schema upgrades for existing SQLite files (idempotent). */
export function runMigrations(db: Database.Database) {
  const shiftCols = db.prepare(`PRAGMA table_info(shifts)`).all() as { name: string }[]
  if (!shiftCols.some((r) => r.name === 'import_source')) {
    db.exec(`ALTER TABLE shifts ADD COLUMN import_source TEXT`)
  }

  let empCols = employeesColumnNames(db)
  addEmployeeColumn(db, empCols, 'employee_access_token', 'employee_access_token TEXT')
  addEmployeeColumn(db, empCols, 'employee_access_enabled', 'employee_access_enabled INTEGER DEFAULT 1')
  addEmployeeColumn(db, empCols, 'employee_access_created_at', 'employee_access_created_at TEXT')
  addEmployeeColumn(db, empCols, 'employee_access_last_used_at', 'employee_access_last_used_at TEXT')

  empCols = employeesColumnNames(db)
  addEmployeeColumn(db, empCols, 'preferred_shift_types_json', `preferred_shift_types_json TEXT DEFAULT '[]'`)
  addEmployeeColumn(db, empCols, 'preferred_work_days_json', `preferred_work_days_json TEXT DEFAULT '[]'`)
  addEmployeeColumn(db, empCols, 'not_preferred_work_days_json', `not_preferred_work_days_json TEXT DEFAULT '[]'`)
  addEmployeeColumn(db, empCols, 'can_work_weekends', 'can_work_weekends INTEGER DEFAULT 1')
  addEmployeeColumn(db, empCols, 'can_work_holidays', 'can_work_holidays INTEGER DEFAULT 1')
  addEmployeeColumn(db, empCols, 'max_preferred_days_per_week', 'max_preferred_days_per_week INTEGER')
  addEmployeeColumn(db, empCols, 'max_weekly_hours', 'max_weekly_hours REAL')
  addEmployeeColumn(db, empCols, 'planning_notes', 'planning_notes TEXT')
  migrateEmployeePlanningRulesColumns(db)

  migrateEmployeeExtendedColumns(db)
  migrateShiftBakingNoticesToBackshopAck(db)
  ensureBackshopRoutineSeedForBodelshausen(db)

  const ewaInfo = db.prepare(`PRAGMA table_info(employee_work_areas)`).all() as { name: string }[]
  const ewaNames = new Set(ewaInfo.map((c) => c.name))
  if (!ewaNames.has('station_id')) {
    db.exec(`ALTER TABLE employee_work_areas ADD COLUMN station_id TEXT`)
    db.exec(
      `UPDATE employee_work_areas SET station_id = COALESCE(station_id, (SELECT station_id FROM work_areas WHERE work_areas.id = employee_work_areas.work_area_id))`,
    )
  }

  const teCols = db.prepare(`PRAGMA table_info(time_entries)`).all() as { name: string }[]
  const teNames = new Set(teCols.map((c) => c.name))
  const addTe = (name: string, ddl: string) => {
    if (!teNames.has(name)) {
      db.exec(`ALTER TABLE time_entries ADD COLUMN ${ddl}`)
      teNames.add(name)
    }
  }
  addTe('approval_status', 'approval_status TEXT')
  addTe('approved_by', 'approved_by TEXT')
  addTe('approved_at', 'approved_at TEXT')
  addTe('rejected_by', 'rejected_by TEXT')
  addTe('rejected_at', 'rejected_at TEXT')
  addTe('rejection_reason', 'rejection_reason TEXT')
  addTe('correction_note', 'correction_note TEXT')
  addTe('payroll_relevant', 'payroll_relevant INTEGER DEFAULT 0')
  addTe('planned_start_at', 'planned_start_at TEXT')
  addTe('start_deviation_minutes', 'start_deviation_minutes INTEGER')
  addTe('start_deviation_type', 'start_deviation_type TEXT')
  addTe('planned_end_at', 'planned_end_at TEXT')
  addTe('end_deviation_minutes', 'end_deviation_minutes INTEGER')
  addTe('end_deviation_type', 'end_deviation_type TEXT')
  addTe('early_leave_minutes', 'early_leave_minutes INTEGER')
  addTe('early_leave_reason', 'early_leave_reason TEXT')
  addTe('early_leave_note', 'early_leave_note TEXT')
  addTe('early_leave_confirmed_at', 'early_leave_confirmed_at TEXT')
  addTe('early_leave_confirmed_by_employee_id', 'early_leave_confirmed_by_employee_id TEXT')

  db.prepare(
    `UPDATE time_entries SET approval_status = 'pending', payroll_relevant = 0
     WHERE status = 'completed' AND (approval_status IS NULL OR trim(approval_status) = '')`,
  ).run()

  db.exec(`CREATE TABLE IF NOT EXISTS employee_access_logs (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    token_hash TEXT,
    used_at TEXT,
    ip TEXT,
    user_agent TEXT,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  )`)

  /** Einmalige Auffüllung: nur Zeilen ohne Token. Kein Rotieren bei Serverstart/Redeploy/Seed. */
  const needToken = db
    .prepare(
      `SELECT id FROM employees WHERE employee_access_token IS NULL OR trim(employee_access_token) = ''`,
    )
    .all() as { id: string }[]
  const ts = nowIso()
  for (const { id } of needToken) {
    const tok = randomBytes(32).toString('hex')
    db.prepare(
      `UPDATE employees SET employee_access_token = ?, employee_access_enabled = COALESCE(employee_access_enabled, 1), employee_access_created_at = COALESCE(employee_access_created_at, ?), updated_at = ? WHERE id = ?`,
    ).run(tok, ts, ts, id)
  }

  /* --- Mehrstations: user_station_access, global_admin, weitere Stationen --- */
  db.exec(`CREATE TABLE IF NOT EXISTS user_station_access (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    station_id TEXT NOT NULL,
    role TEXT NOT NULL,
    permissions_json TEXT NOT NULL DEFAULT '{}',
    active INTEGER DEFAULT 1,
    created_by TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (station_id) REFERENCES stations(id)
  )`)
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_station_access_user_station ON user_station_access(user_id, station_id)`)

  const userColNames = new Set(
    (db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).map((r) => r.name),
  )
  if (!userColNames.has('global_admin')) {
    db.exec(`ALTER TABLE users ADD COLUMN global_admin INTEGER DEFAULT 0`)
  }

  const stationColNames = new Set(
    (db.prepare(`PRAGMA table_info(stations)`).all() as { name: string }[]).map((r) => r.name),
  )
  if (!stationColNames.has('brand')) {
    db.exec(`ALTER TABLE stations ADD COLUMN brand TEXT`)
  }

  const bootTs = nowIso()
  ensureKnownStationsAndWorkAreas(db, bootTs)
  ensureDefaultUserStationAccess(db, bootTs)

  if (shouldRunLegacyRealStationMigrations(db)) {
    db.prepare(`UPDATE stations SET brand = COALESCE(brand, 'Aral') WHERE id = 'aral-bodelshausen' AND (brand IS NULL OR trim(brand) = '')`).run()
  }

  mergeTuvPermissionsIntoAccess(db)
  mergeEmployeeSensitivePermissionsIntoAccess(db)
  ensureEmployeeAppDevicesTable(db)
  mergeEmployeeAppPermissionsIntoAccess(db)
  mergeEmployeesViewDeletedPermission(db)
  migrateRoleLabelsAndAbsenceRejectColumns(db)
  migrateAbsenceVacationModel(db)
  ensureAbsenceAttachmentsTable(db)
  ensureFuelPriceCacheAndStationTankerkoenig(db)
  ensureTaskLogsTabletColumns(db)
  ensureTaskScopeAndLifecycleColumns(db)
  ensureShiftCloseTaskResponsesTable(db)
  removeSeedDemoRunningTimeEntries(db)
  alignAralBodelshausenEmployeeDisplayRoles(db)
  ensurePayrollAdjustmentsTable(db)
  mergePayrollExportPermission(db)
  ensureShiftCloseChecklistCashDifferenceColumn(db)
  ensureShiftCloseStructuredChecklistTables(db)
  ensureShiftCloseChecklistRunExtendedColumns(db)
  ensureStationShiftCloseChecklistDefsTable(db)
  seedAllStationsShiftCloseChecklistDefsIfMissing(db)
  ensurePayrollAdjustmentsUpdatedAtColumn(db)
  ensureStationTabletDevicesTable(db)
  mergeStationTabletPermissionsIntoAccess(db)
  ensureRepresentativesTable(db)
  ensureRepresentativeExtendedColumns(db)
  mergeRepresentativesPermissionsIntoAccess(db)
  seedAralBodelshausenRepresentativesMigration(db)
  ensureUsersLastLoginAtColumn(db)
  ensureUserAuditLogTable(db)
  syncMathiasRaselowskiAccount(db)
  ensureStationRadioColumns(db)
  seedAralBodelshausenStationRadio(db)
  ensureStationRadioPresetsTable(db)
  seedStationRadioDefaultPresetIds(db)
  ensureStationStammdatenColumns(db)
  ensureStationCanonicalNamesOnce(db)
  syncAralBodelshausenStationDisplayName(db)
  syncAralBodelshausenEmployeeCashRegisterCards(db)
  ensureMay2026BodelshausenGuideShifts(db)
  ensureStationGuideVacationsBodelshausen2026Migration(db)
  ensureWeekendTasksAndBakingTables(db)
  migrateWeekendTaskTemplateSlugsToKeys(db)
  seedTaskTemplatesIfMissing(db)
  ensureStationDocumentsTables(db)
  mergeDocumentsPermissionsIntoAccess(db)
  ensureStationExtendedModules2026(db)
  ensureStationBreakPolicyColumnsAndZeroBodelshausenBreaks(db)
  ensureStationPayrollSurchargeRuleColumns(db)
  ensureBodelshausenSundayHolidaySurchargePolicy(db)
  ensureDemoStationSundayHolidaySurchargePolicy(db)
  ensurePayrollQueryIndexes(db)
  ensureStationHolidayPayrollColumns(db)
  ensureStationDocumentTemplateColumns(db)
  ensureTuvReportExtendedColumns(db)
  ensureTimeEntryCorrections2026(db)
  ensureWeeklySchedulePublicationsTable(db)
  ensureEmployeePayrollDocumentsTable(db)
  mergeEmployeePayrollDocumentsPermissionsIntoAccess(db)
  ensureSteveScheifenEmployee(db)
  runSaasMigrations(db)
  runOnboardingMigrations(db)
}

function migrateEmployeePlanningRulesColumns(db: Database.Database) {
  let empCols = employeesColumnNames(db)
  const add = (col: string, ddl: string) => addEmployeeColumn(db, empCols, col, ddl)
  add('desired_shifts_per_month', 'desired_shifts_per_month INTEGER')
  add('min_shifts_per_month', 'min_shifts_per_month INTEGER')
  add('max_shifts_per_month', 'max_shifts_per_month INTEGER')
  add('desired_weekends_per_month', 'desired_weekends_per_month INTEGER')
  add('weekend_day_preference', `weekend_day_preference TEXT DEFAULT 'either'`)
  add('preferred_shift_policy', `preferred_shift_policy TEXT DEFAULT 'any'`)
  add('weekday_availability_json', 'weekday_availability_json TEXT')
  add('reserve_enabled', 'reserve_enabled INTEGER DEFAULT 0')
  add('reserve_conditions_json', `reserve_conditions_json TEXT DEFAULT '{}'`)
  add('reserve_note', 'reserve_note TEXT')
}

/** Neuer Mitarbeiter Steve Scheifen (nur anlegen, wenn noch nicht vorhanden). */
function ensureSteveScheifenEmployee(db: Database.Database) {
  if (!shouldRunLegacyRealStationMigrations(db)) return
  const sid = 'aral-bodelshausen'
  const existing = db
    .prepare(
      `SELECT id FROM employees WHERE station_id = ? AND lower(trim(last_name)) = 'scheifen'
       AND lower(trim(first_name)) = 'steve' AND (deleted_at IS NULL OR trim(deleted_at) = '') LIMIT 1`,
    )
    .get(sid) as { id: string } | undefined
  if (existing?.id) return

  const ts = nowIso()
  const id = randomUUID()
  const weekdayJson = JSON.stringify({
    monday: 'unavailable',
    tuesday: 'unavailable',
    wednesday: 'unavailable',
    thursday: 'unavailable',
    friday: 'unavailable',
    saturday: 'preferred',
    sunday: 'preferred',
  })
  db.prepare(
    `INSERT INTO employees (
      id, station_id, salutation, first_name, last_name, display_name,
      birthday, role, employment_role, employment_type,
      hourly_wage, weekly_hours, monthly_hours, vacation_days_total, vacation_days_used,
      color, status, terminal_enabled, time_tracking_enabled,
      pay_type, max_hours_per_month, work_days_json,
      start_date, notes, active,
      employee_access_enabled,
      preferred_shift_types_json, preferred_work_days_json, not_preferred_work_days_json,
      can_work_weekends, can_work_holidays, max_preferred_days_per_week, planning_notes,
      desired_shifts_per_month, min_shifts_per_month, max_shifts_per_month,
      desired_weekends_per_month, weekend_day_preference, preferred_shift_policy,
      weekday_availability_json, reserve_enabled, reserve_conditions_json,
      created_at, updated_at
    ) VALUES (
      ?, ?, 'none', 'Steve', 'Scheifen', 'Steve Scheifen',
      '1996-08-16', 'Aushilfe', 'Aushilfe', 'aushilfe',
      12.82, 0, 0, 0, 0,
      '#a855f7', 'aktiv', 1, 1,
      'hourly', 43, '[]',
      ?, ?, 1,
      0,
      ?, ?, ?,
      1, 1, 2, ?,
      2, 2, 2,
      1, 'either', 'late_preferred',
      ?, 0, '{}',
      ?, ?
    )`,
  ).run(
    id,
    sid,
    ts.slice(0, 10),
    'Adresse: Uhlandstr. 27/2, 72411 Bodelshausen',
    JSON.stringify(['late', 'early']),
    JSON.stringify(['saturday', 'sunday']),
    JSON.stringify(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']),
    'Bevorzugt Spätschicht am Wochenende, ca. 2 Arbeitstage/Monat. Unter der Woche nicht automatisch einplanen.',
    weekdayJson,
    ts,
    ts,
  )
  db.prepare(
    `INSERT INTO employee_work_areas (id, employee_id, station_id, work_area_id) VALUES (?, ?, ?, ?)`,
  ).run(randomUUID(), id, sid, 'kasse')
}

function ensureEmployeePayrollDocumentsTable(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS employee_payroll_documents (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    title TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    file_size INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    uploaded_by_user_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (station_id) REFERENCES stations(id),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  )`)
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_employee_payroll_documents_emp ON employee_payroll_documents(employee_id, year, month)`,
  )
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_employee_payroll_documents_station ON employee_payroll_documents(station_id, deleted_at)`,
  )
}

function mergeEmployeePayrollDocumentsPermissionsIntoAccess(db: Database.Database) {
  const rows = db.prepare(`SELECT id, permissions_json FROM user_station_access`).all() as {
    id: string
    permissions_json: string
  }[]
  const ts = nowIso()
  for (const r of rows) {
    let p: Record<string, boolean> = {}
    try {
      p = JSON.parse(r.permissions_json || '{}') as Record<string, boolean>
    } catch {
      p = {}
    }
    let changed = false
    const grantView =
      p['payroll.view'] === true ||
      p['employees.manageSensitive'] === true ||
      p['employeePayrollDocuments.manage'] === true
    if (grantView && p['employeePayrollDocuments.view'] === undefined) {
      p['employeePayrollDocuments.view'] = true
      changed = true
    }
    if (p['employees.manageSensitive'] === true && p['employeePayrollDocuments.manage'] === undefined) {
      p['employeePayrollDocuments.manage'] = true
      changed = true
    }
    if (p['payroll.view'] === true && p['employeePayrollDocuments.manage'] === undefined) {
      p['employeePayrollDocuments.manage'] = true
      changed = true
    }
    if (changed) {
      db.prepare(`UPDATE user_station_access SET permissions_json = ?, updated_at = ? WHERE id = ?`).run(
        JSON.stringify(p),
        ts,
        r.id,
      )
    }
  }
}

function ensureWeeklySchedulePublicationsTable(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS weekly_schedule_publications (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    year INTEGER NOT NULL,
    calendar_week INTEGER NOT NULL,
    week_start_date TEXT NOT NULL,
    week_end_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    published_at TEXT,
    published_by_user_id TEXT,
    unpublished_at TEXT,
    unpublished_by_user_id TEXT,
    has_unpublished_changes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(station_id, week_start_date),
    FOREIGN KEY (station_id) REFERENCES stations(id)
  )`)
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_wsp_station_week ON weekly_schedule_publications(station_id, week_start_date)`,
  )
}

/** Revisionssichere Zeiterfassungs-Korrekturen + Auto-Ausstempeln (Stationseinstellung). */
function ensureTimeEntryCorrections2026(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS time_entry_corrections (
    id TEXT PRIMARY KEY,
    time_entry_id TEXT NOT NULL,
    station_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    correction_kind TEXT NOT NULL,
    original_clock_in_at TEXT NOT NULL,
    original_clock_out_at TEXT,
    corrected_clock_in_at TEXT NOT NULL,
    corrected_clock_out_at TEXT,
    original_break_minutes INTEGER NOT NULL DEFAULT 0,
    corrected_break_minutes INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    note TEXT,
    corrected_by_user_id TEXT,
    corrected_by_name TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (time_entry_id) REFERENCES time_entries(id)
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_time_entry_corrections_entry ON time_entry_corrections(time_entry_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_time_entry_corrections_station_created ON time_entry_corrections(station_id, created_at)`)

  const stCols = new Set((db.prepare(`PRAGMA table_info(stations)`).all() as { name: string }[]).map((c) => c.name))
  if (!stCols.has('auto_clock_out_enabled')) {
    db.exec(`ALTER TABLE stations ADD COLUMN auto_clock_out_enabled INTEGER NOT NULL DEFAULT 1`)
  }
  if (!stCols.has('auto_clock_out_time')) {
    db.exec(`ALTER TABLE stations ADD COLUMN auto_clock_out_time TEXT NOT NULL DEFAULT '22:45'`)
  }
}

/** Idempotent: StationGuide-Urlaube Aral Bodelshausen (Apr–Jun 2026), nur wenn Mitarbeiter existieren. */
function ensureStationGuideVacationsBodelshausen2026Migration(db: Database.Database) {
  if (!shouldRunLegacyRealStationMigrations(db)) return
  const n = db
    .prepare(
      `SELECT COUNT(*) as n FROM employees WHERE station_id = 'aral-bodelshausen' AND (deleted_at IS NULL OR trim(deleted_at) = '')`,
    )
    .get() as { n: number }
  if ((n?.n ?? 0) < 1) return
  const { messages } = ensureBodelshausenStationGuideVacations2026(db)
  const noteworthy = messages.filter(
    (m) =>
      m.includes('neu angelegt') ||
      m.includes('ergänzt:') ||
      m.includes('FEHLER') ||
      m.includes('überschneidender'),
  )
  if (noteworthy.length) console.log(`[migrations] StationGuide Urlaube Bodelshausen:\n${noteworthy.join('\n')}`)
}

/** Einmalig: alte Generator-Slugs auf stabile template_keys abbilden (idempotent). */
function migrateWeekendTaskTemplateSlugsToKeys(db: Database.Database) {
  const pairs: [string, string][] = [
    ['pflicht_aussenbereich', 'daily_outside_area_check'],
    ['pflicht_muell', 'daily_bins_check'],
    ['suessigkeiten', 'weekend_candy_shelf'],
    ['kaffeeecke', 'weekend_coffee_corner'],
    ['chips_wein', 'weekend_chips_wine_shelf'],
    ['kuehlschraenke', 'weekend_fridges'],
    ['eistruhe', 'weekend_ice_freezer'],
    ['lottoecke', 'weekend_lotto_corner'],
    ['elfbar', 'weekend_elfbar_corner'],
    ['kassenbereich', 'weekend_cash_area'],
    ['backofen', 'weekend_oven_cleaning'],
    ['fenster_putzen', 'yearly_window_cleaning'],
  ]
  const u = db.prepare(`UPDATE tasks SET weekend_task_template_slug = ? WHERE weekend_task_template_slug = ?`)
  for (const [from, to] of pairs) {
    u.run(to, from)
  }
}

/** Idempotent: Kassenkartennummern für Aral Bodelshausen (nur nicht gelöschte Zeilen, Abgleich per display_name). */
function syncAralBodelshausenEmployeeCashRegisterCards(db: Database.Database) {
  if (!shouldRunLegacyRealStationMigrations(db)) return
  const ts = nowIso()
  const pairs: [string, string][] = [
    ['Mathias Raselowski', '772839'],
    ['Metin Özgür', '772820'],
    ['Max Vins', '140520'],
    ['Valerina Mustafa', '772838'],
    ['Luca Stöck', '140519'],
    ['Chiara H.', '772822'],
    ['Enise A.', '772837'],
  ]
  const stmt = db.prepare(
    `UPDATE employees SET cash_register_card_number = ?, updated_at = ?
     WHERE station_id = 'aral-bodelshausen' AND display_name = ?
       AND (deleted_at IS NULL OR trim(deleted_at) = '')`,
  )
  for (const [name, num] of pairs) {
    stmt.run(num, ts, name)
  }
}

function ensureMay2026BodelshausenGuideShifts(db: Database.Database) {
  if (!shouldRunLegacyRealStationMigrations(db)) return
  const sid = 'aral-bodelshausen'
  const ec = db.prepare(`SELECT COUNT(*) as c FROM employees WHERE station_id = ?`).get(sid) as { c: number }
  if ((ec?.c ?? 0) < 5) return
  const r = applyMay2026BodelshausenOfficeShifts(db)
  if (r.inserted > 0 || r.updatedWorkArea > 0) {
    console.log(
      `[migrations] Mai-2026 Schichten Bodelshausen: ${r.inserted} neu, ${r.updatedWorkArea} Arbeitsbereich angepasst, ${r.skippedDuplicate} unverändert`,
    )
  } else if (r.errors.length > 0 && r.inserted === 0 && r.skippedDuplicate === 0) {
    console.warn(
      `[migrations] Mai-2026 Schichten: ${r.errors.length} Zeilen nicht zuordenbar (Mitarbeiter fehlen?) — optional: npm run import:may2026-shifts`,
    )
  }
}

function ensureStationStammdatenColumns(db: Database.Database) {
  const cols = new Set((db.prepare(`PRAGMA table_info(stations)`).all() as { name: string }[]).map((c) => c.name))
  const add = (name: string, ddl: string) => {
    if (!cols.has(name)) {
      db.exec(`ALTER TABLE stations ADD COLUMN ${ddl}`)
      cols.add(name)
    }
  }
  add('street', 'street TEXT')
  add('house_number', 'house_number TEXT')
  add('contact_person', 'contact_person TEXT')
  add('notes', 'notes TEXT')
  add('standard_work_times_json', 'standard_work_times_json TEXT')
  add('archived_at', 'archived_at TEXT')
  add('deleted_at', 'deleted_at TEXT')
}

/** Einmalig: Anzeigenamen der vier Kern-Stationen angleichen (keine Adress-/Telefon-Überschreibung). */
function ensureStationCanonicalNamesOnce(db: Database.Database) {
  const key = 'migration_canonical_station_names_v1'
  const done = db.prepare(`SELECT 1 FROM settings WHERE key = ?`).get(key) as { 1: number } | undefined
  if (done) return
  const ts = nowIso()
  const rows: { id: string; name: string }[] = [
    { id: 'aral-bodelshausen', name: 'Aral Bodelshausen' },
    { id: 'autohof-kehl', name: 'Autohof Kehl' },
    { id: 'shell-ingersheim', name: 'Shell Ingersheim' },
    { id: 'shell-station-marsch', name: 'Shell Station Marsch' },
  ]
  const upd = db.prepare(`UPDATE stations SET name = ?, updated_at = ? WHERE id = ?`)
  for (const r of rows) {
    upd.run(r.name, ts, r.id)
  }
  db.prepare(
    `INSERT INTO settings (id, station_id, key, value, type, created_at, updated_at) VALUES (?, NULL, ?, '1', 'bool', ?, ?)`,
  ).run(randomUUID(), key, ts, ts)
}

/** Offizieller Anzeigename Aral Bodelshausen (ohne „Bulle 1000“); idempotent bei jedem Start. */
function syncAralBodelshausenStationDisplayName(db: Database.Database) {
  if (!shouldRunLegacyRealStationMigrations(db)) return
  const ts = nowIso()
  db.prepare(
    `UPDATE stations SET name = ?, brand = ?, updated_at = ? WHERE id = 'aral-bodelshausen'`,
  ).run('Aral Bodelshausen', 'ARAL', ts)
}

function ensureStationRadioColumns(db: Database.Database) {
  const cols = new Set((db.prepare(`PRAGMA table_info(stations)`).all() as { name: string }[]).map((c) => c.name))
  const add = (name: string, ddl: string) => {
    if (!cols.has(name)) {
      db.exec(`ALTER TABLE stations ADD COLUMN ${ddl}`)
      cols.add(name)
    }
  }
  add('radio_enabled', 'radio_enabled INTEGER DEFAULT 1')
  add('radio_stream_name', 'radio_stream_name TEXT')
  add('radio_stream_url', 'radio_stream_url TEXT')
  add('radio_stream_url_fallback', 'radio_stream_url_fallback TEXT')
  add('radio_default_volume', 'radio_default_volume REAL DEFAULT 0.5')
  add('radio_default_preset_id', 'radio_default_preset_id TEXT')
}

/** Optional: später Admin-UI für sender-spezifische Streams (aktuell nutzt das Client `tabletRadioStations.ts`). */
function ensureStationRadioPresetsTable(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS station_radio_presets (
    id TEXT PRIMARY KEY,
    station_id TEXT,
    name TEXT NOT NULL,
    stream_url TEXT NOT NULL,
    stream_url_fallback TEXT,
    enabled INTEGER DEFAULT 1,
    is_default INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
  )`)
}

function seedAralBodelshausenStationRadio(db: Database.Database) {
  if (!shouldRunLegacyRealStationMigrations(db)) return
  const ts = nowIso()
  const d = STATION_RADIO_DEFAULTS_ARAL_BODELSHAUSEN
  db.prepare(
    `UPDATE stations SET
      radio_enabled = 1,
      radio_stream_name = ?,
      radio_stream_url = ?,
      radio_stream_url_fallback = ?,
      radio_default_volume = 0.5,
      updated_at = ?
    WHERE id = ?
      AND (radio_stream_url IS NULL OR trim(radio_stream_url) = '')`,
  ).run(d.streamName, d.streamUrl, d.streamUrlFallback, ts, d.stationId)
}

function seedStationRadioDefaultPresetIds(db: Database.Database) {
  const ts = nowIso()
  db.prepare(
    `UPDATE stations SET radio_default_preset_id = ?, updated_at = ?
     WHERE id = ?
       AND (radio_default_preset_id IS NULL OR trim(radio_default_preset_id) = '')`,
  ).run(TABLET_RADIO_DEFAULT_PRESET_ID, ts, STATION_RADIO_DEFAULTS_ARAL_BODELSHAUSEN.stationId)
}

function ensureUsersLastLoginAtColumn(db: Database.Database) {
  const cols = new Set((db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).map((c) => c.name))
  if (!cols.has('last_login_at')) {
    db.exec(`ALTER TABLE users ADD COLUMN last_login_at TEXT`)
  }
}

function ensureUserAuditLogTable(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS user_audit_log (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    target_user_id TEXT,
    station_id TEXT,
    details_json TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_user_audit_log_created ON user_audit_log(created_at)`)
}

/** Profil, E-Mail, Rechte Stationsleiter nur Aral Bodelshausen — Max Vins unangetastet. */
function syncMathiasRaselowskiAccount(db: Database.Database) {
  if (!shouldRunLegacyRealStationMigrations(db)) return
  const matId = 'user-mathias-raselowski'
  const row = db.prepare(`SELECT id FROM users WHERE id = ?`).get(matId) as { id: string } | undefined
  if (!row) return
  const ts = nowIso()
  db.prepare(`UPDATE users SET email = ?, display_name = ?, global_admin = 0, updated_at = ? WHERE id = ?`).run(
    'rabbit.technik@gmail.com',
    'Mathias Raselowski',
    ts,
    matId,
  )

  const perms = JSON.stringify(mathiasStationsleiterPermissions())
  const acc = db
    .prepare(`SELECT id FROM user_station_access WHERE user_id = ? AND station_id = ?`)
    .get(matId, 'aral-bodelshausen') as { id: string } | undefined
  if (acc) {
    db.prepare(
      `UPDATE user_station_access SET role = 'stationsleiter', permissions_json = ?, updated_at = ? WHERE user_id = ? AND station_id = ?`,
    ).run(perms, ts, matId, 'aral-bodelshausen')
  } else {
    db.prepare(
      `INSERT INTO user_station_access (id, user_id, station_id, role, permissions_json, active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'stationsleiter', ?, 1, NULL, ?, ?)`,
    ).run(randomUUID(), matId, 'aral-bodelshausen', perms, ts, ts)
  }
}

/** Stammdaten-Anzeige-Rollen für Bodelshausen (bestehende DBs, Railway-Deploy). */
function alignAralBodelshausenEmployeeDisplayRoles(db: Database.Database) {
  if (!shouldRunLegacyRealStationMigrations(db)) return
  const stationId = 'aral-bodelshausen'
  const ts = nowIso()
  const stmt = db.prepare(
    `UPDATE employees SET role = ?, employment_role = ?, employment_type = ?, updated_at = ? WHERE id = ? AND station_id = ?`,
  )
  const rows: { id: string; role: string; employment_role: string; employment_type: string }[] = [
    { id: 'e1', role: 'Schichtleiter', employment_role: 'Schichtleiter', employment_type: 'vollzeit' },
    { id: 'e3', role: 'Chef / Administrator', employment_role: 'Chef / Administrator', employment_type: 'teilzeit' },
    { id: 'e4', role: 'Vollzeit', employment_role: 'Vollzeit', employment_type: 'vollzeit' },
    { id: 'e5', role: 'Aushilfe', employment_role: 'Aushilfe', employment_type: 'aushilfe' },
    { id: 'e6', role: 'Aushilfe', employment_role: 'Aushilfe', employment_type: 'aushilfe' },
    { id: 'e7', role: 'Aushilfe', employment_role: 'Aushilfe', employment_type: 'aushilfe' },
    { id: 'e8', role: 'Aushilfe', employment_role: 'Aushilfe', employment_type: 'aushilfe' },
  ]
  for (const r of rows) {
    stmt.run(r.role, r.employment_role, r.employment_type, ts, r.id, stationId)
  }
  try {
    db.prepare(
      `UPDATE roles SET role_label = 'Schichtleiter', name = 'Schichtleitung', description = 'Schichtleitung' WHERE id = 'role-station-team-lead'`,
    ).run()
  } catch {
    /* ignore */
  }
}

/** payroll.export: Default = reports.export, wenn noch nicht gesetzt. */
function mergePayrollExportPermission(db: Database.Database) {
  const rows = db.prepare(`SELECT id, permissions_json FROM user_station_access`).all() as {
    id: string
    permissions_json: string
  }[]
  const ts = nowIso()
  for (const r of rows) {
    let p: Record<string, boolean> = {}
    try {
      p = JSON.parse(r.permissions_json || '{}') as Record<string, boolean>
    } catch {
      p = {}
    }
    if (p['payroll.export'] !== undefined) continue
    p['payroll.export'] = p['reports.export'] === true
    db.prepare(`UPDATE user_station_access SET permissions_json = ?, updated_at = ? WHERE id = ?`).run(
      JSON.stringify(p),
      ts,
      r.id,
    )
  }
}

function ensureShiftCloseChecklistCashDifferenceColumn(db: Database.Database) {
  const cols = new Set(
    (db.prepare(`PRAGMA table_info(shift_close_checklists)`).all() as { name: string }[]).map((c) => c.name),
  )
  if (!cols.has('cash_difference')) {
    db.exec(`ALTER TABLE shift_close_checklists ADD COLUMN cash_difference REAL`)
  }
}

function ensureShiftCloseStructuredChecklistTables(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS shift_close_checklist_runs (
    id TEXT PRIMARY KEY,
    time_entry_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    station_id TEXT NOT NULL,
    checklist_type TEXT NOT NULL,
    cash_difference REAL,
    truth_confirmed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT,
    handover_variant TEXT,
    handover_remark TEXT,
    shift_id TEXT,
    checkout_source TEXT,
    FOREIGN KEY (time_entry_id) REFERENCES time_entries(id),
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (station_id) REFERENCES stations(id)
  )`)
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_close_cl_runs_te ON shift_close_checklist_runs(time_entry_id)`)
  db.exec(`CREATE TABLE IF NOT EXISTS shift_close_checklist_items (
    id TEXT PRIMARY KEY,
    checklist_id TEXT NOT NULL,
    time_entry_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    station_id TEXT NOT NULL,
    checklist_type TEXT NOT NULL,
    item_key TEXT NOT NULL,
    item_label TEXT NOT NULL,
    answer TEXT NOT NULL,
    reason TEXT,
    created_at TEXT,
    FOREIGN KEY (checklist_id) REFERENCES shift_close_checklist_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (time_entry_id) REFERENCES time_entries(id),
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (station_id) REFERENCES stations(id)
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shift_close_cl_items_checklist ON shift_close_checklist_items(checklist_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shift_close_cl_items_te ON shift_close_checklist_items(time_entry_id)`)
}

function ensureShiftCloseChecklistRunExtendedColumns(db: Database.Database) {
  const cols = new Set(
    (db.prepare(`PRAGMA table_info(shift_close_checklist_runs)`).all() as { name: string }[]).map((c) => c.name),
  )
  const add = (name: string, ddl: string) => {
    if (!cols.has(name)) {
      db.exec(`ALTER TABLE shift_close_checklist_runs ADD COLUMN ${ddl}`)
      cols.add(name)
    }
  }
  add('handover_variant', 'handover_variant TEXT')
  add('handover_remark', 'handover_remark TEXT')
  add('shift_id', 'shift_id TEXT')
  add('checkout_source', 'checkout_source TEXT')
}

function ensureStationShiftCloseChecklistDefsTable(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS station_shift_close_checklist_defs (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    checklist_type TEXT NOT NULL,
    item_key TEXT NOT NULL,
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    answer_mode TEXT NOT NULL DEFAULT 'yes_no',
    group_id TEXT,
    group_label TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE,
    UNIQUE (station_id, checklist_type, item_key)
  )`)
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_ssccd_station_type_active ON station_shift_close_checklist_defs(station_id, checklist_type, active, sort_order)`,
  )
}

function ensurePayrollAdjustmentsUpdatedAtColumn(db: Database.Database) {
  const cols = new Set(
    (db.prepare(`PRAGMA table_info(payroll_adjustments)`).all() as { name: string }[]).map((c) => c.name),
  )
  if (!cols.has('updated_at')) {
    db.exec(`ALTER TABLE payroll_adjustments ADD COLUMN updated_at TEXT`)
  }
}

function ensurePayrollAdjustmentsTable(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS payroll_adjustments (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    note TEXT,
    created_by TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (station_id) REFERENCES stations(id),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_payroll_adj_station_date ON payroll_adjustments(station_id, date)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_payroll_adj_employee ON payroll_adjustments(employee_id)`)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_shifts_station_date ON shifts(station_id, date)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shifts_employee_date ON shifts(employee_id, date)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_time_entries_station_start ON time_entries(station_id, start_at)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_time_entries_employee_start ON time_entries(employee_id, start_at)`)
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_time_entries_station_status ON time_entries(station_id, status, approval_status)`,
  )
  db.exec(`CREATE INDEX IF NOT EXISTS idx_absences_station_range ON absences(station_id, start_date, end_date)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_absences_employee_range ON absences(employee_id, start_date, end_date)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_employees_station ON employees(station_id)`)
}

/** Früherer Seed: feste IDs mit „running“ — produktiv keine Demo-Eingestempelten. */
function removeSeedDemoRunningTimeEntries(db: Database.Database) {
  try {
    db.prepare(`DELETE FROM time_entries WHERE id IN ('te-run-1', 'te-run-2')`).run()
  } catch {
    /* ignore */
  }
}

function ensureFuelPriceCacheAndStationTankerkoenig(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS fuel_price_cache (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_station_id TEXT,
    status TEXT,
    is_open INTEGER,
    e5 REAL,
    e10 REAL,
    diesel REAL,
    currency TEXT DEFAULT 'EUR',
    raw_json TEXT,
    fetched_at TEXT,
    created_at TEXT,
    updated_at TEXT
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_fuel_price_cache_station ON fuel_price_cache(station_id)`)

  const cacheCols = new Set(
    (db.prepare(`PRAGMA table_info(fuel_price_cache)`).all() as { name: string }[]).map((r) => r.name),
  )
  if (!cacheCols.has('last_tankerkoenig_fetch_at')) {
    db.exec(`ALTER TABLE fuel_price_cache ADD COLUMN last_tankerkoenig_fetch_at TEXT`)
  }
  db.prepare(
    `UPDATE fuel_price_cache SET last_tankerkoenig_fetch_at = fetched_at
     WHERE last_tankerkoenig_fetch_at IS NULL AND fetched_at IS NOT NULL AND trim(fetched_at) != ''`,
  ).run()

  const stationCols = new Set(
    (db.prepare(`PRAGMA table_info(stations)`).all() as { name: string }[]).map((r) => r.name),
  )
  if (!stationCols.has('tankerkoenig_station_id')) {
    db.exec(`ALTER TABLE stations ADD COLUMN tankerkoenig_station_id TEXT`)
  }

  const tsFk = nowIso()
  db.prepare(
    `UPDATE stations SET tankerkoenig_station_id = (
       SELECT f.provider_station_id FROM fuel_price_cache f
       WHERE f.station_id = stations.id AND trim(COALESCE(f.provider_station_id, '')) != ''
       LIMIT 1
     ), updated_at = ?
     WHERE (tankerkoenig_station_id IS NULL OR trim(tankerkoenig_station_id) = '')
       AND EXISTS (
         SELECT 1 FROM fuel_price_cache f2
         WHERE f2.station_id = stations.id AND trim(COALESCE(f2.provider_station_id, '')) != ''
       )`,
  ).run(tsFk)
}

function ensureTaskLogsTabletColumns(db: Database.Database) {
  const cols = new Set(
    (db.prepare(`PRAGMA table_info(task_logs)`).all() as { name: string }[]).map((r) => r.name),
  )
  if (!cols.has('station_id')) {
    db.exec(`ALTER TABLE task_logs ADD COLUMN station_id TEXT`)
  }
  if (!cols.has('source')) {
    db.exec(`ALTER TABLE task_logs ADD COLUMN source TEXT`)
  }
  if (!cols.has('confirmed_by_employee_id')) {
    db.exec(`ALTER TABLE task_logs ADD COLUMN confirmed_by_employee_id TEXT`)
  }
  if (!cols.has('not_done_reason')) {
    db.exec(`ALTER TABLE task_logs ADD COLUMN not_done_reason TEXT`)
  }
  if (!cols.has('time_entry_id')) {
    db.exec(`ALTER TABLE task_logs ADD COLUMN time_entry_id TEXT`)
  }
}

/** Aufgaben: Sichtbarkeit/Leitung, Stations-Tablet-Board, Schichtbezug; Demo-Seeds deaktivieren. */
function ensureTaskScopeAndLifecycleColumns(db: Database.Database) {
  const cols = new Set((db.prepare(`PRAGMA table_info(tasks)`).all() as { name: string }[]).map((r) => r.name))
  const add = (name: string, ddl: string) => {
    if (!cols.has(name)) {
      db.exec(`ALTER TABLE tasks ADD COLUMN ${ddl}`)
      cols.add(name)
    }
  }
  add('task_kind', `task_kind TEXT DEFAULT 'standard'`)
  add('employee_self_service', 'employee_self_service INTEGER DEFAULT 0')
  add('tablet_station_board', 'tablet_station_board INTEGER DEFAULT 0')
  add('assigned_shift_type', 'assigned_shift_type TEXT')
  add('required_for_shift_close', 'required_for_shift_close INTEGER DEFAULT 0')
  add('source_shift_id', 'source_shift_id TEXT')
  add('weekend_task_template_slug', 'weekend_task_template_slug TEXT')
  add('task_category', 'task_category TEXT')

  db.prepare(
    `UPDATE tasks SET active = 0 WHERE (id LIKE 'task-seed-%' OR trim(COALESCE(created_by,'')) = 'seed') AND active = 1`,
  ).run()
}

/** Wochenend-Zusatzaufgaben (Generator) + Backwaren-Bestätigung nach Frühschicht-Check-in. */
function ensureWeekendTasksAndBakingTables(db: Database.Database) {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_station_shift_weekend_slug
    ON tasks(station_id, source_shift_id, weekend_task_template_slug)
    WHERE weekend_task_template_slug IS NOT NULL AND trim(weekend_task_template_slug) != ''
      AND source_shift_id IS NOT NULL AND trim(source_shift_id) != ''`)

  db.exec(`CREATE TABLE IF NOT EXISTS station_weekend_task_settings (
    station_id TEXT PRIMARY KEY,
    enabled INTEGER DEFAULT 1,
    dynamic_tasks_per_weekend_shift INTEGER DEFAULT 2,
    max_fenster_auto_per_year INTEGER DEFAULT 3,
    mandatory_outside_label TEXT,
    mandatory_trash_label TEXT,
    updated_at TEXT,
    FOREIGN KEY (station_id) REFERENCES stations(id)
  )`)

  const ts = nowIso()
  db.prepare(
    `INSERT OR IGNORE INTO station_weekend_task_settings (station_id, enabled, dynamic_tasks_per_weekend_shift, max_fenster_auto_per_year, mandatory_outside_label, mandatory_trash_label, updated_at)
     SELECT id, 1, 2, 3, 'Außenbereich kontrollieren', 'Mülleimer kontrollieren', ? FROM stations`,
  ).run(ts)

  db.exec(`CREATE TABLE IF NOT EXISTS shift_baking_notices (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    shift_id TEXT,
    time_entry_id TEXT NOT NULL UNIQUE,
    date TEXT NOT NULL,
    baking_plan_type TEXT NOT NULL,
    items_json TEXT NOT NULL,
    remark TEXT,
    acknowledged_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (station_id) REFERENCES stations(id),
    FOREIGN KEY (time_entry_id) REFERENCES time_entries(id)
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shift_baking_notices_station ON shift_baking_notices(station_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shift_baking_notices_employee ON shift_baking_notices(employee_id)`)
}

function ensureShiftCloseTaskResponsesTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shift_close_task_responses (
      id TEXT PRIMARY KEY,
      time_entry_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      station_id TEXT NOT NULL,
      shift_id TEXT,
      outcome TEXT NOT NULL,
      not_done_reason TEXT,
      recorded_at TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT,
      UNIQUE (time_entry_id, task_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sctr_time_entry ON shift_close_task_responses(time_entry_id);
    CREATE INDEX IF NOT EXISTS idx_sctr_station ON shift_close_task_responses(station_id);
  `)
}

function migrateEmployeeExtendedColumns(db: Database.Database) {
  let empCols = employeesColumnNames(db)
  const add = (col: string, ddl: string) => addEmployeeColumn(db, empCols, col, ddl)
  add('salutation', 'salutation TEXT')
  add('short_name', 'short_name TEXT')
  add('mobile_phone', 'mobile_phone TEXT')
  add('landline_phone', 'landline_phone TEXT')
  add('personnel_number', 'personnel_number TEXT')
  add('pin_hash', 'pin_hash TEXT')
  add('time_tracking_mode', `time_tracking_mode TEXT DEFAULT 'station_default'`)
  add('break_mode', `break_mode TEXT DEFAULT 'station_default'`)
  add('mobile_punch_mode', `mobile_punch_mode TEXT DEFAULT 'station_default'`)
  add('check_in_mode', `check_in_mode TEXT DEFAULT 'station_default'`)
  add('check_out_mode', `check_out_mode TEXT DEFAULT 'station_default'`)
  add('employee_app_enabled', 'employee_app_enabled INTEGER DEFAULT 1')
  add('employment_role', 'employment_role TEXT')
  add('pay_type', `pay_type TEXT DEFAULT 'hourly'`)
  add('max_hours_per_month', 'max_hours_per_month REAL')
  add('work_days_json', `work_days_json TEXT DEFAULT '["mo","di","mi","do","fr"]'`)
  add('manko_money', 'manko_money REAL')
  add('vl_amount', 'vl_amount REAL')
  add('hide_in_payroll', 'hide_in_payroll INTEGER DEFAULT 0')
  add('overtime_enabled', 'overtime_enabled INTEGER DEFAULT 0')
  add('overtime_start_value', 'overtime_start_value REAL')
  add('overtime_start_date', 'overtime_start_date TEXT')
  add('overtime_current_value', 'overtime_current_value REAL')
  add('overtime_auto_calculate', 'overtime_auto_calculate INTEGER DEFAULT 0')
  add('overtime_include_in_reports', 'overtime_include_in_reports INTEGER DEFAULT 1')
  add('iban', 'iban TEXT')
  add('bic', 'bic TEXT')
  add('account_holder', 'account_holder TEXT')
  add('vacation_start_enabled', 'vacation_start_enabled INTEGER DEFAULT 0')
  add('vacation_start_value', 'vacation_start_value REAL')
  add('vacation_start_date', 'vacation_start_date TEXT')
  add('annual_vacation_days', 'annual_vacation_days REAL')
  add('vacation_hours_per_day', 'vacation_hours_per_day REAL')
  add('vacation_auto_average_13_weeks', 'vacation_auto_average_13_weeks INTEGER DEFAULT 0')
  add('first_break_value', 'first_break_value REAL')
  add('first_break_after_hours', 'first_break_after_hours REAL')
  add('second_break_value', 'second_break_value REAL')
  add('second_break_after_hours', 'second_break_after_hours REAL')
  add('use_station_break_settings', 'use_station_break_settings INTEGER DEFAULT 1')
  add('own_break_rule_enabled', 'own_break_rule_enabled INTEGER DEFAULT 0')
  add('surcharge_mode', `surcharge_mode TEXT DEFAULT 'none'`)
  add('night_surcharge_percent', 'night_surcharge_percent REAL')
  add('night_surcharge_start', 'night_surcharge_start TEXT')
  add('night_surcharge_end', 'night_surcharge_end TEXT')
  add('night_surcharge_after_two_hours', 'night_surcharge_after_two_hours INTEGER DEFAULT 0')
  add('saturday_surcharge_percent', 'saturday_surcharge_percent REAL')
  add('sunday_surcharge_percent', 'sunday_surcharge_percent REAL')
  add('holiday_surcharge_percent', 'holiday_surcharge_percent REAL')
  add('special_holiday_surcharge_percent', 'special_holiday_surcharge_percent REAL')
  add('night_0_4_surcharge_percent', 'night_0_4_surcharge_percent REAL')
  add('night_0_4_after_sunday_percent', 'night_0_4_after_sunday_percent REAL')
  add('night_0_4_after_holiday_percent', 'night_0_4_after_holiday_percent REAL')
  add('night_0_4_after_special_holiday_percent', 'night_0_4_after_special_holiday_percent REAL')
  add('surcharge_calculation_mode', `surcharge_calculation_mode TEXT DEFAULT 'higher'`)
  add('hide_contact_in_address_book', 'hide_contact_in_address_book INTEGER DEFAULT 0')
  add('show_only_first_name_in_employee_app', 'show_only_first_name_in_employee_app INTEGER DEFAULT 0')
  add('visible_in_team_schedule', 'visible_in_team_schedule INTEGER DEFAULT 1')
  add('phone_visible_to_team', 'phone_visible_to_team INTEGER DEFAULT 1')
  add('email_visible_to_team', 'email_visible_to_team INTEGER DEFAULT 1')
  add('deleted_at', 'deleted_at TEXT')
  add('deleted_by', 'deleted_by TEXT')
  add('wage_adjustment_note', 'wage_adjustment_note TEXT')
  db.prepare(
    `UPDATE employees SET mobile_phone = COALESCE(NULLIF(trim(mobile_phone), ''), phone) WHERE mobile_phone IS NULL OR trim(mobile_phone) = ''`,
  ).run()
  db.prepare(
    `UPDATE employees SET employment_role = COALESCE(NULLIF(trim(employment_role), ''), role) WHERE employment_role IS NULL OR trim(employment_role) = ''`,
  ).run()
}

export function ensureMinimumWageRatesSeeded(db: Database.Database) {
  const tbl = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='minimum_wage_rates'`).get() as
    | { name: string }
    | undefined
  if (!tbl) return
  const c = (db.prepare(`SELECT COUNT(*) as n FROM minimum_wage_rates`).get() as { n: number }).n
  if ((c ?? 0) > 0) return
  const ts = nowIso()
  const ins = db.prepare(
    `INSERT INTO minimum_wage_rates (id, valid_from, hourly_rate, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
  )
  ins.run('mwr-2025-01-01', '2025-01-01', 12.82, 'Standard Startwert', ts, ts)
  ins.run('mwr-2026-01-01', '2026-01-01', 13.9, 'Standard Startwert', ts, ts)
  ins.run('mwr-2027-01-01', '2027-01-01', 14.6, 'Standard Startwert', ts, ts)
}

function migrateShiftBakingNoticesToBackshopAck(db: Database.Database) {
  const tbl = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='backshop_notice_acknowledgements'`).get() as
    | { name: string }
    | undefined
  if (!tbl) return
  const oldTbl = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='shift_baking_notices'`).get() as
    | { name: string }
    | undefined
  if (!oldTbl) return
  db.exec(`
    INSERT OR IGNORE INTO backshop_notice_acknowledgements (
      id, station_id, employee_id, shift_id, time_entry_id, routine_id, routine_type, title_snapshot, items_snapshot_json, remark, acknowledged_at, created_at
    )
    SELECT
      sbn.id,
      sbn.station_id,
      sbn.employee_id,
      sbn.shift_id,
      sbn.time_entry_id,
      NULL,
      CASE WHEN lower(trim(sbn.baking_plan_type)) = 'weekday' THEN 'weekday' ELSE 'weekend' END,
      NULL,
      sbn.items_json,
      sbn.remark,
      sbn.acknowledged_at,
      sbn.created_at
    FROM shift_baking_notices sbn
    WHERE NOT EXISTS (
      SELECT 1 FROM backshop_notice_acknowledgements x WHERE x.time_entry_id = sbn.time_entry_id
    )
  `)
}

function ensureBackshopRoutineSeedForBodelshausen(db: Database.Database) {
  if (!shouldRunLegacyRealStationMigrations(db)) return
  const tbl = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='backshop_routines'`).get() as
    | { name: string }
    | undefined
  if (!tbl) return
  const sid = 'aral-bodelshausen'
  const station = db.prepare(`SELECT id FROM stations WHERE id = ?`).get(sid) as { id: string } | undefined
  if (!station) return
  const c = (db.prepare(`SELECT COUNT(*) as n FROM backshop_routines WHERE station_id = ?`).get(sid) as { n: number }).n
  if ((c ?? 0) > 0) return
  const ts = nowIso()
  const insR = db.prepare(
    `INSERT INTO backshop_routines (id, station_id, routine_type, title, description, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
  )
  const wid = `br-${randomUUID()}`
  const weid = `br-${randomUUID()}`
  const hid = `br-${randomUUID()}`
  insR.run(wid, sid, 'weekday', 'Backwaren für heute', null, 1, ts, ts)
  insR.run(weid, sid, 'weekend', 'Backwaren für Wochenende', null, 1, ts, ts)
  insR.run(hid, sid, 'holiday', 'Backwaren für Feiertag', null, 1, ts, ts)
  const insI = db.prepare(
    `INSERT INTO backshop_routine_items (id, routine_id, name, quantity, unit, category, sort_order, active, valid_from, valid_to, restrict_day_type, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
  const weekday: [string, number, string, string][] = [
    ['normale Brötchen', 6, 'Stück', 'Backwaren'],
    ['Laugenbrötchen', 6, 'Stück', 'Backwaren'],
    ['Vitalbrötchen', 1, 'Stück', 'Backwaren'],
    ['Butterbrezeln', 3, 'Stück', 'Backwaren'],
    ['normale Brezeln', 6, 'Stück', 'Backwaren'],
    ['Käsebrezeln', 3, 'Stück', 'Backwaren'],
    ['Schnitzel-Patties', 3, 'Stück', 'Backwaren'],
    ['Hähnchen-Patties', 3, 'Stück', 'Backwaren'],
  ]
  let so = 1
  for (const [name, q, u, cat] of weekday) {
    insI.run(`bi-${randomUUID()}`, wid, name, q, u, cat, so++, 1, null, null, null, null, ts, ts)
  }
  const small: [string, number, string, string][] = [
    ['Butterbrezeln', 3, 'Stück', 'Backwaren'],
    ['normale Brezeln', 3, 'Stück', 'Backwaren'],
    ['Käsebrezeln', 3, 'Stück', 'Backwaren'],
  ]
  so = 1
  for (const [name, q, u, cat] of small) {
    insI.run(`bi-${randomUUID()}`, weid, name, q, u, cat, so++, 1, null, null, null, null, ts, ts)
  }
  so = 1
  for (const [name, q, u, cat] of small) {
    insI.run(`bi-${randomUUID()}`, hid, name, q, u, cat, so++, 1, null, null, null, null, ts, ts)
  }
}

/** Einmalige Stammdaten-Übernahme Personalbögen → bestehende Profile Aral Bodelshausen (idempotent). */
function ensurePersonalstammBodelshausenFromForms(db: Database.Database) {
  if (!shouldRunLegacyRealStationMigrations(db)) return
  const c = db
    .prepare(
      `SELECT COUNT(*) as n FROM employees WHERE station_id = 'aral-bodelshausen' AND (deleted_at IS NULL OR trim(deleted_at) = '')`,
    )
    .get() as { n: number }
  if ((c?.n ?? 0) < 5) return
  const r = applyPersonalstammBodelshausen2026(db)
  if (r.updated > 0) {
    console.log(`[migrations] Personalstamm Bodelshausen: ${r.updated} Profile aktualisiert`)
  }
  if (r.skipped.length) {
    console.log(`[migrations] Personalstamm Bodelshausen: übersprungen (kein Match): ${r.skipped.join(', ')}`)
  }
}

function mergeEmployeeSensitivePermissionsIntoAccess(db: Database.Database) {
  const keys = ['employees.viewSensitive', 'payroll.view', 'employees.manageSensitive'] as const
  const defaults = Object.fromEntries(keys.map((k) => [k, Boolean(TEAMLEAD_PERMISSIONS[k])])) as Record<
    string,
    boolean
  >
  const rows = db.prepare(`SELECT id, permissions_json FROM user_station_access`).all() as {
    id: string
    permissions_json: string
  }[]
  const ts = nowIso()
  for (const r of rows) {
    let p: Record<string, boolean> = {}
    try {
      p = JSON.parse(r.permissions_json || '{}') as Record<string, boolean>
    } catch {
      p = {}
    }
    let changed = false
    for (const [k, v] of Object.entries(defaults)) {
      if (p[k] === undefined) {
        p[k] = v
        changed = true
      }
    }
    if (changed) {
      db.prepare(`UPDATE user_station_access SET permissions_json = ?, updated_at = ? WHERE id = ?`).run(
        JSON.stringify(p),
        ts,
        r.id,
      )
    }
  }
}

function migrateRoleLabelsAndAbsenceRejectColumns(db: Database.Database) {
  const roleCols = db.prepare(`PRAGMA table_info(roles)`).all() as { name: string }[]
  const roleNames = new Set(roleCols.map((c) => c.name))
  if (!roleNames.has('role_key')) {
    db.exec(`ALTER TABLE roles ADD COLUMN role_key TEXT`)
  }
  if (!roleNames.has('role_label')) {
    db.exec(`ALTER TABLE roles ADD COLUMN role_label TEXT`)
  }
  db.prepare(`UPDATE roles SET role_key = 'chief_admin', role_label = 'Chef / Administrator' WHERE id = 'role-admin'`).run()

  const hasTeamLead = db.prepare(`SELECT 1 FROM roles WHERE id = 'role-station-team-lead' LIMIT 1`).get()
  if (!hasTeamLead) {
    const perms = JSON.stringify(TEAMLEAD_PERMISSIONS)
    db.prepare(
      `INSERT INTO roles (id, name, description, permissions_json, role_key, role_label)
       VALUES ('role-station-team-lead', 'Schichtleitung', 'Schichtleitung', ?, 'station_team_lead', 'Schichtleiter')`,
    ).run(perms)
  }

  db.prepare(`UPDATE users SET role_id = 'role-station-team-lead' WHERE id = 'user-mathias-raselowski'`).run()
  db.prepare(`UPDATE users SET global_admin = 1 WHERE id = 'user-max-vins'`).run()
  db.prepare(`UPDATE users SET global_admin = 0 WHERE id = 'user-mathias-raselowski'`).run()

  const absCols = db.prepare(`PRAGMA table_info(absences)`).all() as { name: string }[]
  const absNames = new Set(absCols.map((c) => c.name))
  if (!absNames.has('rejected_by')) {
    db.exec(`ALTER TABLE absences ADD COLUMN rejected_by TEXT`)
  }
  if (!absNames.has('rejected_at')) {
    db.exec(`ALTER TABLE absences ADD COLUMN rejected_at TEXT`)
  }
}

function migrateAbsenceVacationModel(db: Database.Database) {
  const absCols = db.prepare(`PRAGMA table_info(absences)`).all() as { name: string }[]
  const absNames = new Set(absCols.map((c) => c.name))
  const addAbs = (name: string, ddl: string) => {
    if (!absNames.has(name)) {
      db.exec(`ALTER TABLE absences ADD COLUMN ${ddl}`)
      absNames.add(name)
    }
  }
  addAbs('paid', 'paid INTEGER DEFAULT 0')
  addAbs('counts_against_vacation', 'counts_against_vacation INTEGER DEFAULT 0')
  addAbs('paid_hours_per_day', 'paid_hours_per_day REAL DEFAULT 0')
  addAbs('paid_hours_total', 'paid_hours_total REAL DEFAULT 0')
  addAbs('absence_days', 'absence_days REAL DEFAULT 0')
  addAbs('certificate_source', 'certificate_source TEXT')

  db.prepare(`UPDATE absences SET type = 'paid_vacation' WHERE lower(trim(type)) = 'vacation'`).run()
  db.prepare(`UPDATE absences SET type = 'unpaid_vacation' WHERE lower(trim(type)) = 'unpaid'`).run()

  const rows = db
    .prepare(
      `SELECT a.id, a.type, a.start_date, a.end_date, a.half_day, a.status,
              e.vacation_hours_per_day AS vhpd
       FROM absences a
       LEFT JOIN employees e ON e.id = a.employee_id`,
    )
    .all() as {
    id: string
    type: string
    start_date: string
    end_date: string
    half_day: number | null
    status: string
    vhpd: number | null
  }[]

  const upd = db.prepare(
    `UPDATE absences SET
       type = ?,
       paid = ?,
       counts_against_vacation = ?,
       paid_hours_per_day = ?,
       paid_hours_total = ?,
       absence_days = ?
     WHERE id = ?`,
  )

  for (const r of rows) {
    const canon = normalizeAbsenceDbType(r.type)
    const impact = calculateVacationImpact(
      {
        type: canon,
        startDate: r.start_date,
        endDate: r.end_date,
        halfDay: (r.half_day ?? 0) === 1,
      },
      { vacation_hours_per_day: r.vhpd },
    )
    upd.run(
      canon,
      impact.paid ? 1 : 0,
      impact.countsAgainstVacation ? 1 : 0,
      impact.paidHoursPerDay,
      impact.paidHoursTotal,
      impact.absenceDays,
      r.id,
    )
  }
}

function ensureAbsenceAttachmentsTable(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS absence_attachments (
    id TEXT PRIMARY KEY,
    absence_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    station_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_mime_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    uploaded_by TEXT,
    source TEXT,
    FOREIGN KEY (absence_id) REFERENCES absences(id),
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (station_id) REFERENCES stations(id)
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_absence_attachments_absence ON absence_attachments(absence_id)`)
}

function ensureEmployeeAppDevicesTable(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS employee_app_devices (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    station_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    device_label TEXT,
    user_agent TEXT,
    platform TEXT,
    last_ip TEXT,
    first_seen_at TEXT,
    last_seen_at TEXT,
    is_active INTEGER DEFAULT 1,
    revoked_at TEXT,
    revoked_by TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  )`)
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_app_devices_emp_device ON employee_app_devices(employee_id, device_id)`,
  )
  db.exec(`CREATE INDEX IF NOT EXISTS idx_employee_app_devices_station ON employee_app_devices(station_id)`)
}

/** Wer Mitarbeiter endgültig/soft löschen darf, sieht optional die Liste gelöschter Einträge. */
function mergeEmployeesViewDeletedPermission(db: Database.Database) {
  const rows = db.prepare(`SELECT id, permissions_json FROM user_station_access`).all() as {
    id: string
    permissions_json: string
  }[]
  const ts = nowIso()
  for (const r of rows) {
    let p: Record<string, boolean> = {}
    try {
      p = JSON.parse(r.permissions_json || '{}') as Record<string, boolean>
    } catch {
      p = {}
    }
    if (p['employees.delete'] !== true) continue
    if (p['employees.viewDeleted'] !== undefined) continue
    p['employees.viewDeleted'] = true
    db.prepare(`UPDATE user_station_access SET permissions_json = ?, updated_at = ? WHERE id = ?`).run(
      JSON.stringify(p),
      ts,
      r.id,
    )
  }
}

function mergeEmployeeAppPermissionsIntoAccess(db: Database.Database) {
  const keys = [
    'employees.viewAppAccess',
    'employees.viewDevices',
    'employees.manageAppAccess',
    'employees.revokeDevices',
  ] as const
  const rows = db.prepare(`SELECT id, permissions_json FROM user_station_access`).all() as {
    id: string
    permissions_json: string
  }[]
  const ts = nowIso()
  for (const r of rows) {
    let p: Record<string, boolean> = {}
    try {
      p = JSON.parse(r.permissions_json || '{}') as Record<string, boolean>
    } catch {
      p = {}
    }
    if (p['employees.qr'] !== true && p['employees.edit'] !== true) continue
    let changed = false
    for (const k of keys) {
      if (p[k] === undefined) {
        p[k] = true
        changed = true
      }
    }
    if (changed) {
      db.prepare(`UPDATE user_station_access SET permissions_json = ?, updated_at = ? WHERE id = ?`).run(
        JSON.stringify(p),
        ts,
        r.id,
      )
    }
  }
}

function mergeTuvPermissionsIntoAccess(db: Database.Database) {
  const tuvDefaults = Object.fromEntries(
    Object.entries(TEAMLEAD_PERMISSIONS).filter(([k]) => k.startsWith('tuvReports.')),
  ) as Record<string, boolean>
  const rows = db.prepare(`SELECT id, permissions_json FROM user_station_access`).all() as {
    id: string
    permissions_json: string
  }[]
  const ts = nowIso()
  for (const r of rows) {
    let p: Record<string, boolean> = {}
    try {
      p = JSON.parse(r.permissions_json || '{}') as Record<string, boolean>
    } catch {
      p = {}
    }
    let changed = false
    for (const [k, v] of Object.entries(tuvDefaults)) {
      if (p[k] === undefined) {
        p[k] = Boolean(v)
        changed = true
      }
    }
    if (changed) {
      db.prepare(`UPDATE user_station_access SET permissions_json = ?, updated_at = ? WHERE id = ?`).run(
        JSON.stringify(p),
        ts,
        r.id,
      )
    }
  }
}

function ensureStationTabletDevicesTable(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS station_tablet_devices (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    tablet_token TEXT NOT NULL UNIQUE,
    is_active INTEGER DEFAULT 1,
    first_seen_at TEXT,
    last_seen_at TEXT,
    last_ip TEXT,
    user_agent TEXT,
    created_by TEXT,
    created_at TEXT,
    updated_at TEXT,
    revoked_at TEXT,
    revoked_by TEXT,
    FOREIGN KEY (station_id) REFERENCES stations(id)
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_station_tablet_devices_station ON station_tablet_devices(station_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_station_tablet_devices_token ON station_tablet_devices(tablet_token)`)
}

/** Vertreter / Lieferantenkontakte (SQLite-Tabelle). */
function ensureRepresentativesTable(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS representatives (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    company TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    street TEXT,
    house_number TEXT,
    post_code TEXT,
    city TEXT,
    phone TEXT,
    mobile_1 TEXT,
    mobile_2 TEXT,
    fax TEXT,
    category TEXT,
    notes TEXT,
    active INTEGER DEFAULT 1,
    created_by TEXT,
    created_at TEXT,
    updated_at TEXT,
    archived_at TEXT,
    FOREIGN KEY (station_id) REFERENCES stations(id)
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_representatives_station_active ON representatives(station_id, active, company)`)
}

function representativeColumnNames(db: Database.Database): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(representatives)`).all() as { name: string }[]
  return new Set(rows.map((r) => r.name))
}

function ensureRepresentativeExtendedColumns(db: Database.Database) {
  let cols = representativeColumnNames(db)
  const add = (name: string, ddl: string) => {
    if (!cols.has(name)) {
      db.exec(`ALTER TABLE representatives ADD COLUMN ${ddl}`)
      cols.add(name)
    }
  }
  add('position', 'position TEXT')
  add('postal_address', 'postal_address TEXT')
  add('website', 'website TEXT')
  add('is_favorite', 'is_favorite INTEGER DEFAULT 0')
  add('seed_key', 'seed_key TEXT')
  add('business_card_path', 'business_card_path TEXT')
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_representatives_station_seed_key ON representatives(station_id, seed_key) WHERE seed_key IS NOT NULL AND trim(seed_key) != ''`,
  )
}

function seedAralBodelshausenRepresentativesMigration(db: Database.Database) {
  const r = seedAralBodelshausenRepresentatives(db)
  if (r.inserted > 0 || r.updated > 0) {
    console.log(
      `[migrations] Vertreter Bodelshausen: ${r.inserted} neu, ${r.updated} aktualisiert`,
    )
  }
}

/** Vertreter-Berechtigungen für bestehende Schichtplan-/Stammdaten-Rollen ergänzen. */
function mergeRepresentativesPermissionsIntoAccess(db: Database.Database) {
  const rows = db.prepare(`SELECT id, permissions_json FROM user_station_access`).all() as {
    id: string
    permissions_json: string
  }[]
  const ts = nowIso()
  for (const r of rows) {
    let p: Record<string, boolean> = {}
    try {
      p = JSON.parse(r.permissions_json || '{}') as Record<string, boolean>
    } catch {
      p = {}
    }
    const canEdit =
      p['schedule.edit'] === true || p['station.profile.edit'] === true || p['employees.edit'] === true
    if (!canEdit) continue
    let changed = false
    if (p['representatives.view'] === undefined) {
      p['representatives.view'] = true
      changed = true
    }
    if (p['representatives.edit'] === undefined) {
      p['representatives.edit'] = true
      changed = true
    }
    if (p['representatives.delete'] === undefined) {
      p['representatives.delete'] = p['employees.delete'] === true
      changed = true
    }
    if (changed) {
      db.prepare(`UPDATE user_station_access SET permissions_json = ?, updated_at = ? WHERE id = ?`).run(
        JSON.stringify(p),
        ts,
        r.id,
      )
    }
  }
}

/** Stations-Tablets: an Mitarbeiter-App-/Schichtrechten ausrichten (nur fehlende Keys, keine Überschreibung). */
function mergeStationTabletPermissionsIntoAccess(db: Database.Database) {
  const rows = db.prepare(`SELECT id, permissions_json FROM user_station_access`).all() as {
    id: string
    permissions_json: string
  }[]
  const ts = nowIso()
  for (const r of rows) {
    let p: Record<string, boolean> = {}
    try {
      p = JSON.parse(r.permissions_json || '{}') as Record<string, boolean>
    } catch {
      p = {}
    }
    const grantView =
      p['employees.viewAppAccess'] === true ||
      p['employees.manageAppAccess'] === true ||
      p['employees.viewDevices'] === true ||
      p['employees.qr'] === true ||
      p['schedule.edit'] === true
    const grantManage =
      p['employees.manageAppAccess'] === true ||
      p['employees.revokeDevices'] === true ||
      p['employees.qr'] === true ||
      p['schedule.edit'] === true
    if (!grantView && !grantManage) continue
    let changed = false
    if (grantView && p['stationTablets.view'] === undefined) {
      p['stationTablets.view'] = true
      changed = true
    }
    if (grantManage && p['stationTablets.manage'] === undefined) {
      p['stationTablets.manage'] = true
      changed = true
    }
    if (changed) {
      db.prepare(`UPDATE user_station_access SET permissions_json = ?, updated_at = ? WHERE id = ?`).run(
        JSON.stringify(p),
        ts,
        r.id,
      )
    }
  }
}

function ensureStationDocumentsTables(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS station_documents (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    global_document INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    document_type TEXT NOT NULL DEFAULT 'other',
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    preview_path TEXT,
    is_template INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    previous_file_path TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    FOREIGN KEY (station_id) REFERENCES stations(id)
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_station_documents_station ON station_documents(station_id, archived_at, active)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_station_documents_type ON station_documents(document_type)`)
  db.exec(`CREATE TABLE IF NOT EXISTS station_document_employees (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES station_documents(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    UNIQUE(document_id, employee_id)
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_station_document_employees_emp ON station_document_employees(employee_id)`)
}

/** Station: Arbeitsbereiche sortieren/Standard, Stammdaten-Zusatzfelder, Zusatz-Feiertage, Organisations-/Kommunikations-/Abrechnungs-Tabellen. */
function ensureStationExtendedModules2026(db: Database.Database) {
  const waCols = new Set((db.prepare(`PRAGMA table_info(work_areas)`).all() as { name: string }[]).map((c) => c.name))
  if (!waCols.has('sort_order')) {
    db.exec(`ALTER TABLE work_areas ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`)
  }
  if (!waCols.has('is_default')) {
    db.exec(`ALTER TABLE work_areas ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0`)
  }

  const stCols = new Set((db.prepare(`PRAGMA table_info(stations)`).all() as { name: string }[]).map((c) => c.name))
  if (!stCols.has('timezone')) {
    db.exec(`ALTER TABLE stations ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Berlin'`)
  }
  if (!stCols.has('fuel_price_refresh_minutes')) {
    db.exec(`ALTER TABLE stations ADD COLUMN fuel_price_refresh_minutes INTEGER NOT NULL DEFAULT 1`)
  }
  if (!stCols.has('tablet_settings_json')) {
    db.exec(`ALTER TABLE stations ADD COLUMN tablet_settings_json TEXT`)
  }
  if (!stCols.has('backshop_rules_json')) {
    db.exec(`ALTER TABLE stations ADD COLUMN backshop_rules_json TEXT`)
  }

  const usrCols = new Set((db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).map((c) => c.name))
  if (!usrCols.has('phone')) {
    db.exec(`ALTER TABLE users ADD COLUMN phone TEXT`)
  }

  db.exec(`CREATE TABLE IF NOT EXISTS station_extra_holidays (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    federal_state TEXT,
    is_legal INTEGER NOT NULL DEFAULT 0,
    is_special INTEGER NOT NULL DEFAULT 0,
    counts_as_public INTEGER NOT NULL DEFAULT 1,
    counts_as_special INTEGER NOT NULL DEFAULT 0,
    opening_hours_note TEXT,
    remark TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT,
    FOREIGN KEY (station_id) REFERENCES stations(id)
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_station_extra_holidays_station ON station_extra_holidays(station_id, date, active)`)

  db.exec(`CREATE TABLE IF NOT EXISTS station_announcements (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    audience TEXT NOT NULL DEFAULT 'all',
    priority TEXT NOT NULL DEFAULT 'normal',
    valid_from TEXT,
    valid_to TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    archived_at TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (station_id) REFERENCES stations(id)
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_station_announcements_station ON station_announcements(station_id, active, valid_from)`)

  db.exec(`CREATE TABLE IF NOT EXISTS station_chat_groups (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    archived_at TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (station_id) REFERENCES stations(id)
  )`)
  db.exec(`CREATE TABLE IF NOT EXISTS station_chat_group_members (
    group_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    role TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (group_id, employee_id),
    FOREIGN KEY (group_id) REFERENCES station_chat_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
  )`)

  db.exec(`CREATE TABLE IF NOT EXISTS station_org_lists (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT,
    description TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    archived_at TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (station_id) REFERENCES stations(id)
  )`)
  db.exec(`CREATE TABLE IF NOT EXISTS station_org_list_items (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL,
    text TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    mandatory INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (list_id) REFERENCES station_org_lists(id) ON DELETE CASCADE
  )`)

  db.exec(`CREATE TABLE IF NOT EXISTS station_calendar_events (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    time_from TEXT,
    time_to TEXT,
    all_day INTEGER NOT NULL DEFAULT 0,
    category TEXT,
    repeat_rule TEXT,
    reminder_minutes INTEGER,
    attendee_employee_ids_json TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    archived_at TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (station_id) REFERENCES stations(id)
  )`)

  db.exec(`CREATE TABLE IF NOT EXISTS station_org_contacts (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    name TEXT NOT NULL,
    company TEXT,
    role_label TEXT,
    email TEXT,
    phone TEXT,
    mobile TEXT,
    fax TEXT,
    address TEXT,
    note TEXT,
    category TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (station_id) REFERENCES stations(id)
  )`)

  db.exec(`CREATE TABLE IF NOT EXISTS station_meters (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    unit TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (station_id) REFERENCES stations(id)
  )`)
  db.exec(`CREATE TABLE IF NOT EXISTS station_meter_readings (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    meter_id TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT,
    value REAL NOT NULL,
    note TEXT,
    photo_path TEXT,
    captured_by TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (station_id) REFERENCES stations(id),
    FOREIGN KEY (meter_id) REFERENCES station_meters(id) ON DELETE CASCADE
  )`)

  db.exec(`CREATE TABLE IF NOT EXISTS account_invoices (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    period_from TEXT,
    period_to TEXT,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',
    pdf_path TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (station_id) REFERENCES stations(id)
  )`)

  db.exec(`CREATE TABLE IF NOT EXISTS account_billing_documents (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    archived_at TEXT,
    uploaded_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (station_id) REFERENCES stations(id)
  )`)
}

/** Pausenregelung in Stammdaten + Aral Bodelshausen: keine automatische Pause (0 Min.) in bestehenden Schichten/Zeiten. */
/** Stationsregeln Lohn-Zuschläge (Früh/Spät/Nacht an Werktagen, Schichtplan-Basis). */
function ensureStationPayrollSurchargeRuleColumns(db: Database.Database) {
  const cols = new Set((db.prepare(`PRAGMA table_info(stations)`).all() as { name: string }[]).map((c) => c.name))
  const add = (name: string, ddl: string) => {
    if (!cols.has(name)) {
      db.exec(`ALTER TABLE stations ADD COLUMN ${ddl}`)
      cols.add(name)
    }
  }
  add('normal_weekday_night_bonus_enabled', 'normal_weekday_night_bonus_enabled INTEGER')
  add('normal_weekday_evening_bonus_enabled', 'normal_weekday_evening_bonus_enabled INTEGER')
  add('saturday_surcharge_enabled', 'saturday_surcharge_enabled INTEGER')
  add('sunday_surcharge_enabled', 'sunday_surcharge_enabled INTEGER')
  add('payroll_supplements_prefer_schedule', 'payroll_supplements_prefer_schedule INTEGER')
  add('default_special_holiday_percent', 'default_special_holiday_percent REAL')

  const ts = nowIso()
  db.prepare(
    `UPDATE stations SET
      normal_weekday_night_bonus_enabled = COALESCE(normal_weekday_night_bonus_enabled, 1),
      normal_weekday_evening_bonus_enabled = COALESCE(normal_weekday_evening_bonus_enabled, 1),
      saturday_surcharge_enabled = COALESCE(saturday_surcharge_enabled, 1),
      sunday_surcharge_enabled = COALESCE(sunday_surcharge_enabled, 1),
      payroll_supplements_prefer_schedule = COALESCE(payroll_supplements_prefer_schedule, 0),
      default_special_holiday_percent = COALESCE(default_special_holiday_percent, 150),
      updated_at = ?
    WHERE normal_weekday_night_bonus_enabled IS NULL
       OR normal_weekday_evening_bonus_enabled IS NULL
       OR saturday_surcharge_enabled IS NULL
       OR sunday_surcharge_enabled IS NULL
       OR payroll_supplements_prefer_schedule IS NULL
       OR default_special_holiday_percent IS NULL`,
  ).run(ts)

  db.prepare(
    `UPDATE employees SET
      special_holiday_surcharge_percent = 150,
      holiday_surcharge_percent = COALESCE(holiday_surcharge_percent, 125),
      updated_at = ?
    WHERE station_id = 'aral-bodelshausen'
      AND (special_holiday_surcharge_percent IS NULL OR special_holiday_surcharge_percent <= 0)
      AND surcharge_mode IN ('individual', 'tax_free')`,
  ).run(ts)
}

/** Aral Bodelshausen: Sonntagszuschläge aktiv, nur Sonntag/Feiertag (kein Nacht/Früh/Spät). */
function ensureDemoStationSundayHolidaySurchargePolicy(db: Database.Database) {
  const cols = new Set((db.prepare(`PRAGMA table_info(stations)`).all() as { name: string }[]).map((c) => c.name))
  if (!cols.has('payroll_only_sunday_holiday_supplements')) {
    db.exec(`ALTER TABLE stations ADD COLUMN payroll_only_sunday_holiday_supplements INTEGER`)
  }
  const exists = db.prepare(`SELECT 1 FROM stations WHERE id = ?`).get(DEMO_STATION_ID)
  if (!exists) return
  const ts = nowIso()
  db.prepare(
    `UPDATE stations SET
      normal_weekday_night_bonus_enabled = 0,
      normal_weekday_evening_bonus_enabled = 0,
      saturday_surcharge_enabled = 0,
      sunday_surcharge_enabled = 1,
      payroll_supplements_prefer_schedule = 1,
      default_special_holiday_percent = 150,
      payroll_only_sunday_holiday_supplements = 1,
      updated_at = ?
    WHERE id = ?`,
  ).run(ts, DEMO_STATION_ID)
}

function ensureBodelshausenSundayHolidaySurchargePolicy(db: Database.Database) {
  if (!shouldRunLegacyRealStationMigrations(db)) return
  const cols = new Set((db.prepare(`PRAGMA table_info(stations)`).all() as { name: string }[]).map((c) => c.name))
  if (!cols.has('payroll_only_sunday_holiday_supplements')) {
    db.exec(`ALTER TABLE stations ADD COLUMN payroll_only_sunday_holiday_supplements INTEGER`)
  }
  const ts = nowIso()
  db.prepare(
    `UPDATE stations SET
      normal_weekday_night_bonus_enabled = 0,
      normal_weekday_evening_bonus_enabled = 0,
      saturday_surcharge_enabled = 0,
      sunday_surcharge_enabled = 1,
      payroll_supplements_prefer_schedule = 1,
      default_special_holiday_percent = 150,
      payroll_only_sunday_holiday_supplements = 1,
      updated_at = ?
    WHERE id = 'aral-bodelshausen'`,
  ).run(ts)
}

/** Feiertagsverwaltung: Kategorie, Zeitraum, Referenz-Prozent (Anzeige; Lohn nutzt Mitarbeiterprofil). */
function ensureStationHolidayPayrollColumns(db: Database.Database) {
  const cols = new Set(
    (db.prepare(`PRAGMA table_info(station_extra_holidays)`).all() as { name: string }[]).map((c) => c.name),
  )
  const add = (name: string, ddl: string) => {
    if (!cols.has(name)) {
      db.exec(`ALTER TABLE station_extra_holidays ADD COLUMN ${ddl}`)
      cols.add(name)
    }
  }
  add('payroll_category', `payroll_category TEXT NOT NULL DEFAULT 'regular'`)
  add('reference_percent', 'reference_percent REAL')
  add('all_day', 'all_day INTEGER NOT NULL DEFAULT 1')
  add('time_start', 'time_start TEXT')
  add('time_end', 'time_end TEXT')
  add('source', `source TEXT NOT NULL DEFAULT 'custom'`)
  add('statutory_template_id', 'statutory_template_id TEXT')
  add('is_manual_override', 'is_manual_override INTEGER NOT NULL DEFAULT 0')
  add('special_rule_tier', 'special_rule_tier TEXT')

  const ts = nowIso()
  db.prepare(
    `UPDATE station_extra_holidays SET
      payroll_category = CASE
        WHEN counts_as_special = 1 THEN 'special'
        WHEN counts_as_public = 0 THEN 'none'
        ELSE 'regular'
      END,
      reference_percent = COALESCE(reference_percent,
        CASE WHEN counts_as_special = 1 THEN 150 ELSE 125 END),
      all_day = COALESCE(all_day, 1),
      source = COALESCE(NULLIF(source, ''), 'custom'),
      updated_at = ?
    WHERE payroll_category IS NULL OR payroll_category = ''`,
  ).run(ts)

  const stations = db.prepare(`SELECT id FROM stations`).all() as { id: string }[]
  for (const s of stations) {
    ensureStationStatutoryHolidaysSeeded(db, s.id, 2026)
  }
}

function ensureStationDocumentTemplateColumns(db: Database.Database) {
  const cols = new Set(
    (db.prepare(`PRAGMA table_info(station_documents)`).all() as { name: string }[]).map((c) => c.name),
  )
  if (!cols.has('template_key')) {
    db.exec(`ALTER TABLE station_documents ADD COLUMN template_key TEXT`)
  }
  if (!cols.has('version_label')) {
    db.exec(`ALTER TABLE station_documents ADD COLUMN version_label TEXT`)
  }
  const stations = db.prepare(`SELECT id FROM stations`).all() as { id: string }[]
  for (const s of stations) {
    ensureStationDocumentTemplates(db, s.id)
  }
}

function ensureTuvReportExtendedColumns(db: Database.Database) {
  const cols = new Set((db.prepare(`PRAGMA table_info(tuv_reports)`).all() as { name: string }[]).map((c) => c.name))
  if (!cols.has('form_json')) {
    db.exec(`ALTER TABLE tuv_reports ADD COLUMN form_json TEXT`)
  }
  if (!cols.has('source_template_document_id')) {
    db.exec(`ALTER TABLE tuv_reports ADD COLUMN source_template_document_id TEXT`)
  }
  db.exec(`CREATE TABLE IF NOT EXISTS tuv_report_audit_log (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    user_id TEXT,
    user_name TEXT,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (report_id) REFERENCES tuv_reports(id) ON DELETE CASCADE
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tuv_report_audit_report ON tuv_report_audit_log(report_id, created_at)`)
}

function ensurePayrollQueryIndexes(db: Database.Database) {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shifts_station_date ON shifts(station_id, date)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shifts_employee_date ON shifts(employee_id, date)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_time_entries_station_start ON time_entries(station_id, start_at)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_time_entries_employee_start ON time_entries(employee_id, start_at)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_absences_station_span ON absences(station_id, start_date, end_date)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_absences_employee_span ON absences(employee_id, start_date, end_date)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_station_date ON payroll_adjustments(station_id, date)`)
}

function ensureStationBreakPolicyColumnsAndZeroBodelshausenBreaks(db: Database.Database) {
  if (!shouldRunLegacyRealStationMigrations(db)) return
  const cols = new Set((db.prepare(`PRAGMA table_info(stations)`).all() as { name: string }[]).map((r) => r.name))
  if (!cols.has('automatic_break_deduction')) {
    db.exec(`ALTER TABLE stations ADD COLUMN automatic_break_deduction INTEGER NOT NULL DEFAULT 0`)
  }
  if (!cols.has('default_break_minutes')) {
    db.exec(`ALTER TABLE stations ADD COLUMN default_break_minutes INTEGER NOT NULL DEFAULT 0`)
  }
  db.prepare(
    `UPDATE stations SET automatic_break_deduction = 0, default_break_minutes = 0 WHERE id = 'aral-bodelshausen'`,
  ).run()
  db.prepare(`UPDATE shifts SET break_minutes = 0 WHERE station_id = 'aral-bodelshausen'`).run()
  db.prepare(`UPDATE time_entries SET break_minutes = 0 WHERE station_id = 'aral-bodelshausen'`).run()
}

/** Stations-Dokumente: für Stammdaten-Rollen ergänzen (fehlende Keys nur). */
function mergeDocumentsPermissionsIntoAccess(db: Database.Database) {
  const rows = db.prepare(`SELECT id, permissions_json FROM user_station_access`).all() as {
    id: string
    permissions_json: string
  }[]
  const ts = nowIso()
  for (const r of rows) {
    let p: Record<string, boolean> = {}
    try {
      p = JSON.parse(r.permissions_json || '{}') as Record<string, boolean>
    } catch {
      p = {}
    }
    const grant =
      p['employees.edit'] === true ||
      p['station.profile.edit'] === true ||
      p['schedule.edit'] === true
    if (!grant) continue
    let changed = false
    const setIfUndef = (k: string, v: boolean) => {
      if (p[k] === undefined) {
        p[k] = v
        changed = true
      }
    }
    setIfUndef('documents.view', true)
    setIfUndef('documents.upload', true)
    setIfUndef('documents.edit', true)
    setIfUndef('documents.archive', true)
    setIfUndef('documents.print', true)
    if (p['documents.create_employee_from_document'] === undefined && p['employees.create'] === true) {
      p['documents.create_employee_from_document'] = true
      changed = true
    }
    if (changed) {
      db.prepare(`UPDATE user_station_access SET permissions_json = ?, updated_at = ? WHERE id = ?`).run(
        JSON.stringify(p),
        ts,
        r.id,
      )
    }
  }
}
