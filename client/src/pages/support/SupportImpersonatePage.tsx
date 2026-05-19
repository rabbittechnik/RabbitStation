import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { API_BASE, setAdminToken } from '../../services/api'

export function SupportImpersonatePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = params.get('token')?.trim()
    if (!token) {
      setError('Support-Link ungültig oder abgelaufen.')
      return
    }

    void (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/support/impersonate?token=${encodeURIComponent(token)}`,
          { headers: { Accept: 'application/json' } },
        )
        const json = (await res.json()) as {
          ok: boolean
          data?: { token: string }
          error?: string
        }
        if (!res.ok || !json.ok || !json.data?.token) {
          setError(json.error ?? 'Support-Link ungültig oder abgelaufen.')
          return
        }
        setAdminToken(json.data.token, false)
        navigate('/dashboard', { replace: true })
      } catch {
        setError('Support-Link ungültig oder abgelaufen.')
      }
    })()
  }, [params, navigate])

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--bg-main)] p-6 text-center">
      {error ?
        <div className="max-w-md rounded-xl border border-red-500/40 bg-red-950/40 p-6">
          <h1 className="text-lg font-semibold text-red-200">Support-Zugriff</h1>
          <p className="mt-2 text-sm text-red-100">{error}</p>
        </div>
      : <p className="text-sm text-slate-400">Support-Zugriff wird vorbereitet…</p>}
    </div>
  )
}
