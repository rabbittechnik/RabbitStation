/**
 * API-Basis-URL für fetch.
 * Production (ohne VITE_API_URL): relativer Pfad /api — gleicher Host wie das Frontend.
 * Development: localhost:3001 oder Vite-Proxy.
 */
function normalizeApiBase(raw: string): string {
  const base = raw.replace(/\/$/, '')
  if (base.endsWith('/api')) return base
  return `${base}/api`
}

export function resolveApiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
  if (fromEnv) return normalizeApiBase(fromEnv)

  if (import.meta.env.DEV) {
    return 'http://127.0.0.1:3001/api'
  }

  if (typeof window !== 'undefined') {
    return '/api'
  }

  return 'http://127.0.0.1:3001/api'
}

export const API_BASE = resolveApiBase()
