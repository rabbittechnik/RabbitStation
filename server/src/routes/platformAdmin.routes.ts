import { Router } from 'express'
import { getDb } from '../db/database.js'
import { jsonOk } from '../utils/http.js'
import { requirePlatformAdmin } from '../middleware/platformAdminGate.js'
import { tenantToApi } from '../services/tenantService.js'
import { nowIso } from '../utils/timestamps.js'
import { appendTenantAudit } from '../services/tenantAuditService.js'

export const platformAdminRouter = Router()
platformAdminRouter.use(requirePlatformAdmin)

platformAdminRouter.get('/health', (_req, res) => {
  jsonOk(res, {
    ok: true,
    service: 'rabbitstation-pro',
    product: process.env.APP_NAME ?? 'RabbitStation Pro',
    timestamp: nowIso(),
    database: 'sqlite',
  })
})

platformAdminRouter.get('/tenants', (_req, res) => {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM stations s WHERE s.tenant_id = t.id) as station_count,
              (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) as user_count
       FROM tenants t ORDER BY t.created_at DESC`,
    )
    .all() as Record<string, unknown>[]
  jsonOk(res, {
    tenants: rows.map((r) => ({
      ...tenantToApi(r as import('../services/tenantService.js').TenantRow),
      stationCount: Number(r.station_count ?? 0),
      userCount: Number(r.user_count ?? 0),
    })),
  })
})

platformAdminRouter.get('/subscriptions/summary', (_req, res) => {
  const db = getDb()
  const summary = db
    .prepare(
      `SELECT subscription_status, COUNT(*) as c FROM tenants GROUP BY subscription_status`,
    )
    .all() as { subscription_status: string; c: number }[]
  const expiring = db
    .prepare(
      `SELECT * FROM tenants
       WHERE subscription_status = 'trial' AND trial_end IS NOT NULL
         AND date(trial_end) <= date('now', '+3 days')
       ORDER BY trial_end`,
    )
    .all() as import('../services/tenantService.js').TenantRow[]
  jsonOk(res, {
    byStatus: summary,
    expiringTrials: expiring.map(tenantToApi),
  })
})

platformAdminRouter.get('/logs', (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 100)))
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT * FROM tenant_audit_logs ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit)
  jsonOk(res, { logs: rows })
})

platformAdminRouter.get('/security/summary', (_req, res) => {
  const db = getDb()
  const failed = db
    .prepare(
      `SELECT COUNT(*) as c FROM tenant_audit_logs
       WHERE action = 'login.failed' AND created_at >= datetime('now', '-24 hours')`,
    )
    .get() as { c: number }
  const blocked = db
    .prepare(`SELECT COUNT(*) as c FROM tenants WHERE blocked_reason IS NOT NULL AND trim(blocked_reason) != ''`)
    .get() as { c: number }
  jsonOk(res, {
    failedLogins24h: failed?.c ?? 0,
    blockedTenants: blocked?.c ?? 0,
  })
})

platformAdminRouter.get('/backups/status', (_req, res) => {
  jsonOk(res, {
    configured: Boolean(process.env.BACKUP_PATH?.trim()),
    lastBackup: null,
    message: 'Backup-Integration für Produktivbetrieb vorbereiten.',
  })
})

platformAdminRouter.patch('/tenants/:tenantId/subscription', (req, res) => {
  const tenantId = String(req.params.tenantId ?? '')
  const body = req.body as { subscriptionStatus?: string; trialEnd?: string; blockedReason?: string | null }
  const ts = nowIso()
  const db = getDb()
  db.prepare(
    `UPDATE tenants SET
      subscription_status = COALESCE(?, subscription_status),
      trial_end = COALESCE(?, trial_end),
      blocked_reason = ?,
      updated_at = ?
    WHERE id = ?`,
  ).run(
    body.subscriptionStatus ?? null,
    body.trialEnd ?? null,
    body.blockedReason ?? null,
    ts,
    tenantId,
  )
  appendTenantAudit(db, {
    tenantId,
    userId: req.adminUser?.sub,
    action: 'subscription.changed',
    entityType: 'tenant',
    entityId: tenantId,
    metadata: body as Record<string, unknown>,
    req,
  })
  jsonOk(res, { ok: true })
})
