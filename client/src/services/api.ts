/** Zentraler REST-Client (Phase 8/9). Production: /api (gleicher Host); Dev: VITE_API_URL oder 127.0.0.1:3001. */

import type { ScheduleAssistantApplyResult, ScheduleAssistantGenerateResult } from '../types/scheduleAssistant'
import { getEmployeeAppDeviceHeaders } from '../pages/employee-app/employeeAppStorage'
import { DEFAULT_FETCH_TIMEOUT_MS, fetchWithTimeout, isAbortError } from '../lib/fetchWithTimeout'
import { API_BASE } from '../lib/apiBase'

export { DEFAULT_FETCH_TIMEOUT_MS, API_BASE }

const TOKEN_LOCAL = 'rabbit_technik_admin_token'
const TOKEN_LOCAL_LEGACY = 'neonshift_admin_token'
const TOKEN_SESSION = 'rabbit_technik_admin_token_session'
const TOKEN_SESSION_LEGACY = 'neonshift_admin_token_session'

export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; details?: Record<string, unknown> }

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null
  const fromLs = localStorage.getItem(TOKEN_LOCAL) ?? localStorage.getItem(TOKEN_LOCAL_LEGACY)
  if (fromLs) {
    if (!localStorage.getItem(TOKEN_LOCAL) && localStorage.getItem(TOKEN_LOCAL_LEGACY)) {
      localStorage.setItem(TOKEN_LOCAL, fromLs)
      localStorage.removeItem(TOKEN_LOCAL_LEGACY)
    }
    return fromLs
  }
  const fromSs = sessionStorage.getItem(TOKEN_SESSION) ?? sessionStorage.getItem(TOKEN_SESSION_LEGACY)
  if (fromSs) {
    if (!sessionStorage.getItem(TOKEN_SESSION) && sessionStorage.getItem(TOKEN_SESSION_LEGACY)) {
      sessionStorage.setItem(TOKEN_SESSION, fromSs)
      sessionStorage.removeItem(TOKEN_SESSION_LEGACY)
    }
    return fromSs
  }
  return null
}

export function setAdminToken(token: string, rememberMe: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_LOCAL)
  localStorage.removeItem(TOKEN_LOCAL_LEGACY)
  sessionStorage.removeItem(TOKEN_SESSION)
  sessionStorage.removeItem(TOKEN_SESSION_LEGACY)
  if (rememberMe) localStorage.setItem(TOKEN_LOCAL, token)
  else sessionStorage.setItem(TOKEN_SESSION, token)
}

export function clearAdminToken(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_LOCAL)
  localStorage.removeItem(TOKEN_LOCAL_LEGACY)
  sessionStorage.removeItem(TOKEN_SESSION)
  sessionStorage.removeItem(TOKEN_SESSION_LEGACY)
}

function authHeaders(): HeadersInit {
  const t = getAdminToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

function onUnauthorized(): void {
  clearAdminToken()
  if (typeof window === 'undefined') return
  const p = window.location.pathname
  const onPath = (prefix: string) => p === prefix || p.startsWith(`${prefix}/`)
  if (onPath('/employee-app') || onPath('/employee-access') || onPath('/employee')) return
  if (onPath('/tablet') || onPath('/station-terminal')) return
  if (onPath('/app')) return
  if (!p.startsWith('/login')) window.location.assign('/login')
}

function buildQuery(params?: Record<string, string | undefined>): string {
  if (!params) return ''
  const e = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') e.set(k, v)
  }
  const s = e.toString()
  return s ? `?${s}` : ''
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | undefined>,
  init?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<ApiEnvelope<T>> {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}${buildQuery(params)}`
  let res: Response
  try {
    res = await fetchWithTimeout(url, {
      headers: { ...authHeaders() },
      signal: init?.signal,
      timeoutMs: init?.timeoutMs,
    })
  } catch (e) {
    if (isAbortError(e)) return { ok: false, error: 'Zeitüberschreitung — Server antwortet nicht.' }
    return { ok: false, error: e instanceof Error ? e.message : 'Netzwerkfehler' }
  }
  if (res.status === 401) onUnauthorized()
  const json = (await res.json()) as ApiEnvelope<T> & { result?: string; employee?: unknown; timeEntry?: unknown }
  if (!res.ok && json && typeof json === 'object' && 'ok' in json && json.ok === false) {
    return json as ApiEnvelope<T>
  }
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` }
  }
  return json as ApiEnvelope<T>
}

