import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { FULL_STATION_PERMISSIONS, TEAMLEAD_PERMISSIONS } from '../constants/permissions.js'
import {
  DEMO_ADMIN_EMAIL,
  DEMO_ADMIN_PASSWORD_DEFAULT,
  DEMO_ADMIN_USERNAME,
  DEMO_STATION,
  DEMO_STATION_ID,
} from '../constants/demo.js'
import { isDemoSeedEnabled } from '../config/dataPaths.js'
import { nowIso } from '../utils/timestamps.js'

type EmpSeed = {
  id: string
  first_name: string
  last_name: string
  display_name: string
  email: string
  phone: string
  birthday: string
  role: string
  employment_type: string
  hourly_wage: number
  monthly_salary: number | null
  weekly_hours: number
  monthly_hours: number
  vacation_days_total: number
  vacation_days_used: number
  color: string
  cash_register_card_number: string
  terminal_enabled: number
  time_tracking_enabled: number
  start_date: string
  notes: string
  work_area_ids: string[]
}

const EMPLOYEES: EmpSeed[] = [
  {
    id: 'e-demo-1',
    first_name: 'Laura',
    last_name: 'Sommer',
    display_name: 'Laura Sommer',
    email: 'laura.sommer@demo-station.de',
    phone: '0170 1000001',
    birthday: '1988-04-12',
    role: 'Stationsleiter',
    employment_type: 'vollzeit',
    hourly_wage: 16,
    monthly_salary: 2800,
    weekly_hours: 40,
    monthly_hours: 165,
    vacation_days_total: 30,
    vacation_days_used: 5,
    color: '#2dd4bf',
    cash_register_card_number: '900001',
    terminal_enabled: 1,
    time_tracking_enabled: 1,
    start_date: '2020-01-10',
    notes: 'Demo-Stationsleitung',
    work_area_ids: ['kasse', 'buero'],
  },
  {
    id: 'e-demo-2',
    first_name: 'Max',
    last_name: 'Becker',
    display_name: 'Max Becker',
    email: 'max.becker@demo-station.de',
    phone: '0170 1000002',
    birthday: '1990-07-22',
    role: 'Schichtleiter',
    employment_type: 'vollzeit',
    hourly_wage: 15.5,
    monthly_salary: null,
    weekly_hours: 40,
    monthly_hours: 160,
    vacation_days_total: 28,
    vacation_days_used: 8,
    color: '#2563eb',
    cash_register_card_number: '900002',
    terminal_enabled: 1,
    time_tracking_enabled: 1,
    start_date: '2021-03-01',
    notes: '',
    work_area_ids: ['kasse', 'shop'],
  },
  {
    id: 'e-demo-3',
    first_name: 'Tim',
    last_name: 'Wagner',
    display_name: 'Tim Wagner',
    email: 'tim.wagner@demo-station.de',
    phone: '0170 1000003',
    birthday: '1995-11-03',
    role: 'Mitarbeiter',
    employment_type: 'vollzeit',
    hourly_wage: 14.5,
    monthly_salary: null,
    weekly_hours: 38,
    monthly_hours: 155,
    vacation_days_total: 28,
    vacation_days_used: 4,
    color: '#ec4899',
    cash_register_card_number: '900003',
    terminal_enabled: 1,
    time_tracking_enabled: 1,
    start_date: '2022-06-15',
    notes: '',
    work_area_ids: ['kasse', 'bistro'],
  },
  {
    id: 'e-demo-4',
    first_name: 'Nina',
    last_name: 'Keller',
    display_name: 'Nina Keller',
    email: 'nina.keller@demo-station.de',
    phone: '0170 1000004',
    birthday: '1998-02-14',
    role: 'Mitarbeiter',
    employment_type: 'teilzeit',
    hourly_wage: 14,
    monthly_salary: null,
    weekly_hours: 25,
    monthly_hours: 100,
    vacation_days_total: 25,
    vacation_days_used: 2,
    color: '#ea580c',
    cash_register_card_number: '900004',
    terminal_enabled: 1,
    time_tracking_enabled: 1,
    start_date: '2023-01-20',
    notes: '',
    work_area_ids: ['shop', 'wasch'],
  },
  {
    id: 'e-demo-5',
    first_name: 'Jonas',
    last_name: 'Weber',
    display_name: 'Jonas Weber',
    email: 'jonas.weber@demo-station.de',
    phone: '0170 1000005',
    birthday: '2001-05-18',
    role: 'Aushilfe',
    employment_type: 'aushilfe',
    hourly_wage: 13,
    monthly_salary: null,
    weekly_hours: 20,
    monthly_hours: 72,
    vacation_days_total: 0,
    vacation_days_used: 0,
    color: '#fb923c',
    cash_register_card_number: '900005',
    terminal_enabled: 1,
    time_tracking_enabled: 1,
    start_date: '2024-02-01',
    notes: '',
    work_area_ids: ['kasse', 'aussen'],
  },
  {
    id: 'e-demo-6',
    first_name: 'Mia',
    last_name: 'Fischer',
    display_name: 'Mia Fischer',
    email: 'mia.fischer@demo-station.de',
    phone: '0170 1000006',
    birthday: '1993-09-09',
    role: 'Aushilfe',
    employment_type: 'aushilfe',
    hourly_wage: 13.5,
    monthly_salary: null,
    weekly_hours: 15,
    monthly_hours: 55,
    vacation_days_total: 0,
    vacation_days_used: 0,
    color: '#06b6d4',
    cash_register_card_number: '900006',
    terminal_enabled: 1,
    time_tracking_enabled: 1,
    start_date: '2024-08-01',
    notes: 'Demo-Aushilfe Wochenende',
    work_area_ids: ['wasch', 'aussen'],
  },
]

