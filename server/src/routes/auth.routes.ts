import { Router } from 'express'
import { getDb } from '../db/database.js'
import { jsonErr, jsonOk } from '../utils/http.js'
import {
  loginAdminUser,
  buildAuthMeUser,
  findUserByUsername,
  updateAdminUserProfile,
} from '../services/authService.js'
import { createPasswordResetToken, resetPasswordWithToken } from '../services/registrationService.js'
import { appendUserAudit } from '../services/userAuditLogService.js'
import { getTenantById, tenantToApi } from '../services/tenantService.js'
import { getSubscriptionWriteState, getTrialMessage } from '../services/subscriptionService.js'
import { buildTenantPlanEntitlements } from '../services/planFeatureService.js'

export const authRouter = Router()

authRouter.post('/login', (req, res) => {
  const body = req.body as { username?: string; password?: string; rememberMe?: boolean }
  const usernameRaw = String(body.username ?? '').trim()
  try {
    const out = loginAdminUser(getDb(), {
      username: usernameRaw,
      password: String(body.password ?? ''),
      rememberMe: Boolean(body.rememberMe),
    })
    jsonOk(res, out)
  } catch (e) {
    try {
      const db = getDb()
      const u = usernameRaw ? findUserByUsername(db, usernameRaw) : undefined
      appendUserAudit(db, {
        userId: u?.id ?? null,
        action: 'login.failed',
        details: { username: usernameRaw.toLowerCase() },
      })
    } catch {
      /* ignore */
    }
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 401)
  }
})

authRouter.get('/me', (req, res) => {
  const t0 = Date.now()
  if (!req.adminUser) {
    jsonErr(res, 'Nicht angemeldet', 401)
    return
  }
  const db = getDb()
  const me = buildAuthMeUser(db, req.adminUser.sub)
  const ms = Date.now() - t0
  if (ms >= 300) console.info(`[startup] GET /auth/me ${ms}ms`)
  if (!me) {
    jsonErr(res, 'Benutzer nicht gefunden', 404)
    return
  }
  if (req.supportSession && req.adminUser.tenantId) {
    const t = getTenantById(db, req.adminUser.tenantId)
    const ws = t ? getSubscriptionWriteState(t) : null
    jsonOk(res, {
      ...me,
      tenantId: req.adminUser.tenantId,
      tenant: t ? tenantToApi(t) : me.tenant,
      subscription: t && ws ? {
        canWrite: req.supportSession.access_mode === 'support_write' ? ws.canWrite : false,
        status: ws.status,
        trialDaysLeft: ws.trialDaysLeft,
        message: getTrialMessage(ws, t),
      } : me.subscription,
      planEntitlements: t ? buildTenantPlanEntitlements(db, t) : me.planEntitlements,
      supportMode: {
        sessionId: req.supportSession.id,
        tenantId: req.supportSession.tenant_id,
        tenantName: t?.company_name ?? req.supportSession.tenant_id,
        reason: req.supportSession.reason,
        accessMode: req.supportSession.access_mode,
        expiresAt: req.supportSession.expires_at,
      },
    })
    return
  }
  jsonOk(res, me)
})

authRouter.post('/logout', (req, res) => {
  if (req.adminUser) {
    try {
      appendUserAudit(getDb(), { userId: req.adminUser.sub, action: 'logout', createdBy: req.adminUser.sub })
    } catch {
      /* ignore */
    }
  }
  jsonOk(res, { ok: true })
})

authRouter.post('/forgot-password', (req, res) => {
  const email = String((req.body as { email?: string })?.email ?? '').trim()
  createPasswordResetToken(getDb(), email)
  jsonOk(res, { ok: true, message: 'Falls ein Konto existiert, wurde eine E-Mail vorbereitet.' })
})

authRouter.post('/reset-password', (req, res) => {
  try {
    const body = req.body as { token?: string; password?: string }
    resetPasswordWithToken(getDb(), String(body.token ?? ''), String(body.password ?? ''))
    jsonOk(res, { ok: true })
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 400)
  }
})

authRouter.put('/me', (req, res) => {
  if (!req.adminUser) {
    jsonErr(res, 'Nicht angemeldet', 401)
    return
  }
  try {
    const me = updateAdminUserProfile(getDb(), req.adminUser.sub, (req.body ?? {}) as Record<string, unknown>)
    if (!me) {
      jsonErr(res, 'Benutzer nicht gefunden', 404)
      return
    }
    jsonOk(res, me)
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 400)
  }
})
