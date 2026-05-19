import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/auth-context'
import { useStation } from '../../context/station-context'
import { apiGet, apiSend, API_BASE, getAdminToken } from '../../services/api'
import type { TuvReportApi, TuvReportDetail, TuvReportStatus } from '../../types/tuvReport'
import { PageHeader } from '../../components/ui/PageHeader'
import { TuvReportsToolbar } from '../../components/tuv/TuvReportsToolbar'
import { TuvReportsList } from '../../components/tuv/TuvReportsList'
import { TuvReportCard } from '../../components/tuv/TuvReportCard'
import { TuvReportMonthPicker } from '../../components/tuv/TuvReportMonthPicker'
import { useRequirePlanFeature } from '../../hooks/useRequirePlanFeature'

export function TuvReportsPage() {
  const hasTuvReport = useRequirePlanFeature('monthly_tuv_report')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const { stationId, availableStations, canSwitchStation, hasPermission } = useStation()
  const [filterStation, setFilterStation] = useState(stationId ?? '')
  const [year, setYear] = useState(new Date().getFullYear())
  const [status, setStatus] = useState<'all' | TuvReportStatus>('all')
  const [rows, setRows] = useState<TuvReportApi[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  const [createMonth, setCreateMonth] = useState(new Date().getMonth() + 1)
  const [createYear, setCreateYear] = useState(new Date().getFullYear())
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [generalNote, setGeneralNote] = useState('')
  const [dupWarn, setDupWarn] = useState<{ existingId: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (stationId) setFilterStation((prev) => (prev ? prev : stationId))
  }, [stationId])

  const canView = hasPermission('tuvReports.view')
  const canCreate = hasPermission('tuvReports.create')
  const canDelete = Boolean(user?.globalAdmin)

  const stationNames = useMemo(
    () => Object.fromEntries(availableStations.map((s) => [s.id, s.name])),
    [availableStations],
  )

  const load = useCallback(async () => {
    const sid = filterStation || stationId
    if (!sid || !canView) return
    setErr(null)
    const res = await apiGet<TuvReportApi[]>('/tuv-reports', {
      stationId: sid,
      year: String(year),
      status: status === 'all' ? undefined : status,
    })
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setRows(res.data)
  }, [filterStation, stationId, year, status, canView])

  useEffect(() => {
    void load()
  }, [load])

  const openMonthFromQuery = useCallback(async () => {
    const om = Number(searchParams.get('openMonth'))
    const oy = Number(searchParams.get('openYear'))
    if (!Number.isFinite(om) || !Number.isFinite(oy)) return
    const sid = filterStation || stationId
    if (!sid || !canCreate) return
    setBusy(true)
    setErr(null)
    const res = await apiSend<TuvReportDetail & { created?: boolean }>(
      'POST',
      '/tuv-reports/open-month',
      { month: om, year: oy, reportDate: new Date().toISOString().slice(0, 10) },
      { stationId: sid },
    )
    setBusy(false)
    setSearchParams({}, { replace: true })
    if (!res.ok) {
      setErr(res.error)
      return
    }
    navigate(`/tuv-berichte/${res.data.report.id}`)
  }, [searchParams, filterStation, stationId, canCreate, navigate, setSearchParams])

  useEffect(() => {
    void openMonthFromQuery()
  }, [openMonthFromQuery])

  async function openCurrentMonthChecklist() {
    const sid = filterStation || stationId
    if (!sid || !canCreate) return
    const now = new Date()
    setBusy(true)
    const res = await apiSend<TuvReportDetail & { created?: boolean }>(
      'POST',
      '/tuv-reports/open-month',
      { month: now.getMonth() + 1, year: now.getFullYear(), reportDate: now.toISOString().slice(0, 10) },
      { stationId: sid },
    )
    setBusy(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    navigate(`/tuv-berichte/${res.data.report.id}`)
  }

  async function createReport() {
    const sid = filterStation || stationId
    if (!sid || !canCreate) return
    setBusy(true)
    setErr(null)
    setDupWarn(null)
    const token = getAdminToken()
    const url = `${API_BASE}/tuv-reports?stationId=${encodeURIComponent(sid)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        month: createMonth,
        year: createYear,
        reportDate,
        inspectorRole: '',
        weatherNote: '',
        generalNote,
      }),
    })
    const json = (await res.json()) as { ok?: boolean; data?: TuvReportDetail; error?: string; existingId?: string }
    setBusy(false)
    if (res.status === 409 && json.existingId) {
      setDupWarn({ existingId: json.existingId })
      setErr(json.error ?? 'Doppelter Bericht')
      return
    }
    if (!res.ok || !json.ok || !json.data) {
      setErr(json.error ?? `HTTP ${res.status}`)
      return
    }
    setModal(false)
    navigate(`/tuv-berichte/${json.data.report.id}`)
  }

  if (!hasTuvReport) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="TÜV-Berichte"
          description="Monatliche TÜV-Checklisten und Berichte für Ihre Station."
        />
      </div>
    )
  }

  if (!canView) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6 text-sm text-[var(--text-muted)]">
        Keine Berechtigung für TÜV-Berichte.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monatlicher TÜV-Bericht"
        description="Monatliche Kontrollberichte deiner Station erfassen, speichern und ausdrucken."
        actions={
          canCreate ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void openCurrentMonthChecklist()}
                className="rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-40"
              >
                Monatscheckliste ausfüllen
              </button>
              <button
                type="button"
                onClick={() => {
                  setModal(true)
                  setDupWarn(null)
                  setErr(null)
                }}
                className="rounded-lg bg-gradient-to-r from-cyan-500/80 to-fuchsia-600/70 px-4 py-2 text-sm font-semibold text-white shadow-[var(--glow-cyan)]"
              >
                + Neuer TÜV-Bericht
              </button>
            </div>
          ) : null
        }
      />

      <TuvReportsToolbar
        year={year}
        onYear={setYear}
        status={status}
        onStatus={setStatus}
        stationId={filterStation}
        onStation={setFilterStation}
        stations={availableStations.map((s) => ({ id: s.id, name: s.name }))}
        showStationFilter={canSwitchStation && availableStations.length > 1}
      />

      {err ? (
        <div className="rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-100">{err}</div>
      ) : null}

      <TuvReportsList
        rows={rows}
        stationNames={stationNames}
        onOpen={(id) => navigate(`/tuv-berichte/${id}`)}
        onEdit={(id) => navigate(`/tuv-berichte/${id}`)}
        onPrint={(id) => navigate(`/tuv-berichte/${id}`)}
        onDelete={
          canDelete
            ? async (id) => {
                if (!window.confirm('Bericht wirklich löschen?')) return
                const res = await apiSend<{ deleted: boolean }>('DELETE', `/tuv-reports/${id}`)
                if (!res.ok) {
                  setErr(res.error)
                  return
                }
                void load()
              }
            : undefined
        }
        canDelete={canDelete}
      />

      <div className="grid gap-3 md:hidden">
        {rows.map((r) => (
          <TuvReportCard
            key={r.id}
            report={r}
            stationName={stationNames[r.stationId] ?? r.stationId}
            onOpen={() => navigate(`/tuv-berichte/${r.id}`)}
          />
        ))}
      </div>

      {modal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-[min(95vw,1200px)] max-w-[1200px] overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-[var(--text-main)]">Neuer TÜV-Bericht</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Station: {stationNames[filterStation || stationId || ''] ?? filterStation}
            </p>
            <div className="mt-4 space-y-4">
              <TuvReportMonthPicker
                month={createMonth}
                year={createYear}
                onMonth={setCreateMonth}
                onYear={setCreateYear}
              />
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--text-muted)]">Datum der Kontrolle</span>
                <input
                  type="date"
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--text-muted)]">Bemerkung (optional)</span>
                <textarea
                  rows={2}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2"
                  value={generalNote}
                  onChange={(e) => setGeneralNote(e.target.value)}
                />
              </label>
              {dupWarn ? (
                <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                  Für diesen Monat existiert bereits ein TÜV-Bericht.
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-cyan-400/40 px-3 py-1.5 text-xs"
                      onClick={() => navigate(`/tuv-berichte/${dupWarn.existingId}`)}
                    >
                      Vorhandenen öffnen
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm"
                onClick={() => setModal(false)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg bg-cyan-500/80 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                onClick={() => void createReport()}
              >
                Anlegen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
