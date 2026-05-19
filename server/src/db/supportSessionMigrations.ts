import type Database from 'better-sqlite3'

/** Support-Sitzungen für Plattform-Support / Control Center. */
export function ensureSupportSessionsTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS support_sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      admin_user_id TEXT,
      admin_email TEXT,
      reason TEXT NOT NULL,
      access_mode TEXT NOT NULL CHECK (access_mode IN ('read_only', 'support_write')),
      status TEXT NOT NULL CHECK (status IN ('active', 'ended', 'expired', 'revoked')),
      token_hash TEXT,
      expires_at TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      created_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );
    CREATE INDEX IF NOT EXISTS idx_support_sessions_tenant ON support_sessions(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_support_sessions_status ON support_sessions(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_support_sessions_token ON support_sessions(token_hash);
  `)
}
