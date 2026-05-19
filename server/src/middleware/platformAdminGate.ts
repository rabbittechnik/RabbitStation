import type { Request, Response, NextFunction } from 'express'
import { getDb } from '../db/database.js'
import { getUserTenantContext } from '../services/tenantService.js'
import { jsonErrAdmin } from '../utils/http.js'

const CC_WRITE_PATH =
  /^\/api\/admin\/(tenants\/[^/]+\/support-sessions\/start|support-sessions\/[^/]+\/end|tenants\/[^/]+\/subscription)$/

function controlCenterWriteAllowed(req: Request): boolean {
  if (req.method === 'GET') return true
  const p = (req.originalUrl ?? req.url ?? '').split('?')[0] || req.path
  return CC_WRITE_PATH.test(p)
}

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.controlCenterApiAuth) {
    if (!controlCenterWriteAllowed(req)) {
      jsonErrAdmin(res, 'forbidden', 'Forbidden', 403)
      return
    }
    return next()
  }
  if (!req.adminUser) {
    jsonErrAdmin(res, 'unauthorized', 'Unauthorized', 401)
    return
  }
  if (req.adminUser.isSupportMode) {
    jsonErrAdmin(res, 'forbidden', 'Forbidden', 403)
    return
  }
  const ctx = getUserTenantContext(getDb(), req.adminUser.sub)
  if (!ctx?.isPlatformAdmin) {
    jsonErrAdmin(res, 'forbidden', 'Forbidden', 403)
    return
  }
  next()
}
