import { buildSmtpTestHtml, SMTP_TEST_SUBJECT, SMTP_TEST_TEXT } from '../emails/smtpTestEmail.js'
import { assertSmtpReadyToSend, classifySmtpError } from './smtpMailErrors.js'
import {
  getSmtpConfigSnapshot,
  sendViaSmtp,
  verifyMailTransport,
  type SendMailResult,
  type VerifyMailTransportResult,
} from './smtpMailTransport.js'

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
  verify?: VerifyMailTransportResult
  smtpResponse?: string
}

export type SendAdminTestMailFailure = {
  ok: false
  message: string
  errorCode: string
  smtpResponse?: string
  hint?: string
  verify?: VerifyMailTransportResult
  accepted?: string[]
  rejected?: string[]
}

export type SendAdminTestMailResult = SendAdminTestMailSuccess | SendAdminTestMailFailure

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeTestRecipient(to: string): string | null {
  const t = to.trim().toLowerCase()
  if (!t || !EMAIL_RE.test(t)) return null
  return t
}

export async function sendAdminTestMail(input: SendAdminTestMailInput): Promise<SendAdminTestMailResult> {
  const to = normalizeTestRecipient(input.to)
  if (!to) {
    return {
      ok: false,
      message: 'Ungültige Empfänger-Adresse',
      errorCode: 'invalid_recipient',
      hint: 'Bitte eine gültige E-Mail-Adresse im Feld "to" angeben.',
    }
  }

  const precheck = assertSmtpReadyToSend()
  if (precheck) {
    return {
      ok: false,
      message: 'Testmail konnte nicht gesendet werden',
      errorCode: precheck.errorCode,
      smtpResponse: precheck.smtpResponse,
      hint: precheck.hint,
    }
  }

  let verify: VerifyMailTransportResult | undefined
  if (input.verifyFirst !== false) {
    verify = await verifyMailTransport()
    if (!verify.ok) {
      return {
        ok: false,
        message: 'Testmail konnte nicht gesendet werden',
        errorCode: verify.errorCode,
        smtpResponse: verify.smtpResponse,
        hint: 'SMTP-Verbindung oder Login fehlgeschlagen. Bitte SMTP_PASS / Gmail-App-Passwort prüfen.',
        verify,
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
      verify,
      smtpResponse: sendResult.response,
    }
  } catch (err) {
    const classified = classifySmtpError(err)
    console.error(`[mail:test] Fehler → ${to}:`, classified.safeMessage)
    return {
      ok: false,
      message: 'Testmail konnte nicht gesendet werden',
      errorCode: classified.errorCode,
      smtpResponse: classified.smtpResponse,
      hint: classified.hint,
      verify,
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
