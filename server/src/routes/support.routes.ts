import { Router } from 'express'
import { getDb } from '../db/database.js'
import { jsonOk, jsonErr } from '../utils/http.js'
import {
  exchangeSupportToken,
  SupportSessionError,
} from '../services/supportSessionService.js'
import { buildAuthMeUser } from '../services/authService.js'
import { getTenantById } from '../services/tenantService.js'
import { endSupportSession } from '../services/supportSessionService.js'

export const supportPublicRouter = Router()

/** Token gegen JWT tauschen (öffentlich, Token nur einmalig in URL). */
supportPublicRouter.get('/impersonate', (req, res) => {
  const token = String(req.query.token ?? '').trim()
  if (!token) {
    return res.status(400).json({ ok: false, error: 'Token fehlt' })
  }
  try {
    const db = getDb()
    const { jwt, session } = exchangeSupportToken(db, token, req)
    const tenant = getTenantById(db, session.tenant_id)
    const me = buildAuthMeUser(db, session.admin_user_id!)
    jsonOk(res, {
      token: jwt,
      user: me,
      supportMode: {
        sessionId: session.id,
        tenantId: session.tenant_id,
        tenantName: tenant?.company_name ?? session.tenant_id,
        reason: session.reason,
        accessMode: session.access_mode,
        expiresAt: session.expires_at,
      },
    })
  } catch (e) {
    if (e instanceof SupportSessionError) {
      return res.status(e.status).json({ ok: false, error: e.message, code: e.code })
    }
    return jsonErr(res, 'Interner Fehler', 500)
  }
})

/** Support-Sitzung aus der Haupt-App beenden. */
supportPublicRouter.post('/sessions/end', (req, res) => {
  if (!req.adminUser?.isSupportMode || !req.supportSession) {
    return res.status(403).json({ ok: false, error: 'Kein aktiver Support-Modus' })
  }
  try {
    endSupportSession(getDb(), req.supportSession.id, {
      req,
      userId: req.adminUser.sub,
      reason: 'ended_from_banner',
    })
    jsonOk(res, { ok: true })
  } catch (e) {
    if (e instanceof SupportSessionError) {
      return res.status(e.status).json({ ok: false, error: e.message })
    }
    return jsonErr(res, 'Interner Fehler', 500)
  }
})