export async function apiSend<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  params?: Record<string, string | undefined>,
  init?: { timeoutMs?: number },
): Promise<ApiEnvelope<T>> {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}${buildQuery(params)}`
  let res: Response
  try {
    res = await fetchWithTimeout(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: method === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
      timeoutMs: init?.timeoutMs,
    })
  } catch (e) {
    if (isAbortError(e)) return { ok: false, error: 'Zeitüberschreitung — Server antwortet nicht.' }
    return { ok: false, error: e instanceof Error ? e.message : 'Netzwerkfehler' }
  }
  if (res.status === 401) onUnauthorized()
  const json = (await res.json()) as ApiEnvelope<T>
  if (!res.ok && json && typeof json === 'object' && 'ok' in json && json.ok === false) {
    return json as ApiEnvelope<T>
  }
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` }
  }
  return json as ApiEnvelope<T>
}

/** Authentifizierter GET als Blob (Vorschau/Druck). */
export async function apiGetBlob(
  path: string,
  params?: Record<string, string | undefined>,
): Promise<{ ok: true; blob: Blob } | { ok: false; error: string }> {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}${buildQuery(params)}`
  const res = await fetch(url, { headers: { ...authHeaders() } })
  if (res.status === 401) onUnauthorized()
  if (!res.ok) {
    try {
      const j = (await res.json()) as { error?: string }
      return { ok: false, error: j.error ?? `HTTP ${res.status}` }
    } catch {
      return { ok: false, error: `HTTP ${res.status}` }
    }
  }
  return { ok: true, blob: await res.blob() }
}

/** Multipart-Upload (z. B. Dokumente); kein Content-Type setzen (Boundary). */
export async function apiUploadMultipart<T>(
  path: string,
  form: FormData,
  params?: Record<string, string | undefined>,
): Promise<ApiEnvelope<T>> {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}${buildQuery(params)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: form,
  })
  if (res.status === 401) onUnauthorized()
  const json = (await res.json()) as ApiEnvelope<T>
  if (!res.ok && json && typeof json === 'object' && 'ok' in json && json.ok === false) {
    return json as ApiEnvelope<T>
  }
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` }
  }
  return json as ApiEnvelope<T>
}

export async function apiUploadMultipartMethod<T>(
  method: 'PUT' | 'POST',
  path: string,
  form: FormData,
  params?: Record<string, string | undefined>,
): Promise<ApiEnvelope<T>> {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}${buildQuery(params)}`
  const res = await fetch(url, {
    method,
    headers: { ...authHeaders() },
    body: form,
  })
  if (res.status === 401) onUnauthorized()
  const json = (await res.json()) as ApiEnvelope<T>
  if (!res.ok && json && typeof json === 'object' && 'ok' in json && json.ok === false) {
    return json as ApiEnvelope<T>
  }
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` }
  }
  return json as ApiEnvelope<T>
}

export async function scheduleAssistantGenerate(
  body: unknown,
): Promise<ApiEnvelope<ScheduleAssistantGenerateResult>> {
  return apiSend('POST', '/schedule-assistant/generate', body)
}

export async function scheduleAssistantApply(body: unknown): Promise<ApiEnvelope<ScheduleAssistantApplyResult>> {
  return apiSend('POST', '/schedule-assistant/apply', body)
}

/** Öffentliche Mitarbeiter-Zugangs-API (nur Token, kein Admin-Bearer). */
export type EmployeeAccessFetchMeta = { httpStatus: number }

export async function employeeAccessGet<T>(
  token: string,
): Promise<ApiEnvelope<T> & EmployeeAccessFetchMeta> {
  const url = `${API_BASE}/employee-access/${encodeURIComponent(token)}`
  const res = await fetch(url, { headers: { ...getEmployeeAppDeviceHeaders() } })
  const httpStatus = res.status
  const json = (await res.json()) as ApiEnvelope<T>
  if (!res.ok && json && typeof json === 'object' && 'ok' in json && json.ok === false) {
    return { ...(json as ApiEnvelope<T>), httpStatus }
  }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, httpStatus }
  return { ...(json as ApiEnvelope<T> & { ok: true }), httpStatus }
}

export async function employeeAccessGetWeekSchedule<T>(
  token: string,
  weekStart?: string,
): Promise<ApiEnvelope<T> & EmployeeAccessFetchMeta> {
  const q = weekStart ? `?weekStart=${encodeURIComponent(weekStart)}` : ''
  const url = `${API_BASE}/employee-access/${encodeURIComponent(token)}/week-schedule${q}`
  const res = await fetch(url, { headers: { ...getEmployeeAppDeviceHeaders() } })
  const httpStatus = res.status
  const json = (await res.json()) as ApiEnvelope<T>
  if (!res.ok && json && typeof json === 'object' && 'ok' in json && json.ok === false) {
    return { ...(json as ApiEnvelope<T>), httpStatus }
  }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, httpStatus }
  return { ...(json as ApiEnvelope<T> & { ok: true }), httpStatus }
}

