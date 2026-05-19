import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useStation } from '../../context/station-context'
import { apiGet } from '../../services/api'
import { PayrollDetailExtraFields } from '../../components/reports/PayrollDetailExtraFields'
import { useRequirePlanFeature } from '../../hooks/useRequirePlanFeature'
import {
  PAYROLL_TABLE,
  PAYROLL_THEAD_ROW,
  PAYROLL_ROW,
  PAYROLL_TH,
  PAYROLL_TD,
  PayrollTableScroll,
  formatDiffHoursDe,
  formatEuroDe,
  formatHoursDe,
  formatHoursOrDash,
  payrollTd,
  payrollTh,
} from '../../components/reports/payrollReportTable'

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
  scheduleShifts: { id: string; label: string; hours: number; plannedStart?: string; plannedEnd?: string }[]
  scheduledHours: number
  plannedPaidVacationHours?: number
  plannedOtherPaidAbsenceHours?: number
  timeEntries: {
    id: string
    startAt: string
    endAt: string | null
    hours: number
    open: boolean
    startTime?: string
    endTime?: string
    approvalStatus?: string
    pendingApproval?: boolean
    earlyLeaveReason?: string
    earlyLeaveNote?: string
    earlyLeaveMinutes?: number
    earlyLeaveDoc?: string
  }[]
  trackedHours: number
  usedHours: number
  differenceHours: number
  source: DaySource
  note: string
  highlight: DayHighlight
  daySupplementsEuro: number
  hasConflict: boolean
  scheduledMinutes?: number
  trackedMinutes?: number
  usedMinutes?: number
  plannedPaidVacationMinutes?: number
  plannedOtherPaidAbsenceMinutes?: number
  plannedStart?: string | null
  plannedEnd?: string | null
  actualStart?: string | null
  actualEnd?: string | null
  usedStart?: string | null
  usedEnd?: string | null
  deviationReason?: string | null
  isPublicHoliday?: boolean
  holidayNameDe?: string
  supplementDebug?: DaySupplementAudit
}

type SupplementLineDebug = {
  kind: string
  kindLabelDe: string
  percent: number
  hours: number
  hourlyWage: number
  amountEuro: number
}

type DaySupplementAudit = {
  date: string
  weekdayDe: string
  workHoursUsed: number
  vacationHours: number
  hourlyWage: number
  appliedBasis: 'schedule' | 'time_tracking' | 'none'
  scheduleBasisEuro: number
  timeTrackingBasisEuro: number
  isPublicHoliday: boolean
  isSpecialHoliday: boolean
  holidayNameDe: string
  holidayType: 'none' | 'regular' | 'special'
  lines: SupplementLineDebug[]
  dayTotalEuro: number
  linesSumEuro: number
  notInOriginalSystem: boolean
  formulaSummary: string
}

