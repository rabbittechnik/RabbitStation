export type MailFromConfig = {
  name: string
  address: string
}

export type SmtpConfigSnapshot = {
  smtpConfigured: boolean
  smtpHost?: string
  smtpPort?: number
  smtpSecure?: boolean
  smtpUser?: string
  mailFromAddress?: string
  mailFromName?: string
  smtpUserMissing: boolean
  smtpPassMissing: boolean
  fromAddressMismatch: boolean
}

export function getMailFrom(): MailFromConfig {
  const address =
    process.env.MAIL_FROM_ADDRESS?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    'noreply@rabbitstation.local'
  const name = process.env.MAIL_FROM_NAME?.trim() || process.env.APP_NAME?.trim() || 'RabbitStation Pro'
  return { name, address }
}

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim())
}

/** Port 465 → SSL (secure). Port 587 + SMTP_SECURE=false → STARTTLS (secure false, requireTLS). */
export function resolveSmtpSecure(port: number, secureRaw?: string): boolean {
  if (secureRaw === '1' || secureRaw === 'true') return true
  if (secureRaw === '0' || secureRaw === 'false') return false
  return port === 465
}

export type NodemailerTransportOptions = {
  host: string
  port: number
  secure: boolean
  requireTLS: boolean
  auth?: { user: string; pass: string }
  connectionTimeout: number
  greetingTimeout: number
  socketTimeout: number
}

export function getNodemailerTransportOptions(): NodemailerTransportOptions | null {
  const host = process.env.SMTP_HOST?.trim()
  if (!host) return null

  const port = Number(process.env.SMTP_PORT) || 587
  const secure = resolveSmtpSecure(port, process.env.SMTP_SECURE?.trim())
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()

  return {
    host,
    port,
    secure,
    requireTLS: port === 587 && !secure,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  }
}

export function getSmtpConfigSnapshot(): SmtpConfigSnapshot {
  const host = process.env.SMTP_HOST?.trim()
  const port = Number(process.env.SMTP_PORT) || 587
  const secure = resolveSmtpSecure(port, process.env.SMTP_SECURE?.trim())
  const smtpUser = process.env.SMTP_USER?.trim()
  const smtpPass = process.env.SMTP_PASS?.trim()
  const mailFrom = getMailFrom()
  const fromAddressMismatch = Boolean(
    smtpUser &&
      mailFrom.address &&
      smtpUser.toLowerCase() !== mailFrom.address.toLowerCase(),
  )

  return {
    smtpConfigured: Boolean(host),
    smtpHost: host,
    smtpPort: port,
    smtpSecure: secure,
    smtpUser: smtpUser || undefined,
    mailFromAddress: mailFrom.address,
    mailFromName: mailFrom.name,
    smtpUserMissing: Boolean(host) && !smtpUser,
    smtpPassMissing: Boolean(host) && !smtpPass,
    fromAddressMismatch,
  }
}
