import type { Database } from 'better-sqlite3'

const SENSITIVE_META_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'secret',
  'authorization',
  'smtp_pass',
  'smtp_password',
  'api_key',
  'apikey',
])

const ACTION_LABELS: Record<string, string> = {
  'tenant.created': 'Tenant erstellt',
  tenant_created: 'Tenant erstellt',
  'registration.completed': 'Registrierung abgeschlossen',
  registration_completed: 'Registrierung abgeschlossen',
  registration_welcome_email_sent: 'Willkommens-E-Mail gesendet',
  registration_welcome_email_failed: 'Willkommens-E-Mail konnte nicht gesendet werden',
  registration_welcome_email_resent: 'Willkommens-E-Mail erneut gesendet',
  registration_welcome_email_resend_failed: 'Willkommens-E-Mail konnte nicht erneut gesendet werden',
  'login.success': 'Login erfolgreich',
  login_success: 'Login erfolgreich',
  'login.failed': 'Login fehlgeschlagen',
  login_failed: 'Login fehlgeschlagen',
  trial_extended: 'Testzeitraum verlängert',
  trial_extend_failed: 'Testzeitraum-Verlängerung fehlgeschlagen',
  'subscription.changed': 'Abo geändert',
}

const WELCOME_MAIL_ACTIONS = new Set([
  'registration_welcome_email_sent',
  'registration_welcome_email_failed',
  'registration_welcome_email_resent',
  'registration_welcome_email_resend_failed',
])

type AuditJoinRow = {
  id: string
  tenant_id: string | null
  user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  metadata_json: string | null
  created_at: string
  user_display_name: string | null
  user_email: string | null
  user_username: string | null
  user_role_key: string | null
  tenant_company_name: string | null
  tenant_slug: string | null
  primary_station_name: string | null
}

export type AdminLogApiEntry = {
  id: string
  action: string
  actionLabel: string
  severity: string
  category: string
  message: string
  createdAt: string
  tenantId: string | null
  tenantName: string | null
  companyName: string | null
  stationName: string | null
  tenantSlug: string | null
  userId: string | null
  userName: string | null
  userEmail: string | null
  userRole: string | null
  recipientEmail: string | null
  mailType: string | null
  mailStatus: string | null
  errorCode: string | null
  safeMessage: string | null
  /** Snake_case aliases for Control Center / legacy consumers */
  tenant_id: string | null
  user_id: string | null
  entity_type: string | null
  entity_id: string | null
  metadata_json: string | null
  created_at: string
}

function sanitizeMetaRecord(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_META_KEYS.has(k.toLowerCase())) continue
    out[k] = v
  }
  return out
}

function parseMetadataJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return sanitizeMetaRecord(parsed && typeof parsed === 'object' ? parsed : {})
  } catch {
    return {}
  }
}

