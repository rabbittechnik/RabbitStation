import { Zap } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { useAuth } from '../../context/auth-context'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, token } = useAuth()
  const from = (location.state as { from?: string } | null)?.from

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (token) {
    return <Navigate to={from && from !== '/login' ? from : '/dashboard'} replace />
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Bitte Benutzername und Passwort eingeben.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await login(username.trim(), password, remember)
      navigate(from && from !== '/login' ? from : '/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.')
    }
    setSubmitting(false)
  }

  return (
    <Card padding="lg" className="border-[var(--border-strong)] shadow-[var(--shadow-card)]">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] bg-gradient-to-br from-cyan-400/25 to-fuchsia-500/20 ring-1 ring-cyan-400/45">
          <Zap className="h-7 w-7 text-cyan-200" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">RabbitStation Pro</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Anmeldung für Betreiber und Team</p>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <Input
          label="Benutzername"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Input
          label="Passwort"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error ? (
          <p className="rounded-[var(--radius-sm)] border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <label className="flex cursor-pointer items-center gap-2 text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="rounded border-[var(--border-strong)] bg-[var(--bg-elevated)] text-cyan-500 focus:ring-cyan-400/30"
            />
            Eingeloggt bleiben
          </label>
          <Link
            to="/login"
            className="text-cyan-300 hover:underline"
            onClick={(e) => {
              e.preventDefault()
              alert('Passwort zurücksetzen folgt später.')
            }}
          >
            Passwort vergessen?
          </Link>
        </div>

        <Button type="submit" className="w-full py-2.5" disabled={submitting}>
          {submitting ? 'Wird angemeldet…' : 'Anmelden'}
        </Button>

        <p className="text-center text-xs text-[var(--text-faint)]">
          Zugang nur für autorisierte Stationsleitung.
        </p>
      </form>
      <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
        Noch kein Konto?{' '}
        <Link to="/registrieren" className="text-cyan-400 hover:underline">
          7 Tage kostenlos testen
        </Link>
      </p>
    </Card>
  )
}
