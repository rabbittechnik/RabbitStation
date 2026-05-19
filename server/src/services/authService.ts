import type { Database } from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import {
  buildAccessContext,
  listAccessibleStationRows,
  listAllActiveStationRows,
} from './stationAccessService.js'
import { nowIso } from '../utils/timestamps.js'
import { appendUserAudit } from './userAuditLogService.js'
import { getUserTenantContext, getTenantById, tenantToApi } from './tenantService.js'
import { getSubscriptionWriteState, getTrialMessage } from './subscriptionService.js'
import { buildTenantPlanEntitlements } from './planFeatureService.js'
import { appendTenantAudit } from './tenantAuditService.js'

export type AuthUserRow = {
  id: string
  username: string | null
  display_name: string | null
  role_id: string | null
  active: number | null
  password_hash: string | null
  last_login_at?: string | null
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'neonshift-dev-jwt-secret-change-me'

export type JwtPayload = {
  sub: string
  username: string
  displayName: string
  roleId: string
  tenantId?: string | null
  roleKey?: string | null
  platformRole?: string | null
}

export function signAdminToken(payload: JwtPayload, rememberMe: boolean): string {
  const expiresIn = rememberMe ? '30d' : '12h'
  return jwt.sign(
    {
      sub: payload.sub,
      username: payload.username,
      displayName: payload.displayName,
      roleId: payload.roleId,
      tenantId: payload.tenantId ?? null,
      roleKey: payload.roleKey ?? null,
      platformRole: payload.platformRole ?? null,
    },
    JWT_SECRET,
    { expiresIn },
  )
}

export function verifyAdminToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload
    if (!decoded.sub || typeof decoded.sub !== 'string') return null
    return {
      sub: decoded.sub,
      username: String(decoded.username ?? ''),
      displayName: String(decoded.displayName ?? ''),
      roleId: String(decoded.roleId ?? ''),
      tenantId: decoded.tenantId != null ? String(decoded.tenantId) : null,
      roleKey: decoded.roleKey != null ? String(decoded.roleKey) : null,
      platformRole: decoded.platformRole != null ? String(decoded.platformRole) : null,
    }
  } catch {
    return null
  }
}

export function findUserByUsername(db: Database, username: string): AuthUserRow | undefined {
  const u = username.trim().toLowerCase()
  return db
    .prepare(`SELECT * FROM users WHERE lower(trim(username)) = ? AND (active IS NULL OR active = 1)`)
    .get(u) as AuthUserRow | undefined
}

export function verifyPassword(row: AuthUserRow, password: string): boolean {
  const hash = row.password_hash ?? ''
  if (!hash || hash === 'not-set') return false
  return bcrypt.compareSync(password, hash)
}

export function getUserDisplayName(db: Database, userId: string): string {
  const r = db.prepare(`SELECT display_name, username FROM users WHERE id = ?`).get(userId) as
    | { display_name: string | null; username: string | null }
    | undefined
  const dn = r?.display_name?.trim()
  if (dn) return dn
  const u = r?.username?.trim()
  if (u) return u
  return userId
}

