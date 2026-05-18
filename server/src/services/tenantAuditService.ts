import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { Request } from 'express'
import { nowIso } from '../utils/timestamps.js'

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'secret',
  'authorization',
])

function sanitizeMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!meta) return null
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) continue
    out[k] = v
  }
  return Object.keys(out).length ? out : null
}

export function appendTenantAudit(
  db: Database,
  opts: {
    tenantId?: string | null
    userId?: string | null
    action: string
    entityType?: string
    entityId?: string
    metadata?: Record<string, unknown>
    req?: Request
  },
) {
  const ts = nowIso()
  const ip = opts.req?.ip ?? opts.req?.socket?.remoteAddress ?? null
  const ua = opts.req?.headers['user-agent'] ?? null
  db.prepare(
    `INSERT INTO tenant_audit_logs (
      id, tenant_id, user_id, action, entity_type, entity_id,
      metadata_json, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    opts.tenantId ?? null,
    opts.userId ?? null,
    opts.action,
    opts.entityType ?? null,
    opts.entityId ?? null,
    opts.metadata ? JSON.stringify(sanitizeMeta(opts.metadata)) : null,
    ip,
    typeof ua === 'string' ? ua.slice(0, 500) : null,
    ts,
  )
}