type EmployeeRow = {
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

type Audit = {
  detailUsedMinutes: number
  summaryUsedMinutes: number
  detailScheduleMinutes: number
  summaryScheduleMinutes: number
  deviationUsedMinutes: number
  deviationScheduleMinutes: number
  hints: string[]
}

type DetailPayload = {
  stationId: string
  stationName: string
  fromDate: string
  toDate: string
  hasPendingApprovedTime: boolean
  hasOpenRunningTimeEntries: boolean
  employee: EmployeeRow
  audit: Audit
}

function formatYmdDe(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d}.${m}.${y}`
}

function formatMinutesDe(m: number | undefined): string {
  return `${m ?? 0} Min.`
}

function minutesToHours(m: number): number {
  return Math.round((m / 60) * 100) / 100
}

function formatMinutesAndHours(m: number | undefined): string {
  const min = m ?? 0
  if (min <= 0) return '—'
  return `${formatMinutesDe(min)} · ${formatHoursDe(minutesToHours(min))}`
}

function formatHmRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return '—'
  if (start && end) return `${start}–${end}`
  return start ?? end ?? '—'
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

function holidayTypeLabelDe(t: DaySupplementAudit['holidayType']): string {
  switch (t) {
    case 'special':
      return 'B-Feiertag / besonderer Feiertag'
    case 'regular':
      return 'Normaler Feiertag'
    default:
      return '—'
  }
}

function supplementBasisLabelDe(b: DaySupplementAudit['appliedBasis']): string {
  switch (b) {
    case 'schedule':
      return 'Schichtplan'
    case 'time_tracking':
      return 'Zeiterfassung'
    default:
      return '—'
  }
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

function PageShell({ children }: { children: ReactNode }) {
  return <div className="space-y-6">{children}</div>
}

export function PayrollSummaryEmployeeDetailPage() {
  const { employeeId } = useParams<{ employeeId: string }>()
  const [searchParams] = useSearchParams()
  const { stationId, hasPermission } = useStation()
  const hasPayrollAudit = useRequirePlanFeature('payroll_audit')

  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''

  const canView = hasPermission('payroll.view') || hasPermission('reports.payroll')

  const [data, setData] = useState<DetailPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set())

  const backHref = useMemo(() => {
    const q = new URLSearchParams()
    if (from) q.set('from', from)
    if (to) q.set('to', to)
    const s = q.toString()
    return s ? `/reports/payroll-summary?${s}` : '/reports/payroll-summary'
  }, [from, to])

  const load = useCallback(async () => {
    if (!stationId || !employeeId || !from || !to || !canView) return
    setLoading(true)
    setError(null)
    const res = await apiGet<DetailPayload>(
      `/reports/payroll-combined/employee/${encodeURIComponent(employeeId)}`,
      { stationId, from, to },
    )
    if (!res.ok) {
      setData(null)
      setError(res.error)
    } else {
      setData(res.data)
    }
    setLoading(false)
  }, [stationId, employeeId, from, to, canView])

  useEffect(() => {
    void load()
  }, [load])

  const supplementDebugRows = useMemo(() => {
    if (!data?.employee.details) return []
    return data.employee.details
      .map((d) => d.supplementDebug)
      .filter((x): x is DaySupplementAudit => Boolean(x))
  }, [data])

  useEffect(() => {
    if (!data?.employee || supplementDebugRows.length === 0) return
    const payload = supplementDebugRows
      .filter((r) => r.dayTotalEuro > 0 || r.lines.length > 0)
      .map((r) => {
        const hol = r.lines.find((l) => l.kind === 'special_holiday' || l.kind === 'holiday')
        return {
          date: r.date,
          hours: r.workHoursUsed,
          wage: r.hourlyWage,
          holidayName: r.holidayNameDe || undefined,
          holidayType: r.holidayType === 'special' ? 'special' : r.holidayType === 'regular' ? 'regular' : undefined,
          percent: hol?.percent,
          amount: hol?.amountEuro ?? r.dayTotalEuro,
          basis: r.appliedBasis,
          notInOriginal: r.notInOriginalSystem || undefined,
        }
      })
    const supplementsTotal = Math.round(data.employee.supplementsTotal * 100) / 100
    console.info(
      `Payroll supplement debug ${data.employee.employeeName} ${data.fromDate} bis ${data.toDate}:`,
      payload,
      { supplementsTotal },
    )
  }, [data, supplementDebugRows])

  const toggleDayExpand = (key: string) => {
    setExpandedDays((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  }

  const emp = data?.employee
  const audit = data?.audit

  if (!hasPayrollAudit) {
    return (
      <PageShell>
        <PageHeader
          title="Lohnabrechnung Zusammenfassung"
          description="Kombinierte Lohnauswertung aus Schichtplan und Zeiterfassung."
        />
      </PageShell>
    )
  }

  if (!canView) {
    return (
      <PageShell>
        <p className="text-sm text-[var(--text-muted)]">Keine Berechtigung für Lohnabrechnung.</p>
      </PageShell>
    )
  }

  if (!from || !to) {
    return (
      <PageShell>
        <p className="text-sm text-amber-200/90">
          Zeitraum fehlt. Bitte von der{' '}
          <Link to="/reports/payroll-summary" className="text-cyan-300 underline">
            Zusammenfassung
          </Link>{' '}
          aus einen Mitarbeiter öffnen.
        </p>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-start gap-3">
        <Link to={backHref}>
          <Button type="button" variant="ghost" className="shrink-0">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Zusammenfassung
          </Button>
        </Link>
        <PageHeader
          title={emp?.employeeName ?? 'Mitarbeiter-Detail'}
          description={
            data
              ? `${data.stationName} · ${formatYmdDe(data.fromDate)} – ${formatYmdDe(data.toDate)}`
              : `${formatYmdDe(from)} – ${formatYmdDe(to)}`
          }
        />
      </div>

      {loading ? <p className="text-sm text-[var(--text-muted)]">Lade Daten…</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {emp && audit && data ? (
        <>
          {(data.hasPendingApprovedTime || data.hasOpenRunningTimeEntries) && (
            <Card className="border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100/90">
              {data.hasPendingApprovedTime ? <p>Es gibt noch nicht freigegebene Zeiterfassung.</p> : null}
              {data.hasOpenRunningTimeEntries ? <p>Es gibt laufende (offene) Zeiterfassungen.</p> : null}
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="text-xs text-[var(--text-faint)]">Schichtplan</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-sky-200">
                {formatHoursDe(emp.scheduleHoursTotal)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-[var(--text-faint)]">Zeiterfassung</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-violet-200">
                {formatHoursDe(emp.timeTrackingHoursTotal)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-[var(--text-faint)]">Verwendet</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-200">
                {formatHoursDe(emp.usedHoursTotal)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-[var(--text-faint)]">Summe Lohn</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-cyan-100">
                {formatEuroDe(emp.total)}
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="mb-3 text-base font-semibold text-[var(--text-main)]">Prüfsummen (Minuten)</h3>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs text-[var(--text-faint)]">Plan · Detail / Kopf</dt>
                <dd className="tabular-nums text-sky-200/90">
                  {formatMinutesDe(audit.detailScheduleMinutes)} / {formatMinutesDe(audit.summaryScheduleMinutes)}
                  {audit.deviationScheduleMinutes !== 0 ? (
                    <span className="ml-2 text-amber-200">
                      Δ {audit.deviationScheduleMinutes > 0 ? '+' : ''}
                      {audit.deviationScheduleMinutes} Min.
                    </span>
                  ) : (
                    <span className="ml-2 text-emerald-300/90">· OK</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-faint)]">Verwendet · Detail / Kopf</dt>
                <dd className="tabular-nums text-emerald-200/90">
                  {formatMinutesDe(audit.detailUsedMinutes)} / {formatMinutesDe(audit.summaryUsedMinutes)}
                  {audit.deviationUsedMinutes !== 0 ? (
                    <span className="ml-2 text-amber-200">
                      Δ {audit.deviationUsedMinutes > 0 ? '+' : ''}
                      {audit.deviationUsedMinutes} Min.
                    </span>
                  ) : (
                    <span className="ml-2 text-emerald-300/90">· OK</span>
                  )}
                </dd>
              </div>
            </dl>
            {audit.hints.length ? (
              <ul className="mt-4 list-inside list-disc text-xs text-[var(--text-muted)]">
                {audit.hints.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card className="p-6">
            <PayrollDetailExtraFields
              row={{
                employmentType: emp.employmentType,
                registeredHourlyWage: emp.registeredHourlyWage,
                hourlyWage: emp.hourlyWage,
                minimumWageNote: emp.minimumWageNote,
                overtimeHours: emp.overtimeHours,
                mankogeld: emp.mankogeld,
                vl: emp.vl,
                cashDifference: emp.cashDifference,
                bonus: emp.bonus,
                advance: emp.advance,
                paidVacationHours: emp.paidVacationHours,
                paidOtherAbsenceHours: emp.paidOtherAbsenceHours,
                missingTimeEntriesDayCount: emp.missingTimeEntriesDayCount,
                unplannedWorkDayCount: emp.unplannedWorkDayCount,
              }}
              showEmployment
              showAdvance
              showSummaryHints
            />
          </Card>

          <Card className="p-6">
            <h3 className="mb-4 text-base font-semibold text-[var(--text-main)]">Tagesübersicht</h3>
            <PayrollTableScroll>
              <table className={`${PAYROLL_TABLE} min-w-[1100px]`}>
                <thead>
                  <tr className={PAYROLL_THEAD_ROW}>
                    <th className={`${PAYROLL_TH} text-left`}>Datum</th>
                    <th className={payrollTh('plan')}>Plan</th>
                    <th className={`${PAYROLL_TH} text-left`}>Zeiten</th>
                    <th className={payrollTh('time')}>Erfasst</th>
                    <th className={payrollTh('used')}>Verwendet</th>
                    <th className={payrollTh('diff')}>Diff.</th>
                    <th className={payrollTh('vacation')}>Urlaub</th>
                    <th className={`${PAYROLL_TH} text-left`}>Quelle</th>
                    <th className={payrollTh('supplements')}>Zuschlag</th>
                    <th className={`${PAYROLL_TH} text-left`}>Hinweis</th>
                  </tr>
                </thead>
                <tbody>
                  {emp.details.map((d) => (
                    <tr key={d.date} className={`${PAYROLL_ROW} ${highlightClass(d.highlight)}`}>
                      <td className={`${PAYROLL_TD} text-left`}>
                        <div className="font-medium text-[var(--text-main)]">
                          {formatYmdDe(d.date)} · {d.weekdayDe}
                        </div>
                        {d.isPublicHoliday ? (
                          <div className="text-xs text-rose-200/90">{d.holidayNameDe ?? 'Feiertag'}</div>
                        ) : null}
                      </td>
                      <td className={payrollTd('plan')}>{formatMinutesAndHours(d.scheduledMinutes)}</td>
                      <td className={`${PAYROLL_TD} text-left text-xs text-[var(--text-muted)]`}>
                        <div className="space-y-0.5">
                          <div>Plan: {formatHmRange(d.plannedStart, d.plannedEnd)}</div>
                          <div>Gestempelt: {formatHmRange(d.actualStart, d.actualEnd)}</div>
                          <div className="text-[var(--text-main)]">
                            Verwendet: {formatHmRange(d.usedStart, d.usedEnd)}
                          </div>
                        </div>
                      </td>
                      <td className={payrollTd('time')}>{formatMinutesAndHours(d.trackedMinutes)}</td>
                      <td className={payrollTd('used')}>{formatMinutesAndHours(d.usedMinutes)}</td>
                      <td className={payrollTd('diff')}>{formatDiffHoursDe(d.differenceHours)}</td>
                      <td className={payrollTd('vacation')}>{formatHoursOrDash(d.plannedPaidVacationHours)}</td>
                      <td className={`${PAYROLL_TD} text-left text-slate-300/90`}>{sourceLabelDe(d.source)}</td>
                      <td className={payrollTd('supplements')}>
                        {formatEuroDe(d.daySupplementsEuro)}
                        {d.supplementDebug?.formulaSummary && d.supplementDebug.formulaSummary !== '—' ? (
                          <div className="mt-0.5 max-w-[200px] whitespace-normal text-xs font-normal text-amber-200/80">
                            {d.supplementDebug.formulaSummary}
                          </div>
                        ) : d.daySupplementsEuro <= 0 && d.supplementDebug ? (
                          <div className="mt-0.5 text-xs text-[var(--text-faint)]">Kein Zuschlag</div>
                        ) : null}
                      </td>
                      <td
                        className={`${PAYROLL_TD} max-w-[220px] whitespace-normal text-left text-xs text-[var(--text-muted)]`}
                      >
                        {d.note || (d.hasConflict ? 'Konflikt' : '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PayrollTableScroll>

            <p className="mt-4 text-xs text-[var(--text-muted)]">
              Plan/Erfasst/Verwendet: Minuten (exakt) und Stunden (2 Nachkommastellen). Farben in der Zeile wie in der
              Zusammenfassung.
            </p>

            <div className="mt-6 max-h-[60vh] space-y-2 overflow-y-auto">
              <h4 className="text-sm font-medium text-[var(--text-main)]">Schichten &amp; Stempel (aufklappbar)</h4>
              {emp.details.map((d) => {
                const dk = `${emp.employeeId}:${d.date}`
                const open = expandedDays.has(dk)
                return (
                  <div key={dk} className={`rounded-lg pl-2 ${highlightClass(d.highlight)}`}>
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center gap-2 py-2 pr-2 text-left text-sm text-[var(--text-main)]"
                      onClick={() => toggleDayExpand(dk)}
                    >
                      {open ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
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
                        <div className="tabular-nums text-[var(--text-muted)]">
                          Plan {formatHmRange(d.plannedStart, d.plannedEnd)} · Gestempelt{' '}
                          {formatHmRange(d.actualStart, d.actualEnd)} · Verwendet{' '}
                          {formatHmRange(d.usedStart, d.usedEnd)}
                          <br />
                          Minuten: Plan {formatMinutesDe(d.scheduledMinutes)} · Erfasst{' '}
                          {formatMinutesDe(d.trackedMinutes)} · Verwendet {formatMinutesDe(d.usedMinutes)}
                        </div>
                        {d.deviationReason ? (
                          <p className="text-amber-200/90">{d.deviationReason}</p>
                        ) : null}
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
                                      {te.startTime && te.endTime
                                        ? `${te.startTime}–${te.endTime}`
                                        : `${te.startAt} – ${te.endAt}`}{' '}
                                      · {formatHoursDe(te.hours)}
                                      {te.pendingApproval ? (
                                        <span className="text-amber-200/90"> · Freigabe ausstehend</span>
                                      ) : null}
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-[var(--text-faint)]">Keine erfasste Zeit.</span>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="mb-1 text-base font-semibold text-[var(--text-main)]">
              Zuschlags-Debug (Vergleich Originalsystem)
            </h3>
            <p className="mb-4 text-xs text-[var(--text-muted)]">
              Pro Tag: Stunden × Lohn × Prozent = Betrag. Plan- und Stempel-Basis nebeneinander. Referenztage im
              Originalsystem: 01.05. und 14.05.2026. Konsole:{' '}
              <code className="text-cyan-200/90">Payroll supplement debug …</code>
            </p>

            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-white/5 px-3 py-2 text-sm">
                <div className="text-xs text-[var(--text-faint)]">Zuschläge gesamt (Programm)</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-amber-200">
                  {formatEuroDe(emp.supplementsTotal)}
                </div>
              </div>
              <div className="rounded-lg bg-white/5 px-3 py-2 text-sm">
                <div className="text-xs text-[var(--text-faint)]">Summe Tages-Zuschlagszeilen</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-amber-200/90">
                  {formatEuroDe(supplementDebugRows.reduce((s, r) => s + r.dayTotalEuro, 0))}
                </div>
              </div>
              <div className="rounded-lg bg-white/5 px-3 py-2 text-sm">
                <div className="text-xs text-[var(--text-faint)]">Unerwartete Zuschlag-Tage</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-rose-200/90">
                  {supplementDebugRows.filter((r) => r.notInOriginalSystem && r.dayTotalEuro > 0).length}
                </div>
              </div>
            </div>

            <PayrollTableScroll>
              <table className={`${PAYROLL_TABLE} min-w-[1400px]`}>
                <thead>
                  <tr className={PAYROLL_THEAD_ROW}>
                    <th className={`${PAYROLL_TH} text-left`}>Datum</th>
                    <th className={`${PAYROLL_TH} text-left`}>Arbeit / Urlaub</th>
                    <th className={payrollTh('used')}>Std. Zuschlag</th>
                    <th className={payrollTh('muted')}>Lohn</th>
                    <th className={`${PAYROLL_TH} text-left`}>Feiertag</th>
                    <th className={`${PAYROLL_TH} text-left`}>Feiertagsart</th>
                    <th className={`${PAYROLL_TH} text-left`}>Zuschlagsart</th>
                    <th className={payrollTh('muted')}>%</th>
                    <th className={payrollTh('supplements')}>Betrag</th>
                    <th className={payrollTh('plan')}>Plan €</th>
                    <th className={payrollTh('time')}>Stempel €</th>
                    <th className={`${PAYROLL_TH} text-left`}>Quelle</th>
                    <th className={`${PAYROLL_TH} text-left`}>Formel</th>
                  </tr>
                </thead>
                <tbody>
                  {emp.details.flatMap((d) => {
                    const dbg = d.supplementDebug
                    if (!dbg) {
                      return [
                        <tr key={d.date} className={PAYROLL_ROW}>
                          <td className={`${PAYROLL_TD} text-left`} colSpan={13}>
                            {formatYmdDe(d.date)} · {d.weekdayDe} — keine Debug-Daten
                          </td>
                        </tr>,
                      ]
                    }
                    if (dbg.lines.length === 0 && dbg.dayTotalEuro <= 0) {
                      return [
                        <tr key={d.date} className={PAYROLL_ROW}>
                          <td className={`${PAYROLL_TD} text-left`}>
                            {formatYmdDe(dbg.date)} · {dbg.weekdayDe}
                          </td>
                          <td className={`${PAYROLL_TD} text-left text-xs`}>
                            Arbeit {formatHoursDe(dbg.workHoursUsed)}
                            {dbg.vacationHours > 0 ? ` · Urlaub ${formatHoursDe(dbg.vacationHours)}` : ''}
                          </td>
                          <td className={payrollTd('used')} colSpan={10}>
                            <span className="text-[var(--text-faint)]">Kein Zuschlag</span>
                          </td>
                        </tr>,
                      ]
                    }
                    return dbg.lines.map((line, idx) => (
                      <tr
                        key={`${dbg.date}-${line.kind}-${idx}`}
                        className={`${PAYROLL_ROW} ${dbg.notInOriginalSystem ? 'bg-rose-500/10' : ''}`}
                      >
                        {idx === 0 ? (
                          <>
                            <td className={`${PAYROLL_TD} text-left align-top`} rowSpan={dbg.lines.length}>
                              <div className="font-medium">{formatYmdDe(dbg.date)}</div>
                              <div className="text-xs text-[var(--text-muted)]">{dbg.weekdayDe}</div>
                              {dbg.notInOriginalSystem ? (
                                <div className="mt-1 text-xs font-medium text-rose-300">Nicht im Original</div>
                              ) : null}
                            </td>
                            <td className={`${PAYROLL_TD} text-left align-top text-xs`} rowSpan={dbg.lines.length}>
                              Arbeit {formatHoursDe(dbg.workHoursUsed)}
                              {dbg.vacationHours > 0 ? (
                                <>
                                  <br />
                                  Urlaub {formatHoursDe(dbg.vacationHours)}
                                </>
                              ) : null}
                            </td>
                            <td className={payrollTd('used')}>{formatHoursDe(line.hours)}</td>
                            <td className={payrollTd('muted')}>{formatEuroDe(line.hourlyWage)}</td>
                            <td className={`${PAYROLL_TD} text-left align-top text-xs`} rowSpan={dbg.lines.length}>
                              {dbg.isPublicHoliday || dbg.isSpecialHoliday ? (
                                <>
                                  Ja
                                  <br />
                                  <span className="text-rose-200/80">{dbg.holidayNameDe || 'Feiertag'}</span>
                                </>
                              ) : (
                                'Nein'
                              )}
                            </td>
                            <td className={`${PAYROLL_TD} text-left align-top text-xs`} rowSpan={dbg.lines.length}>
                              {holidayTypeLabelDe(dbg.holidayType)}
                            </td>
                          </>
                        ) : null}
                        <td className={`${PAYROLL_TD} text-left text-xs`}>{line.kindLabelDe}</td>
                        <td className={payrollTd('muted')}>{line.percent} %</td>
                        <td className={payrollTd('supplements')}>{formatEuroDe(line.amountEuro)}</td>
                        {idx === 0 ? (
                          <>
                            <td className={`${payrollTd('plan')} align-top`} rowSpan={dbg.lines.length}>
                              {formatEuroDe(dbg.scheduleBasisEuro)}
                            </td>
                            <td className={`${payrollTd('time')} align-top`} rowSpan={dbg.lines.length}>
                              {formatEuroDe(dbg.timeTrackingBasisEuro)}
                            </td>
                            <td className={`${PAYROLL_TD} text-left align-top text-xs`} rowSpan={dbg.lines.length}>
                              {supplementBasisLabelDe(dbg.appliedBasis)}
                              <br />
                              <span className="text-[var(--text-faint)]">{sourceLabelDe(d.source)}</span>
                            </td>
                            <td
                              className={`${PAYROLL_TD} max-w-[200px] whitespace-normal text-left align-top text-xs text-[var(--text-muted)]`}
                              rowSpan={dbg.lines.length}
                            >
                              {dbg.formulaSummary}
                            </td>
                          </>
                        ) : null}
                      </tr>
                    ))
                  })}
                </tbody>
              </table>
            </PayrollTableScroll>
          </Card>
        </>
      ) : null}
    </PageShell>
  )
}
