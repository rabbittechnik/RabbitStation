import type { Database } from 'better-sqlite3'
import { nowIso } from '../utils/timestamps.js'
import { getUserTenantContext, getTenantById } from './tenantService.js'
import { assertTenantCanWrite } from './subscriptionService.js'

export type SetupState = {
  setupCompleted: boolean
  steps: {
    station: boolean
    shiftModel: boolean
    surcharges: boolean
    employees: boolean
    tablet: boolean
    complete: boolean
  }
  stationId: string | null
}

export function getSetupState(db: Database, userId: string): SetupState {
  const ctx = getUserTenantContext(db, userId)
  if (!ctx?.tenantId) {
    return {
      setupCompleted: true,
      steps: {
        station: true,
        shiftModel: true,
        surcharges: true,
        employees: true,
        tablet: true,
        complete: true,
      },
      stationId: null,
    }
  }
  const tenant = getTenantById(db, ctx.tenantId)
  const station = db
    .prepare(`SELECT id, name FROM stations WHERE tenant_id = ? ORDER BY created_at LIMIT 1`)
    .get(ctx.tenantId) as { id: string; name: string } | undefined
  const stationId = station?.id ?? null
  const stationRow = stationId ?
    (db.prepare(`SELECT standard_work_times_json FROM stations WHERE id = ?`).get(stationId) as
      | { standard_work_times_json: string | null }
      | undefined)
  : undefined
  const shiftConfigured = Boolean(stationRow?.standard_work_times_json?.trim())
  const empCount =
    stationId ?
      (db.prepare(`SELECT COUNT(*) as c FROM employees WHERE station_id = ? AND deleted_at IS NULL`).get(stationId) as {
        c: number
      }).c
    : 0
  const tabletCount =
    stationId ?
      (
        db
          .prepare(`SELECT COUNT(*) as c FROM station_tablet_devices WHERE station_id = ?`)
          .get(stationId) as { c: number }
      ).c
    : 0
  const holidayCount =
    stationId ?
      (db.prepare(`SELECT COUNT(*) as c FROM station_extra_holidays WHERE station_id = ?`).get(stationId) as {
        c: number
      }).c
    : 0

  const steps = {
    station: Boolean(station?.name?.trim()),
    shiftModel: shiftConfigured,
    surcharges: holidayCount > 0 || shiftConfigured,
    employees: empCount > 0,
    tablet: tabletCount > 0,
    complete: tenant?.setup_completed === 1,
  }
  return {
    setupCompleted: tenant?.setup_completed === 1,
    steps,
    stationId,
  }
}

export function applySetupShiftPresets(db: Database, userId: string, stationId: string) {
  const ctx = getUserTenantContext(db, userId)
  if (!ctx?.tenantId) throw new Error('Kein Tenant')
  assertTenantCanWrite(db, ctx.tenantId)
  const ts = nowIso()
  const presets = [
    { id: 'frueh', label: 'Frühschicht', start: '06:00', end: '14:00' },
    { id: 'spaet', label: 'Spätschicht', start: '14:00', end: '22:00' },
    { id: 'nacht', label: 'Nachtschicht', start: '22:00', end: '06:00' },
  ]
  db.prepare(
    `UPDATE stations SET standard_work_times_json = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`,
  ).run(JSON.stringify({ presets }), ts, stationId, ctx.tenantId)
}

export function completeSetup(db: Database, userId: string) {
  const ctx = getUserTenantContext(db, userId)
  if (!ctx?.tenantId) throw new Error('Kein Tenant')
  const ts = nowIso()
  db.prepare(`UPDATE tenants SET setup_completed = 1, updated_at = ? WHERE id = ?`).run(ts, ctx.tenantId)
}
