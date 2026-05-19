import nodemailer, { type Transporter } from 'nodemailer'

export type SendMailPayload = {
  to: string
  subject: string
  html: string
  text: string
}

export type MailFromConfig = {
  name: string
  address: string
}

let cachedTransport: Transporter | null | undefined

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

function createTransport(): Transporter | null {
  const host = process.env.SMTP_HOST?.trim()
  if (!host) return null

  const port = Number(process.env.SMTP_PORT) || 587
  const secureRaw = process.env.SMTP_SECURE?.trim()
  const secure =
    secureRaw === '1' || secureRaw === 'true' ? true
    : secureRaw === '0' || secureRaw === 'false' ? false
    : port === 465

  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  })
}

export function getSmtpTransport(): Transporter | null {
  if (cachedTransport === undefined) {
    cachedTransport = createTransport()
  }
  return cachedTransport
}

/** Nur für Tests: Transport-Cache zurücksetzen. */
export function resetSmtpTransportCache(): void {
  cachedTransport = undefined
}

export async function sendViaSmtp(payload: SendMailPayload): Promise<void> {
  const transport = getSmtpTransport()
  if (!transport) {
    throw new Error('SMTP nicht konfiguriert')
  }
  const from = getMailFrom()
  await transport.sendMail({
    from: `"${from.name}" <${from.address}>`,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  })
}
