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
import { buildWelcomeEmailAuditMetadata } from './adminLogService.js'
import { buildWelcomeEmailAuditBase } from './mailTestService.js'
import { assertSmtpReadyToSend, classifySmtpError } from './smtpMailErrors.js'
import { isSmtpConfigured, sendViaSmtp, type SendMailResult } from './smtpMailTransport.js'

export type SendRegistrationWelcomeEmailInput = {
  to: string
  name: string
  companyName: string
  stationName: string
  planLabel: string
  trialEnd: Date | string
  setupUrl: string
  loginUrl?: string
  appUrl?: string
  db?: Database
  tenantId?: string
  userId?: string
  req?: Request
}

export type WelcomeEmailDeliveryResult = {
  sent: boolean
  stubbed: boolean
  error?: string
  errorCode?: string
  messageId?: string
  accepted: string[]
  rejected: string[]
  safeMessage?: string
  responseCode?: number
}

export type SendRegistrationWelcomeEmailResult = Pick<
  WelcomeEmailDeliveryResult,
  'sent' | 'stubbed' | 'error' | 'errorCode'
>

type WelcomeAuditActions = {
  sent: string
  failed: string
}

const REGISTRATION_AUDIT: WelcomeAuditActions = {
  sent: 'registration_welcome_email_sent',
  failed: 'registration_welcome_email_failed',
}

function buildUrls(setupUrl: string, loginUrl?: string, appUrl?: string) {
  const setup = setupUrl.replace(/\/$/, '')
  const publicBase = (process.env.PUBLIC_APP_URL ?? setup.replace(/\/setup$/, '')).replace(/\/$/, '')
  return {
    setupUrl: setup,
    loginUrl: loginUrl?.trim() || `${publicBase}/login`,
    appUrl: appUrl?.trim() || publicBase,
  }
}

export function buildRegistrationWelcomeContent(
  input: Omit<SendRegistrationWelcomeEmailInput, 'db' | 'tenantId' | 'userId' | 'req'>,
): { subject: string; html: string; text: string } {
  const urls = buildUrls(input.setupUrl, input.loginUrl, input.appUrl)
  const vars: RegistrationWelcomeEmailVars = {
    name: input.name,
    companyName: input.companyName,
    stationName: input.stationName,
    planLabel: input.planLabel,
    trialEnd: formatTrialEndDe(input.trialEnd),
    ...urls,
  }
  return {
    subject: REGISTRATION_WELCOME_SUBJECT,
    html: buildRegistrationWelcomeHtml(vars),
    text: buildRegistrationWelcomeText(vars),
  }
}

function smtpErrorDetails(err: unknown): Pick<WelcomeEmailDeliveryResult, 'errorCode' | 'safeMessage' | 'responseCode'> {
  const c = classifySmtpError(err)
  const e = (err && typeof err === 'object' ? err : {}) as { responseCode?: number }
  return {
    errorCode: c.errorCode,
    safeMessage: c.safeMessage,
    responseCode: typeof e.responseCode === 'number' ? e.responseCode : undefined,
  }
}

/**
 * Sendet die Willkommens-E-Mail (Registrierung oder erneuter Versand).
 * Wirft keine Exceptions – Fehler werden geloggt und optional im Tenant-Audit vermerkt.
 */
