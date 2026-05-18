import { Router } from 'express'
import { getDb } from '../db/database.js'
import { jsonErr, jsonOk } from '../utils/http.js'
import { getAccess, requireAnyPermission, requireStationId } from '../middleware/stationAuth.js'
import {
  createStationTablet,
  deleteStationTablet,
  disableStationTablet,
  enableStationTablet,
  listStationTabletsForApi,
  regenerateStationTabletToken,
  updateStationTablet,
} from '../services/stationTabletDeviceService.js'
import { createPairingCode } from '../services/tabletPairingService.js'
import { getUserTenantContext } from '../services/tenantService.js'

export const stationTabletsRouter = Router()

/** Sichtbarkeit Geräte & Apps · Stations-Tablets (ergänzend zu expliziten stationTablets.*). */
const VIEW_KEYS = [
  'stationTablets.view',
  'stationTablets.manage',
  'employees.viewAppAccess',
  'employees.manageAppAccess',
  'employees.viewDevices',
  'employees.qr',
  'schedule.edit',
] as const

/** Verwaltung inkl. QR/Token (analog Mitarbeiter-App-Zugänge). */
const MANAGE_KEYS = [
  'stationTablets.manage',
  'employees.manageAppAccess',
  'employees.revokeDevices',
  'employees.qr',
  'schedule.edit',
] as const

stationTabletsRouter.get('/', (req, res) => {
  try {
    const stationId = typeof req.query.stationId === 'string' ? req.query.stationId : undefined
    if (!requireAnyPermission(req, res, stationId, [...VIEW_KEYS])) return
    const data = listStationTabletsForApi(getDb(), stationId!)
    jsonOk(res, data)
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 500)
  }
})

stationTabletsRouter.post('/', (req, res) => {
  try {
    const body = (req.body ?? {}) as { stationId?: string; name?: string; description?: string }
    const stationId = typeof body.stationId === 'string' ? body.stationId.trim() : ''
    if (!requireAnyPermission(req, res, stationId, [...MANAGE_KEYS])) return
    const ctx = getAccess(req)
    const createdBy = ctx?.userId ? `user:${ctx.userId}` : 'admin'
    const { device, tabletToken } = createStationTablet(getDb(), {
      stationId,
      name: String(body.name ?? ''),
      description: body.description,
      createdBy,
    })
    jsonOk(res, { device, tabletToken })
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 400)
  }
})

stationTabletsRouter.put('/:id', (req, res) => {
  try {
    const id = String(req.params.id ?? '').trim()
    const body = (req.body ?? {}) as { stationId?: string; name?: string; description?: string | null }
    const stationId = typeof body.stationId === 'string' ? body.stationId.trim() : ''
    if (!requireStationId(req, res, stationId)) return
    if (!requireAnyPermission(req, res, stationId, [...MANAGE_KEYS])) return
    updateStationTablet(getDb(), id, stationId, {
      name: body.name,
      description: body.description,
    })
    jsonOk(res, { ok: true })
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 400)
  }
})

stationTabletsRouter.post('/:id/regenerate-token', (req, res) => {
  try {
    const id = String(req.params.id ?? '').trim()
    const body = (req.body ?? {}) as { stationId?: string }
    const stationId = typeof body.stationId === 'string' ? body.stationId.trim() : ''
    if (!requireStationId(req, res, stationId)) return
    if (!requireAnyPermission(req, res, stationId, [...MANAGE_KEYS])) return
    const out = regenerateStationTabletToken(getDb(), id, stationId)
    jsonOk(res, { tabletToken: out.tabletToken, tokenTail: out.tokenTail })
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 400)
  }
})

stationTabletsRouter.post('/:id/disable', (req, res) => {
  try {
    const id = String(req.params.id ?? '').trim()
    const body = (req.body ?? {}) as { stationId?: string }
    const stationId = typeof body.stationId === 'string' ? body.stationId.trim() : ''
    if (!requireStationId(req, res, stationId)) return
    if (!requireAnyPermission(req, res, stationId, [...MANAGE_KEYS])) return
    const ctx = getAccess(req)!
    const revokedBy = ctx.userId ? `user:${ctx.userId}` : 'admin'
    disableStationTablet(getDb(), id, stationId, revokedBy)
    jsonOk(res, { ok: true })
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 400)
  }
})

stationTabletsRouter.post('/:id/enable', (req, res) => {
  try {
    const id = String(req.params.id ?? '').trim()
    const body = (req.body ?? {}) as { stationId?: string }
    const stationId = typeof body.stationId === 'string' ? body.stationId.trim() : ''
    if (!requireStationId(req, res, stationId)) return
    if (!requireAnyPermission(req, res, stationId, [...MANAGE_KEYS])) return
    enableStationTablet(getDb(), id, stationId)
    jsonOk(res, { ok: true })
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 400)
  }
})

stationTabletsRouter.delete('/:id', (req, res) => {
  try {
    const id = String(req.params.id ?? '').trim()
    const stationId = typeof req.query.stationId === 'string' ? req.query.stationId.trim() : ''
    if (!requireStationId(req, res, stationId)) return
    if (!requireAnyPermission(req, res, stationId, [...MANAGE_KEYS])) return
    const { hardDeleted } = deleteStationTablet(getDb(), id, stationId)
    jsonOk(res, { ok: true, hardDeleted })
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 400)
  }
})

stationTabletsRouter.post('/pairing-code', (req, res) => {
  try {
    const body = (req.body ?? {}) as { stationId?: string }
    const stationId = typeof body.stationId === 'string' ? body.stationId.trim() : ''
    if (!requireAnyPermission(req, res, stationId, [...MANAGE_KEYS])) return
    const ctx = getAccess(req)
    const tenantCtx = getUserTenantContext(getDb(), ctx!.userId)
    if (!tenantCtx?.tenantId) {
      jsonErr(res, 'Kein Tenant', 400)
      return
    }
    const out = createPairingCode(getDb(), {
      tenantId: tenantCtx.tenantId,
      stationId,
      userId: ctx!.userId,
    })
    jsonOk(res, out)
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 400)
  }
})
