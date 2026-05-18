import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE } from '../../services/api'
import { fetchWithTimeout } from '../../lib/fetchWithTimeout'

export function TabletPairPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const res = await fetchWithTimeout(`${API_BASE}/tablet/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const json = (await res.json()) as { ok: boolean; data?: { tabletToken: string }; error?: string }
      if (!res.ok || !json.ok || !json.data?.tabletToken) {
        throw new Error(json.error ?? 'Pairing fehlgeschlagen')
      }
      navigate(`/tablet/${encodeURIComponent(json.data.tabletToken)}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060b14] px-4 text-[#e8f0ff]">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border border-cyan-500/30 bg-[#0c1424] p-8">
        <h1 className="text-xl font-semibold text-cyan-100">Tablet koppeln</h1>
        <p className="mt-2 text-sm text-[#a8b8d8]">Pairing-Code von der Stationsleitung eingeben</p>
        <input
          className="mt-6 w-full rounded-lg border border-cyan-500/30 bg-[#060b14] px-4 py-3 text-center text-2xl tracking-widest uppercase"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="CODE"
          maxLength={8}
          autoComplete="off"
        />
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          className="mt-6 w-full rounded-lg bg-cyan-500 py-3 font-medium text-[#060b14]"
        >
          Verbinden
        </button>
      </form>
    </div>
  )
}