const WORK_AREAS = [
  { id: 'kasse', name: 'Kasse', short_code: 'K', color: '#22d3ee', description: '' },
  { id: 'shop', name: 'Shop', short_code: 'S', color: '#fbbf24', description: '' },
  { id: 'bistro', name: 'Bistro', short_code: 'Bi', color: '#f97316', description: '' },
  { id: 'wasch', name: 'Waschanlage', short_code: 'W', color: '#38bdf8', description: '' },
  { id: 'buero', name: 'Büro', short_code: 'B', color: '#a78bfa', description: '' },
  { id: 'aussen', name: 'Außenbereich', short_code: 'A', color: '#4ade80', description: '' },
]

const TASK_TITLES = [
  'Kassenbereich prüfen',
  'Shop auffüllen',
  'Bistro Reinigung',
  'Waschanlage Sichtkontrolle',
  'Außenbereich kontrollieren',
  'TÜV-Bericht vorbereiten (Demo)',
]

function tableCount(db: Database.Database, table: string): number {
  const exists = db
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1`)
    .get(table) as { ok: number } | undefined
  if (!exists) return 0
  const row = db.prepare(`SELECT COUNT(*) as c FROM "${table}"`).get() as { c: number }
  return row.c ?? 0
}

export function isDatabaseReallyEmpty(db: Database.Database): boolean {
  return tableCount(db, 'employees') === 0 && tableCount(db, 'users') === 0
}

function shouldRunDemoSeed(db: Database.Database): boolean {
  if (tableCount(db, 'employees') > 0 || tableCount(db, 'users') > 0) return false
  return isDemoSeedEnabled()
}

export function seedIfEmpty(db: Database.Database) {
  if (!shouldRunDemoSeed(db)) return

  const ts = nowIso()
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD ?? DEMO_ADMIN_PASSWORD_DEFAULT
  const hashAdmin = bcrypt.hashSync(adminPassword, 10)

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT OR IGNORE INTO stations (id, name, brand, address, city, postal_code, phone, email, federal_state, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(
      DEMO_STATION_ID,
      DEMO_STATION.name,
      DEMO_STATION.brand,
      DEMO_STATION.address,
      DEMO_STATION.city,
      DEMO_STATION.postalCode,
      DEMO_STATION.phone,
      DEMO_STATION.email,
      DEMO_STATION.federalState,
      ts,
      ts,
    )

    const insWa = db.prepare(
      `INSERT OR IGNORE INTO work_areas (id, station_id, name, short_code, color, description, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    for (const w of WORK_AREAS) {
      insWa.run(w.id, DEMO_STATION_ID, w.name, w.short_code, w.color, w.description, ts, ts)
    }

    db.prepare(
      `INSERT OR IGNORE INTO roles (id, name, description, permissions_json, role_key, role_label) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'role-admin',
      'Betreiber',
      'Betreiber / Administrator',
      JSON.stringify(FULL_STATION_PERMISSIONS),
      'chief_admin',
      'Betreiber',
    )
    db.prepare(
      `INSERT OR IGNORE INTO roles (id, name, description, permissions_json, role_key, role_label) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'role-station-team-lead',
      'Schichtleitung',
      'Schichtleitung',
      JSON.stringify(TEAMLEAD_PERMISSIONS),
      'station_team_lead',
      'Schichtleiter',
    )

    const insUser = db.prepare(
      `INSERT OR IGNORE INTO users (id, username, email, password_hash, display_name, role_id, global_admin, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    const updUser = db.prepare(
      `UPDATE users SET email = ?, password_hash = ?, display_name = ?, role_id = ?, global_admin = ?, updated_at = ? WHERE id = ?`,
    )
    insUser.run(
      'user-demo-admin',
      DEMO_ADMIN_USERNAME,
      DEMO_ADMIN_EMAIL,
      hashAdmin,
      'Demo Admin',
      'role-admin',
      1,
      ts,
      ts,
    )
    updUser.run(DEMO_ADMIN_EMAIL, hashAdmin, 'Demo Admin', 'role-admin', 1, ts, 'user-demo-admin')
    insUser.run(
      'user-demo-lead',
      'laura',
      'laura.sommer@demo-station.de',
      hashAdmin,
      'Laura Sommer',
      'role-station-team-lead',
      0,
      ts,
      ts,
    )
    updUser.run('laura.sommer@demo-station.de', hashAdmin, 'Laura Sommer', 'role-station-team-lead', 0, ts, 'user-demo-lead')

    const insEmp = db.prepare(
      `INSERT INTO employees (
        id, station_id, first_name, last_name, display_name, email, phone, birthday, role, employment_type,
        hourly_wage, monthly_salary, weekly_hours, monthly_hours, vacation_days_total, vacation_days_used,
        color, status, cash_register_card_number, terminal_enabled, time_tracking_enabled,
        start_date, end_date, notes, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL, ?, 1, ?, ?)`,
    )
    const insEwa = db.prepare(
      `INSERT INTO employee_work_areas (id, employee_id, work_area_id) VALUES (?, ?, ?)`,
    )
    for (const e of EMPLOYEES) {
      insEmp.run(
        e.id,
        DEMO_STATION_ID,
        e.first_name,
        e.last_name,
        e.display_name,
        e.email,
        e.phone,
        e.birthday,
        e.role,
        e.employment_type,
        e.hourly_wage,
        e.monthly_salary,
        e.weekly_hours,
        e.monthly_hours,
        e.vacation_days_total,
        e.vacation_days_used,
        e.color,
        e.cash_register_card_number,
        e.terminal_enabled,
        e.time_tracking_enabled,
        e.start_date,
        e.notes,
        ts,
        ts,
      )
      for (const wid of e.work_area_ids) {
        insEwa.run(randomUUID(), e.id, wid)
      }
    }

    const insAbs = db.prepare(
      `INSERT INTO absences (
         id, station_id, employee_id, type, start_date, end_date, half_day, status, comment,
         requested_at, approved_by, approved_at, rejected_by, rejected_at, rejected_reason,
         paid, counts_against_vacation, paid_hours_per_day, paid_hours_total, absence_days,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    )
    insAbs.run(
      'abs-demo-1',
      DEMO_STATION_ID,
      'e-demo-5',
      'paid_vacation',
      '2026-06-10',
      '2026-06-14',
      'approved',
      'Demo-Urlaub',
      ts,
      'Demo',
      ts,
      1,
      1,
      8,
      40,
      5,
      ts,
      ts,
    )
    insAbs.run(
      'abs-demo-2',
      DEMO_STATION_ID,
      'e-demo-3',
      'sick',
      '2026-05-12',
      '2026-05-13',
      'approved',
      '',
      ts,
      'Demo',
      ts,
      0,
      0,
      0,
      0,
      2,
      ts,
      ts,
    )

    const insTask = db.prepare(
      `INSERT INTO tasks (
        id, station_id, title, description, work_area_id, assigned_type, assigned_employee_id, assigned_role,
        recurrence_type, start_date, end_date, weekdays_json, month_day, start_time, end_time,
        confirm_required, control_required, mandatory, priority, active, icon, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'all', NULL, NULL, 'weekly', '2026-01-01', NULL, ?, NULL, '06:00', '22:00', 0, 0, 0, 'normal', 1, NULL, 'seed', ?, ?)`,
    )
    const weekdays = JSON.stringify([1, 2, 3, 4, 5, 6])
    TASK_TITLES.forEach((title, i) => {
      const wid = WORK_AREAS[i % WORK_AREAS.length]!.id
      insTask.run(`task-demo-${i + 1}`, DEMO_STATION_ID, title, 'Demo-Aufgabe', wid, weekdays, ts, ts)
    })

    const insShift = db.prepare(
      `INSERT INTO shifts (
        id, station_id, employee_id, work_area_id, date, start_time, end_time, break_minutes,
        shift_type, title, note, color, status, published, conflict, import_source, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 30, ?, NULL, '', NULL, 'published', 1, 0, 'demo_seed', 'seed', 'seed', ?, ?)`,
    )
    insShift.run(
      'shift-demo-1',
      DEMO_STATION_ID,
      'e-demo-2',
      'kasse',
      '2026-05-19',
      '06:00',
      '14:00',
      'early',
      ts,
      ts,
    )
    insShift.run(
      'shift-demo-2',
      DEMO_STATION_ID,
      'e-demo-3',
      'kasse',
      '2026-05-19',
      '14:00',
      '22:00',
      'late',
      ts,
      ts,
    )

    const insTe = db.prepare(
      `INSERT INTO time_entries (id, station_id, employee_id, shift_id, start_at, end_at, break_minutes, status, source, started_by, ended_by, start_note, end_note, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    )
    insTe.run(
      'te-demo-1',
      DEMO_STATION_ID,
      'e-demo-2',
      '2026-05-18T04:00:00.000Z',
      '2026-05-18T11:00:00.000Z',
      30,
      'completed',
      'tablet',
      'Max Becker',
      'Max Becker',
      ts,
      ts,
    )
  })

  tx()
}
