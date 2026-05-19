import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { nowIso } from '../utils/timestamps.js'
import { DEMO_STATION_ID } from '../constants/demo.js'
import { ensureSupportSessionsTable } from './supportSessionMigrations.js'

export const DEMO_TENANT_ID = 'tenant-demo-rabbitstation'

function tableExists(db: Database.Database, name: string): boolean {
  const r = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name)
  return Boolean(r)
}

function colExists(db: Database.Database, table: string, col: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return rows.some((r) => r.name === col)
}

function addCol(db: Database.Database, table: string, col: string, ddl: string) {
  if (!colExists(db, table, col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}

/** SaaS-Schema: Tenants, Abos, Audit, Tokens, Pairing. */
export function runSaasMigrations(db: Database.Database) {
  ensureSupportSessionsTable(db)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      slug TEXT UNIQUE,
      plan TEXT NOT NULL DEFAULT 'rabbitstation_pro',
      subscription_status TEXT NOT NULL DEFAULT 'trial',
      trial_start TEXT,
      trial_end TEXT,
      payment_provider TEXT,
      payment_customer_id TEXT,
      payment_subscription_id TEXT,
      current_period_start TEXT,
      current_period_end TEXT,
      cancelled_at TEXT,
      blocked_reason TEXT,
      setup_completed INTEGER NOT NULL DEFAULT 0,
      contact_email TEXT,
      contact_phone TEXT,
      address_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tenant_audit_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      metadata_json TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_audit_tenant ON tenant_audit_logs(tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tenant_audit_action ON tenant_audit_logs(action, created_at);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pwd_reset_user ON password_reset_tokens(user_id);

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      verified_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employee_invites (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      station_id TEXT,
      email TEXT NOT NULL,
      role_key TEXT,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      invited_by_user_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tablet_pairing_codes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      station_id TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      device_id TEXT,
      created_by_user_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tablet_pair_code ON tablet_pairing_codes(code, expires_at);
  `)

  addCol(db, 'users', 'tenant_id', 'tenant_id TEXT')
  addCol(db, 'users', 'platform_role', 'platform_role TEXT')
  addCol(db, 'users', 'email_verified', 'email_verified INTEGER NOT NULL DEFAULT 0')
  addCol(db, 'stations', 'tenant_id', 'tenant_id TEXT')

  ensureSaasRoles(db)
  ensureDemoTenant(db)
  backfillTenantIds(db)
}

function ensureSaasRoles(db: Database.Database) {
  const ts = nowIso()
  const roles: { id: string; key: string; label: string; desc: string }[] = [
    { id: 'role-saas-owner', key: 'saas_owner', label: 'SaaS Owner', desc: 'Plattformbetreiber' },
    { id: 'role-saas-superadmin', key: 'saas_superadmin', label: 'SaaS Superadmin', desc: 'Plattform-Support' },
    { id: 'role-tenant-owner', key: 'tenant_owner', label: 'Betreiber / Owner', desc: 'Tenant-Inhaber' },
    { id: 'role-station-admin', key: 'station_admin', label: 'Stations-Admin', desc: 'Stationsverwaltung' },
    { id: 'role-steuerberater', key: 'steuerberater', label: 'Steuerberater', desc: 'Eingeschränkte Auswertungen' },
    { id: 'role-tablet', key: 'tablet', label: 'Tablet', desc: 'Stations-Tablet' },
  ]
  for (const r of roles) {
    const ex = db.prepare(`SELECT id FROM roles WHERE id = ? OR role_key = ?`).get(r.id, r.key) as
      | { id: string }
      | undefined
    if (ex) {
      db.prepare(`UPDATE roles SET role_key = ?, role_label = ? WHERE id = ?`).run(r.key, r.label, ex.id)
      continue
    }
    db.prepare(
      `INSERT INTO roles (id, name, description, permissions_json, role_key, role_label)
       VALUES (?, ?, ?, '{}', ?, ?)`,
    ).run(r.id, r.label, r.desc, r.key, r.label)
  }
}

function ensureDemoTenant(db: Database.Database) {
  const ts = nowIso()
  const trialEnd = new Date()
  trialEnd.setDate(trialEnd.getDate() + 365)
  db.prepare(
    `INSERT OR IGNORE INTO tenants (
      id, company_name, slug, plan, subscription_status,
      trial_start, trial_end, setup_completed, contact_email, created_at, updated_at
    ) VALUES (?, ?, ?, 'rabbitstation_pro', 'active', ?, ?, 1, 'admin@demo-rabbitstation.local', ?, ?)`,
  ).run(
    DEMO_TENANT_ID,
    'Demo Betrieb GmbH',
    'demo-rabbitstation',
    ts,
    trialEnd.toISOString(),
    ts,
    ts,
  )
  db.prepare(
    `UPDATE tenants SET subscription_status = 'active', setup_completed = 1, updated_at = ? WHERE id = ?`,
  ).run(ts, DEMO_TENANT_ID)

  const admin = db.prepare(`SELECT id FROM users WHERE lower(trim(username)) = 'admin' LIMIT 1`).get() as
    | { id: string }
    | undefined
  if (admin) {
    db.prepare(
      `UPDATE users SET tenant_id = ?, platform_role = 'saas_owner', global_admin = 1 WHERE id = ?`,
    ).run(DEMO_TENANT_ID, admin.id)
    const ownerRole = db.prepare(`SELECT id FROM roles WHERE role_key = 'tenant_owner' LIMIT 1`).get() as
      | { id: string }
      | undefined
    if (ownerRole && !db.prepare(`SELECT role_id FROM users WHERE id = ?`).get(admin.id)) {
      /* role bleibt demo-admin role wenn gesetzt */
    }
  }
}

function backfillTenantIds(db: Database.Database) {
  db.prepare(`UPDATE stations SET tenant_id = ? WHERE tenant_id IS NULL OR trim(tenant_id) = ''`).run(
    DEMO_TENANT_ID,
  )
  const stations = db.prepare(`SELECT id FROM stations WHERE tenant_id = ?`).all(DEMO_TENANT_ID) as { id: string }[]
  for (const s of stations) {
    db.prepare(`UPDATE employees SET station_id = station_id WHERE station_id = ?`).run(s.id)
  }
  const usersWithoutTenant = db
    .prepare(
      `SELECT u.id FROM users u
       LEFT JOIN user_station_access usa ON usa.user_id = u.id
       WHERE (u.tenant_id IS NULL OR trim(u.tenant_id) = '')
         AND (u.platform_role IS NULL OR trim(u.platform_role) = '')
         AND usa.user_id IS NOT NULL
       GROUP BY u.id`,
    )
    .all() as { id: string }[]
  for (const u of usersWithoutTenant) {
    db.prepare(`UPDATE users SET tenant_id = ? WHERE id = ?`).run(DEMO_TENANT_ID, u.id)
  }
}
