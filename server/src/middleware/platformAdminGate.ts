import type { Request, Response, NextFunction } from 'express'
import { getDb } from '../db/database.js'
import { getUserTenantContext } from '../services/tenantService.js'
import { jsonErrAdmin } from '../utils/http.js'

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.controlCenterApiAuth) {
    if (req.method !== 'GET') {
      jsonErrAdmin(res, 'forbidden', 'Forbidden', 403)
      return
    }
    return next()
  }
  if (!req.adminUser) {
    jsonErrAdmin(res, 'unauthorized', 'Unauthorized', 401)
    return
  }
  const ctx = getUserTenantContext(getDb(), req.adminUser.sub)
  if (!ctx?.isPlatformAdmin) {
    jsonErrAdmin(res, 'forbidden', 'Forbidden', 403)
    return
  }
  next()
}
