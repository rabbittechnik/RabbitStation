import type { Database } from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { randomBytes, randomUUID } from 'node:crypto'
import { nowIso } from '../utils/timestamps.js'
import { FULL_STATION_PERMISSIONS } from '../constants/permissions.js'
import { appendTenantAudit } from './tenantAuditService.js'
import { sendTemplateMail } from './mailService.js'
import { loginAdminUser } from './authService.js'
import { ensureStationStatutoryHolidaysSeeded } from './stationExtraHolidayService.js'
import { tenantToApi } from './tenantService.js'

export type RegisterBody = {
  companyName: string
  stationName: string
  firstName: string
  lastName: string
  email: string
  password: string
  phone?: string
  address?: string
  plan?: string
  acceptTerms: boolean
  acceptPrivacy: boolean
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'tenant'
}

function uniqueSlug(db: Database, base: string): string {
  let slug = base
  let n = 0
  while (db.prepare(`SELECT id FROM tenants WHERE slug = ?`).get(slug)) {
    n += 1
    slug = `${base}-${n}`
  }
  return slug
}

export function registerNewTenant(db: Database, body: RegisterBody, req?: import('express').Request) {
  if (!body.acceptTerms || !body.acceptPrivacy) {
    throw new Error('AGB und Datenschutz müssen akzeptiert werden.')
  }
  const companyName = String(body.companyName ?? '').trim()
  const stationName = String(body.stationName ?? '').trim()
  const firstName = String(body.firstName ?? '').trim()
  const lastName = String(body.lastName ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  if (!companyName || !stationName || !firstName || !lastName || !email || !password) {
    throw new Error('Bitte alle Pflichtfelder ausfüllen.')
  }
  if (password.length < 10) throw new Error('Passwort muss mindestens 10 Zeichen haben.')
  const existing = db
    .prepare(`SELECT id FROM users WHERE lower(trim(email)) = ? OR lower(trim(username)) = ?`)
    .get(email, email)
  if (existing) throw new Error('Diese E-Mail ist bereits registriert.')

  const ts = nowIso()
  const trialStart = new Date()
  const trialEnd = new Date(trialStart)
  trialEnd.setDate(trialEnd.getDate() + 7)
  const tenantId = randomUUID()
  const stationId = randomUUID()
  const userId = randomUUID()
  const slug = uniqueSlug(db, slugify(companyName))
  const plan = String(body.plan ?? 'rabbitstation_pro').trim() || 'rabbitstation_pro'
  const displayName = `${firstName} ${lastName}`.trim()
  const username = email
  const hash = bcrypt.hashSync(password, 10)

  const ownerRole = db.prepare(`SELECT id FROM roles WHERE role_key = 'tenant_owner' LIMIT 1`).get() as
    | { id: string }
    | undefined
  const roleId = ownerRole?.id ?? 'role-admin'

  const addressJson =
    body.address?.trim() ?
      JSON.stringify({ raw: String(body.address).trim() })
    : null

  const register = db.transaction(() => {
    db.prepare(
      `INSERT INTO tenants (
        id, company_name, slug, plan, subscription_status,
        trial_start, trial_end, setup_completed, contact_email, contact_phone,
        address_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'trial', ?, ?, 0, ?, ?, ?, ?, ?)`,
    ).run(
      tenantId,
      companyName,
      slug,
      plan,
      trialStart.toISOString(),
      trialEnd.toISOString(),
      email,
      body.phone?.trim() || null,
      addressJson,
      ts,
      ts,
    )

    db.prepare(
      `INSERT INTO stations (
        id, name, brand, city, federal_state, active, tenant_id, created_at, updated_at
      ) VALUES (?, ?, 'Demo', '', 'BW', 1, ?, ?, ?)`,
    ).run(stationId, stationName, tenantId, ts, ts)

    db.prepare(
      `INSERT INTO users (
        id, username, display_name, email, phone, password_hash, role_id,
        tenant_id, global_admin, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
    ).run(
      userId,
      username,
      displayName,
      email,
      body.phone?.trim() || null,
      hash,
      roleId,
      tenantId,
      ts,
      ts,
    )

    const accessId = randomUUID()
    db.prepare(
      `INSERT INTO user_station_access (
        id, user_id, station_id, role, permissions_json, active, created_at, updated_at
      ) VALUES (?, ?, ?, 'stationsleiter', ?, 1, ?, ?)`,
    ).run(accessId, userId, stationId, JSON.stringify(FULL_STATION_PERMISSIONS), ts, ts)

    const areas = [
      { id: 'kasse', name: 'Kasse', short: 'KAS' },
      { id: 'shop', name: 'Shop', short: 'SHP' },
      { id: 'buero', name: 'Büro', short: 'BU' },
    ]
    for (const a of areas) {
      db.prepare(
        `INSERT OR IGNORE INTO work_areas (id, station_id, name, short_code, color, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, '#2563eb', 1, ?, ?)`,
      ).run(`${stationId}-${a.id}`, stationId, a.name, a.short, ts, ts)
    }
  })
  register()
  try {
    ensureStationStatutoryHolidaysSeeded(db, stationId)
  } catch {
    /* optional */
  }

  appendTenantAudit(db, {
    tenantId,
    userId,
    action: 'tenant.created',
    entityType: 'tenant',
    entityId: tenantId,
    metadata: { companyName, plan },
    req,
  })
  appendTenantAudit(db, {
    tenantId,
    userId,
    action: 'registration.completed',
    entityType: 'user',
    entityId: userId,
    req,
  })

  const publicUrl = (process.env.PUBLIC_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')
  void sendTemplateMail(email, 'welcome_registration', {
    displayName,
    companyName,
    trialEnd: trialEnd.toLocaleDateString('de-DE'),
    setupUrl: `${publicUrl}/setup`,
  })

  const auth = loginAdminUser(db, { username, password, rememberMe: true })
  const tenant = db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(tenantId) as Record<string, unknown>
  return {
    ...auth,
    tenant: tenantToApi(tenant as import('./tenantService.js').TenantRow),
    setupRequired: true,
    defaultStationId: stationId,
  }
}

export function createPasswordResetToken(db: Database, email: string): { ok: boolean } {
  const e = email.trim().toLowerCase()
  const user = db
    .prepare(`SELECT id, email, display_name FROM users WHERE lower(trim(email)) = ? AND (active IS NULL OR active = 1)`)
    .get(e) as { id: string; email: string; display_name: string } | undefined
  if (!user) return { ok: true }
  const token = randomBytes(32).toString('hex')
  const hash = bcrypt.hashSync(token, 10)
  const expires = new Date()
  expires.setHours(expires.getHours() + 24)
  const ts = nowIso()
  db.prepare(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(randomUUID(), user.id, hash, expires.toISOString(), ts)
  const publicUrl = (process.env.PUBLIC_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')
  void sendTemplateMail(user.email || e, 'password_reset', {
    resetUrl: `${publicUrl}/passwort-zuruecksetzen?token=${token}`,
  })
  return { ok: true }
}

export function resetPasswordWithToken(db: Database, token: string, newPassword: string): void {
  if (newPassword.length < 10) throw new Error('Passwort muss mindestens 10 Zeichen haben.')
  const rows = db
    .prepare(
      `SELECT * FROM password_reset_tokens WHERE used_at IS NULL AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 50`,
    )
    .all() as { id: string; user_id: string; token_hash: string }[]
  const match = rows.find((r) => bcrypt.compareSync(token, r.token_hash))
  if (!match) throw new Error('Link ungültig oder abgelaufen.')
  const hash = bcrypt.hashSync(newPassword, 10)
  const ts = nowIso()
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(hash, ts, match.user_id)
  db.prepare(`UPDATE password_reset_tokens SET used_at = ? WHERE id = ?`).run(ts, match.id)
}
