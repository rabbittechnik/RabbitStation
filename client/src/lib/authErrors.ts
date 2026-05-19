import { isAbortError } from './fetchWithTimeout'

/** Nutzerfreundliche Login-Fehlermeldung; technische Details nur in der Konsole. */
export function loginErrorMessage(err: unknown, res?: Response): string {
  if (isAbortError(err)) {
    return 'Die RabbitStation-API antwortet nicht rechtzeitig. Bitte später erneut versuchen.'
  }

  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase()
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed')) {
      return 'Verbindung zur Haupt-App konnte nicht hergestellt werden.'
    }
  }

  if (res) {
    if (res.status === 401) return 'Benutzername oder Passwort ist falsch.'
    if (res.status === 403) return 'Dieser Zugang ist nicht berechtigt.'
    if (res.status >= 500) return 'Serverfehler beim Login. Bitte Support kontaktieren.'
    if (res.status === 503) {
      return 'Die RabbitStation-API ist aktuell nicht erreichbar. Bitte später erneut versuchen.'
    }
  }

  if (err instanceof Error && err.message && !err.message.toLowerCase().includes('failed to fetch')) {
    return err.message
  }

  return 'Die RabbitStation-API ist aktuell nicht erreichbar. Bitte später erneut versuchen.'
}
