import path from 'node:path'
import { Router } from 'express'
import { getDb } from '../db/database.js'
import { jsonOk } from '../utils/http.js'
import { requirePlatformAdmin } from '../middleware/platformAdminGate.js'
import { tenantToApi } from '../services/tenantService.js'
import { nowIso } from '../utils/timestamps.js'
import { appendTenantAudit } from '../services/tenantAuditService.js'
import { buildAdminHealthPayload } from '../services/adminHealthService.js'
import { normalizePlanId } from '../constants/plans.js'
import {
  startSupportSession,
  listSupportSessions,
  endSupportSession,
  SupportSessionError,
  countActiveSupportSessions,
} from '../services/supportSessionService.js'
import { getTenantById } from '../services/tenantService.js'
import { mailTestFailureToJson, sendAdminTestMail } from '../services/mailTestService.js'
import { buildSmtpFailureDetails } from '../services/smtpMailTransport.js'
import { getSmtpConfigSnapshot } from '../services/smtpConfig.js'
import {
  createBackup,
  getBackupStatusResponse,
  listBackupFiles,
  resolveBackupDownloadPath,
} from '../services/backupService.js'

export const platformAdminRouter = Router()
platformAdminRouter.use(requirePlatformAdmin)

platformAdminRouter.get('/health', (_req, res) => {
  jsonOk(res, buildAdminHealthPayload())
})

platformAdminRouter.post('/mail/test', async (req, res) => {
  try {
    const body = req.body as { to?: string; verifyFirst?: boolean }
    const to = typeof body.to === 'string' ? body.to : ''
    const result = await sendAdminTestMail({
      to,
      verifyFirst: body.verifyFirst !== false,
    })
    if (result.ok) {
      return res.status(200).json({
        ok: true,
        message: result.message,
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
        smtpHost: result.smtpHost,
        smtpPort: result.smtpPort,
        secure: result.secure,
        ...(result.smtpResponse ? { smtpResponse: result.smtpResponse } : {}),
      })
    }
    return res.status(502).json(mailTestFailureToJson(result))
  } catch (err) {
    console.error('[mail:test] Unerwarteter Fehler:', err instanceof Error ? err.message : err)
    return res.status(502).json({
      ok: false,
      message: 'Testmail konnte nicht gesendet werden',
      ...buildSmtpFailureDetails('send', err),
    })
  }
})

platformAdminRouter.get('/mail/config-check', (_req, res) => {
  const snap = getSmtpConfigSnapshot()
  return res.status(200).json({
    ok: true,
    smtpHost: snap.smtpHost ?? null,
    smtpPort: snap.smtpPort ?? null,
    secure: snap.smtpSecure ?? null,
    smtpUserSet: !snap.smtpUserMissing && Boolean(snap.smtpHost),
    smtpPassSet: !snap.smtpPassMissing && Boolean(snap.smtpHost),
    fromAddress: snap.mailFromAddress ?? null,
    smtpConfigured: snap.smtpConfigured,
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
    .prepare(`SELECT subscription_status, COUNT(*) as c FROM tenants GROUP BY subscription_status`)
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
    .prepare(`SELECT * FROM tenant_audit_logs ORDER BY created_at DESC LIMIT ?`)
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
    activeSupportSessions: countActiveSupportSessions(db),
  })
})

platformAdminRouter.get('/support-sessions', (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined
    const tenantId = req.query.tenantId ? String(req.query.tenantId) : undefined
    const sessions = listSupportSessions(getDb(), { status, tenantId })
    jsonOk(res, { sessions })
  } catch (e) {
    if (e instanceof SupportSessionError) {
      return res.status(e.status).json({ ok: false, error: e.message, code: e.code })
    }
    throw e
  }
})

