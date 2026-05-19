/** Bekannte API-Fehlercodes (Server / Plan-Gating). */

export const API_ERROR_CODES = [
  'feature_not_available',
  'plan_limit_reached',
  'unauthorized',
  'forbidden',
  'trial_expired',
  'subscription_required',
  'not_found',
  'server_error',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

const API_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  feature_not_available: 'Diese Funktion ist in Ihrem aktuellen Plan nicht enthalten.',
  plan_limit_reached: 'Das Limit Ihres aktuellen Plans wurde erreicht.',
  unauthorized: 'Sie sind nicht angemeldet oder Ihre Sitzung ist abgelaufen.',
  forbidden: 'Sie haben keine Berechtigung für diese Aktion.',
  trial_expired: 'Ihre Testphase ist abgelaufen. Bitte wählen Sie ein Abo, um weiterzuarbeiten.',
  subscription_required: 'Für diese Funktion ist ein aktives Abo erforderlich.',
  not_found: 'Die angeforderten Daten wurden nicht gefunden.',
  server_error: 'Es ist ein technischer Fehler aufgetreten. Bitte versuchen Sie es später erneut.',
}

const CODE_SET = new Set<string>(API_ERROR_CODES)

export function isApiErrorCode(value: string | undefined | null): value is ApiErrorCode {
  return Boolean(value && CODE_SET.has(value))
}

export function isPlanErrorCode(value: string | undefined | null): boolean {
  return value === 'feature_not_available' || value === 'plan_limit_reached' || value === 'subscription_required'
}

/** Rohen Code oder Fehlertext in kundenfreundliche Meldung übersetzen. */
export function formatApiError(
  input: string | { error?: string; message?: string; code?: string } | null | undefined,
): string {
  if (!input) return 'Es ist ein Fehler aufgetreten.'
  if (typeof input === 'string') {
    if (isApiErrorCode(input)) return API_ERROR_MESSAGES[input]
    if (/^[a-z][a-z0-9_]+$/.test(input)) {
      return 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.'
    }
    return input
  }
  const code = input.code ?? (isApiErrorCode(input.error) ? input.error : undefined)
  const serverMsg = input.message?.trim()
  if (code && isApiErrorCode(code)) {
    if (serverMsg && serverMsg !== code && !CODE_SET.has(serverMsg)) return serverMsg
    return API_ERROR_MESSAGES[code]
  }
  if (input.error && isApiErrorCode(input.error)) return API_ERROR_MESSAGES[input.error]
  if (serverMsg) return serverMsg
  if (input.error) return formatApiError(input.error)
  return 'Es ist ein Fehler aufgetreten.'
}

export type NormalizedApiFailure = {
  /** Anzeigetext für Kunden */
  error: string
  /** Technischer Code (nur Konsole / Debug) */
  code?: string
}

/** API-Antwort mit ok:false in Anzeige- + Debug-Felder aufteilen. */
export function normalizeApiFailure(body: {
  error?: string
  message?: string
  code?: string
}): NormalizedApiFailure {
  const raw = (body.error ?? body.code ?? '').trim()
  const serverMessage = body.message?.trim()

  if (isApiErrorCode(raw)) {
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      console.debug('[api-error]', raw, serverMessage ?? '')
    }
    const display =
      serverMessage && serverMessage !== raw && !CODE_SET.has(serverMessage)
        ? serverMessage
        : API_ERROR_MESSAGES[raw]
    return { error: display, code: raw }
  }

  if (/^[a-z][a-z0-9_]+$/.test(raw)) {
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      console.debug('[api-error]', raw, serverMessage ?? '')
    }
    return {
      error: serverMessage || 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.',
      code: raw,
    }
  }

  return {
    error: serverMessage || raw || 'Es ist ein Fehler aufgetreten.',
    code: undefined,
  }
}
