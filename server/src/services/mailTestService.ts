import { buildSmtpTestHtml, SMTP_TEST_SUBJECT, SMTP_TEST_TEXT } from '../emails/smtpTestEmail.js'
import { assertSmtpReadyToSend } from './smtpMailErrors.js'
import {
  buildSmtpFailureDetails,
  getSmtpConfigSnapshot,
  sendViaSmtp,
  verifyMailTransport,
  type SendMailResult,
  type SmtpFailureDetails,
  type SmtpOperationStep,
} from './smtpMailTransport.js'

export type { SmtpFailureDetails, SmtpOperationStep } from './smtpMailTransport.js'

export type SendAdminTestMailInput = {
  to: string
  verifyFirst?: boolean
}

export type SendAdminTestMailSuccess = {
  ok: true
  message: string
  messageId?: string
  accepted: string[]
  rejected: string[]
  smtpHost?: string
  smtpPort?: number
  secure?: boolean
  smtpResponse?: string
}

export type SendAdminTestMailFailure = {
  ok: false
  message: string
} & Partial<SmtpFailureDetails>

export type SendAdminTestMailResult = SendAdminTestMailSuccess | SendAdminTestMailFailure

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeTestRecipient(to: string): string | null {
  const t = to.trim().toLowerCase()
  if (!t || !EMAIL_RE.test(t)) return null
  return t
}

function smtpConnectionMeta() {
  const snap = getSmtpConfigSnapshot()
  return {
    smtpHost: snap.smtpHost,
    smtpPort: snap.smtpPort,
    secure: snap.smtpSecure,
  }
}

function configFailure(precheck: ReturnType<typeof assertSmtpReadyToSend>): SendAdminTestMailFailure {
  if (!precheck) {
    return { ok: false, message: 'Interner Konfigurationsfehler' }
  }
  return {
    ok: false,
    message: 'Testmail konnte nicht gesendet werden',
    errorCode: precheck.errorCode,
    safeMessage: precheck.safeMessage,
    smtpResponse: precheck.smtpResponse,
    hint: precheck.hint,
    ...smtpConnectionMeta(),
  }
}

export async function sendAdminTestMail(input: SendAdminTestMailInput): Promise<SendAdminTestMailResult> {
  const to = normalizeTestRecipient(input.to)
  if (!to) {
    return {
      ok: false,
      message: 'Ungültige Empfänger-Adresse',
      errorCode: 'invalid_recipient',
      safeMessage: 'Ungültige Empfänger-Adresse',
      hint: 'Bitte eine gültige E-Mail-Adresse im Feld "to" angeben.',
      ...smtpConnectionMeta(),
    }
  }

  const precheck = assertSmtpReadyToSend()
  if (precheck) {
    return configFailure(precheck)
  }

  const meta = smtpConnectionMeta()

  if (input.verifyFirst !== false) {
    const verify = await verifyMailTransport()
    if (!verify.ok) {
      console.error(`[mail:test] verify fehlgeschlagen:`, verify.safeMessage)
      return {
        message: 'Testmail konnte nicht gesendet werden',
        ...verify,
      }
    }
  }

  try {
    const sendResult: SendMailResult = await sendViaSmtp({
      to,
      subject: SMTP_TEST_SUBJECT,
      text: SMTP_TEST_TEXT,
      html: buildSmtpTestHtml(),
    })
    console.info(
      `[mail:test] Gesendet → ${to} messageId=${sendResult.messageId ?? '—'} accepted=${sendResult.accepted.join(',')}`,
    )
    return {
      ok: true,
      message: 'Testmail wurde gesendet',
      messageId: sendResult.messageId,
      accepted: sendResult.accepted,
      rejected: sendResult.rejected,
      ...meta,
      smtpResponse: sendResult.response,
    }
  } catch (err) {
    const details = buildSmtpFailureDetails('send', err)
    console.error(`[mail:test] send fehlgeschlagen → ${to}:`, details.safeMessage)
    return {
      ok: false,
      message: 'Testmail konnte nicht gesendet werden',
      ...details,
    }
  }
}

export function buildWelcomeEmailAuditBase() {
  const snap = getSmtpConfigSnapshot()
  return {
    smtpConfigured: snap.smtpConfigured,
    smtpHost: snap.smtpHost,
    smtpPort: snap.smtpPort,
    smtpSecure: snap.smtpSecure,
    fromAddressMismatch: snap.fromAddressMismatch,
  }
}

/** JSON-Felder für POST /api/admin/mail/test bei Fehlern (ohne Secrets). */
export function mailTestFailureToJson(result: SendAdminTestMailFailure): Record<string, unknown> {
  return {
    ok: false,
    message: result.message,
    ...(result.step ? { step: result.step } : {}),
    errorCode: result.errorCode,
    safeMessage: result.safeMessage ?? result.message,
    ...(result.responseCode != null ? { responseCode: result.responseCode } : {}),
    ...(result.command ? { command: result.command } : {}),
    ...(result.smtpHost ? { smtpHost: result.smtpHost } : {}),
    ...(result.smtpPort != null ? { smtpPort: result.smtpPort } : {}),
    ...(result.secure != null ? { secure: result.secure } : {}),
    ...(result.smtpResponse ? { smtpResponse: result.smtpResponse } : {}),
    ...(result.hint ? { hint: result.hint } : {}),
  }
}
