import type { Database } from 'better-sqlite3'
import type { Request } from 'express'
import {
  REGISTRATION_WELCOME_SUBJECT,
  buildRegistrationWelcomeHtml,
  buildRegistrationWelcomeText,
  formatTrialEndDe,
  type RegistrationWelcomeEmailVars,
} from '../emails/registrationWelcomeEmail.js'
import { appendTenantAudit } from './tenantAuditService.js'
import { buildWelcomeEmailAuditBase } from './mailTestService.js'
import { assertSmtpReadyToSend, classifySmtpError } from './smtpMailErrors.js'
import { isSmtpConfigured, sendViaSmtp } from './smtpMailTransport.js'

export type SendRegistrationWelcomeEmailInput = {
  to: string
  name: string
  companyName: string
  stationName: string
  trialEnd: Date | string
  setupUrl: string
  loginUrl?: string
  db?: Database
  tenantId?: string
  userId?: string
  req?: Request
}

export type SendRegistrationWelcomeEmailResult = {
  sent: boolean
  stubbed: boolean
  error?: string
  errorCode?: string
}

function buildUrls(setupUrl: string, loginUrl?: string): Pick<RegistrationWelcomeEmailVars, 'setupUrl' | 'loginUrl'> {
  const setup = setupUrl.replace(/\/$/, '')
  const publicBase = (process.env.PUBLIC_APP_URL ?? setup.replace(/\/setup$/, '')).replace(/\/$/, '')
  return {
    setupUrl: setup,
    loginUrl: loginUrl?.trim() || `${publicBase}/login`,
  }
}

export function buildRegistrationWelcomeContent(
  input: Omit<SendRegistrationWelcomeEmailInput, 'db' | 'tenantId' | 'userId' | 'req'>,
): { subject: string; html: string; text: string } {
  const urls = buildUrls(input.setupUrl, input.loginUrl)
  const vars: RegistrationWelcomeEmailVars = {
    name: input.name,
    companyName: input.companyName,
    stationName: input.stationName,
    trialEnd: formatTrialEndDe(input.trialEnd),
    ...urls,
  }
  return {
    subject: REGISTRATION_WELCOME_SUBJECT,
    html: buildRegistrationWelcomeHtml(vars),
    text: buildRegistrationWelcomeText(vars),
  }
}

/**
 * Sendet die Willkommens-E-Mail nach Registrierung.
 * Wirft keine Exceptions – Fehler werden geloggt und optional im Tenant-Audit vermerkt.
 */
export async function sendRegistrationWelcomeEmail(
  input: SendRegistrationWelcomeEmailInput,
): Promise<SendRegistrationWelcomeEmailResult> {
  const to = input.to.trim().toLowerCase()
  const auditBase = buildWelcomeEmailAuditBase()

  const audit = (action: string, metadata?: Record<string, unknown>) => {
    if (!input.db) return
    appendTenantAudit(input.db, {
      tenantId: input.tenantId,
      userId: input.userId,
      action,
      entityType: 'user',
      entityId: input.userId,
      metadata: { recipientEmail: to, ...auditBase, ...metadata },
      req: input.req,
    })
  }

  if (!to) {
    console.warn('[mail:registration-welcome] Keine Empfänger-E-Mail – Versand übersprungen')
    audit('registration_welcome_email_failed', {
      errorCode: 'missing_recipient',
      safeMessage: 'Keine Empfänger-E-Mail angegeben.',
    })
    return { sent: false, stubbed: true, error: 'missing_recipient', errorCode: 'missing_recipient' }
  }

  const { subject, html, text } = buildRegistrationWelcomeContent(input)
  const isDev = process.env.NODE_ENV !== 'production'

  if (!isSmtpConfigured()) {
    const msg = '[mail:registration-welcome] SMTP_HOST nicht gesetzt – Versand nur Stub/Log'
    if (isDev) {
      console.info(`${msg}\n${subject}\n---\n${text}`)
    } else {
      console.warn(msg)
    }
    audit('registration_welcome_email_failed', {
      errorCode: 'smtp_not_configured',
      safeMessage: 'SMTP ist nicht konfiguriert (SMTP_HOST fehlt).',
      stubbed: true,
    })
    return { sent: false, stubbed: true, error: 'smtp_not_configured', errorCode: 'smtp_not_configured' }
  }

  const precheck = assertSmtpReadyToSend()
  if (precheck) {
    console.warn(`[mail:registration-welcome] ${precheck.safeMessage} → ${to}`)
    audit('registration_welcome_email_failed', {
      errorCode: precheck.errorCode,
      safeMessage: precheck.safeMessage,
      smtpResponse: precheck.smtpResponse,
      accepted: [],
      rejected: [],
    })
    return { sent: false, stubbed: false, error: precheck.safeMessage, errorCode: precheck.errorCode }
  }

  try {
    const sendResult = await sendViaSmtp({ to, subject, html, text })
    console.info(
      `[mail:registration-welcome] Gesendet → ${to} messageId=${sendResult.messageId ?? '—'} accepted=${sendResult.accepted.join(',')}`,
    )
    audit('registration_welcome_email_sent', {
      messageId: sendResult.messageId,
      accepted: sendResult.accepted,
      rejected: sendResult.rejected,
      smtpResponse: sendResult.response,
    })
    return { sent: true, stubbed: false }
  } catch (err) {
    const classified = classifySmtpError(err)
    console.error(`[mail:registration-welcome] Fehler → ${to}:`, classified.safeMessage)
    audit('registration_welcome_email_failed', {
      errorCode: classified.errorCode,
      safeMessage: classified.safeMessage,
      smtpResponse: classified.smtpResponse,
      accepted: [],
      rejected: [],
    })
    return {
      sent: false,
      stubbed: false,
      error: classified.safeMessage,
      errorCode: classified.errorCode,
    }
  }
}
