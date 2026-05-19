import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, FileSpreadsheet, Printer } from 'lucide-react'
import * as XLSX from 'xlsx'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useAuth } from '../../context/auth-context'
import { useStation } from '../../context/station-context'
import { useEmployees } from '../../context/employees-context'
import { apiGet } from '../../services/api'
import { PayrollSummaryMainTable } from '../../components/reports/PayrollSummaryMainTable'
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

type DaySource =
  | 'schedule'
  | 'time_tracking'
  | 'time_tracking_extra'
  | 'schedule_fallback'
  | 'paid_vacation'
  | 'paid_other_absence'
  | 'manual_correction'
  | 'none'

type DayHighlight = 'green' | 'yellow' | 'orange' | 'red' | 'neutral'

type DayDetail = {
  date: string
  weekdayDe: string
  scheduleShifts: { id: string; label: string; hours: number }[]
  scheduledHours: number
  plannedPaidVacationHours?: number
  plannedOtherPaidAbsenceHours?: number
  timeEntries: { id: string; startAt: string; endAt: string | null; hours: number; open: boolean; earlyLeaveDoc?: string }[]
  trackedHours: number
  usedHours: number
  differenceHours: number
  source: DaySource
  note: string
  highlight: DayHighlight
  daySupplementsEuro: number
  hasConflict: boolean
}

type ReportRow = {
  employeeId: string
  employeeName: string
  employmentType: string
  hourlyWage: number
  registeredHourlyWage?: number
  minimumWageNote?: string
  scheduleHoursTotal: number
  timeTrackingHoursTotal: number
  usedHoursTotal: number
  differenceHours: number
  extraUnplannedHours: number
  missingTimeEntriesDayCount: number
  unplannedWorkDayCount: number
  vacationDays: number
  paidVacationHours: number
  paidOtherAbsenceHours?: number
  overtimeHours: number
  basePay: number
  supplementsTotal: number
  mankogeld: number
  vl: number
  cashDifference: number
  bonus: number
  advance: number
  total: number
  messages?: string[]
  details: DayDetail[]
}

