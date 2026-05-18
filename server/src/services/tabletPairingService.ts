import type { Database } from 'better-sqlite3'
import { randomBytes, randomUUID } from 'node:crypto'
import { nowIso } from '../utils/timestamps.js'
import { createStationTablet } from './stationTabletDeviceService.js'
import { getStationTenantId } from './tenantService.js'
import { appendTenantAudit } from './tenantAuditService.js'

function randomCode(): string {
  return randomBytes(3).toString('hex').toUpperCase()
}

export function createPairingCode(
  db: Database,
  opts: { tenantId: string; stationId: string; userId: string },
): { code: string; expiresAt: string } {
  const tid = getStationTenantId(db, opts.stationId)
  if (tid !== opts.tenantId) throw new Error('Station gehört nicht zum Tenant')
  const expires = new Date()
  expires.setMinutes(expires.getMinutes() + 15)
  const code = randomCode()
  const ts = nowIso()
  db.prepare(
    `INSERT INTO tablet_pairing_codes (id, tenant_id, station_id, code, expires_at, created_by_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), opts.tenantId, opts.stationId, code, expires.toISOString(), opts.userId, ts)
  return { code, expiresAt: expires.toISOString() }
}

export function pairTabletWithCode(db: Database, code: string): { tabletToken: string; stationId: string } {
  const normalized = code.trim().toUpperCase()
  const row = db
    .prepare(
      `SELECT * FROM tablet_pairing_codes
       WHERE upper(code) = ? AND used_at IS NULL AND expires_at > datetime('now')
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(normalized) as
    | {
        id: string
        tenant_id: string
        station_id: string
      }
    | undefined
  if (!row) throw new Error('Pairing-Code ungültig oder abgelaufen.')
  const ts = nowIso()
  const { device, tabletToken } = createStationTablet(db, {
    stationId: row.station_id,
    name: 'Gekoppeltes Tablet',
    description: 'Per Pairing-Code gekoppelt',
    createdBy: 'pairing',
  })
  db.prepare(`UPDATE tablet_pairing_codes SET used_at = ?, device_id = ? WHERE id = ?`).run(
    ts,
    device.id,
    row.id,
  )
  appendTenantAudit(db, {
    tenantId: row.tenant_id,
    action: 'tablet.paired',
    entityType: 'tablet',
    entityId: device.id,
    metadata: { stationId: row.station_id },
  })
  return { tabletToken, stationId: row.station_id }
}
