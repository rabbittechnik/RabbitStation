import type { NextFunction, Request, Response } from 'express'
import { verifyAdminToken } from '../services/authService.js'
import { getDb } from '../db/database.js'
import { buildAccessContext } from '../services/stationAccessService.js'
import { trialWriteGate } from './trialWriteGate.js'
import { planFeatureGate } from './planFeatureGate.js'
import { supportWriteGate } from './supportWriteGate.js'
import { isControlCenterApiRequest } from './controlCenterApiAuth.js'
import { jsonErrAdmin } from '../utils/http.js'
import { buildSupportAccessContext } from '../services/stationAccessService.js'
import { getActiveSessionById } from '../services/supportSessionService.js'

/**
 * Schützt alle /api/* Routen außer Health, Login, Public, Mitarbeiter-Zugang und Terminal.
 */
export function adminApiGate(req: Request, res: Response, next: NextFunction) {
  const p = (req.originalUrl ?? req.url ?? '').split('?')[0] || req.path
  if (p === '/api/health') return next()
  if (p.startsWith('/api/public')) return next()
  if (p === '/api/auth/login') return next()
  if (p === '/api/auth/forgot-password' || p === '/api/auth/reset-password') return next()
  if (p.startsWith('/api/employee-access')) return next()
  if (p.startsWith('/api/terminal')) return next()
  if (p === '/api/tablet/pair' || p.startsWith('/api/tablet/session')) return next()
  if (p.startsWith('/api/tablet')) return next()
  if (p.startsWith('/api/fuel-prices')) return next()
  if (p.startsWith('/api/support/impersonate')) return next()

  if (!p.startsWith('/api')) return next()

  if (p.startsWith('/api/admin') && isControlCenterApiRequest(req)) {
    req.controlCenterApiAuth = true
    return next()
  }

  const h = req.headers.authorization
  const token = typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7).trim() : ''
  if (!token) {
    if (p.startsWith('/api/admin')) {
      jsonErrAdmin(res, 'unauthorized', 'Admin API token missing or invalid', 401)
      return
    }
    res.status(401).json({ ok: false, error: 'Nicht angemeldet' })
    return
  }
  const payload = verifyAdminToken(token)
  if (!payload) {
    if (p.startsWith('/api/admin')) {
      jsonErrAdmin(res, 'unauthorized', 'Admin API token missing or invalid', 401)
      return
    }
    res.status(401).json({ ok: false, error: 'Sitzung abgelaufen' })
    return
  }
  const db = getDb()
  const row = db
    .prepare(`SELECT id FROM users WHERE id = ? AND (active IS NULL OR active = 1)`)
    .get(payload.sub) as { id: string } | undefined
  if (!row) {
    res.status(401).json({ ok: false, error: 'Benutzer ungültig' })
    return
  }

  if (payload.isSupportMode && payload.supportSessionId && payload.tenantId) {
    const session = getActiveSessionById(db, payload.supportSessionId)
    if (!session) {
      res.status(401).json({
        ok: false,
        error: 'Support-Sitzung abgelaufen oder beendet.',
        code: 'support_session_invalid',
      })
      return
    }
    req.supportSession = session
    req.adminUser = payload
    req.accessContext = buildSupportAccessContext(db, payload.sub, payload.tenantId)
    planFeatureGate(req, res, () => {
      trialWriteGate(req, res, () => {
        supportWriteGate(req, res, next)
      })
    })
    return
  }

  req.accessContext = buildAccessContext(db, payload.sub)
  req.adminUser = payload
  planFeatureGate(req, res, () => {
    trialWriteGate(req, res, () => {
      supportWriteGate(req, res, next)
    })
  })
}
