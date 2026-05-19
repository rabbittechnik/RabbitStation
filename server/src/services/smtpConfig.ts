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

export function getSmtpConfigSnapshot(): SmtpConfigSnapshot {
  const host = process.env.SMTP_HOST?.trim()
  const port = Number(process.env.SMTP_PORT) || 587
  const secureRaw = process.env.SMTP_SECURE?.trim()
  const secure =
    secureRaw === '1' || secureRaw === 'true' ? true
    : secureRaw === '0' || secureRaw === 'false' ? false
    : port === 465
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
