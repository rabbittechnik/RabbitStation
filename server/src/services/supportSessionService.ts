import type { Database } from 'better-sqlite3'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { Request } from 'express'
import { appendTenantAudit } from './tenantAuditService.js'
import { getTenantById } from './tenantService.js'
import { nowIso } from '../utils/timestamps.js'
import { signSupportToken, type SupportJwtPayload } from './authService.js'

export type SupportAccessMode = 'read_only' | 'support_write'
export type SupportSessionStatus = 'active' | 'ended' | 'expired' | 'revoked'

export type SupportSessionRow = {
  id: string
  tenant_id: string
  admin_user_id: string | null
  admin_email: string | null
  reason: string
  access_mode: SupportAccessMode
  status: SupportSessionStatus
  token_hash: string | null
  expires_at: string
  started_at: string
  ended_at: string | null
  created_at: string
  ip_address: string | null
  user_agent: string | null
}

const MAX_DURATION_MINUTES = 240
const DEFAULT_DURATION_MINUTES = 60

export function hashSupportToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function generateSupportToken(): string {
  return randomBytes(32).toString('base64url')
}

export function expireStaleSupportSessions(db: Database) {
  const ts = nowIso()
  const rows = db
    .prepare(
      `SELECT id, tenant_id, admin_user_id, admin_email FROM support_sessions
       WHERE status = 'active' AND expires_at <= ?`,
    )
    .all(ts) as Pick<SupportSessionRow, 'id' | 'tenant_id' | 'admin_user_id' | 'admin_email'>[]

  if (rows.length === 0) return

  db.prepare(
    `UPDATE support_sessions SET status = 'expired', ended_at = ? WHERE status = 'active' AND expires_at <= ?`,
  ).run(ts, ts)

  for (const row of rows) {
    appendTenantAudit(db, {
      tenantId: row.tenant_id,
      userId: row.admin_user_id,
      action: 'support_session_expired',
      entityType: 'support_session',
      entityId: row.id,
      metadata: { adminEmail: row.admin_email },
    })
  }
}

function getStationName(db: Database, tenantId: string): string | null {
  const row = db
    .prepare(
      `SELECT name FROM stations WHERE tenant_id = ? AND (active IS NULL OR active = 1)
       ORDER BY name LIMIT 1`,
    )
    .get(tenantId) as { name: string } | undefined
  return row?.name?.trim() ?? null
}

export function sessionToListItem(db: Database, row: SupportSessionRow) {
  const tenant = getTenantById(db, row.tenant_id)
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: tenant?.company_name ?? row.tenant_id,
    stationName: getStationName(db, row.tenant_id),
    adminEmail: row.admin_email,
    reason: row.reason,
    accessMode: row.access_mode,
    status: row.status,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    endedAt: row.ended_at,
  }
}

function resolvePlatformAdminUserId(db: Database, preferredId?: string | null): string {
  if (preferredId) {
    const u = db.prepare(`SELECT id FROM users WHERE id = ?`).get(preferredId) as { id: string } | undefined
    if (u) return u.id
  }
  const row = db
    .prepare(
      `SELECT id FROM users WHERE platform_role IN ('saas_owner', 'saas_superadmin')
       ORDER BY CASE platform_role WHEN 'saas_owner' THEN 0 ELSE 1 END LIMIT 1`,
    )
    .get() as { id: string } | undefined
  if (!row) {
    throw new SupportSessionError('no_platform_admin', 'Kein Plattform-Admin-Benutzer vorhanden', 503)
  }
  return row.id
}

