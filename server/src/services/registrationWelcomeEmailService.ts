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
  if (!to) {
    console.warn('[mail:registration-welcome] Keine Empfänger-E-Mail – Versand übersprungen')
    return { sent: false, stubbed: true, error: 'missing_recipient' }
  }

  const { subject, html, text } = buildRegistrationWelcomeContent(input)
  const isDev = process.env.NODE_ENV !== 'production'

  const audit = (action: string, metadata?: Record<string, unknown>) => {
    if (!input.db) return
    appendTenantAudit(input.db, {
      tenantId: input.tenantId,
      userId: input.userId,
      action,
      entityType: 'user',
      entityId: input.userId,
      metadata: { to, ...metadata },
      req: input.req,
    })
  }

  if (!isSmtpConfigured()) {
    const msg = '[mail:registration-welcome] SMTP_HOST nicht gesetzt – Versand nur Stub/Log'
    if (isDev) {
      console.info(`${msg}\n${subject}\n---\n${text}`)
    } else {
      console.warn(msg)
    }
    audit('registration_welcome_email_failed', { reason: 'smtp_not_configured', stubbed: true })
    return { sent: false, stubbed: true, error: 'smtp_not_configured' }
  }

  try {
    await sendViaSmtp({ to, subject, html, text })
    console.info(`[mail:registration-welcome] Gesendet → ${to}`)
    audit('registration_welcome_email_sent', { subject })
    return { sent: true, stubbed: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[mail:registration-welcome] Fehler → ${to}:`, message)
    audit('registration_welcome_email_failed', { reason: message })
    return { sent: false, stubbed: false, error: message }
  }
}
