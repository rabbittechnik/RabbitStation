import type { Request, Response, NextFunction } from 'express'
import { getDb } from '../db/database.js'
import { getUserTenantContext } from '../services/tenantService.js'
import { jsonErr } from '../utils/http.js'

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.adminUser) {
    jsonErr(res, 'Nicht angemeldet', 401)
    return
  }
  const ctx = getUserTenantContext(getDb(), req.adminUser.sub)
  if (!ctx?.isPlatformAdmin) {
    jsonErr(res, 'Keine Berechtigung', 403)
    return
  }
  next()
}
