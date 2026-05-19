import nodemailer, { type SentMessageInfo, type Transporter } from 'nodemailer'
import { classifySmtpError } from './smtpMailErrors.js'
import { getMailFrom, isSmtpConfigured } from './smtpConfig.js'

export type { MailFromConfig, SmtpConfigSnapshot } from './smtpConfig.js'
export { getMailFrom, getSmtpConfigSnapshot, isSmtpConfigured } from './smtpConfig.js'

export type SendMailPayload = {
  to: string
  subject: string
  html: string
  text: string
}

export type SendMailResult = {
  messageId?: string
  accepted: string[]
  rejected: string[]
  response?: string
}

export type VerifyMailTransportResult =
  | { ok: true }
  | { ok: false; errorCode: string; safeMessage: string; smtpResponse?: string }

let cachedTransport: Transporter | null | undefined

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

function normalizeSendResult(info: SentMessageInfo): SendMailResult {
  const accepted = (Array.isArray(info.accepted) ? info.accepted : []).map(String)
  const rejected = (Array.isArray(info.rejected) ? info.rejected : []).map(String)
  return {
    messageId: info.messageId ? String(info.messageId) : undefined,
    accepted,
    rejected,
    response: typeof info.response === 'string' ? info.response : undefined,
  }
}

/** Prüft SMTP-Verbindung und Login (nodemailer verify). */
export async function verifyMailTransport(): Promise<VerifyMailTransportResult> {
  const transport = getSmtpTransport()
  if (!transport) {
    return {
      ok: false,
      errorCode: 'smtp_not_configured',
      safeMessage: 'SMTP ist nicht konfiguriert.',
    }
  }
  try {
    await transport.verify()
    return { ok: true }
  } catch (err) {
    const c = classifySmtpError(err)
    return {
      ok: false,
      errorCode: c.errorCode,
      safeMessage: c.safeMessage,
      smtpResponse: c.smtpResponse,
    }
  }
}

export async function sendViaSmtp(payload: SendMailPayload): Promise<SendMailResult> {
  const transport = getSmtpTransport()
  if (!transport) {
    throw Object.assign(new Error('SMTP nicht konfiguriert'), { code: 'smtp_not_configured' })
  }
  const from = getMailFrom()
  const info = await transport.sendMail({
    from: `"${from.name}" <${from.address}>`,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  })
  const result = normalizeSendResult(info)
  if (result.rejected.length > 0) {
    throw Object.assign(new Error('Empfänger vom SMTP-Server abgelehnt'), {
      code: 'smtp_recipient_rejected',
      response: result.response,
    })
  }
  return result
}
