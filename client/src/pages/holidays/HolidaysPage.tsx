import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { HolidayEditModal } from '../../components/holidays/HolidayEditModal'
import { useStation } from '../../context/station-context'
import { useAuth } from '../../context/auth-context'
import { apiGet, apiSend } from '../../services/api'
import type { StationHoliday } from '../../types/stationHoliday'
import { categoryBadgeLabel, PAYROLL_HOLIDAY_CATEGORY_LABELS, timeRangeLabel } from '../../types/stationHoliday'
import {
  GERMAN_FEDERAL_STATES,
  GERMAN_STATE_LABELS,
  parseGermanState,
  type GermanState,
} from '../../data/germanFederalStates'

type HolidaySettings = {
  federalState: GermanState
  federalStateLabel: string
  options: { bavariaAssumptionDayEnabled?: boolean }
}

function categoryBadgeTone(h: StationHoliday): 'default' | 'cyan' | 'amber' | 'success' {
  if (h.payrollCategory === 'none' || !h.active) return 'default'
  if (h.payrollCategory === 'special') return 'amber'
  if (h.payrollCategory === 'special_rule') return 'cyan'
  return 'success'
}

export function HolidaysPage() {
  const { stationId, federalState, hasPermission } = useStation()
  const { user, refreshMe } = useAuth()
  const canView = Boolean(user?.globalAdmin || hasPermission('settings.view'))
  const canEdit = Boolean(user?.globalAdmin || hasPermission('settings.edit'))

  const calendarYear = new Date().getFullYear()

  const [holidays, setHolidays] = useState<StationHoliday[]>([])
  const [, setSettings] = useState<HolidaySettings | null>(null)
  const [selectedState, setSelectedState] = useState<GermanState>(federalState)
  const [bavariaAssumption, setBavariaAssumption] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editMode, setEditMode] = useState<'create' | 'edit'>('edit')
  const [editing, setEditing] = useState<StationHoliday | null>(null)

  const loadSettings = useCallback(async () => {
    if (!stationId) return
    const res = await apiGet<HolidaySettings>(`/stations/${stationId}/holiday-settings`)
    if (res.ok) {
      setSettings(res.data)
      setSelectedState(parseGermanState(res.data.federalState, federalState))
      setBavariaAssumption(res.data.options?.bavariaAssumptionDayEnabled === true)
    }
  }, [stationId, federalState])

  const load = useCallback(async () => {
    if (!stationId || !canView) return
    setLoading(true)
    setError(null)
    const res = await apiGet<StationHoliday[]>('/station-extra-holidays', {
      stationId,
      includeInactive: 'true',
      year: String(calendarYear),
    })
    if (!res.ok) {
      setError(res.error)
      setHolidays([])
    } else {
      setHolidays(Array.isArray(res.data) ? res.data : [])
    }
    setLoading(false)
  }, [stationId, canView, calendarYear])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    void load()
  }, [load])

  const sorted = useMemo(
    () =>
      [...holidays]
        .filter((h) => h.date.startsWith(`${calendarYear}-`))
        .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)),
    [holidays, calendarYear],
  )

  const stateLabel = GERMAN_STATE_LABELS[selectedState] ?? selectedState

  const applyFederalState = async () => {
    if (!canEdit || !stationId) return
    setConfirmOpen(false)
    setLoading(true)
    setError(null)
    const patch = await apiSend<HolidaySettings>('PATCH', `/stations/${stationId}/holiday-settings`, {
      federalState: selectedState,
      options: { bavariaAssumptionDayEnabled: bavariaAssumption },
    })
    if (!patch.ok) {
      setError(patch.error)
      setLoading(false)
      return
    }
    const regen = await apiSend<{ conflicts?: string[] }>(
      'POST',
      `/stations/${stationId}/holidays/regenerate`,
      {
        year: calendarYear,
        federalState: selectedState,
        preserveManualChanges: true,
      },
    )
    if (!regen.ok) {
      setError(regen.error)
    } else if (regen.data?.conflicts?.length) {
      setError(
        `Feiertage aktualisiert. ${regen.data.conflicts.length} Datum/Datums-Konflikt(e) mit manuellen Einträgen übersprungen.`,
      )
    }
    await loadSettings()
    await load()
    await refreshMe()
    setLoading(false)
  }

  const loadHolidaysNow = async () => {
    if (!stationId || !canEdit) return
    setLoading(true)
    setError(null)
    const regen = await apiSend('POST', `/stations/${stationId}/holidays/regenerate`, {
      year: calendarYear,
      federalState: selectedState,
      preserveManualChanges: true,
    })
    if (!regen.ok) setError(regen.error)
    await load()
    setLoading(false)
  }

  const openCreate = () => {
    setEditMode('create')
    setEditing(null)
    setEditOpen(true)
  }

  const openEdit = (h: StationHoliday) => {
    setEditMode('edit')
    setEditing(h)
    setEditOpen(true)
  }

  const saveHoliday = async (payload: Partial<StationHoliday> & { name: string; date: string }) => {
    if (!canEdit || !stationId) return
    setLoading(true)
    setError(null)
    if (editMode === 'create') {
      const res = await apiSend<StationHoliday>('POST', '/station-extra-holidays', payload, { stationId })
      if (!res.ok) setError(res.error)
    } else if (editing?.id) {
      const res = await apiSend<StationHoliday>('PUT', `/station-extra-holidays/${editing.id}`, payload)
      if (!res.ok) setError(res.error)
    }
    await load()
    setLoading(false)
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-xl font-semibold text-[var(--text-main)]">Feiertage</h1>
        <p className="text-sm text-[var(--text-muted)]">Keine Berechtigung (settings.view).</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 pb-16">
      <PageHeader
        title="Feiertage"
        description={`Kalender ${calendarYear} · Bundesland: ${stateLabel}. Die Feiertage werden automatisch anhand des Bundeslands Ihrer Station geladen. Sie können Zuschläge, B-Feiertage und Sonderregeln bei Bedarf anpassen.`}
      />

      <Card className="space-y-4 border-[var(--border-subtle)] p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block min-w-[220px] flex-1 text-sm">
            <span className="mb-1 block text-[var(--text-muted)]">Bundesland auswählen</span>
            <select
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-main)]"
              value={selectedState}
              disabled={!canEdit}
              onChange={(e) => setSelectedState(parseGermanState(e.target.value))}
            >
              {GERMAN_FEDERAL_STATES.map((code) => (
                <option key={code} value={code}>
                  {GERMAN_STATE_LABELS[code]}
                </option>
              ))}
            </select>
          </label>
          {canEdit ?
            <Button type="button" variant="outline" disabled={loading} onClick={() => setConfirmOpen(true)}>
              Feiertage für Bundesland aktualisieren
            </Button>
          : null}
          {selectedState === 'BY' ?
            <label className="flex w-full items-start gap-2 text-sm text-[var(--text-muted)] sm:basis-full">
              <input
                type="checkbox"
                className="mt-1"
                checked={bavariaAssumption}
                disabled={!canEdit}
                onChange={(e) => setBavariaAssumption(e.target.checked)}
              />
              <span>
                Mariä Himmelfahrt gilt in Bayern nur in bestimmten Gemeinden. Bitte aktivieren, wenn Ihre Station
                betroffen ist.
              </span>
            </label>
          : null}
        </div>
      </Card>

      {error ?
        <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>
      : null}

      {canEdit ?
        <Button type="button" onClick={openCreate}>
          Zusatz-Feiertag
        </Button>
      : null}

      <Card padding="none" className="min-w-0 overflow-hidden border-[var(--border-subtle)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--table-head-bg)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <th className="px-3 py-2 font-medium">Datum</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Kategorie</th>
                <th className="px-3 py-2 font-medium">Zuschlag (Hinweis)</th>
                <th className="px-3 py-2 font-medium">Zeitraum</th>
                <th className="px-3 py-2 font-medium">Aktiv</th>
                <th className="px-3 py-2 font-medium">Notiz</th>
                {canEdit ? <th className="px-3 py-2 font-medium">Aktion</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading && !sorted.length ?
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="px-3 py-6 text-[var(--text-muted)]">
                    Lade Feiertage…
                  </td>
                </tr>
              : null}
              {!loading && sorted.length === 0 ?
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="px-3 py-8 text-center text-[var(--text-muted)]">
                    <p>Für dieses Jahr wurden noch keine Feiertage geladen.</p>
                    {canEdit ?
                      <Button type="button" className="mt-3" disabled={loading} onClick={() => void loadHolidaysNow()}>
                        Feiertage jetzt laden
                      </Button>
                    : null}
                  </td>
                </tr>
              : null}
              {sorted.map((h) => (
                <tr
                  key={h.id}
                  className={`border-b border-white/5 ${h.payrollCategory === 'special' ? 'bg-amber-500/[0.04]' : ''}`}
                >
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--text-main)]">{h.date}</td>
                  <td className="px-3 py-2 text-[var(--text-main)]">
                    {h.name}
                    {h.source === 'custom' ?
                      <span className="ml-1 text-[10px] text-[var(--text-faint)]">(Zusatz)</span>
                    : null}
                    {h.isManualOverride ?
                      <span className="ml-1 text-[10px] text-amber-400/90">(angepasst)</span>
                    : null}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">
                    {PAYROLL_HOLIDAY_CATEGORY_LABELS[h.payrollCategory]}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={categoryBadgeTone(h)}>{categoryBadgeLabel(h)}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[var(--text-muted)]">{timeRangeLabel(h)}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{h.active ? 'aktiv' : 'inaktiv'}</td>
                  <td className="max-w-[12rem] truncate px-3 py-2 text-[var(--text-faint)]" title={h.note}>
                    {h.note || '—'}
                  </td>
                  {canEdit ?
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-1 px-2 py-1 text-xs"
                        onClick={() => openEdit(h)}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Bearbeiten
                      </Button>
                    </td>
                  : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {confirmOpen ?
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="federal-change-title"
        >
          <div className="max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-6 shadow-xl">
            <h2 id="federal-change-title" className="text-lg font-semibold text-[var(--text-main)]">
              Bundesland ändern?
            </h2>
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              Die Feiertage dieser Station werden für das ausgewählte Bundesland neu geladen. Eigene Zusatz-Feiertage
              bleiben erhalten. Bereits manuell angepasste Einträge werden nicht ungefragt überschrieben.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
                Abbrechen
              </Button>
              <Button type="button" onClick={() => void applyFederalState()}>
                Aktualisieren
              </Button>
            </div>
          </div>
        </div>
      : null}

      <HolidayEditModal
        open={editOpen}
        mode={editMode}
        holiday={editing}
        federalState={selectedState}
        onClose={() => setEditOpen(false)}
        onSave={(p) => void saveHoliday(p)}
      />
    </div>
  )
}