export async function deliverWelcomeEmail(
  input: SendRegistrationWelcomeEmailInput,
  auditActions: WelcomeAuditActions,
  extraAuditMeta: Record<string, unknown> = {},
): Promise<WelcomeEmailDeliveryResult> {
  const to = input.to.trim().toLowerCase()
  const auditBase = buildWelcomeEmailAuditBase()
  const emptyMail = { accepted: [] as string[], rejected: [] as string[] }

  const welcomeMeta = buildWelcomeEmailAuditMetadata(
    {
      tenantId: input.tenantId,
      userId: input.userId,
      companyName: input.companyName,
      stationName: input.stationName,
      name: input.name,
      to,
    },
    extraAuditMeta,
  )

  const audit = (action: string, metadata?: Record<string, unknown>) => {
    if (!input.db) return
    const mailStatus = action.includes('failed') ? 'failed' : action.includes('resent') ? 'resent' : 'sent'
    appendTenantAudit(input.db, {
      tenantId: input.tenantId,
      userId: input.userId,
      action,
      entityType: 'user',
      entityId: input.userId,
      metadata: {
        ...welcomeMeta,
        ...auditBase,
        mailStatus,
        ...metadata,
      },
      req: input.req,
    })
  }

  if (!to) {
    console.warn('[mail:registration-welcome] Keine Empfänger-E-Mail – Versand übersprungen')
    audit(auditActions.failed, {
      errorCode: 'missing_recipient',
      safeMessage: 'Keine Empfänger-E-Mail angegeben.',
      ...emptyMail,
    })
    return {
      sent: false,
      stubbed: true,
      error: 'missing_recipient',
      errorCode: 'missing_recipient',
      safeMessage: 'Keine Empfänger-E-Mail angegeben.',
      ...emptyMail,
    }
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
    audit(auditActions.failed, {
      errorCode: 'smtp_not_configured',
      safeMessage: 'SMTP ist nicht konfiguriert (SMTP_HOST fehlt).',
      stubbed: true,
      ...emptyMail,
    })
    return {
      sent: false,
      stubbed: true,
      error: 'smtp_not_configured',
      errorCode: 'smtp_not_configured',
      safeMessage: 'SMTP ist nicht konfiguriert (SMTP_HOST fehlt).',
      ...emptyMail,
    }
  }

  const precheck = assertSmtpReadyToSend()
  if (precheck) {
    console.warn(`[mail:registration-welcome] ${precheck.safeMessage} → ${to}`)
    audit(auditActions.failed, {
      errorCode: precheck.errorCode,
      safeMessage: precheck.safeMessage,
      smtpResponse: precheck.smtpResponse,
      ...emptyMail,
    })
    return {
      sent: false,
      stubbed: false,
      error: precheck.safeMessage,
      errorCode: precheck.errorCode,
      safeMessage: precheck.safeMessage,
      ...emptyMail,
    }
  }

  try {
    const sendResult: SendMailResult = await sendViaSmtp({ to, subject, html, text })
    const accepted = sendResult.accepted
    const rejected = sendResult.rejected

    if (accepted.length === 0 || rejected.length > 0) {
      const safeMessage =
        rejected.length > 0
          ? 'Empfänger wurde vom SMTP-Server abgelehnt.'
          : 'SMTP hat die Nachricht nicht akzeptiert.'
      audit(auditActions.failed, {
        errorCode: 'smtp_recipient_rejected',
        safeMessage,
        messageId: sendResult.messageId,
        accepted,
        rejected,
        smtpResponse: sendResult.response,
      })
      return {
        sent: false,
        stubbed: false,
        error: safeMessage,
        errorCode: 'smtp_recipient_rejected',
        safeMessage,
        messageId: sendResult.messageId,
        accepted,
        rejected,
      }
    }

    console.info(
      `[mail:registration-welcome] Gesendet → ${to} messageId=${sendResult.messageId ?? '—'} accepted=${accepted.join(',')}`,
    )
    audit(auditActions.sent, {
      messageId: sendResult.messageId,
      accepted,
      rejected,
      smtpResponse: sendResult.response,
    })
    return {
      sent: true,
      stubbed: false,
      messageId: sendResult.messageId,
      accepted,
      rejected,
    }
  } catch (err) {
    const details = smtpErrorDetails(err)
    const classified = classifySmtpError(err)
    console.error(`[mail:registration-welcome] Fehler → ${to}:`, details.safeMessage)
    audit(auditActions.failed, {
      errorCode: details.errorCode,
      safeMessage: details.safeMessage,
      smtpResponse: classified.smtpResponse,
      responseCode: details.responseCode,
      ...emptyMail,
    })
    return {
      sent: false,
      stubbed: false,
      error: details.safeMessage,
      errorCode: details.errorCode,
      safeMessage: details.safeMessage,
      responseCode: details.responseCode,
      ...emptyMail,
    }
  }
}

/**
 * Sendet die Willkommens-E-Mail nach Registrierung.
 */
export async function sendRegistrationWelcomeEmail(
  input: SendRegistrationWelcomeEmailInput,
): Promise<SendRegistrationWelcomeEmailResult> {
  const result = await deliverWelcomeEmail(input, REGISTRATION_AUDIT)
  return {
    sent: result.sent,
    stubbed: result.stubbed,
    error: result.error,
    errorCode: result.errorCode,
  }
}
