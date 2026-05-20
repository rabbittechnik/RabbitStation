import { Router } from 'express'
import { getDb } from '../db/database.js'
import { jsonErr, jsonOk } from '../utils/http.js'
import {
  getSetupState,
  applySetupShiftPresets,
  completeSetup,
  saveSetupShiftTemplates,
  saveTuvPreference,
  saveOwnerAsEmployee,
  createSetupFirstEmployee,
  completeOnboardingTour,
  resetOnboardingTour,
  saveSetupFederalState,
} from '../services/setupService.js'
import { parseGermanState } from '../data/germanFederalStates.js'
import { getUserTenantContext } from '../services/tenantService.js'
import { requireStationId } from '../middleware/stationAuth.js'
import type { ShiftTemplateInput } from '../services/shiftTemplateService.js'

export const setupRouter = Router()

setupRouter.get('/state', (req, res) => {
  if (!req.adminUser) {
    jsonErr(res, 'Nicht angemeldet', 401)
    return
  }
  jsonOk(res, getSetupState(getDb(), req.adminUser.sub))
})

setupRouter.post('/federal-state', (req, res) => {
  if (!req.adminUser) {
    jsonErr(res, 'Nicht angemeldet', 401)
    return
  }
  const body = req.body as {
    stationId?: string
    federalState?: string
    options?: { bavariaAssumptionDayEnabled?: boolean }
  }
  const stationId = String(body.stationId ?? '')
  if (!requireStationId(req, res, stationId)) return
  try {
    saveSetupFederalState(
      getDb(),
      req.adminUser.sub,
      stationId,
      parseGermanState(body.federalState, 'BW'),
      body.options ?? {},
    )
    jsonOk(res, { ok: true })
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 400)
  }
})

setupRouter.post('/shift-templates', (req, res) => {
  if (!req.adminUser) {
    jsonErr(res, 'Nicht angemeldet', 401)
    return
  }
  const body = req.body as { stationId?: string; templates?: ShiftTemplateInput[] }
  const stationId = String(body.stationId ?? '')
  if (!requireStationId(req, res, stationId)) return
  try {
    const templates = saveSetupShiftTemplates(getDb(), req.adminUser.sub, stationId, body.templates ?? [])
    jsonOk(res, { ok: true, templates })
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 400)
  }
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

setupRouter.post('/tuv-preference', (req, res) => {
  if (!req.adminUser) {
    jsonErr(res, 'Nicht angemeldet', 401)
    return
  }
  const body = req.body as { stationId?: string; enabled?: boolean }
  const stationId = String(body.stationId ?? '')
  if (!requireStationId(req, res, stationId)) return
  try {
    saveTuvPreference(getDb(), req.adminUser.sub, stationId, Boolean(body.enabled))
    jsonOk(res, { ok: true })
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 400)
  }
})

setupRouter.post('/first-employee', (req, res) => {
  if (!req.adminUser) {
    jsonErr(res, 'Nicht angemeldet', 401)
    return
  }
  const body = req.body as { stationId?: string } & Record<string, unknown>
  const stationId = String(body.stationId ?? '')
  if (!requireStationId(req, res, stationId)) return
  try {
    const emp = createSetupFirstEmployee(getDb(), req.adminUser.sub, stationId, body)
    jsonOk(res, { ok: true, employee: emp })
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 400)
  }
})

setupRouter.post('/owner-as-employee', (req, res) => {
  if (!req.adminUser) {
    jsonErr(res, 'Nicht angemeldet', 401)
    return
  }
  const body = req.body as { stationId?: string; enabled?: boolean }
  const stationId = String(body.stationId ?? '')
  if (!requireStationId(req, res, stationId)) return
  try {
    saveOwnerAsEmployee(getDb(), req.adminUser.sub, stationId, Boolean(body.enabled))
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

setupRouter.post('/tour-complete', (req, res) => {
  if (!req.adminUser) {
    jsonErr(res, 'Nicht angemeldet', 401)
    return
  }
  try {
    completeOnboardingTour(getDb(), req.adminUser.sub)
    jsonOk(res, { ok: true, onboardingTourCompleted: true })
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 400)
  }
})

setupRouter.post('/tour-reset', (req, res) => {
  if (!req.adminUser) {
    jsonErr(res, 'Nicht angemeldet', 401)
    return
  }
  try {
    resetOnboardingTour(getDb(), req.adminUser.sub)
    jsonOk(res, { ok: true, onboardingTourCompleted: false })
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
