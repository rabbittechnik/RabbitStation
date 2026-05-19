import type { NextFunction, Request, Response } from 'express'
import { getDb } from '../db/database.js'
import { appendTenantAudit } from '../services/tenantAuditService.js'
import { getActiveSessionById } from '../services/supportSessionService.js'

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const SUPPORT_WRITE_EXEMPT = [
  '/api/auth/logout',
  '/api/auth/me',
  '/api/support/sessions/end',
]

/**
 * Im Support-Modus: read_only blockiert Schreibzugriffe serverseitig.
 * support_write protokolliert jede Schreibaktion.
 */
export function supportWriteGate(req: Request, res: Response, next: NextFunction) {
  if (!req.adminUser?.isSupportMode || !req.supportSession) return next()
  if (!WRITE_METHODS.has(req.method)) return next()

  const p = (req.originalUrl ?? req.url ?? '').split('?')[0] || req.path
  if (SUPPORT_WRITE_EXEMPT.some((x) => p.startsWith(x))) return next()

  const db = getDb()
  const live = getActiveSessionById(db, req.supportSession.id)
  if (!live) {
    res.status(401).json({
      ok: false,
      error: 'Support-Sitzung abgelaufen oder beendet.',
      code: 'support_session_invalid',
    })
    return
  }
  req.supportSession = live

  if (live.access_mode === 'read_only') {
    res.status(403).json({
      ok: false,
      error: 'Support-Modus: Nur Lesen — Schreibaktionen sind nicht erlaubt.',
      code: 'support_read_only',
    })
    return
  }

  appendTenantAudit(db, {
    tenantId: live.tenant_id,
    userId: req.adminUser.sub,
    action: 'support_action_performed',
    entityType: 'http',
    entityId: p,
    metadata: {
      method: req.method,
      supportSessionId: live.id,
    },
    req,
  })

  next()
}
