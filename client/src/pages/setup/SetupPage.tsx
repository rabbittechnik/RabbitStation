import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiGet, apiSend } from '../../services/api'
import { useAuth } from '../../context/auth-context'
import { Button } from '../../components/ui/Button'

type SetupState = {
  setupCompleted: boolean
  stationId: string | null
  steps: Record<string, boolean>
}

export function SetupPage() {
  const { token, refreshMe } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<SetupState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) return
    void apiGet<SetupState>('/setup/state').then((r) => {
      if (r.ok) setState(r.data)
    })
  }, [token])

  if (!token) {
    return (
      <p className="p-8 text-center text-[#a8b8d8]">
        <Link to="/login" className="text-cyan-300">
          Bitte anmelden
        </Link>
      </p>
    )
  }

  const runPresets = async () => {
    if (!state?.stationId) return
    setBusy(true)
    await apiSend('POST', '/setup/shift-presets', { stationId: state.stationId })
    const r = await apiGet<SetupState>('/setup/state')
    if (r.ok) setState(r.data)
    setBusy(false)
  }

  const finish = async () => {
    setBusy(true)
    await apiSend('POST', '/setup/complete', {})
    await refreshMe()
    navigate('/dashboard', { replace: true })
  }

  const steps = [
    { key: 'station', label: 'Stationsdaten prüfen' },
    { key: 'shiftModel', label: 'Schichtmodell einrichten' },
    { key: 'surcharges', label: 'Zuschlagsregeln / Feiertage' },
    { key: 'employees', label: 'Mitarbeiter anlegen' },
    { key: 'tablet', label: 'Tablet koppeln' },
  ]

  return (
    <div className="min-h-screen bg-[#060b14] px-4 py-12 text-[#e8f0ff]">
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-semibold text-cyan-100">Setup-Assistent</h1>
        <p className="mt-2 text-sm text-[#a8b8d8]">RabbitStation Pro für Ihren Betrieb einrichten</p>
        <ul className="mt-8 space-y-3">
          {steps.map((s) => (
            <li
              key={s.key}
              className={`rounded-lg border px-4 py-3 ${state?.steps[s.key] ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-cyan-500/20'}`}
            >
              {state?.steps[s.key] ? '✓ ' : '○ '}
              {s.label}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="button" disabled={busy || !state?.stationId} onClick={() => void runPresets()}>
            Schicht-Vorlagen anwenden
          </Button>
          <Link to="/account/devices" className="rounded-lg border border-cyan-500/40 px-4 py-2 text-sm text-cyan-200">
            Tablet koppeln
          </Link>
          <Button type="button" disabled={busy} onClick={() => void finish()}>
            Setup abschließen
          </Button>
        </div>
      </div>
    </div>
  )
}
