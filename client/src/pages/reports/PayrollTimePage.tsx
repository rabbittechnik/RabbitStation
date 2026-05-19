import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, FileSpreadsheet, Printer, Table2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useAuth } from '../../context/auth-context'
import { useStation } from '../../context/station-context'
import { apiGet } from '../../services/api'
import { PayrollTimeMainTable } from '../../components/reports/PayrollTimeMainTable'
import { PayrollDetailExtraFields } from '../../components/reports/PayrollDetailExtraFields'
import { useRequirePlanFeature } from '../../hooks/useRequirePlanFeature'

type EmploymentFilter =
  | 'all'
  | 'all_with_exited'
  | 'vollzeit'
  | 'teilzeit'
  | 'aushilfe'
  | 'schichtleiter'
  | 'chef'
  | 'exited'

type ReportRow = {
  employeeId: string
  employeeName: string
  employmentType: string
  hourlyWage: number
  /** Profil-Stundenlohn (Stundenkraft); fehlt z. B. bei Monatsgehalt. */
  registeredHourlyWage?: number
  minimumWageNote?: string
  totalHours: number
  workPlanHours?: number
  overtimeHours: number
  vacationDays: number
  paidVacationHours: number
  paidOtherAbsenceHours?: number
  basePay: number
  supplementsTotal: number
  mankogeld: number
  vl: number
  cashDifference: number
  bonus: number
  advance: number
  total: number
  messages?: string[]
}

type Totals = {
  totalHours: number
  overtimeHours: number
  vacationDays: number
  basePay: number
  supplementsTotal: number
  mankogeld: number
  vl: number
  cashDifference: number
  bonus: number
  advance: number
  total: number
}

type ReportPayload = {
  stationId: string
  stationName: string
  fromDate: string
  toDate: string
  hasPendingApprovedTime: boolean
  reportSource?: 'time_tracking' | 'schedule_plan'
  rows: ReportRow[]
  totals: Totals
}

type TimeDetailItem = {
  id: string
  employeeId: string
  employeeName: string
  date: string
  startAt: string
  endAt: string
  breakMinutes: number
  hours: number
  source: string
  status: string
  approvalStatus: string
  synthetic?: boolean
  stampedStartAt?: string
  stampedEndAt?: string
  correctedStartAt?: string
  correctedEndAt?: string
  correctionReasonLabel?: string
  timeCorrectionNote?: string
  plannedShiftStart?: string
  plannedShiftEnd?: string
}

function hmBerlin(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
}

function monthStartToToday(): { from: string; to: string } {
  const n = new Date()
  const y = n.getFullYear()
  const m = String(n.getMonth() + 1).padStart(2, '0')
  const d = String(n.getDate()).padStart(2, '0')
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${d}` }
}

function formatHoursDe(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} Std.`
}

const FILTER_OPTIONS: { value: EmploymentFilter; label: string }[] = [
  { value: 'all', label: 'Alle Beschäftigungsarten' },
  { value: 'vollzeit', label: 'Vollzeit' },
  { value: 'teilzeit', label: 'Teilzeit' },
  { value: 'aushilfe', label: 'Aushilfe' },
  { value: 'schichtleiter', label: 'Schichtleiter' },
  { value: 'chef', label: 'Chef / Administrator' },
  { value: 'exited', label: 'Ausgeschiedene' },
  { value: 'all_with_exited', label: 'Alle inkl. ausgeschiedene (aktiv)' },
]

/** Vollständige Spaltenüberschriften für CSV/XLSX (unveränderte Datenbasis). */
const EXPORT_COL_HEADERS = [
  'Mitarbeiter',
  'Eingetr. Stundenlohn',
  'Verwend. Stundenlohn',
  'Mindestlohn / Hinweis',
  'Stunden Gesamt',
  'Überstd.',
  'U-Tage',
  'Lohn/Gehalt / Monat',
  'Zuschläge kumuliert',
  'Mankogeld / Monat',
  'VL / Monat',
  'Kassendifferenz',
  'Prämie',
  'Vorschuß',
  'Summe',
] as const