export function startSupportSession(
  db: Database,
  opts: {
    tenantId: string
    reason: string
    accessMode: SupportAccessMode
    durationMinutes: number
    adminUserId?: string | null
    adminEmail?: string | null
    req?: Request
  },
): { session: SupportSessionRow; plainToken: string; impersonationUrl: string } {
  expireStaleSupportSessions(db)

  const tenant = getTenantById(db, opts.tenantId)
  if (!tenant) {
    throw new SupportSessionError('tenant_not_found', 'Tenant nicht gefunden', 404)
  }

  const reason = opts.reason.trim()
  if (!reason) {
    throw new SupportSessionError('reason_required', 'Grund ist erforderlich', 400)
  }

  const duration = Math.min(
    MAX_DURATION_MINUTES,
    Math.max(5, Math.floor(opts.durationMinutes || DEFAULT_DURATION_MINUTES)),
  )

  const accessMode: SupportAccessMode =
    opts.accessMode === 'support_write' ? 'support_write' : 'read_only'

  const adminUserId = resolvePlatformAdminUserId(db, opts.adminUserId)
  const adminEmail =
    opts.adminEmail?.trim() ||
    (opts.adminUserId ?
      (db.prepare(`SELECT email, username FROM users WHERE id = ?`).get(adminUserId) as
        | { email: string | null; username: string | null }
        | undefined)?.email?.trim() ||
      (db.prepare(`SELECT username FROM users WHERE id = ?`).get(adminUserId) as
        | { username: string | null }
        | undefined)?.username?.trim()
    : null) ||
    'control-center@system'

  const plainToken = generateSupportToken()
  const tokenHash = hashSupportToken(plainToken)
  const ts = nowIso()
  const expiresAt = new Date(Date.now() + duration * 60_000).toISOString()
  const id = randomUUID()

  db.prepare(
    `INSERT INTO support_sessions (
      id, tenant_id, admin_user_id, admin_email, reason, access_mode, status,
      token_hash, expires_at, started_at, ended_at, created_at, ip_address, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL, ?, ?, ?)`,
  ).run(
    id,
    opts.tenantId,
    adminUserId,
    adminEmail,
    reason,
    accessMode,
    tokenHash,
    expiresAt,
    ts,
    ts,
    opts.req?.ip ?? opts.req?.socket?.remoteAddress ?? null,
    typeof opts.req?.headers['user-agent'] === 'string' ?
      opts.req.headers['user-agent'].slice(0, 500)
    : null,
  )

  const session = db
    .prepare(`SELECT * FROM support_sessions WHERE id = ?`)
    .get(id) as SupportSessionRow

  appendTenantAudit(db, {
    tenantId: opts.tenantId,
    userId: adminUserId,
    action: 'support_session_started',
    entityType: 'support_session',
    entityId: id,
    metadata: {
      accessMode,
      durationMinutes: duration,
      adminEmail,
      supportSessionId: id,
    },
    req: opts.req,
  })

  const base = resolvePublicAppUrl()
  const impersonationUrl = `${base}/support/impersonate?token=${encodeURIComponent(plainToken)}`

  return { session, plainToken, impersonationUrl }
}

