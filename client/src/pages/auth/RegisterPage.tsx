import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API_BASE, setAdminToken, type ApiEnvelope } from '../../services/api'
import { fetchWithTimeout } from '../../lib/fetchWithTimeout'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'

export function RegisterPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    companyName: '',
    stationName: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    acceptTerms: false,
    acceptPrivacy: false,
  })

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(`${API_BASE}/public/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, plan: 'rabbitstation_pro' }),
      })
      const json = (await res.json()) as ApiEnvelope<{ token: string }>
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : 'Registrierung fehlgeschlagen')
      setAdminToken(json.data.token, true)
      navigate('/setup', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#060b14] px-4 py-12 text-[#e8f0ff]">
      <div className="mx-auto max-w-lg rounded-2xl border border-cyan-500/25 bg-[#0c1424] p-8 shadow-lg">
        <h1 className="text-2xl font-semibold text-cyan-100">RabbitStation Pro testen</h1>
        <p className="mt-2 text-sm text-[#a8b8d8]">7 Tage kostenlos · eigener Mandant · erste Station inklusive</p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <Input label="Firmenname" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required />
          <Input label="Stationsname" value={form.stationName} onChange={(e) => setForm({ ...form, stationName: e.target.value })} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Vorname" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            <Input label="Nachname" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
          </div>
          <Input type="email" label="E-Mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <Input type="password" label="Passwort (min. 10 Zeichen)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <Input label="Telefon optional" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={form.acceptTerms} onChange={(e) => setForm({ ...form, acceptTerms: e.target.checked })} />
            <span>AGB akzeptieren</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={form.acceptPrivacy} onChange={(e) => setForm({ ...form, acceptPrivacy: e.target.checked })} />
            <span>Datenschutz akzeptieren</span>
          </label>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Wird angelegt…' : 'Konto erstellen'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-[#7a8aa8]">
          Bereits Kunde? <Link to="/login" className="text-cyan-300">Anmelden</Link>
        </p>
      </div>
    </div>
  )
}
