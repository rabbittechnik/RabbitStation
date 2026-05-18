import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { KNOWN_STATIONS } from '../constants/stationIds.js'
import { TEAMLEAD_PERMISSIONS } from '../constants/permissions.js'
import { mathiasStationsleiterPermissions } from '../constants/mathiasStationsleiterPermissions.js'
import { isPlatformRole } from '../constants/saasRoles.js'

const VISIBLE_IN_DROPDOWN_SQL = `(active IS NULL OR active = 1) AND (deleted_at IS NULL OR trim(deleted_at) = '')`

export type UserStationAccessRow = {
  id: string
  user_id: string
  station_id: string
  role: string
  permissions_json: string
  active: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type AccessContext = {
  userId: string
  globalAdmin: boolean
  tenantId: string | null
  isPlatformAdmin: boolean
  /** Erlaubte Station-IDs (immer aktiv laut DB). */
  stationIds: string[]
  /** stationId → geparste Berechtigungen */
  permissionsByStation: Map<string, Record<string, boolean>>
  /** stationId → Rolle laut user_station_access */
  roleByStation: Map<string, string>
}

function parsePermissionsJson(raw: string | null | undefined): Record<string, boolean> {
  try {
    const o = JSON.parse(String(raw ?? '{}')) as Record<string, unknown>
    const out: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(o)) {
      out[k] = Boolean(v)
    }
    return out
  } catch {
    return {}
  }
}

export function buildAccessContext(db: Database, userId: string): AccessContext {
  const u = db
    .prepare(
      `SELECT id, COALESCE(global_admin, 0) as ga, tenant_id, platform_role FROM users WHERE id = ?`,
    )
    .get(userId) as
    | { id: string; ga: number; tenant_id: string | null; platform_role: string | null }
    | undefined
  const globalAdmin = (u?.ga ?? 0) === 1
  const tenantId = u?.tenant_id?.trim() || null
  const isPlatformAdmin = isPlatformRole(u?.platform_role?.trim())

  if (globalAdmin) {
    const all =
      isPlatformAdmin || !tenantId ?
        (db
          .prepare(`SELECT id FROM stations WHERE ${VISIBLE_IN_DROPDOWN_SQL} ORDER BY name`)
          .all() as { id: string }[])
      : (db
          .prepare(`SELECT id FROM stations WHERE ${VISIBLE_IN_DROPDOWN_SQL} AND tenant_id = ? ORDER BY name`)
          .all(tenantId) as { id: string }[])
    const stationIds = all.map((r) => r.id)
    return {
      userId,
      globalAdmin: true,
      tenantId,
      isPlatformAdmin,
      stationIds,
      permissionsByStation: new Map(),
      roleByStation: new Map(),
    }
  }

  const rows = db
    .prepare(
      `SELECT usa.* FROM user_station_access usa
       JOIN stations s ON s.id = usa.station_id
       WHERE usa.user_id = ? AND (usa.active IS NULL OR usa.active = 1)
         AND (? IS NULL OR s.tenant_id = ?)`,
    )
    .all(userId, tenantId, tenantId) as UserStationAccessRow[]

  const stationIds: string[] = []
  const permissionsByStation = new Map<string, Record<string, boolean>>()
  const roleByStation = new Map<string, string>()
  for (const r of rows) {
    if (!r.station_id) continue
    stationIds.push(r.station_id)
    permissionsByStation.set(r.station_id, parsePermissionsJson(r.permissions_json))
    roleByStation.set(r.station_id, r.role ?? 'teamleiter')
  }
  return { userId, globalAdmin: false, tenantId, isPlatformAdmin, stationIds, permissionsByStation, roleByStation }
}

export function canAccessStation(ctx: AccessContext, stationId: string, db?: Database): boolean {
  if (!stationId) return false
  if (ctx.globalAdmin) {
    if (!ctx.tenantId || ctx.isPlatformAdmin) return true
    if (db) {
      const tid = db.prepare(`SELECT tenant_id FROM stations WHERE id = ?`).get(stationId) as
        | { tenant_id: string | null }
        | undefined
      return (tid?.tenant_id?.trim() || null) === ctx.tenantId
    }
    return ctx.stationIds.includes(stationId)
  }
  return ctx.stationIds.includes(stationId)
}

export function hasPermission(ctx: AccessContext, stationId: string, key: string): boolean {
  if (ctx.globalAdmin) return true
  if (!canAccessStation(ctx, stationId)) return false
  const p = ctx.permissionsByStation.get(stationId)
  if (!p) return false
  return p[key] === true
}

/** Mindestens eine zugewiesene Station mit dieser Berechtigung (für Admin-Seiten ohne Stations-Kontext). */
export function hasAnyStationPermission(ctx: AccessContext, key: string): boolean {
  if (ctx.globalAdmin) return true
  for (const sid of ctx.stationIds) {
    if (hasPermission(ctx, sid, key)) return true
  }
  return false
}

export function canAccessStationsAdminUi(ctx: AccessContext): boolean {
  return ctx.globalAdmin || hasAnyStationPermission(ctx, 'stations.manage') || hasAnyStationPermission(ctx, 'station.profile.edit')
}