function metaString(meta: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = meta[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

export function formatAdminLogActionLabel(action: string): string {
  const key = action.trim()
  if (ACTION_LABELS[key]) return ACTION_LABELS[key]
  const normalized = key.replace(/\./g, '_')
  if (ACTION_LABELS[normalized]) return ACTION_LABELS[normalized]
  return key
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

export function severityForAdminLogAction(action: string): string {
  const a = action.toLowerCase()
  if (a.includes('failed') || a.includes('blocked') || a.includes('denied') || a.includes('error')) {
    return 'error'
  }
  if (a.includes('expired') || a.includes('past_due')) return 'warning'
  if (a.includes('success') || a.includes('completed') || a.includes('created') || a.includes('sent')) {
    return 'success'
  }
  return 'info'
}

function resolveJoinedUserEmail(row: AuditJoinRow): string | null {
  const email = row.user_email?.trim().toLowerCase()
  if (email && email.includes('@')) return email
  const username = row.user_username?.trim().toLowerCase()
  if (username && username.includes('@')) return username
  return email || null
}

function mailFieldsForAction(
  action: string,
  meta: Record<string, unknown>,
): { mailType: string | null; mailStatus: string | null } {
  if (!WELCOME_MAIL_ACTIONS.has(action)) {
    return { mailType: null, mailStatus: null }
  }
  const mailType = metaString(meta, 'mailType') ?? 'registration_welcome'
  const mailStatus =
    metaString(meta, 'mailStatus') ??
    (action.includes('failed') ? 'failed'
    : action.includes('resent') ? 'resent'
    : 'sent')
  return { mailType, mailStatus }
}

export function mapAdminLogRow(row: AuditJoinRow): AdminLogApiEntry {
  const meta = parseMetadataJson(row.metadata_json)
  const action = row.action

  const tenantId = row.tenant_id ?? metaString(meta, 'tenantId', 'tenant_id')
  const userId = row.user_id ?? metaString(meta, 'userId', 'user_id')

  const companyName =
    metaString(meta, 'companyName', 'tenantName') ?? row.tenant_company_name?.trim() ?? null
  const tenantName = metaString(meta, 'tenantName', 'companyName') ?? companyName
  const tenantSlug = metaString(meta, 'tenantSlug', 'tenant_slug') ?? row.tenant_slug?.trim() ?? null
  const stationName =
    metaString(meta, 'stationName', 'station_name') ?? row.primary_station_name?.trim() ?? null

  const joinedEmail = resolveJoinedUserEmail(row)
  const userEmail =
    metaString(meta, 'userEmail', 'user_email') ??
    metaString(meta, 'recipientEmail', 'recipient_email') ??
    joinedEmail
  const recipientEmail =
    metaString(meta, 'recipientEmail', 'recipient_email') ?? userEmail

  const joinedName = row.user_display_name?.trim() || null
  const metaName = metaString(meta, 'userName', 'user_name', 'displayName', 'name')
  const userName =
    metaName ?? joinedName ?? (userId ? 'Unbekannter Benutzer' : null)

  const userRole = metaString(meta, 'userRole', 'role') ?? row.user_role_key?.trim() ?? null
  const errorCode = metaString(meta, 'errorCode', 'error_code')
  const safeMessage = metaString(meta, 'safeMessage', 'safe_message')
  const { mailType, mailStatus } = mailFieldsForAction(action, meta)

  const actionLabel = formatAdminLogActionLabel(action)
  const message =
    action.includes('registration_welcome_email_failed') ?
      'Willkommens-E-Mail konnte nicht gesendet werden'
    : action.includes('registration_welcome_email_resend_failed') ?
      'Willkommens-E-Mail konnte nicht erneut gesendet werden'
    : actionLabel

  const enrichedMeta = sanitizeMetaRecord({
    ...meta,
    tenantId,
    tenantName,
    companyName,
    stationName,
    tenantSlug,
    userId,
    userName,
    userEmail,
    userRole,
    recipientEmail,
    mailType,
    mailStatus,
    errorCode,
    safeMessage,
  })

  return {
    id: row.id,
    action,
    actionLabel,
    severity: severityForAdminLogAction(action),
    category: row.entity_type ?? 'audit',
    message,
    createdAt: row.created_at,
    tenantId,
    tenantName,
    companyName,
    stationName,
    tenantSlug,
    userId,
    userName,
    userEmail,
    userRole,
    recipientEmail,
    mailType,
    mailStatus,
    errorCode,
    safeMessage,
    tenant_id: tenantId,
    user_id: userId,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    metadata_json: JSON.stringify(enrichedMeta),
    created_at: row.created_at,
  }
}

const ADMIN_LOGS_SQL = `
  SELECT
    l.id,
    l.tenant_id,
    l.user_id,
    l.action,
    l.entity_type,
    l.entity_id,
    l.metadata_json,
    l.created_at,
    u.display_name AS user_display_name,
    u.email AS user_email,
    u.username AS user_username,
    r.role_key AS user_role_key,
    t.company_name AS tenant_company_name,
    t.slug AS tenant_slug,
    (
      SELECT s.name FROM stations s
      WHERE s.tenant_id = l.tenant_id AND (s.active IS NULL OR s.active = 1)
      ORDER BY s.created_at ASC
      LIMIT 1
    ) AS primary_station_name
  FROM tenant_audit_logs l
  LEFT JOIN users u ON u.id = l.user_id
  LEFT JOIN roles r ON r.id = u.role_id
  LEFT JOIN tenants t ON t.id = l.tenant_id
  ORDER BY l.created_at DESC
  LIMIT ?
`

export function listAdminLogs(db: Database, limit = 100): AdminLogApiEntry[] {
  const capped = Math.min(500, Math.max(1, limit))
  const rows = db.prepare(ADMIN_LOGS_SQL).all(capped) as AuditJoinRow[]
  return rows.map(mapAdminLogRow)
}

/** Metadata written with welcome-email audit events (registration + resend). */
export function buildWelcomeEmailAuditMetadata(
  input: {
    tenantId?: string
    userId?: string
    companyName: string
    stationName: string
    name: string
    to: string
  },
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const email = input.to.trim().toLowerCase()
  return {
    tenantId: input.tenantId,
    tenantName: input.companyName,
    companyName: input.companyName,
    stationName: input.stationName,
    userId: input.userId,
    userName: input.name,
    userEmail: email,
    recipientEmail: email,
    mailType: 'registration_welcome',
    ...extra,
  }
}
