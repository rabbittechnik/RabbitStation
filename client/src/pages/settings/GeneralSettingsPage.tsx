import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useStation } from '../../context/station-context'
import { useAuth } from '../../context/auth-context'
import { apiGet, apiSend } from '../../services/api'

type StationRow = Record<string, unknown>

export function GeneralSettingsPage() {
  const { stationId, hasPermission } = useStation()
  const { user } = useAuth()
  const canView = Boolean(user?.globalAdmin || hasPermission('station.profile.edit') || hasPermission('settings.view'))
  const canEdit = Boolean(user?.globalAdmin || hasPermission('station.profile.edit'))

  const [row, setRow] = useState<StationRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    if (!stationId || !canView) return
    setLoading(true)
    setError(null)
    const res = await apiGet<StationRow>(`/stations/${encodeURIComponent(stationId)}`)
    if (!res.ok) {
      setError(res.error)
      setRow(null)
    } else setRow(res.data)
    setLoading(false)
  }, [stationId, canView])

  useEffect(() => {
    void load()
  }, [load])

  const setField = (key: string, val: string) => {
    setRow((r) => (r ? { ...r, [key]: val } : r))
    setSaved(false)
  }

  const save = async () => {
    if (!canEdit || !stationId || !row) return
    setLoading(true)
    setError(null)
    const res = await apiSend<StationRow>('PUT', `/stations/${encodeURIComponent(stationId)}`, {
      name: row.name,
      brand: row.brand,
      street: row.street,
      houseNumber: row.house_number,
      city: row.city,
      postalCode: row.postal_code,
      phone: row.phone,
      email: row.email,
      federalState: row.federal_state,
      timezone: row.timezone,
      fuelPriceRefreshMinutes: row.fuel_price_refresh_minutes,
      automaticBreakDeduction: Boolean(row.automatic_break_deduction),
      defaultBreakMinutes: row.default_break_minutes,
      autoClockOutEnabled: row.auto_clock_out_enabled == null || Number(row.auto_clock_out_enabled) !== 0,
      autoClockOutTime: row.auto_clock_out_time,
      tabletSettingsJson: row.tablet_settings_json,
      backshopRulesJson: row.backshop_rules_json,
      standardWorkTimesJson: row.standard_work_times_json,
    })
    if (!res.ok) setError(res.error)
    else {
      setRow(res.data)
      setSaved(true)
    }
    setLoading(false)
  }

  const title = useMemo(() => String(row?.name ?? 'Station'), [row])

  if (!canView) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-xl font-semibold text-[var(--text-main)]">Allgemein</h1>
        <p className="text-sm text-[var(--text-muted)]">Keine Berechtigung (station.profile.edit / settings.view).</p>
      </div>
    )
  }

  if (!row && !loading) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <p className="text-sm text-[var(--text-muted)]">{error ?? 'Station nicht geladen.'}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 pb-16">
      <PageHeader title="Einstellungen · Allgemein" description={`Stammdaten für: ${title}`} />
      {error ? <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}
      {saved ? <p className="text-sm text-emerald-200/90">Gespeichert.</p> : null}

      <Card padding="md" className="border-[var(--border-subtle)] space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-[var(--text-faint)]">
            Stationsname
            <input
              className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
              value={String(row?.name ?? '')}
              disabled={!canEdit}
              onChange={(e) => setField('name', e.target.value)}
            />
          </label>
          <label className="text-xs text-[var(--text-faint)]">
            Bundesland
            <input
              className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
              value={String(row?.federal_state ?? 'BW')}
              disabled={!canEdit}
              onChange={(e) => setField('federal_state', e.target.value.toUpperCase())}
            />
          </label>
          <label className="text-xs text-[var(--text-faint)] sm:col-span-2">
            Straße / Nr.
            <div className="mt-1 flex gap-2">
              <input
                className="w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
                value={String(row?.street ?? '')}
                disabled={!canEdit}
                onChange={(e) => setField('street', e.target.value)}
              />
              <input
                className="w-24 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
                value={String(row?.house_number ?? '')}
                disabled={!canEdit}
                onChange={(e) => setField('house_number', e.target.value)}
              />
            </div>
          </label>
          <label className="text-xs text-[var(--text-faint)]">
            PLZ
            <input
              className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
              value={String(row?.postal_code ?? '')}
              disabled={!canEdit}
              onChange={(e) => setField('postal_code', e.target.value)}
            />
          </label>
          <label className="text-xs text-[var(--text-faint)]">
            Ort
            <input
              className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
              value={String(row?.city ?? '')}
              disabled={!canEdit}
              onChange={(e) => setField('city', e.target.value)}
            />
          </label>
          <label className="text-xs text-[var(--text-faint)]">
            Telefon
            <input
              className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
              value={String(row?.phone ?? '')}
              disabled={!canEdit}
              onChange={(e) => setField('phone', e.target.value)}
            />
          </label>
          <label className="text-xs text-[var(--text-faint)]">
            E-Mail
            <input
              className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
              value={String(row?.email ?? '')}
              disabled={!canEdit}
              onChange={(e) => setField('email', e.target.value)}
            />
          </label>
          <label className="text-xs text-[var(--text-faint)]">
            Zeitzone
            <input
              className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
              value={String(row?.timezone ?? 'Europe/Berlin')}
              disabled={!canEdit}
              onChange={(e) => setField('timezone', e.target.value)}
            />
          </label>
          <label className="text-xs text-[var(--text-faint)]">
            Spritpreis-Refresh (Min.)
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
              value={Number(row?.fuel_price_refresh_minutes ?? 1)}
              disabled={!canEdit}
              onChange={(e) => setField('fuel_price_refresh_minutes', e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--text-faint)] sm:col-span-2">
            <input
              type="checkbox"
              checked={Boolean(row?.automatic_break_deduction)}
              disabled={!canEdit}
              onChange={(e) => setRow((r) => (r ? { ...r, automatic_break_deduction: e.target.checked ? 1 : 0 } : r))}
            />
            Automatischer Pausenabzug
          </label>
          <label className="text-xs text-[var(--text-faint)]">
            Standardpause (Minuten)
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
              value={Number(row?.default_break_minutes ?? 0)}
              disabled={!canEdit}
              onChange={(e) => setField('default_break_minutes', e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--text-faint)] sm:col-span-2">
            <input
              type="checkbox"
              checked={row?.auto_clock_out_enabled == null || Number(row?.auto_clock_out_enabled) !== 0}
              disabled={!canEdit}
              onChange={(e) =>
                setRow((r) => (r ? { ...r, auto_clock_out_enabled: e.target.checked ? 1 : 0 } : r))
              }
            />
            Automatisches Ausstempeln (Sicherheit, Europe/Berlin)
          </label>
          <label className="text-xs text-[var(--text-faint)]">
            Auto-Ausstempeln um (HH:mm)
            <input
              className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm tabular-nums"
              value={String(row?.auto_clock_out_time ?? '22:45')}
              disabled={!canEdit}
              placeholder="22:45"
              onChange={(e) => setField('auto_clock_out_time', e.target.value)}
            />
          </label>
        </div>
        <label className="block text-xs text-[var(--text-faint)]">
          Tablet-Einstellungen (JSON, optional)
          <textarea
            className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-2 font-mono text-xs"
            rows={3}
            value={String(row?.tablet_settings_json ?? '')}
            disabled={!canEdit}
            onChange={(e) => setField('tablet_settings_json', e.target.value)}
          />
        </label>
        <label className="block text-xs text-[var(--text-faint)]">
          Backshop-Regeln (JSON, optional)
          <textarea
            className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-2 font-mono text-xs"
            rows={3}
            value={String(row?.backshop_rules_json ?? '')}
            disabled={!canEdit}
            onChange={(e) => setField('backshop_rules_json', e.target.value)}
          />
        </label>
        <label className="block text-xs text-[var(--text-faint)]">
          Standard-Schichtzeiten (JSON)
          <textarea
            className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-2 font-mono text-xs"
            rows={4}
            value={String(row?.standard_work_times_json ?? '')}
            disabled={!canEdit}
            onChange={(e) => setField('standard_work_times_json', e.target.value)}
          />
        </label>
        <Card className="mt-6">
          <h3 className="text-sm font-semibold text-[var(--text-main)]">Einführung</h3>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Die geführte Tour durch die wichtigsten Bereiche der App erneut starten.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={async () => {
              await apiSend('POST', '/setup/tour-reset', {})
              window.dispatchEvent(new CustomEvent('rabbitstation-restart-tour'))
            }}
          >
            Einführung erneut starten
          </Button>
        </Card>
        {canEdit ? (
          <Button type="button" onClick={() => void save()} disabled={loading}>
            Speichern
          </Button>
        ) : null}
      </Card>
    </div>
  )
}