export function listAccessibleStationRows(
  db: Database,
  ctx: AccessContext,
  opts?: { forDropdown?: boolean },
) {
  if (ctx.stationIds.length === 0) return [] as Record<string, unknown>[]
  const placeholders = ctx.stationIds.map(() => '?').join(',')
  const vis = opts?.forDropdown !== false ? ` AND ${VISIBLE_IN_DROPDOWN_SQL}` : ''
  return db
    .prepare(`SELECT * FROM stations WHERE id IN (${placeholders})${vis} ORDER BY name`)
    .all(...ctx.stationIds) as Record<string, unknown>[]
}

export function listAllActiveStationRows(db: Database, opts?: { includeArchived?: boolean }) {
  if (opts?.includeArchived) {
    return db.prepare(`SELECT * FROM stations ORDER BY name`).all() as Record<string, unknown>[]
  }
  return db
    .prepare(`SELECT * FROM stations WHERE ${VISIBLE_IN_DROPDOWN_SQL} ORDER BY name`)
    .all() as Record<string, unknown>[]
}

const DEFAULT_WORK_AREA_TEMPLATE: {
  id: string
  name: string
  short_code: string
  color: string
  description: string
}[] = [
  { id: 'kasse', name: 'Kasse', short_code: 'K', color: '#22d3ee', description: '' },
  { id: 'buero', name: 'Büro', short_code: 'B', color: '#a78bfa', description: '' },
  { id: 'backshop', name: 'Backshop', short_code: 'Ba', color: '#fbbf24', description: '' },
  { id: 'lager', name: 'Lager', short_code: 'L', color: '#94a3b8', description: '' },
  { id: 'wasch', name: 'Waschanlage', short_code: 'W', color: '#38bdf8', description: '' },
  { id: 'aussen', name: 'Außenbereich', short_code: 'A', color: '#4ade80', description: '' },
  { id: 'schule', name: 'Schule', short_code: 'Sch', color: '#2dd4bf', description: '' },
  { id: 'reinigung', name: 'Reinigung', short_code: 'Re', color: '#64748b', description: '' },
]

/** Bootstrap: fehlende Stationen + Arbeitsbereiche (INSERT OR IGNORE, keine Überschreibung). */
export function ensureKnownStationsAndWorkAreas(db: Database, nowIsoStr: string) {
  const insSt = db.prepare(
    `INSERT OR IGNORE INTO stations (id, name, address, city, postal_code, phone, email, federal_state, brand, active, created_at, updated_at)
     VALUES (?, ?, '', ?, '', '', '', ?, ?, 1, ?, ?)`,
  )
  for (const s of KNOWN_STATIONS) {
    insSt.run(s.id, s.name, s.city, s.federalState, s.brand, nowIsoStr, nowIsoStr)
  }

  const tplDb = db
    .prepare(`SELECT id, name, short_code, color, description FROM work_areas WHERE station_id = ?`)
    .all(KNOWN_STATIONS[0]!.id) as {
    id: string
    name: string
    short_code: string
    color: string
    description: string
  }[]

  const tpl = tplDb.length > 0 ? tplDb : DEFAULT_WORK_AREA_TEMPLATE

  const insWa = db.prepare(
    `INSERT OR IGNORE INTO work_areas (id, station_id, name, short_code, color, description, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  )

  for (const s of KNOWN_STATIONS) {
    const c = db.prepare(`SELECT COUNT(*) as c FROM work_areas WHERE station_id = ?`).get(s.id) as { c: number }
    if ((c?.c ?? 0) > 0) continue
    for (const w of tpl) {
      const wid = s.id === KNOWN_STATIONS[0]!.id ? w.id : `${s.id}_${w.id}`
      insWa.run(wid, s.id, w.name, w.short_code, w.color, w.description ?? '', nowIsoStr, nowIsoStr)
    }
  }
}

export function ensureDefaultUserStationAccess(db: Database, nowIsoStr: string) {
  const ins = db.prepare(
    `INSERT INTO user_station_access (id, user_id, station_id, role, permissions_json, active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, NULL, ?, ?)`,
  )
  const exists = db.prepare(`SELECT 1 FROM user_station_access WHERE user_id = ? AND station_id = ?`)

  const adminId = 'user-demo-admin'
  const leadId = 'user-demo-lead'
  const demoStationId = KNOWN_STATIONS[0]!.id

  const adminRow = db.prepare(`SELECT id FROM users WHERE id = ?`).get(adminId) as { id: string } | undefined
  if (adminRow) {
    db.prepare(`DELETE FROM user_station_access WHERE user_id = ?`).run(adminId)
    db.prepare(`UPDATE users SET global_admin = 1, updated_at = ? WHERE id = ?`).run(nowIsoStr, adminId)
  }

  if (db.prepare(`SELECT id FROM users WHERE id = ?`).get(leadId) && !exists.get(leadId, demoStationId)) {
    ins.run(
      randomUUID(),
      leadId,
      demoStationId,
      'stationsleiter',
      JSON.stringify(mathiasStationsleiterPermissions()),
      nowIsoStr,
      nowIsoStr,
    )
    db.prepare(`UPDATE users SET global_admin = 0, updated_at = ? WHERE id = ?`).run(nowIsoStr, leadId)
  }
}