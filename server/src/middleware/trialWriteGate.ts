import type { Request, Response, NextFunction } from 'express'
import { getDb } from '../db/database.js'
import { getUserTenantContext } from '../services/tenantService.js'
import { getTenantById } from '../services/tenantService.js'
import { getSubscriptionWriteState } from '../services/subscriptionService.js'
import { isPlatformRole } from '../constants/saasRoles.js'

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const WRITE_EXEMPT_PREFIXES = [
  '/api/public',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/tenant/subscription',
  '/api/subscription',
  '/api/setup',
  '/api/admin',
]

/**
 * Nach Login: Schreibzugriff sperren wenn Trial abgelaufen / Abo inaktiv.
 * Lesen (GET) bleibt erlaubt.
 */
export function trialWriteGate(req: Request, res: Response, next: NextFunction) {
  if (!WRITE_METHODS.has(req.method)) return next()
  const p = (req.originalUrl ?? req.url ?? '').split('?')[0] || req.path
  if (WRITE_EXEMPT_PREFIXES.some((x) => p.startsWith(x))) return next()
  if (!p.startsWith('/api')) return next()
  if (!req.adminUser) return next()

  const db = getDb()
  const ctx = getUserTenantContext(db, req.adminUser.sub)
  if (!ctx || ctx.isPlatformAdmin) return next()
  if (isPlatformRole(ctx.platformRole)) return next()
  if (!ctx.tenantId) return next()

  const tenant = getTenantById(db, ctx.tenantId)
  if (!tenant) return next()
  const state = getSubscriptionWriteState(tenant)
  if (state.canWrite) return next()

  res.status(402).json({
    ok: false,
    error: 'Schreibzugriff gesperrt – Testphase abgelaufen oder Abo inaktiv.',
    code: state.reason ?? 'subscription_blocked',
    subscriptionStatus: state.status,
  })
}
