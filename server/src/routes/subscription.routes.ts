import { Router } from 'express'
import { getDb } from '../db/database.js'
import { jsonErr, jsonOk } from '../utils/http.js'
import { isValidPlanId } from '../constants/plans.js'
import { changeTenantPlan, ChangePlanError } from '../services/changePlanService.js'

export const subscriptionRouter = Router()

subscriptionRouter.post('/change-plan', (req, res) => {
  if (!req.adminUser) {
    jsonErr(res, 'Nicht angemeldet', 401)
    return
  }
  if (req.supportSession) {
    jsonErr(res, 'Planwechsel im Support-Modus nicht erlaubt', 403)
    return
  }

  const plan = String((req.body as { plan?: string })?.plan ?? '').trim()
  if (!plan || !isValidPlanId(plan)) {
    jsonErr(res, 'Ungültiger Plan', 400)
    return
  }

  try {
    const result = changeTenantPlan(getDb(), req.adminUser.sub, plan, req)
    jsonOk(res, result)
  } catch (e) {
    if (e instanceof ChangePlanError) {
      res.status(e.status).json({ ok: false, error: e.message, code: e.code })
      return
    }
    console.error('[subscription] change-plan', e instanceof Error ? e.message : e)
    jsonErr(res, 'Planwechsel fehlgeschlagen', 500)
  }
})
