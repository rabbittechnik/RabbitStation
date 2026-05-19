import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileSpreadsheet, Printer, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { PageHeader } from '../../components/ui/PageHeader'
import { useRequirePlanFeature } from '../../hooks/useRequirePlanFeature'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useAuth } from '../../context/auth-context'
import { useStation } from '../../context/station-context'
import { apiGet } from '../../services/api'
import { PayrollScheduleMainTable } from '../../components/reports/PayrollScheduleMainTable'
import { PayrollDetailExtraFields } from '../../components/reports/PayrollDetailExtraFields'

type EmploymentFilter =
  | 'all'
  | 'all_with_exited'
  | 'vollzeit'
  | 'teilzeit'
  | 'aushilfe'
  | 'schichtleiter'
  | 'chef'
  | 'exited'

type ScheduleDetailLine = {
  date: string
  weekdayDe: string
  lineType: 'shift' | 'paid_vacation' | 'unpaid_vacation' | 'sick' | 'special_leave' | 'other_absence'
  von: string
  bis: string
  bereich: string
  hours: number
  nacht: string
  samstag: string
  sonntag: string
  feiertag: string
  besondererFeiertag: string
  hinweis: string
  lineSource?: string
}

type ReportRow = {
  employeeId: string
  employeeName: string
  employmentType: string
  hourlyWage: number
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
  scheduleLines?: ScheduleDetailLine[]
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

function formatYmdDe(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${d}.${m}.${y}`
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

const COL_HEADERS_EXPORT = [
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

export function PayrollSchedulePage() {
  const { user } = useAuth()
  const { stationId, selectedStation, hasPermission } = useStation()
  const hasPayrollSchedule = useRequirePlanFeature('payroll_schedule')
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
  const [detailEmployeeId, setDetailEmployeeId] = useState<string | null>(null)
  const [detailLines, setDetailLines] = useState<ScheduleDetailLine[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [loadMessage, setLoadMessage] = useState('Lohnabrechnung wird berechnet…')
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    if (!stationId || !canView) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setError(null)
    setLoadMessage('Lohnabrechnung wird berechnet…')
    const res = await apiGet<ReportPayload>(
      '/reports/payroll-schedule',
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
      setDetailEmployeeId(null)
      setDetailLines([])
    }
    setLoading(false)
  }, [stationId, from, to, employmentFilter, canView])

  useEffect(() => {
    void load()
    return () => abortRef.current?.abort()
  }, [load])

  useEffect(() => {
    if (!detailEmployeeId || !stationId) {
      setDetailLines([])
      return
    }
    setDetailLoading(true)
    void (async () => {
      const res = await apiGet<ReportPayload>('/reports/payroll-schedule', {
        stationId,
        from,
        to,
        employmentType: employmentFilter,
        includeDetailLines: '1',
        employeeIds: detailEmployeeId,
      })
      const row = res.ok ? res.data.rows.find((r) => r.employeeId === detailEmployeeId) : undefined
      setDetailLines(row?.scheduleLines ?? [])
      setDetailLoading(false)
    })()
  }, [detailEmployeeId, stationId, from, to, employmentFilter])

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
    const head = ['', ...COL_HEADERS_EXPORT]
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
    a.download = `lohn-schichtplan_${from}_${to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const exportXlsx = () => {
    const { head, body, foot } = buildSheetMatrix()
    const ws = XLSX.utils.aoa_to_sheet([head, ...body, ...(foot ? [foot] : [])])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Lohn')
    XLSX.writeFile(wb, `lohn-schichtplan_${from}_${to}.xlsx`)
  }

  if (!hasPayrollSchedule) {
    return (
      <div className="space-y-6">
        <PageHeader title="Lohnabrechnung (Schichtplan)" description="Lohnauswertung auf Basis des Schichtplans." />
      </div>
    )
  }

  if (!stationId) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-xl font-semibold text-[var(--text-main)]">Lohnabrechnung (Schichtplan)</h1>
        <p className="text-sm text-[var(--text-muted)]">Bitte zuerst eine Station auswählen.</p>
      </div>
    )
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-xl font-semibold text-[var(--text-main)]">Lohnabrechnung (Schichtplan)</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Keine Berechtigung. Erforderlich: <span className="text-cyan-200/90">payroll.view</span> oder{' '}
          <span className="text-cyan-200/90">reports.payroll</span>.
        </p>
      </div>
    )
  }

  const metaLine = `${selectedStation?.name ?? data?.stationName ?? 'Station'} · ${from} – ${to}`
  const detailRow = data?.rows.find((r) => r.employeeId === detailEmployeeId) ?? null

  const scheduleTableTotals = useMemo(() => {
    if (!data?.totals) return null
    const paidVacationHours = data.rows.reduce((s, r) => s + r.paidVacationHours, 0)
    return {
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
        title="Lohnabrechnung (Schichtplan)"
        description="Auswertung auf Basis geplanter Schichten, Urlaub und Profil-/Anpassungswerte · gleicher Server-Endpunkt wie Exporte"
      />

      <p className="ui-info-banner rounded-lg px-3 py-2 text-sm">
        „Stunden Gesamt“ umfasst geplante Schichten sowie genehmigten bezahlten Urlaub im Zeitraum (ohne Doppelzählung am
        selben Tag). Zeiterfassung fließt hier nicht ein. „Details“ öffnet die Tagesliste und weitere Spalten.
      </p>

      <div className="flex flex-col gap-4 print:hidden xl:flex-row xl:flex-wrap xl:items-start xl:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex flex-col gap-1 text-sm text-[var(--text-muted)]">
            <span>Filter: Beschäftigungsart</span>
            <select
              value={employmentFilter}
              onChange={(e) => setEmploymentFilter(e.target.value as EmploymentFilter)}
              className="min-w-[14rem] rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-[var(--text-main)]"
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
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
          <label className="flex flex-col gap-1 text-sm text-[var(--text-muted)]">
            <span>Von</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-[var(--text-main)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-[var(--text-muted)]">
            <span>Bis</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-[var(--text-main)]"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => window.print()}
          disabled={!data?.rows.length}
        >
          <Printer className="h-4 w-4" aria-hidden />
          Druck (PDF)
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={exportXlsx}
          disabled={!canExport || !rowsForExport.length}
          title={!canExport ? 'reports.export oder payroll.export erforderlich' : undefined}
        >
          <FileSpreadsheet className="h-4 w-4" aria-hidden />
          Excel (XLSX)
        </Button>
        <Button type="button" variant="outline" onClick={exportCsv} disabled={!canExport || !rowsForExport.length}>
          CSV
        </Button>
        {!canExport ? (
          <span className="text-xs text-[var(--text-faint)]">Export: reports.export oder payroll.export</span>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-rose-300" role="alert">
          {error}
        </p>
      ) : null}

      <Card padding="none" className="min-w-0 overflow-hidden border-cyan-500/15 print:shadow-none print:ring-0">
        <div id="payroll-schedule-report-print" className="w-full p-6 print:p-2">
          <p className="mb-3 text-xs text-[var(--text-muted)] print:hidden">{metaLine}</p>
          <div className="mb-4 hidden print:block">
            <h2 className="text-lg font-semibold text-black">Lohnabrechnung (Schichtplan)</h2>
            <p className="text-sm text-black">{metaLine}</p>
            <p className="text-xs text-neutral-700">
              Erstellt: {new Date().toLocaleString('de-DE')}
              {user?.displayName ? ` · ${user.displayName}` : ''}
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">{loadMessage}</p>
          ) : !data?.rows.length ? (
            <p className="text-sm text-[var(--text-muted)]">
              Keine Abrechnungsdaten im gewählten Zeitraum (keine Schichten oder keine relevanten Buchungen).
            </p>
          ) : scheduleTableTotals ? (
            <PayrollScheduleMainTable
              rows={data.rows}
              totals={scheduleTableTotals}
              selected={selected}
              onToggleRow={toggleRow}
              onToggleAll={toggleAll}
              onOpenDetails={setDetailEmployeeId}
            />
          ) : null}
        </div>
      </Card>

      {detailRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payroll-schedule-detail-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-cyan-500/25 bg-[#0a0f14] shadow-[0_0_40px_rgba(34,211,238,0.12)]">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <h2 id="payroll-schedule-detail-title" className="text-base font-semibold text-[var(--text-main)]">
                  Schichtplan &amp; Abwesenheiten
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {detailRow.employeeName} · {formatYmdDe(from)} – {formatYmdDe(to)}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-main)]"
                aria-label="Schließen"
                onClick={() => setDetailEmployeeId(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
              <PayrollDetailExtraFields
                row={{
                  employmentType: detailRow.employmentType,
                  registeredHourlyWage: detailRow.registeredHourlyWage,
                  hourlyWage: detailRow.hourlyWage,
                  minimumWageNote: detailRow.minimumWageNote,
                  overtimeHours: detailRow.overtimeHours,
                  mankogeld: detailRow.mankogeld,
                  vl: detailRow.vl,
                  cashDifference: detailRow.cashDifference,
                  bonus: detailRow.bonus,
                  advance: detailRow.advance,
                  vacationDays: detailRow.vacationDays,
                  paidVacationHours: detailRow.paidVacationHours,
                  paidOtherAbsenceHours: detailRow.paidOtherAbsenceHours,
                  workPlanHours: detailRow.workPlanHours,
                  totalHours: detailRow.totalHours,
                }}
                showEmployment
                showAdvance
              />
              {detailLoading ? (
                <p className="text-sm text-[var(--text-muted)]">Schichtdetails werden geladen…</p>
              ) : !detailLines.length ? (
                <p className="text-sm text-[var(--text-muted)]">Keine Detailzeilen vom Server geliefert.</p>
              ) : (
                <table className="w-full min-w-0 table-fixed border-collapse text-left text-[10px] sm:text-xs">
                  <thead>
                    <tr className="border-b border-white/15 text-[var(--text-muted)]">
                      <th className="py-2 pr-2">Datum</th>
                      <th className="py-2 pr-2">Tag</th>
                      <th className="py-2 pr-2">Von</th>
                      <th className="py-2 pr-2">Bis</th>
                      <th className="py-2 pr-2">Bereich</th>
                      <th className="py-2 pr-2">Std.</th>
                      <th className="py-2 pr-2">Nacht</th>
                      <th className="py-2 pr-2">Sa</th>
                      <th className="py-2 pr-2">So</th>
                      <th className="py-2 pr-2">Feiertag</th>
                      <th className="py-2 pr-2">bes. FH</th>
                      <th className="py-2 pr-2">Hinweis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailLines.map((ln, idx) => (
                      <tr key={`${ln.date}-${ln.lineType}-${idx}`} className="border-b border-white/[0.06]">
                        <td className="py-1.5 pr-2 tabular-nums text-[var(--text-main)]">{formatYmdDe(ln.date)}</td>
                        <td className="py-1.5 pr-2 text-[var(--text-muted)]">{ln.weekdayDe}</td>
                        <td className="py-1.5 pr-2 font-mono text-[10px] text-[var(--text-main)]">{ln.von || '—'}</td>
                        <td className="py-1.5 pr-2 font-mono text-[10px] text-[var(--text-main)]">{ln.bis || '—'}</td>
                        <td className="py-1.5 pr-2 text-[var(--text-main)]">{ln.bereich}</td>
                        <td className="py-1.5 pr-2 tabular-nums text-[var(--text-main)]">
                          {ln.hours > 0 ? formatHoursDe(ln.hours) : '—'}
                        </td>
                        <td className="py-1.5 pr-2 text-center text-[var(--text-muted)]">{ln.nacht}</td>
                        <td className="py-1.5 pr-2 text-center text-amber-200/80">{ln.samstag}</td>
                        <td className="py-1.5 pr-2 text-center text-violet-200/80">{ln.sonntag}</td>
                        <td className="py-1.5 pr-2 text-[var(--text-muted)]">{ln.feiertag || '—'}</td>
                        <td className="py-1.5 pr-2 text-[var(--text-muted)]">{ln.besondererFeiertag || '—'}</td>
                        <td className="py-1.5 pr-2 text-[10px] leading-snug text-[var(--text-faint)] sm:text-xs">{ln.hinweis}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
