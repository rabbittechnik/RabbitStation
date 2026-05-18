import { Router } from 'express'
import { getDb } from '../db/database.js'
import { jsonErr, jsonOk } from '../utils/http.js'
import { getSetupState, applySetupShiftPresets, completeSetup } from '../services/setupService.js'
import { getUserTenantContext } from '../services/tenantService.js'
import { requireStationId } from '../middleware/stationAuth.js'

export const setupRouter = Router()

setupRouter.get('/state', (req, res) => {
  if (!req.adminUser) {
    jsonErr(res, 'Nicht angemeldet', 401)
    return
  }
  jsonOk(res, getSetupState(getDb(), req.adminUser.sub))
})

setupRouter.post('/shift-presets', (req, res) => {
  if (!req.adminUser) {
    jsonErr(res, 'Nicht angemeldet', 401)
    return
  }
  const stationId = String((req.body as { stationId?: string })?.stationId ?? '')
  if (!requireStationId(req, res, stationId)) return
  try {
    applySetupShiftPresets(getDb(), req.adminUser.sub, stationId)
    jsonOk(res, { ok: true })
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 400)
  }
})

setupRouter.post('/complete', (req, res) => {
  if (!req.adminUser) {
    jsonErr(res, 'Nicht angemeldet', 401)
    return
  }
  try {
    completeSetup(getDb(), req.adminUser.sub)
    jsonOk(res, { ok: true, setupCompleted: true })
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 400)
  }
})

setupRouter.get('/tenant', (req, res) => {
  if (!req.adminUser) {
    jsonErr(res, 'Nicht angemeldet', 401)
    return
  }
  const ctx = getUserTenantContext(getDb(), req.adminUser.sub)
  if (!ctx?.tenantId) {
    jsonErr(res, 'Kein Tenant', 404)
    return
  }
  const db = getDb()
  const tenant = db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(ctx.tenantId)
  const stations = db.prepare(`SELECT id, name, city, brand FROM stations WHERE tenant_id = ?`).all(ctx.tenantId)
  jsonOk(res, { tenant, stations })
})