platformAdminRouter.post('/tenants/:tenantId/support-sessions/start', (req, res) => {
  const tenantId = String(req.params.tenantId ?? '')
  const body = req.body as {
    reason?: string
    accessMode?: string
    durationMinutes?: number
  }
  try {
    const db = getDb()
    let adminEmail = 'control-center@system'
    if (!req.controlCenterApiAuth && req.adminUser?.sub) {
      const row = db.prepare(`SELECT email, username FROM users WHERE id = ?`).get(req.adminUser.sub) as
        | { email: string | null; username: string | null }
        | undefined
      adminEmail = row?.email?.trim() || row?.username?.trim() || adminEmail
    }
    const result = startSupportSession(db, {
      tenantId,
      reason: String(body.reason ?? ''),
      accessMode: body.accessMode === 'support_write' ? 'support_write' : 'read_only',
      durationMinutes: Number(body.durationMinutes ?? 60),
      adminUserId: req.adminUser?.sub ?? null,
      adminEmail,
      req,
    })
    const tenant = getTenantById(db, tenantId)
    res.status(201).json({
      ok: true,
      supportSession: {
        id: result.session.id,
        tenantId: result.session.tenant_id,
        tenantName: tenant?.company_name ?? tenantId,
        accessMode: result.session.access_mode,
        status: result.session.status,
        expiresAt: result.session.expires_at,
      },
      impersonationUrl: result.impersonationUrl,
    })
  } catch (e) {
    if (e instanceof SupportSessionError) {
      return res.status(e.status).json({ ok: false, error: e.message, code: e.code })
    }
    throw e
  }
})

platformAdminRouter.post('/support-sessions/:id/end', (req, res) => {
  try {
    endSupportSession(getDb(), String(req.params.id ?? ''), {
      req,
      userId: req.adminUser?.sub ?? null,
    })
    jsonOk(res, { ok: true })
  } catch (e) {
    if (e instanceof SupportSessionError) {
      return res.status(e.status).json({ ok: false, error: e.message, code: e.code })
    }
    throw e
  }
})

platformAdminRouter.get('/backups/status', (_req, res) => {
  res.json(getBackupStatusResponse())
})

platformAdminRouter.get('/backups', (_req, res) => {
  res.json({ ok: true, backups: listBackupFiles() })
})

platformAdminRouter.post('/backups/create', async (req, res) => {
  try {
    const body = req.body as { includeUploads?: boolean; includeDocuments?: boolean }
    const backup = await createBackup({
      includeUploads: body.includeUploads !== false,
      includeDocuments: body.includeDocuments !== false,
      type: 'manual',
      req,
    })
    res.status(201).json({
      ok: true,
      backup: {
        fileName: backup.fileName,
        path: backup.path,
        sizeBytes: backup.sizeBytes,
        createdAt: backup.createdAt,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Backup fehlgeschlagen'
    res.status(500).json({ ok: false, message })
  }
})

platformAdminRouter.get('/backups/:fileName/download', (req, res) => {
  const filePath = resolveBackupDownloadPath(String(req.params.fileName ?? ''))
  if (!filePath) {
    return res.status(400).json({ ok: false, message: 'Ungültiger Backup-Dateiname' })
  }
  res.download(filePath, path.basename(filePath))
})

platformAdminRouter.patch('/tenants/:tenantId/subscription', (req, res) => {
  const tenantId = String(req.params.tenantId ?? '')
  const body = req.body as {
    plan?: string
    subscriptionStatus?: string
    subscription_status?: string
    trialEnd?: string
    trial_end?: string
    currentPeriodStart?: string
    current_period_start?: string
    currentPeriodEnd?: string
    current_period_end?: string
    blockedReason?: string | null
    blocked_reason?: string | null
  }
  const ts = nowIso()
  const db = getDb()
  const sets = ['updated_at = ?']
  const params: unknown[] = [ts]
  if (body.plan != null) {
    sets.push('plan = ?')
    params.push(normalizePlanId(String(body.plan)))
  }
  const subStatus = body.subscriptionStatus ?? body.subscription_status
  if (subStatus != null) {
    sets.push('subscription_status = ?')
    params.push(subStatus)
  }
  const trialEnd = body.trialEnd ?? body.trial_end
  if (trialEnd != null) {
    sets.push('trial_end = ?')
    params.push(trialEnd)
  }
  const periodStart = body.currentPeriodStart ?? body.current_period_start
  if (periodStart != null) {
    sets.push('current_period_start = ?')
    params.push(periodStart)
  }
  const periodEnd = body.currentPeriodEnd ?? body.current_period_end
  if (periodEnd != null) {
    sets.push('current_period_end = ?')
    params.push(periodEnd)
  }
  const blocked = body.blockedReason !== undefined ? body.blockedReason : body.blocked_reason
  if (blocked !== undefined) {
    sets.push('blocked_reason = ?')
    params.push(blocked)
  }
  params.push(tenantId)
  db.prepare(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`).run(...params)
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
