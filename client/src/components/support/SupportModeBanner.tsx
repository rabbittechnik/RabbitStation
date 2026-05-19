import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/auth-context'
import { API_BASE, clearAdminToken, getAdminToken } from '../../services/api'

function formatRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'abgelaufen'
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min} Min.`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h} Std. ${m} Min.` : `${h} Std.`
}

export function SupportModeBanner() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const support = user?.supportMode
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    if (!support?.expiresAt) return
    const tick = () => setRemaining(formatRemaining(support.expiresAt))
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [support?.expiresAt])

  const readOnly = useMemo(() => support?.accessMode === 'read_only', [support?.accessMode])

  if (!support) return null

  const endSupport = async () => {
    const token = getAdminToken()
    try {
      if (token) {
        await fetch(`${API_BASE}/support/sessions/end`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        })
      }
    } catch {
      /* ignore */
    }
    clearAdminToken()
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div
      className="sticky top-0 z-[100] border-b-2 border-orange-500 bg-gradient-to-r from-orange-700 via-red-700 to-orange-800 px-4 py-3 text-white shadow-lg"
      role="alert"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold tracking-wide">SUPPORT-MODUS AKTIV</p>
          <p className="mt-1 text-xs text-orange-100">
            Sie arbeiten im Tenant: <strong>{support.tenantName}</strong>
            {' · '}
            Grund: {support.reason}
            {' · '}
            Sitzung endet in: <strong>{remaining}</strong>
            {readOnly ?
              <span className="ml-2 rounded bg-black/20 px-1.5 py-0.5">Nur Lesen</span>
            : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void endSupport()}
          className="rounded-lg border border-white/40 bg-black/20 px-4 py-2 text-xs font-semibold hover:bg-black/30"
        >
          Support beenden
        </button>
      </div>
    </div>
  )
}
