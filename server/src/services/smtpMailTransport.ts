import nodemailer, { type SentMessageInfo, type Transporter } from 'nodemailer'
import { classifySmtpError, type ClassifiedSmtpError } from './smtpMailErrors.js'
import { getMailFrom, getNodemailerTransportOptions, isSmtpConfigured } from './smtpConfig.js'

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

export type SmtpOperationStep = 'verify' | 'send'

/** Gesamtes verify/send inkl. Nodemailer-Timeouts – spätestens nach ~20s abbrechen. */
export const SMTP_OPERATION_TIMEOUT_MS = 20_000

export type VerifyMailTransportResult =
  | { ok: true }
  | ({ ok: false } & SmtpFailureDetails)

export type SmtpFailureDetails = {
  step: SmtpOperationStep
  errorCode: string
  safeMessage: string
  smtpHost?: string
  smtpPort?: number
  secure?: boolean
  responseCode?: number
  command?: string
  smtpResponse?: string
  hint?: string
}

function createTransport(): Transporter | null {
  const opts = getNodemailerTransportOptions()
  if (!opts) return null
  return nodemailer.createTransport(opts)
}

/**
 * Always creates a fresh transport from current process.env values.
 * No caching — ensures env var changes (e.g. Railway redeploys) are always reflected.
 */
export function getSmtpTransport(): Transporter | null {
  return createTransport()
}

/**
 * No-op kept for test compatibility.
 * Caching was removed so env vars are always read fresh on each call.
 */
export function resetSmtpTransportCache(): void {
  // no-op: transport is no longer cached
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

export function buildSmtpFailureDetails(
  step: SmtpOperationStep,
  err: unknown,
  classified?: ClassifiedSmtpError,
): SmtpFailureDetails {
  const c = classified ?? classifySmtpError(err)
  const e = (err && typeof err === 'object' ? err : {}) as {
    responseCode?: number
    command?: string
  }
  const opts = getNodemailerTransportOptions()
  return {
    step,
    errorCode: c.errorCode,
    safeMessage: c.safeMessage,
    smtpHost: opts?.host,
    smtpPort: opts?.port,
    secure: opts?.secure,
    responseCode: typeof e.responseCode === 'number' ? e.responseCode : undefined,
    command: typeof e.command === 'string' ? e.command : undefined,
    smtpResponse: c.smtpResponse,
    hint: c.hint,
  }
}

async function withSmtpOperationTimeout<T>(step: SmtpOperationStep, fn: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          Object.assign(new Error(`SMTP ${step} Zeitüberschreitung nach ${SMTP_OPERATION_TIMEOUT_MS}ms`), {
            code: 'ETIMEDOUT',
          }),
        )
      }, SMTP_OPERATION_TIMEOUT_MS)
    })
    return await Promise.race([fn(), timeoutPromise])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Prüft SMTP-Verbindung und Login (nodemailer verify). */
export async function verifyMailTransport(): Promise<VerifyMailTransportResult> {
  const transport = getSmtpTransport()
  if (!transport) {
    return {
      ok: false,
      ...buildSmtpFailureDetails('verify', { code: 'smtp_not_configured' }),
    }
  }
  try {
    await withSmtpOperationTimeout('verify', () => transport.verify())
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      ...buildSmtpFailureDetails('verify', err),
    }
  }
}

export async function sendViaSmtp(payload: SendMailPayload): Promise<SendMailResult> {
  const transport = getSmtpTransport()
  if (!transport) {
    throw Object.assign(new Error('SMTP nicht konfiguriert'), { code: 'smtp_not_configured' })
  }
  const from = getMailFrom()
  const info = await withSmtpOperationTimeout('send', () =>
    transport.sendMail({
      from: `"${from.name}" <${from.address}>`,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  )
  const result = normalizeSendResult(info)
  if (result.rejected.length > 0) {
    throw Object.assign(new Error('Empfänger vom SMTP-Server abgelehnt'), {
      code: 'smtp_recipient_rejected',
      response: result.response,
    })
  }
  return result
}
