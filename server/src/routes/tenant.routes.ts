import { Router } from 'express'
import { getDb } from '../db/database.js'
import { jsonErr, jsonOk } from '../utils/http.js'
import { getUserTenantContext, getTenantById, tenantToApi } from '../services/tenantService.js'
import { getSubscriptionWriteState, getTrialMessage } from '../services/subscriptionService.js'
import { buildTenantPlanEntitlements } from '../services/planFeatureService.js'
import { getPlanDefinition } from '../config/planConfig.js'
import { normalizePlanId } from '../constants/plans.js'

export const tenantRouter = Router()

tenantRouter.get('/subscription', (req, res) => {
  if (!req.adminUser) {
    jsonErr(res, 'Nicht angemeldet', 401)
    return
  }
  const ctx = getUserTenantContext(getDb(), req.adminUser.sub)
  if (!ctx?.tenantId) {
    jsonErr(res, 'Kein Tenant-Konto', 404)
    return
  }
  const tenant = getTenantById(getDb(), ctx.tenantId)
  if (!tenant) {
    jsonErr(res, 'Tenant nicht gefunden', 404)
    return
  }
  const ws = getSubscriptionWriteState(tenant)
  jsonOk(res, {
    tenant: tenantToApi(tenant),
    canWrite: ws.canWrite,
    message: getTrialMessage(ws, tenant),
    status: ws.status,
    trialDaysLeft: ws.trialDaysLeft,
    plan: buildTenantPlanEntitlements(getDb(), tenant),
  })
})

tenantRouter.get('/plan', (req, res) => {
  if (!req.adminUser) {
    jsonErr(res, 'Nicht angemeldet', 401)
    return
  }
  const ctx = getUserTenantContext(getDb(), req.adminUser.sub)
  if (!ctx?.tenantId) {
    jsonErr(res, 'Kein Tenant-Konto', 404)
    return
  }
  const db = getDb()
  const tenant = getTenantById(db, ctx.tenantId)
  if (!tenant) {
    jsonErr(res, 'Tenant nicht gefunden', 404)
    return
  }
  const planId = normalizePlanId(tenant.plan)
  const def = getPlanDefinition(planId)
  jsonOk(res, {
    ...buildTenantPlanEntitlements(db, tenant),
    planDisplayName: def.name,
    priceMonthly: def.priceMonthly,
  })
})