/** GET /employee-access/:token/:subPath?query (nur Token). */
export async function employeeAccessGetQuery<T>(
  token: string,
  subPath: string,
  query?: Record<string, string>,
): Promise<ApiEnvelope<T> & EmployeeAccessFetchMeta> {
  const params = new URLSearchParams()
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== '') params.set(k, v)
    }
  }
  const qs = params.toString() ? `?${params}` : ''
  const url = `${API_BASE}/employee-access/${encodeURIComponent(token)}/${subPath.replace(/^\//, '')}${qs}`
  const res = await fetch(url, { headers: { ...getEmployeeAppDeviceHeaders() } })
  const httpStatus = res.status
  const json = (await res.json()) as ApiEnvelope<T>
  if (!res.ok && json && typeof json === 'object' && 'ok' in json && json.ok === false) {
    return { ...(json as ApiEnvelope<T>), httpStatus }
  }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, httpStatus }
  return { ...(json as ApiEnvelope<T> & { ok: true }), httpStatus }
}

export async function employeeAccessGetTasks<T>(
  token: string,
): Promise<ApiEnvelope<T> & EmployeeAccessFetchMeta> {
  const url = `${API_BASE}/employee-access/${encodeURIComponent(token)}/tasks`
  const res = await fetch(url, { headers: { ...getEmployeeAppDeviceHeaders() } })
  const httpStatus = res.status
  const json = (await res.json()) as ApiEnvelope<T>
  if (!res.ok && json && typeof json === 'object' && 'ok' in json && json.ok === false) {
    return { ...(json as ApiEnvelope<T>), httpStatus }
  }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, httpStatus }
  return { ...(json as ApiEnvelope<T> & { ok: true }), httpStatus }
}

/** Öffentliche Mitarbeiter-Zugangs-POST (Antwort kann ok:false bei HTTP 200 enthalten). */
export async function employeeAccessPost(
  token: string,
  subPath: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const url = `${API_BASE}/employee-access/${encodeURIComponent(token)}/${subPath.replace(/^\//, '')}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getEmployeeAppDeviceHeaders() },
    body: JSON.stringify(body ?? {}),
  })
  const json = (await res.json()) as Record<string, unknown>
  if (res.status === 403) {
    return {
      ok: false,
      result: 'invalid_token',
      message: typeof json.error === 'string' ? json.error : 'Zugang verweigert',
    }
  }
  if (!res.ok && json.ok !== false) {
    return { ok: false, error: `HTTP ${res.status}` }
  }
  return json
}

/** Öffentliche Mitarbeiter-Zugangs-POST mit typisierter ApiEnvelope-Antwort. */
export async function employeeAccessPostJson<T>(
  token: string,
  subPath: string,
  body?: unknown,
): Promise<ApiEnvelope<T> & EmployeeAccessFetchMeta> {
  const url = `${API_BASE}/employee-access/${encodeURIComponent(token)}/${subPath.replace(/^\//, '')}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getEmployeeAppDeviceHeaders() },
    body: JSON.stringify(body ?? {}),
  })
  const httpStatus = res.status
  const json = (await res.json()) as ApiEnvelope<T>
  if (res.status === 403 && json && typeof json === 'object' && 'ok' in json && json.ok === false) {
    return { ...(json as ApiEnvelope<T>), httpStatus }
  }
  if (!res.ok && json && typeof json === 'object' && 'ok' in json && json.ok === false) {
    return { ...(json as ApiEnvelope<T>), httpStatus }
  }
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}`, httpStatus }
  }
  return { ...(json as ApiEnvelope<T> & { ok: true }), httpStatus }
}

/** GET Lohnabrechnung-PDF über Mitarbeiter-Zugangstoken (kein Admin-Bearer). */
export async function employeeAccessGetPayrollBlob(
  token: string,
  documentId: string,
  opts?: { inline?: boolean },
): Promise<{ ok: true; blob: Blob } | { ok: false; error: string; httpStatus?: number }> {
  const q = opts?.inline ? '?inline=1' : ''
  const url = `${API_BASE}/employee-access/${encodeURIComponent(token)}/payroll-documents/${encodeURIComponent(documentId)}/download${q}`
  const res = await fetch(url, { headers: { ...getEmployeeAppDeviceHeaders() } })
  const httpStatus = res.status
  if (!res.ok) {
    try {
      const j = (await res.json()) as { error?: string }
      return { ok: false, error: j.error ?? `HTTP ${res.status}`, httpStatus }
    } catch {
      return { ok: false, error: `HTTP ${res.status}`, httpStatus }
    }
  }
  return { ok: true, blob: await res.blob() }
}
