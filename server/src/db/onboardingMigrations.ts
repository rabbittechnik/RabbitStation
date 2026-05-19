import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { nowIso } from '../utils/timestamps.js'
import { DEMO_TENANT_ID } from './saasMigrations.js'

function colExists(db: Database.Database, table: string, col: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return rows.some((r) => r.name === col)
}

function addCol(db: Database.Database, table: string, col: string, ddl: string) {
  if (!colExists(db, table, col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}

export function runOnboardingMigrations(db: Database.Database) {
  addCol(db, 'tenants', 'onboarding_tour_completed', 'onboarding_tour_completed INTEGER NOT NULL DEFAULT 0')
  addCol(db, 'stations', 'monthly_tuv_report_enabled', 'monthly_tuv_report_enabled INTEGER')
  addCol(db, 'stations', 'shift_setup_completed', 'shift_setup_completed INTEGER NOT NULL DEFAULT 0')
  addCol(db, 'stations', 'owner_as_employee_enabled', 'owner_as_employee_enabled INTEGER NOT NULL DEFAULT 0')
  addCol(db, 'stations', 'setup_owner_answered', 'setup_owner_answered INTEGER NOT NULL DEFAULT 0')
  addCol(db, 'users', 'employee_id', 'employee_id TEXT')

  db.exec(`
    CREATE TABLE IF NOT EXISTS shift_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      station_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      color TEXT,
      work_area_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_shift_templates_station ON shift_templates(station_id, active, sort_order);
    CREATE INDEX IF NOT EXISTS idx_shift_templates_tenant ON shift_templates(tenant_id);
  `)

  backfillShiftTemplatesFromLegacyJson(db)
}

function parseLegacyWorkTimes(json: string | null): Array<{
  type: string
  name: string
  start: string
  end: string
}> {
  if (!json?.trim()) return []
  try {
    const o = JSON.parse(json) as Record<string, unknown>
    const out: Array<{ type: string; name: string; start: string; end: string }> = []
    const map: [string, string][] = [
      ['early', 'Frühschicht'],
      ['middle', 'Mittelschicht'],
      ['late', 'Spätschicht'],
      ['night', 'Nachtschicht'],
      ['office', 'Büro / Verwaltung'],
    ]
    for (const [key, label] of map) {
      const slot = o[key] as { start?: string; end?: string } | undefined
      if (slot?.start && slot?.end) {
        out.push({ type: key, name: label, start: String(slot.start).slice(0, 5), end: String(slot.end).slice(0, 5) })
      }
    }
    const customs = o.customShifts as Array<{ name?: string; start?: string; end?: string }> | undefined
    if (Array.isArray(customs)) {
      for (const c of customs) {
        if (c?.name && c?.start && c?.end) {
          out.push({
            type: 'custom',
            name: String(c.name),
            start: String(c.start).slice(0, 5),
            end: String(c.end).slice(0, 5),
          })
        }
      }
    }
    return out
  } catch {
    return []
  }
}

function backfillShiftTemplatesFromLegacyJson(db: Database.Database) {
  const stations = db
    .prepare(
      `SELECT id, tenant_id, standard_work_times_json, shift_setup_completed
       FROM stations
       WHERE standard_work_times_json IS NOT NULL AND trim(standard_work_times_json) != ''`,
    )
    .all() as {
    id: string
    tenant_id: string | null
    standard_work_times_json: string | null
    shift_setup_completed: number
  }[]

  const ts = nowIso()
  const countTpl = db.prepare(`SELECT COUNT(*) as c FROM shift_templates WHERE station_id = ?`)
  const ins = db.prepare(
    `INSERT INTO shift_templates (
      id, tenant_id, station_id, name, type, start_time, end_time, color, work_area_id,
      active, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  )

  for (const st of stations) {
    const tenantId = st.tenant_id?.trim() || DEMO_TENANT_ID
    const existing = (countTpl.get(st.id) as { c: number }).c
    if (existing > 0) continue

    const slots = parseLegacyWorkTimes(st.standard_work_times_json)

    if (slots.length === 0) continue

    slots.forEach((slot, i) => {
      ins.run(
        randomUUID(),
        tenantId,
        st.id,
        slot.name,
        slot.type,
        slot.start,
        slot.end,
        null,
        null,
        i,
        ts,
        ts,
      )
    })
    db.prepare(
      `UPDATE stations SET shift_setup_completed = 1, updated_at = ? WHERE id = ? AND (shift_setup_completed IS NULL OR shift_setup_completed = 0)`,
    ).run(ts, st.id)
  }
}
