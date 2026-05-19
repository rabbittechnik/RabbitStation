import { getSmtpConfigSnapshot, isSmtpConfigured } from './smtpConfig.js'

export type ClassifiedSmtpError = {
  errorCode: string
  safeMessage: string
  smtpResponse?: string
  hint?: string
}

type NodemailerLikeError = {
  code?: string
  message?: string
  response?: string
  responseCode?: number
  command?: string
}

function trimResponse(raw?: string): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined
  const t = raw.replace(/\r/g, '').trim()
  if (!t) return undefined
  return t.length > 500 ? `${t.slice(0, 500)}…` : t
}

/** Mappt Nodemailer-/SMTP-Fehler auf sichere Kundentexte (ohne Secrets). */
export function classifySmtpError(err: unknown): ClassifiedSmtpError {
  const snap = getSmtpConfigSnapshot()

  if (!snap.smtpConfigured) {
    return {
      errorCode: 'smtp_not_configured',
      safeMessage: 'SMTP ist nicht konfiguriert (SMTP_HOST fehlt).',
      hint: 'Bitte SMTP_HOST, SMTP_USER und SMTP_PASS in Railway setzen.',
    }
  }
  if (snap.smtpUserMissing) {
    return {
      errorCode: 'smtp_user_missing',
      safeMessage: 'SMTP_USER fehlt.',
      hint: 'SMTP_USER muss gesetzt sein (z. B. info.neonlink@gmail.com).',
    }
  }
  if (snap.smtpPassMissing) {
    return {
      errorCode: 'smtp_pass_missing',
      safeMessage: 'SMTP_PASS fehlt.',
      hint: 'Bitte SMTP_PASS / Gmail-App-Passwort prüfen.',
    }
  }
  if (snap.fromAddressMismatch) {
    return {
      errorCode: 'mail_from_mismatch',
      safeMessage: 'MAIL_FROM_ADDRESS stimmt nicht mit SMTP_USER überein.',
      hint: 'MAIL_FROM_ADDRESS und SMTP_USER müssen identisch sein (Gmail).',
    }
  }

  const e = (err && typeof err === 'object' ? err : {}) as NodemailerLikeError
  const response = trimResponse(e.response)
  const code = (e.code ?? '').toUpperCase()
  const msg = (e.message ?? '').toLowerCase()

  if (code === 'EAUTH' || msg.includes('authentication') || msg.includes('invalid login')) {
    return {
      errorCode: 'smtp_auth_failed',
      safeMessage: 'SMTP Authentifizierung fehlgeschlagen (Gmail App-Passwort ungültig?).',
      smtpResponse: response,
      hint: 'Bitte SMTP_PASS / Gmail-App-Passwort prüfen.',
    }
  }
  if (code === 'ETIMEDOUT' || code === 'ESOCKET' || msg.includes('timeout')) {
    return {
      errorCode: 'smtp_timeout',
      safeMessage: 'Zeitüberschreitung bei der SMTP-Verbindung.',
      smtpResponse: response,
      hint: `Verbindung zu ${snap.smtpHost ?? 'SMTP-Server'} prüfen (Port ${snap.smtpPort ?? '?'}).`,
    }
  }
  if (code === 'ECONNECTION' || code === 'ENOTFOUND' || msg.includes('connect')) {
    return {
      errorCode: 'smtp_connection_failed',
      safeMessage: `Verbindung zu ${snap.smtpHost ?? 'SMTP-Server'} fehlgeschlagen.`,
      smtpResponse: response,
      hint: 'SMTP_HOST, SMTP_PORT und SMTP_SECURE prüfen.',
    }
  }
  if (msg.includes('rejected') || (response && /5\d{2}/.test(response))) {
    return {
      errorCode: 'smtp_recipient_rejected',
      safeMessage: 'Empfänger wurde vom SMTP-Server abgelehnt.',
      smtpResponse: response,
      hint: 'Empfänger-Adresse und Absender (MAIL_FROM_ADDRESS) prüfen.',
    }
  }

  return {
    errorCode: code ? code.toLowerCase() : 'smtp_send_failed',
    safeMessage: e.message?.slice(0, 240) || 'E-Mail konnte nicht gesendet werden.',
    smtpResponse: response,
    hint: 'Bitte SMTP_PASS / Gmail-App-Passwort prüfen.',
  }
}

export function assertSmtpReadyToSend(): ClassifiedSmtpError | null {
  if (!isSmtpConfigured()) {
    return classifySmtpError(new Error('SMTP nicht konfiguriert'))
  }
  const snap = getSmtpConfigSnapshot()
  if (snap.smtpUserMissing) return classifySmtpError({ code: 'smtp_user_missing' })
  if (snap.smtpPassMissing) return classifySmtpError({ code: 'smtp_pass_missing' })
  if (snap.fromAddressMismatch) return classifySmtpError({ code: 'mail_from_mismatch' })
  return null
}
