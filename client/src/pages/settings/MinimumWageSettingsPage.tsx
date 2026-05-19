import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useStation } from '../../context/station-context'
import { useAuth } from '../../context/auth-context'
import { apiGet, apiSend } from '../../services/api'
import { formatApiError } from '../../lib/apiErrors'

type RateRow = {
  id: string
  valid_from: string
  hourly_rate: number
  note: string | null
}

function formatEuroDe(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

export function MinimumWageSettingsPage() {
  const { hasPermission } = useStation()
  const { user } = useAuth()
  const canView = useMemo(
    () => Boolean(user?.globalAdmin || hasPermission('payroll.view') || hasPermission('settings.view')),
    [user?.globalAdmin, hasPermission],
  )
  const canEdit = useMemo(
    () => Boolean(user?.globalAdmin || hasPermission('settings.edit')),
    [user?.globalAdmin, hasPermission],
  )

  const [items, setItems] = useState<RateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validFrom, setValidFrom] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    if (!canView) return
    setLoading(true)
    setError(null)
    const res = await apiGet<{ items: RateRow[] }>('/minimum-wage-rates')
    if (!res.ok) {
      setError(formatApiError(res))
      setItems([])
    } else {
      setItems(res.data.items)
    }
    setLoading(false)
  }, [canView])

  useEffect(() => {
    void load()
  }, [load])

  const addRow = async () => {
    if (!canEdit) return
    const hr = Number(String(hourlyRate).replace(',', '.'))
    if (!validFrom.trim()) {
      setError('Gültig-ab-Datum erforderlich')
      return
    }
    if (!Number.isFinite(hr) || hr <= 0) {
      setError('Stundenlohn ungültig')
      return
    }
    setLoading(true)
    setError(null)
    const res = await apiSend<RateRow>('POST', '/minimum-wage-rates', {
      validFrom: validFrom.trim(),
      hourlyRate: hr,
      note: note.trim() || null,
    })
    if (!res.ok) setError(formatApiError(res))
    else {
      setValidFrom('')
      setHourlyRate('')
      setNote('')
      await load()
    }
    setLoading(false)
  }

  const del = async (id: string) => {
    if (!canEdit) return
    if (!window.confirm('Diesen Mindestlohn-Eintrag wirklich löschen?')) return
    setLoading(true)
    const res = await apiSend<{ ok: boolean }>('DELETE', `/minimum-wage-rates/${id}`)
    if (!res.ok) setError(formatApiError(res))
    else await load()
    setLoading(false)
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-xl font-semibold text-[var(--text-main)]">Mindestlohn</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Keine Berechtigung. Erforderlich: payroll.view oder settings.view.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 pb-16">
      <PageHeader
        title="Mindestlohn"
        description="Gesetzlicher Mindestlohn Deutschland und zentrale Stundenlohn-Tabelle für die Lohnprüfung"
      />

      <Card padding="md" className="border-cyan-500/25 bg-cyan-950/20">
        <h2 className="text-sm font-semibold text-[var(--text-main)]">Gesetzlicher Mindestlohn Deutschland</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Der gesetzliche Mindestlohn gilt deutschlandweit. Diese Werte dienen der Prüfung und Vorbereitung der
          Lohnabrechnung.
        </p>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[var(--text-faint)]">
              <th className="py-2 pr-3">Gültig ab</th>
              <th className="py-2">Betrag</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-white/5">
              <td className="py-2 pr-3 tabular-nums">01.01.2025</td>
              <td className="py-2">{formatEuroDe(12.82)}</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="py-2 pr-3 tabular-nums">01.01.2026</td>
              <td className="py-2">{formatEuroDe(13.9)}</td>
            </tr>
            <tr>
              <td className="py-2 pr-3 tabular-nums">01.01.2027</td>
              <td className="py-2">{formatEuroDe(14.6)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-[10px] leading-relaxed text-[var(--text-faint)]">
          Hinweis: RabbitStation ersetzt keine steuerliche oder arbeitsrechtliche Beratung. Fehlende Stichtage können Sie
          unten in der Historie ergänzen.
        </p>
      </Card>

      {error ? (
        <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>
      ) : null}

      <Card padding="md" className="border-[var(--border-subtle)]">
        <h2 className="text-sm font-semibold text-[var(--text-main)]">Historie</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[var(--text-faint)]">
                <th className="py-2 pr-3">Gültig ab</th>
                <th className="py-2 pr-3">Stundenlohn</th>
                <th className="py-2 pr-3">Notiz</th>
                {canEdit ? <th className="py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-b border-white/5">
                  <td className="py-2 pr-3 tabular-nums">{r.valid_from}</td>
                  <td className="py-2 pr-3">{formatEuroDe(r.hourly_rate)}</td>
                  <td className="py-2 pr-3 text-[var(--text-muted)]">{r.note ?? '—'}</td>
                  {canEdit ? (
                    <td className="py-2 text-right">
                      <Button type="button" variant="ghost" className="text-red-200/90" onClick={() => void del(r.id)}>
                        Löschen
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--text-faint)]">
          Bearbeiten: Eintrag löschen und mit gleichem Datum neu anlegen.
        </p>
      </Card>

      {canEdit ? (
        <Card padding="md" className="border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-[var(--text-main)]">Neuer Eintrag</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Gültig ab
              <input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-[var(--text-main)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Stundenlohn (€)
              <input
                type="text"
                inputMode="decimal"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-[var(--text-main)]"
                placeholder="z. B. 14,60"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Notiz (optional)
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-[var(--text-main)]"
              />
            </label>
          </div>
          <Button type="button" className="mt-4" onClick={() => void addRow()} disabled={loading}>
            Speichern
          </Button>
        </Card>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">Nur Benutzer mit settings.edit dürfen Werte ändern.</p>
      )}

      <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
        Aktualisieren
      </Button>
    </div>
  )
}
