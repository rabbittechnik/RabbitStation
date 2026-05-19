import type { NextFunction, Request, Response } from 'express'
import type { FeatureKey } from '../config/planConfig.js'
import { getDb } from '../db/database.js'
import { isPlatformRole } from '../constants/saasRoles.js'
import { getUserTenantContext } from '../services/tenantService.js'
import {
  PlanFeatureError,
  requireFeature,
  sendPlanError,
  tenantForRequest,
} from '../services/planFeatureService.js'

type RouteRule = {
  match: (path: string) => boolean
  feature: FeatureKey
  methods?: string[]
}

/** API-Pfad → benötigtes Feature (Lesen + Schreiben). */
const ROUTE_FEATURE_RULES: RouteRule[] = [
  { match: (p) => p.startsWith('/api/time-entries'), feature: 'time_tracking' },
  {
    match: (p) => p.startsWith('/api/reports/payroll-audit') || p.includes('/payroll-audit'),
    feature: 'payroll_audit',
  },
  {
    match: (p) =>
      p.startsWith('/api/reports/payroll') ||
      p.startsWith('/api/reports/payroll-time') ||
      p.startsWith('/api/reports/payroll-schedule') ||
      p.startsWith('/api/reports/payroll-summary'),
    feature: 'payroll_audit',
  },
  { match: (p) => p.startsWith('/api/tuv-reports'), feature: 'monthly_tuv_report' },
  { match: (p) => p.startsWith('/api/station-tablets'), feature: 'station_tablet' },
  {
    match: (p) => p.startsWith('/api/tablet') && !p.startsWith('/api/tablet/pair'),
    feature: 'station_tablet',
  },
  { match: (p) => p.startsWith('/api/representatives'), feature: 'contacts' },
  { match: (p) => p.startsWith('/api/absences'), feature: 'absences' },
  { match: (p) => p.startsWith('/api/station-extra-holidays'), feature: 'holidays' },
  {
    match: (p) => p.startsWith('/api/documents') && p.includes('protected'),
    feature: 'protected_documents',
  },
  {
    match: (p) => p.startsWith('/api/reports') && (p.includes('/export') || p.endsWith('/export')),
    feature: 'exports',
  },
]

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const PLAN_EXEMPT_PREFIXES = [
  '/api/public',
  '/api/auth',
  '/api/health',
  '/api/employee-access',
  '/api/terminal',
  '/api/tablet/pair',
  '/api/tablet/session',
  '/api/tenant',
  '/api/setup',
  '/api/admin',
]

function resolveFeatureForPath(path: string): FeatureKey | null {
  for (const rule of ROUTE_FEATURE_RULES) {
    if (rule.match(path)) return rule.feature
  }
  return null
}

/**
 * Prüft Plan-Features für Tenant-APIs. Plattform-Admins sind ausgenommen.
 */
export function planFeatureGate(req: Request, res: Response, next: NextFunction) {
  const path = (req.originalUrl ?? req.url ?? '').split('?')[0] || req.path
  if (!path.startsWith('/api')) return next()
  if (PLAN_EXEMPT_PREFIXES.some((x) => path.startsWith(x))) return next()
  if (!req.adminUser) return next()

  const db = getDb()
  const ctx = getUserTenantContext(db, req.adminUser.sub)
  if (!ctx?.tenantId || ctx.isPlatformAdmin || isPlatformRole(ctx.platformRole)) return next()

  const tenant = tenantForRequest(db, ctx.tenantId)
  if (!tenant) return next()

  const feature = resolveFeatureForPath(path)
  if (!feature) return next()

  try {
    requireFeature(tenant, feature)
    return next()
  } catch (e) {
    if (e instanceof PlanFeatureError) {
      return sendPlanError(res, e)
    }
    return next(e)
  }
}

/** In Route-Handlern: Tenant laden und Feature erzwingen. */
export function assertRequestFeature(req: Request, feature: FeatureKey): void {
  if (!req.adminUser) return
  const db = getDb()
  const ctx = getUserTenantContext(db, req.adminUser.sub)
  if (!ctx?.tenantId || ctx.isPlatformAdmin || isPlatformRole(ctx.platformRole)) return
  const tenant = tenantForRequest(db, ctx.tenantId)
  if (!tenant) return
  requireFeature(tenant, feature)
}

export function handlePlanError(res: Response, e: unknown): boolean {
  if (e instanceof PlanFeatureError) {
    sendPlanError(res, e)
    return true
  }
  return false
}