export function PayrollTimePage() {
  const { user } = useAuth()
  const { stationId, selectedStation, hasPermission } = useStation()
  const hasPayrollTimeTracking = useRequirePlanFeature('payroll_time_tracking')
  const canView = hasPermission('payroll.view') || hasPermission('reports.payroll')
  const canExport = hasPermission('reports.export') || hasPermission('payroll.export')

  const defaults = useMemo(() => monthStartToToday(), [])
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [employmentFilter, setEmploymentFilter] = useState<EmploymentFilter>('all')
  const [data, setData] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailEmp, setDetailEmp] = useState<string>('')
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailItems, setDetailItems] = useState<TimeDetailItem[]>([])

  const abortRef = useRef<AbortController | null>(null)
  const [loadMessage, setLoadMessage] = useState('Lohnabrechnung wird berechnet…')

  const load = useCallback(async () => {
    if (!stationId || !canView) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setError(null)
    setLoadMessage('Lohnabrechnung wird berechnet…')
    const res = await apiGet<ReportPayload>(
      '/reports/payroll-time-tracking',
      { stationId, from, to, employmentType: employmentFilter },
      { signal: ac.signal },
    )
    if (ac.signal.aborted) return
    if (!res.ok) {
      setData(null)
      setError(res.error)
    } else {
      setData(res.data)
      setSelected(new Set())
    }
    setLoading(false)
  }, [stationId, from, to, employmentFilter, canView])

  useEffect(() => {
    void load()
    return () => abortRef.current?.abort()
  }, [load])

  const openDetails = async (employeeId?: string) => {
    if (!stationId || !canView) return
    setDetailEmp(employeeId ?? '')
    setDetailOpen(true)
    setDetailLoading(true)
    const res = await apiGet<{ items: TimeDetailItem[] }>('/reports/payroll-time-tracking/time-entries', {
      stationId,
      from,
      to,
      ...(employeeId ? { employeeId } : {}),
    })
    if (!res.ok) {
      setDetailItems([])
    } else {
      setDetailItems(res.data.items)
    }
    setDetailLoading(false)
  }

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const toggleAll = () => {
    if (!data?.rows.length) return
    if (selected.size === data.rows.length) setSelected(new Set())
    else setSelected(new Set(data.rows.map((r) => r.employeeId)))
  }

  const detailSummary = useMemo(() => {
    if (!detailEmp || !data?.rows) return null
    return data.rows.find((x) => x.employeeId === detailEmp) ?? null
  }, [detailEmp, data])

  const rowsForExport = useMemo(() => {
    if (!data?.rows.length) return []
    if (selected.size === 0) return data.rows
    return data.rows.filter((r) => selected.has(r.employeeId))
  }, [data, selected])

  const exportTotals = useMemo(() => {
    if (!rowsForExport.length) return null
    const t = rowsForExport.reduce(
      (acc, r) => ({
        totalHours: acc.totalHours + r.totalHours,
        overtimeHours: acc.overtimeHours + r.overtimeHours,
        vacationDays: acc.vacationDays + r.vacationDays,
        basePay: acc.basePay + r.basePay,
        supplementsTotal: acc.supplementsTotal + r.supplementsTotal,
        mankogeld: acc.mankogeld + r.mankogeld,
        vl: acc.vl + r.vl,
        cashDifference: acc.cashDifference + r.cashDifference,
        bonus: acc.bonus + r.bonus,
        advance: acc.advance + r.advance,
        total: acc.total + r.total,
      }),
      {
        totalHours: 0,
        overtimeHours: 0,
        vacationDays: 0,
        basePay: 0,
        supplementsTotal: 0,
        mankogeld: 0,
        vl: 0,
        cashDifference: 0,
        bonus: 0,
        advance: 0,
        total: 0,
      },
    )
    const keys = Object.keys(t) as (keyof typeof t)[]
    return keys.reduce(
      (acc, k) => {
        acc[k] = Math.round(t[k] * 100) / 100
        return acc
      },
      { ...t },
    )
  }, [rowsForExport])

  const buildSheetMatrix = useCallback(() => {
    const head = ['', ...EXPORT_COL_HEADERS]
    const body = rowsForExport.map((r) => [
      '',
      r.employeeName,
      r.registeredHourlyWage ?? '',
      r.hourlyWage,
      r.minimumWageNote ?? '',
      r.totalHours,
      r.overtimeHours,
      r.vacationDays,
      r.basePay,
      r.supplementsTotal,
      r.mankogeld,
      r.vl,
      r.cashDifference,
      r.bonus,
      r.advance,
      r.total,
    ])
    const sum = exportTotals
    const foot = sum
      ? [
          '',
          'Summe',
          '',
          '',
          '',
          sum.totalHours,
          sum.overtimeHours,
          sum.vacationDays,
          sum.basePay,
          sum.supplementsTotal,
          sum.mankogeld,
          sum.vl,
          sum.cashDifference,
          sum.bonus,
          sum.advance,
          sum.total,
        ]
      : null
    return { head, body, foot }
  }, [rowsForExport, exportTotals])

  const exportCsv = () => {
    const { head, body, foot } = buildSheetMatrix()
    const esc = (v: string | number) => {
      const s = String(v).replace(/"/g, '""')
      return `"${s}"`
    }
    const lines = [
      head.map(esc).join(';'),
      ...body.map((row) => row.map(esc).join(';')),
      ...(foot ? [foot.map(esc).join(';')] : []),
    ]
    const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `lohn-zeiterfassung_${from}_${to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const exportXlsx = () => {
    const { head, body, foot } = buildSheetMatrix()
    const ws = XLSX.utils.aoa_to_sheet([head, ...body, ...(foot ? [foot] : [])])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Lohn')
    XLSX.writeFile(wb, `lohn-zeiterfassung_${from}_${to}.xlsx`)
  }

  if (!hasPayrollTimeTracking) {
    return (
      <div className="space-y-6">
        <PageHeader title="Lohnabrechnung (Zeiterfassung)" description="Lohnauswertung auf Basis der Zeiterfassung." />
      </div>
    )
  }

  if (!stationId) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-xl font-semibold text-[var(--text-main)]">Lohnabrechnung (Zeiterfassung)</h1>
        <p className="text-sm text-[var(--text-muted)]">Bitte zuerst eine Station auswählen.</p>
      </div>
    )
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-xl font-semibold text-[var(--text-main)]">Lohnabrechnung (Zeiterfassung)</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Keine Berechtigung. Erforderlich: <span className="text-cyan-200/90">payroll.view</span> oder{' '}
          <span className="text-cyan-200/90">reports.payroll</span>.
        </p>
      </div>
    )
  }

  const metaLine = `${selectedStation?.name ?? data?.stationName ?? 'Station'} · ${from} – ${to}`

  const timeTableTotals = useMemo(() => {
    if (!data?.totals) return null
    const workPlanHours = data.rows.reduce((s, r) => s + (r.workPlanHours ?? 0), 0)
    const paidVacationHours = data.rows.reduce((s, r) => s + r.paidVacationHours, 0)
    return {
      workPlanHours: Math.round(workPlanHours * 100) / 100,
      totalHours: data.totals.totalHours,
      vacationDays: data.totals.vacationDays,
      paidVacationHours: Math.round(paidVacationHours * 100) / 100,
      basePay: data.totals.basePay,
      supplementsTotal: data.totals.supplementsTotal,
      advance: data.totals.advance,
      total: data.totals.total,
    }
  }, [data])


  return (
    <div className="space-y-6 pb-10 print:pb-0">
      <PageHeader
        title="Lohnabrechnung (Zeiterfassung)"
        description="Auswertung auf Basis freigegebener Zeiterfassung, Urlaub und Lohnfelder · getrennt von der Schichtplan-Lohnabrechnung"
      />

      <p className="ui-info-banner rounded-lg px-3 py-2 text-sm">
        „Stunden“ in der Tabelle = freigegebene Arbeitszeiten plus genehmigter bezahlter Urlaub (täglich ohne Doppelzählung mit Arbeit am selben Tag).
      </p>

      {(data?.reportSource === 'time_tracking' || data?.reportSource === undefined) && data?.hasPendingApprovedTime ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Es gibt noch nicht freigegebene abgeschlossene Arbeitszeiten. Diese sind{' '}
            <strong>nicht</strong> in der Berechnung enthalten.
          </p>
        </div>
      ) : null}

      <Card className="print:hidden">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex min-w-[12rem] flex-col gap-1.5 text-sm text-[var(--text-muted)]">
              <span className="whitespace-nowrap">Beschäftigungsart</span>
              <select
                value={employmentFilter}
                onChange={(e) => setEmploymentFilter(e.target.value as EmploymentFilter)}
                className="rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-[var(--text-main)]"
              >
                {FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
              Aktualisieren
            </Button>
            <Button type="button" variant="ghost" onClick={() => void openDetails()} className="gap-2">
              <Table2 className="h-4 w-4 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">Arbeitszeiten tabellarisch</span>
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-3 sm:justify-end">
            <label className="flex flex-col gap-1.5 text-sm text-[var(--text-muted)]">
              <span>Von</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-[var(--text-main)]"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-[var(--text-muted)]">
              <span>Bis</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-[var(--text-main)]"
              />
            </label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => window.print()}
            disabled={!data?.rows.length}
          >
            <Printer className="h-4 w-4 shrink-0" aria-hidden />
            <span className="whitespace-nowrap">Druck (PDF)</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={exportXlsx}
            disabled={!canExport || !rowsForExport.length}
            title={!canExport ? 'reports.export oder payroll.export erforderlich' : undefined}
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
            Excel (XLSX)
          </Button>
          <Button type="button" variant="outline" onClick={exportCsv} disabled={!canExport || !rowsForExport.length}>
            CSV
          </Button>
          {!canExport ? (
            <span className="text-xs text-[var(--text-faint)]">Export: reports.export oder payroll.export</span>
          ) : null}
        </div>
      </Card>

      {error ? (
        <p className="text-sm text-rose-300" role="alert">
          {error}
        </p>
      ) : null}

      <Card padding="none" className="min-w-0 overflow-hidden border-cyan-500/15 print:shadow-none print:ring-0">
        <div id="payroll-report-print" className="w-full p-6 print:p-2">
          <p className="mb-3 text-xs text-[var(--text-muted)] print:hidden">{metaLine}</p>
          <div className="mb-4 hidden print:block">
            <h2 className="text-lg font-semibold text-black">Lohnabrechnung (Zeiterfassung)</h2>
            <p className="text-sm text-black">{metaLine}</p>
            <p className="text-xs text-neutral-700">
              Erstellt: {new Date().toLocaleString('de-DE')}
              {user?.displayName ? ` · ${user.displayName}` : ''}
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">{loadMessage}</p>
          ) : !data?.rows.length ? (
            <p className="text-sm text-[var(--text-muted)]">Keine Abrechnungsdaten im gewählten Zeitraum.</p>
          ) : timeTableTotals ? (
            <PayrollTimeMainTable
              rows={data.rows}
              totals={timeTableTotals}
              selected={selected}
              onToggleRow={toggleRow}
              onToggleAll={toggleAll}
              onOpenDetails={(id) => void openDetails(id)}
            />
          ) : null}
        </div>
      </Card>

      {detailOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center print:hidden"
          role="dialog"
          aria-modal
        >
          <div className="max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-xl border border-white/15 bg-[var(--bg-card)] shadow-[0_0_40px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 className="text-base font-semibold text-[var(--text-main)]">
                Arbeitszeiten · {detailEmp ? data?.rows.find((x) => x.employeeId === detailEmp)?.employeeName ?? detailEmp : 'alle Mitarbeiter'}
              </h2>
              <Button type="button" variant="ghost" onClick={() => setDetailOpen(false)}>
                Schließen
              </Button>
            </div>
            <div className="max-h-[calc(85vh-56px)] overflow-auto p-4">
              {detailLoading ? (
                <p className="text-sm text-[var(--text-muted)]">Lade…</p>
              ) : (
                <>
                  {detailSummary ? (
                    <PayrollDetailExtraFields
                      row={{
                        employmentType: detailSummary.employmentType,
                        registeredHourlyWage: detailSummary.registeredHourlyWage,
                        hourlyWage: detailSummary.hourlyWage,
                        minimumWageNote: detailSummary.minimumWageNote,
                        overtimeHours: detailSummary.overtimeHours,
                        mankogeld: detailSummary.mankogeld,
                        vl: detailSummary.vl,
                        cashDifference: detailSummary.cashDifference,
                        bonus: detailSummary.bonus,
                        advance: detailSummary.advance,
                        vacationDays: detailSummary.vacationDays,
                        paidVacationHours: detailSummary.paidVacationHours,
                        paidOtherAbsenceHours: detailSummary.paidOtherAbsenceHours,
                        workPlanHours: detailSummary.workPlanHours,
                        totalHours: detailSummary.totalHours,
                      }}
                      showEmployment
                      showAdvance
                    />
                  ) : null}
                  {!detailItems.length ? (
                    <p className="text-sm text-[var(--text-muted)]">Keine Zeiterfassungs- oder Abwesenheitszeilen im Zeitraum.</p>
                  ) : (
                    <table className="w-full border-collapse text-left text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-white/10 text-[var(--text-muted)]">
                          <th className="whitespace-nowrap py-2 pr-2">Datum</th>
                          <th className="py-2 pr-2">Mitarbeiter</th>
                          <th className="whitespace-nowrap py-2 pr-2">Start</th>
                          <th className="whitespace-nowrap py-2 pr-2">Ende</th>
                          <th className="whitespace-nowrap py-2 pr-2">Pause (Min)</th>
                          <th className="whitespace-nowrap py-2 pr-2 text-right">Stunden</th>
                          <th className="py-2 pr-2">Quelle</th>
                          <th className="py-2 pr-2">Status</th>
                          <th className="py-2 pr-2">Freigabe</th>
                          <th className="py-2 pr-2">Korrektur</th>
                          <th className="py-2 pr-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {detailItems.map((it) => (
                          <tr
                            key={it.id}
                            className={`border-b border-white/[0.06] ${it.synthetic ? 'bg-cyan-500/5' : ''}`}
                          >
                            <td className="py-1.5 pr-2 whitespace-nowrap">{it.date}</td>
                            <td className="py-1.5 pr-2">{it.employeeName}</td>
                            <td className="py-1.5 pr-2 font-mono text-[11px]">
                              {it.stampedStartAt ? hmBerlin(it.stampedStartAt) : hmBerlin(it.startAt)}
                              {it.plannedShiftStart ? (
                                <span className="block text-[10px] text-[var(--text-faint)]">Plan {it.plannedShiftStart}</span>
                              ) : null}
                            </td>
                            <td className="py-1.5 pr-2 font-mono text-[11px]">
                              {it.correctedEndAt
                                ? `${hmBerlin(it.correctedStartAt ?? it.startAt)}–${hmBerlin(it.correctedEndAt)}`
                                : it.stampedEndAt
                                  ? hmBerlin(it.stampedEndAt)
                                  : hmBerlin(it.endAt)}
                              {it.plannedShiftEnd ? (
                                <span className="block text-[10px] text-[var(--text-faint)]">Plan {it.plannedShiftEnd}</span>
                              ) : null}
                            </td>
                            <td className="py-1.5 pr-2 tabular-nums">{it.synthetic ? '—' : it.breakMinutes}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{formatHoursDe(it.hours)}</td>
                            <td className="py-1.5 pr-2 text-[var(--text-muted)]">
                              {it.source === 'paid_vacation_auto'
                                ? 'Bezahlter Urlaub (automatisch)'
                                : it.source === 'paid_other_absence_auto'
                                  ? 'Bezahlte Abwesenheit (automatisch)'
                                  : it.source === 'absence_display'
                                    ? 'Abwesenheit (Anzeige)'
                                    : it.source}
                            </td>
                            <td className="py-1.5 pr-2">{it.synthetic ? 'berechnet' : it.status}</td>
                            <td className="py-1.5 pr-2">{it.approvalStatus}</td>
                            <td className="py-1.5 pr-2 text-[11px] text-violet-200/90">
                              {it.correctionReasonLabel ?? it.timeCorrectionNote ?? '—'}
                            </td>
                            <td className="py-1.5 pr-2">
                              {!it.synthetic && it.approvalStatus === 'approved' ? (
                                <Link
                                  to={`/time-approvals?entry=${encodeURIComponent(it.id)}&correct=1`}
                                  className="text-cyan-300 hover:underline"
                                >
                                  Korrigieren
                                </Link>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