export function buildAuthMeUser(db: Database, userId: string) {
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.email, u.phone, u.role_id,
              r.role_key as role_key, r.role_label as role_label
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id = ?`,
    )
    .get(userId) as
    | {
        id: string
        username: string | null
        display_name: string | null
        email: string | null
        phone: string | null
        role_id: string | null
        role_key: string | null
        role_label: string | null
      }
    | undefined
  if (!row) return null
  const ctx = buildAccessContext(db, userId)
  const stationsRaw = ctx.globalAdmin ? listAllActiveStationRows(db) : listAccessibleStationRows(db, ctx)
  const stations = stationsRaw.map((s) => ({
    id: String(s.id),
    name: String(s.name ?? ''),
    brand: s.brand != null ? String(s.brand) : undefined,
    city: s.city != null ? String(s.city) : undefined,
    federalState: String(s.federal_state ?? 'BW'),
    active: (s.active as number) ?? 1,
    standardWorkTimesJson:
      s.standard_work_times_json != null && String(s.standard_work_times_json).trim()
        ? String(s.standard_work_times_json)
        : undefined,
  }))
  const stationAccess = ctx.globalAdmin
    ? []
    : ctx.stationIds.map((sid) => ({
        stationId: sid,
        role: ctx.roleByStation.get(sid) ?? 'teamleiter',
        permissions: ctx.permissionsByStation.get(sid) ?? {},
        active: true as const,
      }))
  const canSwitchStation = ctx.globalAdmin || ctx.stationIds.length > 1
  const roleKey = row.role_key?.trim() || undefined
  const roleLabel = row.role_label?.trim() || undefined
  const tenantCtx = getUserTenantContext(db, userId)
  let tenant: ReturnType<typeof tenantToApi> | undefined
  let subscription:
    | {
        canWrite: boolean
        status: string
        trialDaysLeft: number | null
        message: string | null
      }
    | undefined
  let planEntitlements: ReturnType<typeof buildTenantPlanEntitlements> | undefined
  if (tenantCtx?.tenantId) {
    const t = getTenantById(db, tenantCtx.tenantId)
    if (t) {
      tenant = tenantToApi(t)
      const ws = getSubscriptionWriteState(t)
      subscription = {
        canWrite: ws.canWrite,
        status: ws.status,
        trialDaysLeft: ws.trialDaysLeft,
        message: getTrialMessage(ws, t),
      }
      planEntitlements = buildTenantPlanEntitlements(db, t)
    }
  }
  return {
    id: row.id,
    username: row.username ?? '',
    displayName: row.display_name ?? '',
    email: row.email?.trim() || '',
    phone: row.phone?.trim() || '',
    roleId: row.role_id ?? '',
    roleKey,
    roleLabel,
    globalAdmin: ctx.globalAdmin,
    platformRole: tenantCtx?.platformRole ?? undefined,
    tenantId: tenantCtx?.tenantId ?? undefined,
    tenant,
    subscription,
    planEntitlements,
    setupRequired: tenant ? !tenant.setupCompleted : false,
    setupCompleted: tenant?.setupCompleted ?? true,
    onboardingTourCompleted: tenant?.onboardingTourCompleted ?? true,
    stations,
    stationAccess,
    canSwitchStation,
  }
}

function jwtPayloadForUser(db: Database, row: AuthUserRow): JwtPayload {
  const tenantCtx = getUserTenantContext(db, row.id)
  const role = db.prepare(`SELECT role_key FROM roles WHERE id = ?`).get(row.role_id ?? '') as
    | { role_key: string | null }
    | undefined
  return {
    sub: row.id,
    username: row.username ?? '',
    displayName: row.display_name ?? '',
    roleId: row.role_id ?? '',
    tenantId: tenantCtx?.tenantId ?? null,
    roleKey: role?.role_key ?? tenantCtx?.roleKey ?? null,
    platformRole: tenantCtx?.platformRole ?? null,
  }
}

export function loginAdminUser(
  db: Database,
  body: { username: string; password: string; rememberMe?: boolean },
) {
  const username = String(body.username ?? '').trim()
  const password = String(body.password ?? '')
  if (!username || !password) throw new Error('Benutzername und Passwort erforderlich')
  const row = findUserByUsername(db, username)
  if (!row || !verifyPassword(row, password)) {
    throw new Error('Anmeldung fehlgeschlagen')
  }
  const token = signAdminToken(jwtPayloadForUser(db, row), Boolean(body.rememberMe))
  const user = buildAuthMeUser(db, row.id)
  if (!user) throw new Error('Benutzerdaten fehlen')
  const ts = nowIso()
  try {
    db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).run(ts, row.id)
  } catch {
    /* Spalte kann in sehr alten DB-Dateien fehlen */
  }
  try {
    appendUserAudit(db, { userId: row.id, action: 'login.success', createdBy: row.id })
    const tc = getUserTenantContext(db, row.id)
    appendTenantAudit(db, {
      tenantId: tc?.tenantId,
      userId: row.id,
      action: 'login.success',
      entityType: 'user',
      entityId: row.id,
    })
  } catch {
    /* ignore */
  }
  return {
    token,
    user,
  }
}

export function updateAdminUserProfile(
  db: Database,
  userId: string,
  body: Record<string, unknown>,
) {
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as AuthUserRow | undefined
  if (!row) throw new Error('Benutzer nicht gefunden')
  const ts = nowIso()
  if (String(body.newPassword ?? '').trim()) {
    const cur = String(body.currentPassword ?? '')
    if (!verifyPassword(row, cur)) throw new Error('Aktuelles Passwort ist falsch')
    const hash = bcrypt.hashSync(String(body.newPassword), 10)
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(hash, ts, userId)
  }
  if (body.displayName !== undefined || body.email !== undefined || body.phone !== undefined) {
    db.prepare(
      `UPDATE users SET
        display_name = COALESCE(?, display_name),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        updated_at = ?
      WHERE id = ?`,
    ).run(
      body.displayName != null ? String(body.displayName) : null,
      body.email !== undefined ? (body.email == null ? null : String(body.email)) : null,
      body.phone !== undefined ? (body.phone == null ? null : String(body.phone)) : null,
      ts,
      userId,
    )
  }
  return buildAuthMeUser(db, userId)
}