type Totals = {
  scheduleHours: number
  timeTrackingHours: number
  usedHours: number
  differenceHours: number
  extraUnplannedHours: number
  missingTimeEntriesDayCount: number
  unplannedWorkDayCount: number
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
  hasOpenRunningTimeEntries: boolean
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

function formatEuroDe(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

function formatHoursDe(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} Std.`
}

function formatYmdDe(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d}.${m}.${y}`
}

function formatPlanBreakdownDe(d: DayDetail): string {
  const vVac = d.plannedPaidVacationHours ?? 0
  const vOth = d.plannedOtherPaidAbsenceHours ?? 0
  const parts: string[] = []
  if (d.scheduledHours > 0) parts.push(`Schicht ${formatHoursDe(d.scheduledHours)}`)
  if (vVac > 0) parts.push(`Urlaub ${formatHoursDe(vVac)}`)
  if (vOth > 0) parts.push(`Abw. ${formatHoursDe(vOth)}`)
  return parts.length ? parts.join(' · ') : formatHoursDe(0)
}

function sourceLabelDe(s: DaySource): string {
  switch (s) {
    case 'schedule':
      return 'Schichtplan'
    case 'time_tracking':
      return 'Zeiterfassung'
    case 'time_tracking_extra':
      return 'Zeiterfassung (ohne Plan)'
    case 'schedule_fallback':
      return 'Schichtplan (Fallback)'
    case 'paid_vacation':
      return 'Bezahlter Urlaub'
    case 'paid_other_absence':
      return 'Bezahlte Abwesenheit'
    case 'manual_correction':
      return 'Manuell'
    default:
      return '—'
  }
}

function highlightClass(h: DayHighlight): string {
  switch (h) {
    case 'green':
      return 'border-l-4 border-emerald-500/80 bg-emerald-500/10'
    case 'yellow':
      return 'border-l-4 border-amber-500/80 bg-amber-500/10'
    case 'orange':
      return 'border-l-4 border-orange-500/80 bg-orange-500/10'
    case 'red':
      return 'border-l-4 border-rose-500/80 bg-rose-500/10'
    default:
      return 'border-l-4 border-white/10 bg-black/20'
  }
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
  'Schichtplan Std.',
  'Zeiterfassung Std.',
  'Verwendet Std.',
  'Differenz',
  'Zusatz Std.',
  'Ohne Stempel (Tage)',
  'Ohne Plan (Tage)',
  'U-Tage',
  'Eingetr. Stundenlohn',
  'Verwend. Stundenlohn',
  'Mindestlohn / Hinweis',
  'Grundlohn',
  'Zuschläge kum.',
  'Mankogeld',
  'VL',
  'Kassendifferenz',
  'Prämie',
  'Vorschuss',
  'Summe',
] as const

export function PayrollSummaryPage() {
  const { user } = useAuth()
  const { stationId, selectedStation, hasPermission } = useStation()
  const hasPayrollAudit = useRequirePlanFeature('payroll_audit')
  const { employees } = useEmployees()
  const employeesList = useMemo(
    () => employees.map((e) => ({ id: e.id, displayName: e.displayName })),
    [employees],
  )

  const canView = hasPermission('payroll.view') || hasPermission('reports.payroll')
  const canExport = hasPermission('reports.export') || hasPermission('payroll.export')

  const defaults = useMemo(() => monthStartToToday(), [])
  const [searchParams] = useSearchParams()
  const [from, setFrom] = useState(() => searchParams.get('from') || defaults.from)
  const [to, setTo] = useState(() => searchParams.get('to') || defaults.to)
  const [employmentFilter, setEmploymentFilter] = useState<EmploymentFilter>('all')
  const [employeeIdFilter, setEmployeeIdFilter] = useState<string>('')
  const [data, setData] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [detailEmployeeId, setDetailEmployeeId] = useState<string | null>(null)
  const [detailDays, setDetailDays] = useState<DayDetail[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [loadMessage, setLoadMessage] = useState('Lohnabrechnung wird berechnet…')
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set())
  const abortRef = useRef<AbortController | null>(null)
  const detailAbortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    if (!stationId || !canView) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setError(null)
    setLoadMessage('Lohnabrechnung wird berechnet…')
    const started = Date.now()
    const tick = window.setInterval(() => {
      const s = Math.round((Date.now() - started) / 1000)
      setLoadMessage(`Lohnabrechnung wird berechnet… (${s} s)`)
    }, 500)
    const q: Record<string, string> = {
      stationId,
      from,
      to,
      employmentType: employmentFilter,
      includeDetails: '0',
    }
    if (employeeIdFilter.trim()) q.employeeIds = employeeIdFilter.trim()
    const res = await apiGet<ReportPayload>('/reports/payroll-combined', q, {
      signal: ac.signal,
      timeoutMs: 60_000,
    })
    window.clearInterval(tick)
    if (ac.signal.aborted) return
    if (!res.ok) {
      setData(null)
      const isTimeout = res.error.includes('Zeitüberschreitung') || res.error.includes('timeout')
      const hint = isTimeout
        ? 'Die Einzelabrechnungen (Schichtplan/Zeiterfassung) laden, aber die Zusammenfassung konnte nicht erstellt werden. Bitte erneut berechnen oder Zeitraum verkürzen.'
        : null
      setError(
        [res.error, hint, `Station: ${stationId}`, `Zeitraum: ${from} – ${to}`].filter(Boolean).join(' · '),
      )
    } else {
      setData(res.data)
      setSelected(new Set())
      setDetailEmployeeId(null)
      setDetailDays([])
    }
    setLoading(false)
  }, [stationId, from, to, employmentFilter, employeeIdFilter, canView])

  useEffect(() => {
    void load()
    return () => abortRef.current?.abort()
  }, [load])

  useEffect(() => {
    if (!detailEmployeeId || !stationId) {
      setDetailDays([])
      return
    }
    detailAbortRef.current?.abort()
    const ac = new AbortController()
    detailAbortRef.current = ac
    setDetailLoading(true)
    void (async () => {
      const res = await apiGet<{ employee: ReportRow }>(
        `/reports/payroll-combined/employee/${encodeURIComponent(detailEmployeeId)}`,
        { stationId, from, to },
        { signal: ac.signal },
      )
      if (ac.signal.aborted) return
      setDetailDays(res.ok ? res.data.employee.details : [])
      setDetailLoading(false)
    })()
    return () => ac.abort()
  }, [detailEmployeeId, stationId, from, to])

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
        scheduleHours: acc.scheduleHours + r.scheduleHoursTotal,
        timeTrackingHours: acc.timeTrackingHours + r.timeTrackingHoursTotal,
        usedHours: acc.usedHours + r.usedHoursTotal,
        differenceHours: acc.differenceHours + r.differenceHours,
        extraUnplannedHours: acc.extraUnplannedHours + r.extraUnplannedHours,
        missingTimeEntriesDayCount: acc.missingTimeEntriesDayCount + r.missingTimeEntriesDayCount,
        unplannedWorkDayCount: acc.unplannedWorkDayCount + r.unplannedWorkDayCount,
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
        scheduleHours: 0,
        timeTrackingHours: 0,
        usedHours: 0,
        differenceHours: 0,
        extraUnplannedHours: 0,
        missingTimeEntriesDayCount: 0,
        unplannedWorkDayCount: 0,
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
      r.scheduleHoursTotal,
      r.timeTrackingHoursTotal,
      r.usedHoursTotal,
      r.differenceHours,
      r.extraUnplannedHours,
      r.missingTimeEntriesDayCount,
      r.unplannedWorkDayCount,
      r.vacationDays,
      r.registeredHourlyWage ?? '',
      r.hourlyWage,
      r.minimumWageNote ?? '',
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
          sum.scheduleHours,
          sum.timeTrackingHours,
          sum.usedHours,
          sum.differenceHours,
          sum.extraUnplannedHours,
          sum.missingTimeEntriesDayCount,
          sum.unplannedWorkDayCount,
          sum.vacationDays,
          '',
          '',
          '',
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

  const exportCsv = async (includeDetails: boolean) => {
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
    const exportRows = includeDetails
      ? await fetchRowsWithDetails(rowsForExport.map((r) => r.employeeId))
      : rowsForExport
    if (includeDetails && exportRows.length) {
      lines.push('')
      lines.push(esc('Tagesdetails'))
      for (const r of exportRows) {
        lines.push(esc(`--- ${r.employeeName} ---`))
        const dh = [
          'Datum',
          'Wochentag',
          'Plan Schicht Std.',
          'Plan Urlaub Std.',
          'Plan Sonst. Abw. Std.',
          'Erfasst Std.',
          'Verwendet',
          'Differenz',
          'Quelle',
          'Hinweis',
          'Zuschlag €',
        ]
        lines.push(dh.map(esc).join(';'))
        for (const d of r.details) {
          lines.push(
            [
              formatYmdDe(d.date),
              d.weekdayDe,
              d.scheduledHours,
              d.plannedPaidVacationHours ?? 0,
              d.plannedOtherPaidAbsenceHours ?? 0,
              d.trackedHours,
              d.usedHours,
              d.differenceHours,
              sourceLabelDe(d.source),
              d.note,
              d.daySupplementsEuro,
            ]
              .map(esc)
              .join(';'),
          )
        }
      }
    }
    const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `lohn-zusammenfassung_${from}_${to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const exportXlsx = async () => {
    const { head, body, foot } = buildSheetMatrix()
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([head, ...body, ...(foot ? [foot] : [])])
    XLSX.utils.book_append_sheet(wb, ws, 'Übersicht')
    const exportRows = await fetchRowsWithDetails(rowsForExport.map((r) => r.employeeId))
    if (exportRows.length) {
      const detailRows: (string | number)[][] = [
        [
          'Mitarbeiter',
          'Datum',
          'Wochentag',
          'Plan Schicht Std.',
          'Plan Urlaub Std.',
          'Plan Sonst. Abw. Std.',
          'Erfasst Std.',
          'Verwendet',
          'Differenz',
          'Quelle',
          'Hinweis',
          'Zuschlag €',
        ],
      ]
      for (const r of exportRows) {
        for (const d of r.details) {
          detailRows.push([
            r.employeeName,
            formatYmdDe(d.date),
            d.weekdayDe,
            d.scheduledHours,
            d.plannedPaidVacationHours ?? 0,
            d.plannedOtherPaidAbsenceHours ?? 0,
            d.trackedHours,
            d.usedHours,
            d.differenceHours,
            sourceLabelDe(d.source),
            d.note,
            d.daySupplementsEuro,
          ])
        }
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailRows), 'Tagesdetails')
    }
    XLSX.writeFile(wb, `lohn-zusammenfassung_${from}_${to}.xlsx`)
  }

  const detailRow = useMemo(() => data?.rows.find((r) => r.employeeId === detailEmployeeId) ?? null, [data, detailEmployeeId])

  const fetchRowsWithDetails = useCallback(
    async (employeeIds: string[]): Promise<ReportRow[]> => {
      if (!stationId) return []
      const res = await apiGet<ReportPayload>('/reports/payroll-combined', {
        stationId,
        from,
        to,
        employmentType: employmentFilter,
        employeeIds: employeeIds.join(','),
        includeDetails: '1',
      })
      return res.ok ? res.data.rows : []
    },
    [stationId, from, to, employmentFilter],
  )

  const toggleDayExpand = (key: string) => {
    setExpandedDays((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  }

  if (!hasPayrollAudit) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Lohnabrechnung Zusammenfassung"
          description="Kombinierte Lohnauswertung aus Schichtplan und Zeiterfassung."
        />
      </div>
    )
  }

  if (!stationId) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-xl font-semibold text-[var(--text-main)]">Lohnabrechnung Zusammenfassung</h1>
        <p className="text-sm text-[var(--text-muted)]">Bitte zuerst eine Station auswählen.</p>
      </div>
    )
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-xl font-semibold text-[var(--text-main)]">Lohnabrechnung Zusammenfassung</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Keine Berechtigung. Erforderlich: <span className="text-cyan-200/90">payroll.view</span> oder{' '}
          <span className="text-cyan-200/90">reports.payroll</span>.
        </p>
      </div>
    )
  }

  const metaLine = `${selectedStation?.name ?? data?.stationName ?? 'Station'} · ${from} – ${to}`

  return (
    <div className="space-y-6 pb-10 print:pb-0">
      <PageHeader
        title="Lohnabrechnung Zusammenfassung"
        description="Freigegebene Stempelzeiten pro Kalendertag (Europe/Berlin); ohne Stempelung gilt der Schichtplan. Plan, Ist und verwendete Zeit bleiben in den Details nachvollziehbar."
      />

      <p className="ui-info-banner rounded-lg px-3 py-2 text-sm">
        Freigegebene Stempelzeiten ersetzen die Planzeit. Ohne Stempelung wird der Schichtplan verwendet. Noch nicht
        freigegebene Zeiten sind in den Details sichtbar, fließen aber erst nach Freigabe in „verwendet“ ein. Offene
        Zeiterfassungen (ohne Ende) werden rot markiert.
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
          {employeesList.length ? (
            <label className="flex flex-col gap-1 text-sm text-[var(--text-muted)]">
              <span>Mitarbeiter</span>
              <select
                value={employeeIdFilter}
                onChange={(e) => setEmployeeIdFilter(e.target.value)}
                className="min-w-[14rem] rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-[var(--text-main)]"
              >
                <option value="">Alle Mitarbeitenden</option>
                {employeesList.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.displayName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
            <span>Bis (einschließlich)</span>
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
          onClick={() => void exportXlsx()}
          disabled={!canExport || !rowsForExport.length}
          title={!canExport ? 'reports.export oder payroll.export erforderlich' : undefined}
        >
          <FileSpreadsheet className="h-4 w-4" aria-hidden />
          Excel (XLSX)
        </Button>
        <Button type="button" variant="outline" onClick={() => exportCsv(false)} disabled={!canExport || !rowsForExport.length}>
          CSV (Übersicht)
        </Button>
        <Button type="button" variant="outline" onClick={() => exportCsv(true)} disabled={!canExport || !rowsForExport.length}>
          CSV + Tagesdetails
        </Button>
        {!canExport ? (
          <span className="text-xs text-[var(--text-faint)]">Export: reports.export oder payroll.export</span>
        ) : null}
      </div>

      {data?.hasPendingApprovedTime ? (
        <p className="text-sm text-amber-200/90">
          Es gibt noch nicht freigegebene Zeiteinträge im Zeitraum – die Zusammenfassung nutzt nur freigegebene Zeiten.
        </p>
      ) : null}
      {data?.hasOpenRunningTimeEntries ? (
        <p className="text-sm text-rose-300">
          Mindestens eine laufende Zeiterfassung ohne Ende im Zeitraum – bitte prüfen (rote Markierung in der Tagesdetailansicht).
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-rose-300" role="alert">
          {error}
        </p>
      ) : null}

      <Card padding="none" className="min-w-0 overflow-hidden border-cyan-500/15 print:border-white/20 print:shadow-none print:ring-0">
        <div id="payroll-summary-report-print" className="w-full p-6 print:p-2">
          <p className="mb-3 text-xs text-[var(--text-muted)] print:hidden">{metaLine}</p>
          <div className="mb-4 hidden print:block">
            <h2 className="text-lg font-semibold text-black">Lohnabrechnung Zusammenfassung</h2>
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
          ) : (
            <PayrollSummaryMainTable
              rows={data.rows}
              totals={data.totals}
              selected={selected}
              onToggleRow={toggleRow}
              onToggleAll={toggleAll}
              onOpenDetails={setDetailEmployeeId}
              periodFrom={from}
              periodTo={to}
            />
          )}
        </div>
      </Card>

      {detailRow ? (
        <Card className="p-6 print:hidden">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-[var(--text-main)]">
              Details · {detailRow.employeeName}
            </h3>
            <Button type="button" variant="ghost" onClick={() => setDetailEmployeeId(null)}>
              Schließen
            </Button>
          </div>
          <PayrollDetailExtraFields
            row={{
              registeredHourlyWage: detailRow.registeredHourlyWage,
              hourlyWage: detailRow.hourlyWage,
              minimumWageNote: detailRow.minimumWageNote,
              mankogeld: detailRow.mankogeld,
              vl: detailRow.vl,
              cashDifference: detailRow.cashDifference,
              bonus: detailRow.bonus,
              advance: detailRow.advance,
              paidVacationHours: detailRow.paidVacationHours,
              paidOtherAbsenceHours: detailRow.paidOtherAbsenceHours,
              missingTimeEntriesDayCount: detailRow.missingTimeEntriesDayCount,
              unplannedWorkDayCount: detailRow.unplannedWorkDayCount,
            }}
            showAdvance
            showSummaryHints
          />
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Farben: grün = Ist übernommen / passt, gelb = Schichtplan-Fallback, orange = kürzeres Ist / ohne Plan /
            Freigabe ausstehend, rot = offene Zeiterfassung oder fehlender Früh-Ende-Grund.
          </p>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto">
            {detailLoading ? (
              <p className="px-8 py-4 text-sm text-[var(--text-muted)]">Tagesdetails werden geladen…</p>
            ) : null}
            {detailDays.map((d) => {
              const dk = `${detailRow.employeeId}:${d.date}`
              const open = expandedDays.has(dk)
              return (
                <div key={dk} className={`rounded-lg pl-2 ${highlightClass(d.highlight)}`}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 py-2 pr-2 text-left text-sm text-[var(--text-main)]"
                    onClick={() => toggleDayExpand(dk)}
                  >
                    {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <span className="font-medium">
                      {formatYmdDe(d.date)} · {d.weekdayDe}
                    </span>
                    <span className="text-[var(--text-muted)]">
                      Plan {formatPlanBreakdownDe(d)} · erfasst {formatHoursDe(d.trackedHours)} → verwendet{' '}
                      <span className="text-[var(--text-main)]">{formatHoursDe(d.usedHours)}</span>
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-[var(--text-muted)]">{sourceLabelDe(d.source)}</span>
                  </button>
                  {d.note ? <p className="px-8 pb-1 text-xs text-[var(--text-muted)]">{d.note}</p> : null}
                  {open ? (
                    <div className="space-y-2 px-8 pb-3 text-xs">
                      {d.scheduleShifts.length ? (
                        <div>
                          <div className="font-medium text-[var(--text-muted)]">Schichtplan</div>
                          <ul className="list-inside list-disc">
                            {d.scheduleShifts.map((s) => (
                              <li key={`${s.id}-${s.label}`}>
                                {s.label} · {formatHoursDe(s.hours)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div className="text-[var(--text-faint)]">Keine Schicht geplant.</div>
                      )}
                      {(d.plannedPaidVacationHours ?? 0) > 0 || (d.plannedOtherPaidAbsenceHours ?? 0) > 0 ? (
                        <div>
                          <div className="font-medium text-[var(--text-muted)]">Geplante Abwesenheit (Lohn)</div>
                          <ul className="list-inside list-disc">
                            {(d.plannedPaidVacationHours ?? 0) > 0 ? (
                              <li>Bezahlter Urlaub · {formatHoursDe(d.plannedPaidVacationHours ?? 0)}</li>
                            ) : null}
                            {(d.plannedOtherPaidAbsenceHours ?? 0) > 0 ? (
                              <li>Sonstige bezahlte Abwesenheit · {formatHoursDe(d.plannedOtherPaidAbsenceHours ?? 0)}</li>
                            ) : null}
                          </ul>
                        </div>
                      ) : null}
                      <div>
                        <div className="font-medium text-[var(--text-muted)]">Zeiterfassung</div>
                        {d.timeEntries.length ? (
                          <ul className="space-y-1">
                            {d.timeEntries.map((te) => (
                              <li key={`${te.id}-${te.startAt}-${te.open ? 'o' : 'c'}`}>
                                {te.open ? (
                                  <span className="text-rose-300">Laufend · Start {te.startAt}</span>
                                ) : (
                                  <>
                                    {te.startAt} – {te.endAt} · {formatHoursDe(te.hours)}
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-[var(--text-faint)]">Keine erfasste Zeit.</span>
                        )}
                      </div>
                      <div className="tabular-nums text-[var(--text-muted)]">
                        Zuschlag (Tag): {formatEuroDe(d.daySupplementsEuro)} · Differenz verwendet vs. Plan:{' '}
                        {d.differenceHours > 0 ? '+' : ''}
                        {formatHoursDe(d.differenceHours)}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </Card>
      ) : null}
    </div>
  )
}