export function listSupportSessions(
  db: Database,
  filters: { status?: string; tenantId?: string },
) {
  expireStaleSupportSessions(db)
  const clauses: string[] = []
  const params: unknown[] = []
  if (filters.status) {
    clauses.push('status = ?')
    params.push(filters.status)
  }
  if (filters.tenantId) {
    clauses.push('tenant_id = ?')
    params.push(filters.tenantId)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = db
    .prepare(`SELECT * FROM support_sessions ${where} ORDER BY started_at DESC LIMIT 200`)
    .all(...params) as SupportSessionRow[]
  return rows.map((r) => sessionToListItem(db, r))
}

export function endSupportSession(
  db: Database,
  sessionId: string,
  opts: { req?: Request; userId?: string | null; reason?: string },
) {
  expireStaleSupportSessions(db)
  const row = db
    .prepare(`SELECT * FROM support_sessions WHERE id = ?`)
    .get(sessionId) as SupportSessionRow | undefined
  if (!row) {
    throw new SupportSessionError('not_found', 'Support-Sitzung nicht gefunden', 404)
  }
  if (row.status !== 'active') {
    return row
  }
  const ts = nowIso()
  db.prepare(`UPDATE support_sessions SET status = 'ended', ended_at = ? WHERE id = ?`).run(ts, sessionId)
  appendTenantAudit(db, {
    tenantId: row.tenant_id,
    userId: opts.userId ?? row.admin_user_id,
    action: 'support_session_ended',
    entityType: 'support_session',
    entityId: sessionId,
    metadata: { endedBy: opts.reason ?? 'manual' },
    req: opts.req,
  })
  return db.prepare(`SELECT * FROM support_sessions WHERE id = ?`).get(sessionId) as SupportSessionRow
}

export function findActiveSessionByToken(db: Database, plainToken: string): SupportSessionRow | null {
  expireStaleSupportSessions(db)
  const hash = hashSupportToken(plainToken)
  const row = db
    .prepare(`SELECT * FROM support_sessions WHERE token_hash = ? AND status = 'active'`)
    .get(hash) as SupportSessionRow | undefined
  if (!row) return null
  if (row.expires_at <= nowIso()) {
    const ts = nowIso()
    db.prepare(
      `UPDATE support_sessions SET status = 'expired', ended_at = ? WHERE id = ? AND status = 'active'`,
    ).run(ts, row.id)
    appendTenantAudit(db, {
      tenantId: row.tenant_id,
      userId: row.admin_user_id,
      action: 'support_session_expired',
      entityType: 'support_session',
      entityId: row.id,
    })
    return null
  }
  return row
}

export function exchangeSupportToken(
  db: Database,
  plainToken: string,
  req?: Request,
): { jwt: string; session: SupportSessionRow; payload: SupportJwtPayload } {
  const session = findActiveSessionByToken(db, plainToken)
  if (!session) {
    throw new SupportSessionError('invalid_token', 'Support-Link ungültig oder abgelaufen.', 401)
  }

  const adminUserId = session.admin_user_id
  if (!adminUserId) {
    throw new SupportSessionError('no_admin_user', 'Support-Sitzung ohne Admin-Benutzer', 500)
  }

  const user = db
    .prepare(`SELECT id, username, display_name, role_id FROM users WHERE id = ?`)
    .get(adminUserId) as
    | { id: string; username: string | null; display_name: string | null; role_id: string | null }
    | undefined
  if (!user) {
    throw new SupportSessionError('no_admin_user', 'Admin-Benutzer nicht gefunden', 500)
  }

  appendTenantAudit(db, {
    tenantId: session.tenant_id,
    userId: adminUserId,
    action: 'support_impersonation_opened',
    entityType: 'support_session',
    entityId: session.id,
    metadata: { accessMode: session.access_mode },
    req,
  })

  const payload: SupportJwtPayload = {
    sub: user.id,
    username: user.username ?? '',
    displayName: user.display_name ?? 'Support',
    roleId: user.role_id ?? '',
    tenantId: session.tenant_id,
    roleKey: null,
    platformRole: null,
    isSupportMode: true,
    supportSessionId: session.id,
    supportAccessMode: session.access_mode,
  }

  const jwt = signSupportToken(payload, session.expires_at)
  return { jwt, session, payload }
}

export function getActiveSessionById(db: Database, sessionId: string): SupportSessionRow | null {
  expireStaleSupportSessions(db)
  const row = db
    .prepare(`SELECT * FROM support_sessions WHERE id = ?`)
    .get(sessionId) as SupportSessionRow | undefined
  if (!row || row.status !== 'active') return null
  if (row.expires_at <= nowIso()) {
    endSupportSession(db, sessionId, { reason: 'expired_on_access' })
    return null
  }
  return row
}

export function countActiveSupportSessions(db: Database): number {
  expireStaleSupportSessions(db)
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM support_sessions WHERE status = 'active'`)
    .get() as { c: number }
  return row?.c ?? 0
}

function resolvePublicAppUrl(): string {
  const url =
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.CLIENT_ORIGIN?.split(',')[0]?.trim() ||
    'http://localhost:5173'
  return url.replace(/\/$/, '')
}

export class SupportSessionError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'SupportSessionError'
    this.code = code
    this.status = status
  }
}
