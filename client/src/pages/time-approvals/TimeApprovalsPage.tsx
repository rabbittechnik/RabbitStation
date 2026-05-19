import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ClipboardCheck, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../context/auth-context'
import { apiGet, apiSend } from '../../services/api'
import { useStation } from '../../context/station-context'
import { canAccessTimeApprovalsPage, canApproveTimeEntries, canCorrectStampTimes } from '../../utils/timeApproval'
import { Button } from '../../components/ui/Button'
import { LargeReviewModal, LargeReviewSection } from '../../components/ui/LargeReviewModal'
import type { TimeEntry } from '../../types/timeTracking'
import { calculateWorkedMinutes, formatWorkedDuration } from '../../utils/timeTrackingUtils'
import { earlyLeaveReasonLabelDeClient } from '../../constants/earlyLeaveCheckout'
import { dispatchNotificationsRefresh } from '../../utils/notificationsRefresh'
import { useRequirePlanFeature } from '../../hooks/useRequirePlanFeature'

type PendingRow = TimeEntry & {
  employeeDisplayName: string
  latestCorrectionKind?: string
  needsAutoClockOutReview?: boolean
}

type ChecklistReviewItem = {
  id: string
  checklistKey: string
  label: string
  employeeChecked: boolean
  reviewChecked: boolean
  reviewComment: string
  reviewedBy?: string
  reviewedAt?: string
}

type ShiftCloseStructuredItem = {
  itemKey: string
  itemLabel: string
  answer: string
  reason?: string
}

type ShiftCloseStructuredDetail = {
  checklistType: string
  cashDifference: number
  truthConfirmed: boolean
  createdAt: string
  items: ShiftCloseStructuredItem[]
}

type ShiftCloseTaskResponseRow = {
  id: string
  taskId: string
  taskTitle: string
  outcome: string
  notDoneReason?: string
  recordedAt: string
  source: string
}

type MiddayCollectiveHandoverDetail = {
  confirmed: true
  remark?: string
  completedAt: string
  bulletTitles: string[]
  source?: string
}

type CorrectionApiItem = {
  id: string
  kind: string
  originalClockInAt: string
  originalClockOutAt?: string
  correctedClockInAt: string
  correctedClockOutAt?: string
  originalBreakMinutes: number
  correctedBreakMinutes: number
  reason: string
  reasonLabelDe: string
  note?: string
  correctedByName?: string
  createdAt: string
}

type DetailPayload = {
  timeEntry: TimeEntry
  workDateYmdBerlin?: string
  effectiveForPayroll?: { startAt: string; endAt?: string; breakMinutes: number }
  correctionsHistory?: CorrectionApiItem[]
  latestCorrection?: CorrectionApiItem | null
  employeeName: string
  checklist: Record<string, unknown> | null
  shiftCloseStructured?: ShiftCloseStructuredDetail | null
  middayCollectiveHandover?: MiddayCollectiveHandoverDetail | null
  checklistReviewItems?: ChecklistReviewItem[]
  shiftCloseTaskResponses?: ShiftCloseTaskResponseRow[]
  plannedShift: { id: string; date: string; startTime: string; endTime: string } | null
  bakingNotice?: {
    eligible: boolean
    popupOffered: boolean
    acknowledged: boolean
    acknowledgedAt?: string
    routineType?: string
    planTypeLabel?: string
    items: string[]
    remark?: string
  } | null
}

function sourceLabel(source: string): string {
  if (source === 'tablet' || source === 'cash_register_card_terminal') return 'Stations-Tablet'
  if (source === 'employee_mobile_app' || source === 'employee_app') return 'Mitarbeiter-App'
  if (source === 'manual') return 'Manuell'
  return source
}

function approvalBadge(s: string | undefined) {
  if (s === 'approved') return { text: 'Freigegeben', cls: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' }
  if (s === 'rejected') return { text: 'Abgelehnt', cls: 'border-rose-400/50 bg-rose-500/15 text-rose-100' }
  if (s === 'correction_required') return { text: 'Korrektur nötig', cls: 'border-violet-400/45 bg-violet-500/12 text-violet-100' }
  return { text: 'Wartet auf Freigabe', cls: 'border-amber-400/45 bg-amber-500/12 text-amber-100' }
}

function berlinHmFromIso(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const h = (parts.find((p) => p.type === 'hour')?.value ?? '0').padStart(2, '0')
  const m = (parts.find((p) => p.type === 'minute')?.value ?? '0').padStart(2, '0')
  return `${h}:${m}`
}

const TIME_CORRECTION_REASON_OPTIONS: { key: string; label: string }[] = [
  { key: 'system_error', label: 'Systemfehler' },
  { key: 'forgot_checkout', label: 'Mitarbeiter hat Ausstempeln vergessen' },
  { key: 'forgot_checkin', label: 'Mitarbeiter hat Einstempeln vergessen' },
  { key: 'wrong_stamp_time', label: 'falsche Stempelzeit' },
  { key: 'early_sick', label: 'früher gegangen wegen Krankheit' },
  { key: 'early_agreed_swap', label: 'früher gegangen wegen abgesprochenem Wechsel' },
  { key: 'late_handover', label: 'länger geblieben wegen Übergabe' },
  { key: 'late_customer_ops', label: 'länger geblieben wegen Kunden / Betrieb' },
  { key: 'management_correction', label: 'manuelle Leitungskorrektur' },
  { key: 'other', label: 'sonstiger Grund' },
]

type ApprovedLookupRow = PendingRow & { hasManualCorrection?: boolean }

export function TimeApprovalsPage() {
  const { user } = useAuth()
  const { stationId } = useStation()
  const [searchParams] = useSearchParams()
  const hasTimeApprovals = useRequirePlanFeature('time_approvals')
  const allowed = canAccessTimeApprovalsPage(user)
  const canApprove = canApproveTimeEntries(user)
  const canCorrect = canCorrectStampTimes(user)
  const [items, setItems] = useState<PendingRow[]>([])
  const [approvedItems, setApprovedItems] = useState<ApprovedLookupRow[]>([])
  const [approvedQ, setApprovedQ] = useState('')
  const [approvedFrom, setApprovedFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [approvedTo, setApprovedTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [approvedLoading, setApprovedLoading] = useState(false)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailPayload | null>(null)
  const [busy, setBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [corrOpen, setCorrOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [corrNote, setCorrNote] = useState('')
  const [tcOpen, setTcOpen] = useState(false)
  const [tcStartHm, setTcStartHm] = useState('')
  const [tcEndHm, setTcEndHm] = useState('')
  const [tcBreak, setTcBreak] = useState('0')
  const [tcReason, setTcReason] = useState('forgot_checkout')
  const [tcNote, setTcNote] = useState('')
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [reviewDraft, setReviewDraft] = useState<ChecklistReviewItem[]>([])

  useEffect(() => {
    if (!detail) {
      setReviewDraft([])
      return
    }
    setReviewDraft((detail.checklistReviewItems ?? []).map((i) => ({ ...i })))
  }, [detail])

  const load = useCallback(async () => {
    if (!allowed || !stationId) return
    setLoading(true)
    setErr(null)
    const res = await apiGet<{ items: PendingRow[]; count: number }>('/time-entries/pending-approval', {
      stationId: stationId!,
    })
    if (!res.ok) {
      setErr(res.error)
      setItems([])
      setCount(0)
    } else {
      setItems(res.data.items ?? [])
      setCount(res.data.count ?? 0)
    }
    setLoading(false)
  }, [allowed, stationId])

  useEffect(() => {
    void load()
  }, [load])

  const loadApprovedLookup = useCallback(async () => {
    if (!allowed || !stationId) return
    setApprovedLoading(true)
    const res = await apiGet<{ items: ApprovedLookupRow[] }>('/time-entries/approved-lookup', {
      stationId,
      from: approvedFrom,
      to: approvedTo,
      q: approvedQ.trim() || undefined,
      limit: '80',
    })
    setApprovedLoading(false)
    if (res.ok) setApprovedItems(res.data.items ?? [])
    else setApprovedItems([])
  }, [allowed, stationId, approvedFrom, approvedTo, approvedQ])

  useEffect(() => {
    void loadApprovedLookup()
  }, [loadApprovedLookup])

  const openDetail = useCallback(async (id: string) => {
    setBusy(true)
    const res = await apiGet<DetailPayload>(`/time-entries/${encodeURIComponent(id)}/detail`)
    setBusy(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setDetail(res.data)
  }, [])

  const entryFromUrl = searchParams.get('entry')
  const correctFromUrl = searchParams.get('correct') === '1'
  useEffect(() => {
    if (!entryFromUrl || !allowed) return
    void openDetail(entryFromUrl).then(() => {
      if (correctFromUrl) setTcOpen(true)
    })
  }, [entryFromUrl, correctFromUrl, allowed, openDetail])

  const detailIsApproved = detail?.timeEntry.approvalStatus === 'approved'

  const approve = async () => {
    if (!detail) return
    setBusy(true)
    const res = await apiSend<TimeEntry>('POST', `/time-entries/${encodeURIComponent(detail.timeEntry.id)}/approve`, {})
    setBusy(false)
    setConfirmApprove(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setDetail(null)
    await load()
    dispatchNotificationsRefresh()
  }

  const reject = async () => {
    if (!detail || !rejectReason.trim()) return
    setBusy(true)
    const res = await apiSend<TimeEntry>('POST', `/time-entries/${encodeURIComponent(detail.timeEntry.id)}/reject`, {
      rejectionReason: rejectReason.trim(),
    })
    setBusy(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setRejectOpen(false)
    setRejectReason('')
    setDetail(null)
    await load()
    dispatchNotificationsRefresh()
  }

  const requestCorr = async () => {
    if (!detail || !corrNote.trim()) return
    setBusy(true)
    const res = await apiSend<TimeEntry>(
      'POST',
      `/time-entries/${encodeURIComponent(detail.timeEntry.id)}/request-correction`,
      { correctionNote: corrNote.trim() },
    )
    setBusy(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setCorrOpen(false)
    setCorrNote('')
    setDetail(null)
    await load()
    dispatchNotificationsRefresh()
  }

  const openTimeCorrectForm = () => {
    if (!detail) return
    const eff = detail.effectiveForPayroll ?? {
      startAt: detail.timeEntry.startAt,
      endAt: detail.timeEntry.endAt,
      breakMinutes: detail.timeEntry.breakMinutes ?? 0,
    }
    setTcStartHm(berlinHmFromIso(eff.startAt))
    setTcEndHm(eff.endAt ? berlinHmFromIso(eff.endAt) : '')
    setTcBreak(String(Math.max(0, Math.round(Number(eff.breakMinutes ?? 0)))))
    setTcReason('forgot_checkout')
    setTcNote('')
    setTcOpen(true)
  }

  const submitTimeCorrection = async (approveAfter: boolean) => {
    if (!detail) return
    const workDateYmdBerlin = detail.workDateYmdBerlin ?? detail.timeEntry.startAt.slice(0, 10)
    if (tcReason === 'other' && !tcNote.trim()) {
      setErr('Bei „sonstiger Grund“ ist eine Bemerkung Pflicht.')
      return
    }
    if (!tcStartHm.trim() || !tcEndHm.trim()) {
      setErr('Bitte korrigierten Beginn und Ende (HH:mm) angeben.')
      return
    }
    setBusy(true)
    const res = await apiSend<{ detail: DetailPayload }>(
      'POST',
      `/time-entries/${encodeURIComponent(detail.timeEntry.id)}/correct-times`,
      {
        workDateYmdBerlin: workDateYmdBerlin,
        correctedStartHm: tcStartHm.trim(),
        correctedEndHm: tcEndHm.trim(),
        breakMinutes: Number(tcBreak) || 0,
        reason: tcReason,
        note: tcNote.trim() || undefined,
        keepApproved: detailIsApproved || approveAfter,
        approveAfter,
      },
    )
    setBusy(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setTcOpen(false)
    if (res.data.detail) setDetail(res.data.detail)
    await load()
    await loadApprovedLookup()
    dispatchNotificationsRefresh()
  }

  const saveChecklistReview = async () => {
    if (!detail || reviewDraft.length === 0) return
    setBusy(true)
    const res = await apiSend<DetailPayload>(
      'POST',
      `/time-entries/${encodeURIComponent(detail.timeEntry.id)}/checklist-review`,
      {
        items: reviewDraft.map((i) => ({
          id: i.id,
          reviewChecked: i.reviewChecked,
          reviewComment: i.reviewComment,
        })),
      },
    )
    setBusy(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setDetail(res.data)
    dispatchNotificationsRefresh()
  }

  if (!hasTimeApprovals) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-xl font-semibold text-[var(--text-main)]">Zeitfreigaben</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Freigabe und Korrektur von Zeiterfassungen ist ab RabbitStation Pro verfügbar.
        </p>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-xl font-semibold text-[var(--text-main)]">Zeitfreigaben</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Diese Seite ist nur für Teamleitung mit Berechtigung „Zeit freigeben“ oder „Zeiten korrigieren“ freigegeben.
        </p>
        <Link to="/dashboard" className="text-sm text-cyan-300 hover:underline">
          Zurück zum Dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
      </div>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-main)]">Zeitfreigaben</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Prüfe und bestätige gestempelte Arbeitszeiten, bevor sie für die Abrechnung übernommen werden.
        </p>
      </header>

      {err ? (
        <div className="rounded-lg border border-rose-400/35 bg-rose-500/10 px-4 py-2 text-sm text-rose-100">{err}</div>
      ) : null}

      <section className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)]/80 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
          <ClipboardCheck className="h-5 w-5 text-cyan-300" aria-hidden />
          <span className="font-medium text-[var(--text-main)]">Offene Zeitfreigaben</span>
          <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-100">
            {count}
          </span>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-[var(--text-muted)]">Lade…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-[var(--text-muted)]">Keine offenen Freigaben.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left text-sm">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Mitarbeiter</th>
                  <th className="px-3 py-2 font-medium">Datum</th>
                  <th className="px-3 py-2 font-medium">Start – Ende</th>
                  <th className="px-3 py-2 font-medium">Dauer</th>
                  <th className="px-3 py-2 font-medium">Quelle</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const mins = calculateWorkedMinutes(row.startAt, row.endAt, new Date())
                  const ab = approvalBadge(row.approvalStatus)
                  const earlyAttention =
                    row.endDeviationType === 'early' &&
                    (row.endDeviationMinutes ?? 0) > 30 &&
                    (row.source === 'tablet' || row.source === 'cash_register_card_terminal')
                  const earlyRowCls = earlyAttention
                    ? row.earlyLeaveReason
                      ? 'border-l-4 border-amber-400/90 bg-amber-500/[0.07]'
                      : 'border-l-4 border-rose-500/90 bg-rose-500/[0.07]'
                    : ''
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-[var(--border-subtle)] hover:bg-white/[0.02] ${earlyRowCls}`}
                    >
                      <td className="px-3 py-2 font-medium text-[var(--text-main)]">{row.employeeDisplayName}</td>
                      <td className="px-3 py-2 text-[var(--text-muted)]">{row.startAt.slice(0, 10)}</td>
                      <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">
                        {new Date(row.startAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} –{' '}
                        {row.endAt
                          ? new Date(row.endAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-cyan-200/85">{formatWorkedDuration(mins)}</td>
                      <td className="px-3 py-2 text-[var(--text-muted)]">{sourceLabel(row.source)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ab.cls}`}>
                          {ab.text}
                        </span>
                        {row.latestCorrectionKind === 'manual' ? (
                          <span className="ml-1 inline-flex rounded-full border border-violet-400/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-100">
                            Korrigiert
                          </span>
                        ) : null}
                        {row.needsAutoClockOutReview ? (
                          <span className="ml-1 inline-flex rounded-full border border-amber-400/45 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
                            Auto-Ausstempelung
                          </span>
                        ) : null}
                        {earlyAttention ? (
                          <p className="mt-1 text-[11px] text-amber-100/90">
                            {row.earlyLeaveReason
                              ? `Früher um ${row.endDeviationMinutes ?? '—'} Min. – ${earlyLeaveReasonLabelDeClient(String(row.earlyLeaveReason))}`
                              : 'Früher beendet ohne dokumentierten Grund — Prüfen erforderlich'}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button type="button" variant="outline" className="text-xs" onClick={() => void openDetail(row.id)}>
                          Prüfen
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-white/10 bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold text-[var(--text-main)]">Freigegebene Zeiten korrigieren</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Bereits freigegebene Buchungen können nachträglich korrigiert werden (revisionssicher, Lohnabrechnung nutzt die
          korrigierte Zeit).
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
            Von
            <input
              type="date"
              value={approvedFrom}
              onChange={(e) => setApprovedFrom(e.target.value)}
              className="rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
            Bis
            <input
              type="date"
              value={approvedTo}
              onChange={(e) => setApprovedTo(e.target.value)}
              className="rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-[var(--text-muted)]">
            Suche (Name / Datum)
            <input
              type="search"
              value={approvedQ}
              onChange={(e) => setApprovedQ(e.target.value)}
              className="rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm"
              placeholder="z. B. Max Vins"
            />
          </label>
          <Button type="button" variant="outline" disabled={approvedLoading} onClick={() => void loadApprovedLookup()}>
            Suchen
          </Button>
        </div>
        {approvedLoading ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">Lade freigegebene Zeiten…</p>
        ) : !approvedItems.length ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">Keine freigegebenen Einträge im Zeitraum.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-[var(--text-faint)]">
                <tr>
                  <th className="px-3 py-2">Mitarbeiter</th>
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2">Gestempelt</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {approvedItems.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--border-subtle)]">
                    <td className="px-3 py-2">{row.employeeDisplayName}</td>
                    <td className="px-3 py-2">{row.startAt.slice(0, 10)}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {new Date(row.startAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} –{' '}
                      {row.endAt
                        ? new Date(row.endAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {row.hasManualCorrection ? (
                        <span className="text-violet-200">korrigiert</span>
                      ) : (
                        <span className="text-emerald-200">freigegeben</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button type="button" variant="outline" className="text-xs" onClick={() => void openDetail(row.id)}>
                        Öffnen / korrigieren
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detail ? (
        <LargeReviewModal
          open
          titleId="time-entry-review-dialog"
          title="Zeitbuchung prüfen"
          subtitle={<p className="text-sm text-[var(--text-muted)]">{detail.employeeName}</p>}
          zIndexClass="z-[90]"
          backdropDisabled={busy}
          onBackdropClose={() => {
            if (!busy) setDetail(null)
          }}
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setDetail(null)} disabled={busy}>
                Schließen
              </Button>
              {canCorrect && detail.timeEntry.status === 'completed' && detail.timeEntry.endAt ? (
                <Button
                  type="button"
                  variant="outline"
                  className="border-violet-400/40 text-violet-100"
                  disabled={busy}
                  onClick={() => openTimeCorrectForm()}
                >
                  Zeit korrigieren
                </Button>
              ) : null}
              {canApprove && !detailIsApproved ? (
                <>
                  <Button type="button" variant="outline" onClick={() => setCorrOpen(true)} disabled={busy}>
                    Korrektur nötig
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-rose-400/40 text-rose-200"
                    onClick={() => setRejectOpen(true)}
                    disabled={busy}
                  >
                    Ablehnen
                  </Button>
                  <Button type="button" variant="primary" onClick={() => setConfirmApprove(true)} disabled={busy}>
                    Bestätigen
                  </Button>
                </>
              ) : null}
            </>
          }
        >
          <div className="review-modal-content grid grid-cols-1 gap-4 min-[1000px]:grid-cols-2 min-[1400px]:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-4">
              {detailIsApproved ? (
                <p className="rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-50/95">
                  Diese Zeitbuchung wurde bereits freigegeben. Korrekturen werden revisionssicher protokolliert und
                  fließen in die Lohnabrechnung ein.
                </p>
              ) : null}
              <LargeReviewSection title="Basisdaten & Zeiten">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-faint)]">Datum</dt>
                <dd className="text-[var(--text-main)]">{detail.timeEntry.startAt.slice(0, 10)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-faint)]">Geplant</dt>
                <dd className="text-[var(--text-main)]">
                  {detail.plannedShift
                    ? `${detail.plannedShift.startTime} – ${detail.plannedShift.endTime}`
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-faint)]">Gestempelt</dt>
                <dd className="text-[var(--text-main)] tabular-nums">
                  {new Date(detail.timeEntry.startAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} –{' '}
                  {detail.timeEntry.endAt
                    ? new Date(detail.timeEntry.endAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </dd>
              </div>
              {(() => {
                const hist = detail.correctionsHistory ?? []
                const effPay = detail.effectiveForPayroll ?? {
                  startAt: detail.timeEntry.startAt,
                  endAt: detail.timeEntry.endAt,
                  breakMinutes: detail.timeEntry.breakMinutes ?? 0,
                }
                const stampedDiffers =
                  detail.timeEntry.startAt !== effPay.startAt ||
                  detail.timeEntry.endAt !== effPay.endAt ||
                  (detail.timeEntry.breakMinutes ?? 0) !== effPay.breakMinutes
                const show = hist.length > 0 || stampedDiffers
                if (!show) return null
                return (
                  <>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--text-faint)]">Verwendet für Abrechnung</dt>
                      <dd className="text-right text-[var(--text-main)] tabular-nums">
                        {new Date(effPay.startAt).toLocaleTimeString('de-DE', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        –{' '}
                        {effPay.endAt
                          ? new Date(effPay.endAt).toLocaleTimeString('de-DE', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                        <span className="block text-[10px] font-normal text-[var(--text-faint)]">
                          Pause {effPay.breakMinutes} Min.
                        </span>
                      </dd>
                    </div>
                    {detail.latestCorrection?.kind === 'manual' ? (
                      <div className="rounded-md border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-50/95">
                        <p className="font-semibold text-violet-100">Korrigiert</p>
                        <p className="mt-1 text-[var(--text-faint)]">
                          Original gestempelt:{' '}
                          {new Date(detail.latestCorrection.originalClockInAt).toLocaleTimeString('de-DE', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          –{' '}
                          {detail.latestCorrection.originalClockOutAt
                            ? new Date(detail.latestCorrection.originalClockOutAt).toLocaleTimeString('de-DE', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </p>
                        <p className="mt-1">
                          Korrigiert auf:{' '}
                          {new Date(detail.latestCorrection.correctedClockInAt).toLocaleTimeString('de-DE', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          –{' '}
                          {detail.latestCorrection.correctedClockOutAt
                            ? new Date(detail.latestCorrection.correctedClockOutAt).toLocaleTimeString('de-DE', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </p>
                        <p className="mt-1">Grund: {detail.latestCorrection.reasonLabelDe}</p>
                        {detail.latestCorrection.note ? <p className="mt-1">Bemerkung: {detail.latestCorrection.note}</p> : null}
                        <p className="mt-1 text-[10px] text-[var(--text-faint)]">
                          Korrigiert von: {detail.latestCorrection.correctedByName ?? '—'} ·{' '}
                          {new Date(detail.latestCorrection.createdAt).toLocaleString('de-DE')}
                        </p>
                      </div>
                    ) : null}
                    {detail.latestCorrection?.kind === 'auto_clock_out' ? (
                      <div className="rounded-md border border-amber-400/45 bg-amber-500/12 px-3 py-2 text-xs text-amber-50">
                        <p className="font-semibold text-amber-100">Automatisch ausgestempelt — bitte prüfen</p>
                        {detail.timeEntry.endNote ? <p className="mt-1">{detail.timeEntry.endNote}</p> : null}
                      </div>
                    ) : null}
                  </>
                )
              })()}
              {detail.timeEntry.startDeviationType && detail.timeEntry.startDeviationType !== 'on_time' ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-faint)]">Start vs. Plan</dt>
                  <dd className="text-right text-[var(--text-main)]">
                    {detail.timeEntry.startDeviationType === 'no_planned_shift'
                      ? 'Keine Plan-Schicht'
                      : `${detail.timeEntry.startDeviationType === 'early' ? 'Früher' : 'Später'}: ${detail.timeEntry.startDeviationMinutes ?? '—'} Min.`}
                  </dd>
                </div>
              ) : null}
              {detail.timeEntry.endDeviationType && detail.timeEntry.endDeviationType !== 'on_time' ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-faint)]">Ende vs. Plan</dt>
                  <dd className="text-right text-[var(--text-main)]">
                    {detail.timeEntry.endDeviationType === 'no_planned_shift'
                      ? 'Kein geplantes Schichtende (ohne Plan-Schicht)'
                      : `${detail.timeEntry.endDeviationType === 'early' ? 'Früher' : 'Später'}: ${detail.timeEntry.endDeviationMinutes ?? '—'} Min.`}
                  </dd>
                </div>
              ) : null}
              {detail.timeEntry.endDeviationType === 'early' &&
              (detail.timeEntry.endDeviationMinutes ?? 0) > 30 &&
              (detail.timeEntry.source === 'tablet' || detail.timeEntry.source === 'cash_register_card_terminal') ? (
                <div
                  className={`mt-3 rounded-lg border p-3 text-sm ${
                    detail.timeEntry.earlyLeaveReason
                      ? 'border-amber-400/40 bg-amber-500/10 text-amber-50/95'
                      : 'border-rose-400/45 bg-rose-500/10 text-rose-50/95'
                  }`}
                >
                  <p className="font-semibold">
                    {detail.timeEntry.earlyLeaveReason
                      ? `Früher beendet (${detail.timeEntry.endDeviationMinutes ?? '—'} Min.) – Grund dokumentiert`
                      : `Früher beendet (${detail.timeEntry.endDeviationMinutes ?? '—'} Min.) – ohne Grund / unvollständig`}
                  </p>
                  {detail.timeEntry.earlyLeaveReason ? (
                    <>
                      <p className="mt-2">
                        <span className="text-[var(--text-faint)]">Grund:</span>{' '}
                        {earlyLeaveReasonLabelDeClient(String(detail.timeEntry.earlyLeaveReason))}
                      </p>
                      {detail.timeEntry.earlyLeaveNote ? (
                        <p className="mt-1">
                          <span className="text-[var(--text-faint)]">Bemerkung:</span> {detail.timeEntry.earlyLeaveNote}
                        </p>
                      ) : null}
                      {detail.timeEntry.earlyLeaveConfirmedAt ? (
                        <p className="mt-2 text-xs text-[var(--text-faint)]">
                          Bestätigt am{' '}
                          {new Date(detail.timeEntry.earlyLeaveConfirmedAt).toLocaleString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-1 text-xs">Status: Prüfen erforderlich</p>
                  )}
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-faint)]">Quelle</dt>
                <dd className="text-[var(--text-main)]">{sourceLabel(detail.timeEntry.source)}</dd>
              </div>
            </dl>
              </LargeReviewSection>
            </div>

            <div className="min-w-0 space-y-4">
              <LargeReviewSection title="Übergabe, Checklisten & Hinweise">
              <div className="space-y-4">
            {detail.middayCollectiveHandover ? (
              <div className="mt-4 rounded-md border border-emerald-400/30 bg-emerald-500/8 p-3 text-sm text-[var(--text-muted)]">
                <p className="font-semibold text-[var(--text-main)]">Schichtübergabe (ca. 13–15 Uhr)</p>
                <p className="mt-2 text-[var(--text-main)]">
                  <span className="text-emerald-200/95">Bestätigt:</span> Ja
                </p>
                <p className="mt-1 text-xs text-[var(--text-faint)]">
                  Schichtübergabe wurde bestätigt.
                  {detail.middayCollectiveHandover.source ? (
                    <span> Quelle: {sourceLabel(detail.middayCollectiveHandover.source)}.</span>
                  ) : null}
                  {detail.middayCollectiveHandover.completedAt
                    ? ` (${new Date(detail.middayCollectiveHandover.completedAt).toLocaleString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })})`
                    : null}
                </p>
                {detail.middayCollectiveHandover.remark ? (
                  <p className="mt-2 rounded border border-white/10 bg-black/20 px-2 py-2 text-[var(--text-main)]">
                    <span className="font-medium text-cyan-200/90">Bemerkung:</span> {detail.middayCollectiveHandover.remark}
                  </p>
                ) : null}
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-[var(--text-faint)]">Angezeigte Prüfpunkte (Snapshot)</summary>
                  <ul className="mt-2 list-inside list-disc space-y-0.5 text-[var(--text-faint)]">
                    {detail.middayCollectiveHandover.bulletTitles.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </details>
              </div>
            ) : null}

            {detail.shiftCloseStructured ? (
              <div className="mt-4 rounded-md border border-orange-400/25 bg-orange-500/5 p-3 text-xs text-[var(--text-muted)]">
                <div className="flex flex-wrap items-center gap-2">
                  {detail.shiftCloseStructured.items.some((i) => i.answer === 'no') ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
                  ) : null}
                  <p className="font-semibold text-[var(--text-main)]">
                    Schichtende-Checkliste (
                    {detail.shiftCloseStructured.checklistType === 'closing' ? 'Ladenschluss' : 'Übergabe ca. 14:00'})
                  </p>
                </div>
                {detail.shiftCloseStructured.items.some((i) => i.answer === 'no') ? (
                  <p className="mt-1.5 text-[11px] font-medium text-amber-100/95">
                    Nicht alle Punkte als erledigt markiert — Details siehe Liste.
                  </p>
                ) : (
                  <p className="mt-1.5 text-[11px] text-emerald-200/90">
                    Checkliste bestätigt (alle Punkte erledigt, wahrheitsgemäß bestätigt).
                  </p>
                )}
                <ul className="mt-2 max-h-[min(340px,40vh)] space-y-1.5 overflow-y-auto">
                  {detail.shiftCloseStructured.items.map((it) => {
                    const ans =
                      it.answer === 'yes' ? 'Ja' : it.answer === 'no' ? 'Nein' : it.answer === 'not_relevant' ? 'Nicht relevant' : it.answer
                    const isNo = it.answer === 'no'
                    return (
                      <li
                        key={it.itemKey}
                        className={`rounded border px-2 py-1.5 ${isNo ? 'border-amber-400/40 bg-amber-500/10' : 'border-white/10 bg-black/20'}`}
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="text-[var(--text-main)]">{it.itemLabel}</span>
                          <span className={isNo ? 'font-semibold text-amber-200' : 'text-cyan-200/90'}>{ans}</span>
                        </div>
                        {isNo && it.reason ? (
                          <p className="mt-1 text-[11px] font-medium text-amber-100/95">Begründung: {it.reason}</p>
                        ) : null}
                        {!isNo && it.reason ? (
                          <p className="mt-1 text-[11px] text-[var(--text-faint)]">Hinweis: {it.reason}</p>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
                <p className="mt-2 text-[var(--text-main)]">
                  Kassendifferenz:{' '}
                  <span className="font-semibold tabular-nums">
                    {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
                      Number(detail.shiftCloseStructured.cashDifference ?? 0),
                    )}
                  </span>
                </p>
              </div>
            ) : null}

            {detail.shiftCloseTaskResponses && detail.shiftCloseTaskResponses.length > 0 ? (
              <div
                className={`mt-4 rounded-md border p-3 text-xs text-[var(--text-muted)] ${
                  detail.shiftCloseTaskResponses.some((r) => String(r.outcome).toLowerCase() === 'not_done')
                    ? 'border-amber-400/40 bg-amber-500/10'
                    : 'border-cyan-500/20 bg-cyan-500/5'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {detail.shiftCloseTaskResponses.some((r) => String(r.outcome).toLowerCase() === 'not_done') ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
                  ) : null}
                  <p className="font-semibold text-[var(--text-main)]">Pflicht- / Abschlussaufgaben (Schichtende)</p>
                </div>
                <p className="mt-1.5 text-[11px] text-[var(--text-faint)]">
                  Angaben des Mitarbeiters beim Ausstempeln — inkl. Quelle und Zeitpunkt.
                </p>
                <ul className="mt-2 max-h-[min(300px,36vh)] space-y-2 overflow-y-auto">
                  {detail.shiftCloseTaskResponses.map((r) => {
                    const notDone = String(r.outcome).toLowerCase() === 'not_done'
                    const done = String(r.outcome).toLowerCase() === 'done'
                    const statusLabel = done ? 'Erledigt' : notDone ? 'Nicht erledigt' : r.outcome
                    return (
                      <li
                        key={r.id}
                        className={`rounded border px-2 py-2 ${
                          notDone ? 'border-amber-400/45 bg-amber-500/15' : 'border-white/10 bg-black/25'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <span className="font-medium text-[var(--text-main)]">{r.taskTitle}</span>
                          <span
                            className={
                              notDone ? 'shrink-0 font-semibold text-amber-200' : 'shrink-0 font-medium text-emerald-200/90'
                            }
                          >
                            {statusLabel}
                          </span>
                        </div>
                        {notDone && r.notDoneReason ? (
                          <p className="mt-1.5 text-[11px] font-medium text-amber-100/95">Begründung: {r.notDoneReason}</p>
                        ) : null}
                        <p className="mt-1.5 text-[10px] text-[var(--text-faint)]">
                          Quelle: {sourceLabel(r.source)} ·{' '}
                          {r.recordedAt
                            ? new Date(r.recordedAt).toLocaleString('de-DE', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}

            {detail.bakingNotice && (detail.bakingNotice.popupOffered || detail.bakingNotice.acknowledged) ? (
              <div className="mt-4 rounded-md border border-amber-400/25 bg-amber-500/8 p-3 text-sm text-[var(--text-muted)]">
                <p className="font-semibold text-[var(--text-main)]">Backwaren-Hinweis (Frühschicht)</p>
                <p className="mt-1">
                  Hinweis angeboten:{' '}
                  <span className="font-medium text-[var(--text-main)]">
                    {detail.bakingNotice.popupOffered ? 'Ja' : 'Nein'}
                  </span>
                </p>
                <p className="mt-1">
                  Bestätigt:{' '}
                  <span className={detail.bakingNotice.acknowledged ? 'font-medium text-emerald-200' : 'font-medium text-amber-200'}>
                    {detail.bakingNotice.acknowledged ? 'Ja' : 'Nein'}
                  </span>
                </p>
                {detail.bakingNotice.planTypeLabel ? (
                  <p className="mt-1">
                    Routine-Typ: <span className="text-[var(--text-main)]">{detail.bakingNotice.planTypeLabel}</span>
                  </p>
                ) : null}
                {detail.bakingNotice.acknowledged && detail.bakingNotice.acknowledgedAt ? (
                  <p className="mt-1 text-[11px] text-[var(--text-faint)]">
                    Backshop-Popup bestätigt um{' '}
                    {new Date(detail.bakingNotice.acknowledgedAt).toLocaleTimeString('de-DE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    Uhr (
                    {new Date(detail.bakingNotice.acknowledgedAt).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                    ).
                  </p>
                ) : null}
                {detail.bakingNotice.items?.length ? (
                  <ul className="mt-2 list-inside list-disc text-[11px] text-[var(--text-faint)]">
                    {detail.bakingNotice.items.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {detail.bakingNotice.remark ? (
                  <p className="mt-2 rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[var(--text-main)]">
                    <span className="text-[var(--text-faint)]">Bemerkung:</span> {detail.bakingNotice.remark}
                  </p>
                ) : null}
              </div>
            ) : null}

            {!detail.shiftCloseStructured && detail.checklist ? (
              <div className="mt-4 rounded-md border border-white/10 bg-black/20 p-3 text-xs text-[var(--text-muted)]">
                <p className="font-semibold text-[var(--text-main)]">Abschluss-Checkliste</p>
                <ul className="mt-2 list-inside list-disc space-y-0.5">
                  <li>Kühlschrank: {detail.checklist.fridgeFronted ? 'Ja' : 'Nein'}</li>
                  <li>Getränke: {detail.checklist.drinksFilled ? 'Ja' : 'Nein'}</li>
                  <li>Zigaretten: {detail.checklist.cigarettesFilled ? 'Ja' : 'Nein'}</li>
                  <li>Regale: {detail.checklist.shelvesFilled ? 'Ja' : 'Nein'}</li>
                  <li>Mülleimer: {detail.checklist.trashEmptied ? 'Ja' : 'Nein'}</li>
                  <li>Kasse sauber: {detail.checklist.counterClean ? 'Ja' : 'Nein'}</li>
                  <li>Backshop: {detail.checklist.coffeeAreaClean ? 'Ja' : 'Nein'}</li>
                  <li>Außen: {detail.checklist.outsideChecked ? 'Ja' : 'Nein'}</li>
                  <li>Vorkommnisse notiert: {detail.checklist.incidentsNoted ? 'Ja' : 'Nein'}</li>
                  <li>Übergabe: {detail.checklist.handoverPossible ? 'Ja' : 'Nein'}</li>
                  <li>Zuschließbar: {detail.checklist.closingReady ? 'Ja' : 'Nein'}</li>
                </ul>
                <p className="mt-2 text-[var(--text-main)]">
                  Kassendifferenz:{' '}
                  <span className="font-semibold tabular-nums">
                    {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
                      Number(detail.checklist.cashDifference ?? 0),
                    )}
                  </span>
                </p>
                {String(detail.checklist.incidentNote ?? '').trim() ? (
                  <p className="mt-2 text-[var(--text-faint)]">
                    Bemerkung: {String(detail.checklist.incidentNote)}
                  </p>
                ) : null}
              </div>
            ) : null}
              </div>
              </LargeReviewSection>
            </div>

            <div className="min-w-0 space-y-4">
            {canApprove && reviewDraft.length > 0 ? (
              <LargeReviewSection title="Nachprüfung durch Leitung">
              <div className="text-xs text-[var(--text-muted)]">
                <p className="text-[var(--text-faint)]">
                  Wenn die Leitung einen Punkt nicht bestätigt, obwohl der Mitarbeiter ihn als erledigt markiert hat, wird
                  eine dokumentierte Beanstandung erzeugt.
                </p>
                <ul className="mt-3 space-y-3">
                  {reviewDraft.map((row) => (
                    <li key={row.id} className="rounded-md border border-white/10 bg-black/20 p-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-[var(--text-main)]">{row.label}</p>
                          <p className="text-[var(--text-faint)]">
                            Mitarbeiter: {row.employeeChecked ? 'Ja' : 'Nein'}
                          </p>
                        </div>
                        <label className="flex cursor-pointer items-center gap-2 text-[var(--text-main)]">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-white/20 bg-black/30"
                            checked={row.reviewChecked}
                            onChange={(e) =>
                              setReviewDraft((prev) =>
                                prev.map((r) => (r.id === row.id ? { ...r, reviewChecked: e.target.checked } : r)),
                              )
                            }
                          />
                          <span>Leitung bestätigt</span>
                        </label>
                      </div>
                      <label className="mt-2 block text-[var(--text-faint)]">Kommentar</label>
                      <textarea
                        className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-[var(--text-main)]"
                        rows={2}
                        value={row.reviewComment}
                        onChange={(e) =>
                          setReviewDraft((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, reviewComment: e.target.value } : r)),
                          )
                        }
                      />
                    </li>
                  ))}
                </ul>
                <div className="mt-3">
                  <Button type="button" variant="outline" className="text-xs" disabled={busy} onClick={() => void saveChecklistReview()}>
                    Nachprüfung speichern
                  </Button>
                </div>
              </div>
              </LargeReviewSection>
            ) : null}
            </div>
          </div>
        </LargeReviewModal>
      ) : null}

      {confirmApprove && detail ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-xl border border-emerald-400/35 bg-[var(--bg-card)] p-5">
            <p className="font-semibold text-[var(--text-main)]">Arbeitszeit bestätigen?</p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Diese Arbeitszeit wird nach der Bestätigung für die Abrechnung übernommen.
            </p>
            <div className="mt-4 flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setConfirmApprove(false)}>
                Abbrechen
              </Button>
              <Button type="button" variant="primary" className="flex-1" disabled={busy} onClick={() => void approve()}>
                Ja, bestätigen
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {rejectOpen && detail ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-xl border border-rose-400/35 bg-[var(--bg-card)] p-5">
            <p className="font-semibold text-[var(--text-main)]">Arbeitszeit ablehnen</p>
            <label className="mt-3 block text-xs text-[var(--text-muted)]">Grund der Ablehnung (Pflicht)</label>
            <textarea
              className="mt-1 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 py-2 text-sm"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="mt-4 flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setRejectOpen(false)}>
                Abbrechen
              </Button>
              <Button type="button" variant="primary" className="flex-1" disabled={busy || !rejectReason.trim()} onClick={() => void reject()}>
                Ablehnen
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {tcOpen && detail ? (
        <LargeReviewModal
          open
          titleId="time-correction-dialog"
          title="Stempelzeit korrigieren"
          subtitle={
            <p className="text-xs text-[var(--text-muted)]">
              {detail.employeeName} · {detail.workDateYmdBerlin ?? detail.timeEntry.startAt.slice(0, 10)}
              {detail.plannedShift ? ` · Geplant: ${detail.plannedShift.startTime}–${detail.plannedShift.endTime}` : ''}
            </p>
          }
          width="form"
          zIndexClass="z-[100]"
          shellClassName="border-violet-400/35"
          backdropDisabled={busy}
          onBackdropClose={() => {
            if (!busy) setTcOpen(false)
          }}
          footer={
            <>
              <Button type="button" variant="ghost" className="flex-1 sm:flex-none" onClick={() => setTcOpen(false)}>
                Abbrechen
              </Button>
              <Button
                type="button"
                variant="primary"
                className="flex-1 sm:flex-none"
                disabled={busy}
                onClick={() => void submitTimeCorrection(false)}
              >
                Korrektur speichern
              </Button>
              {!detailIsApproved && canApprove ? (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 border-emerald-400/40 text-emerald-100 sm:flex-none"
                  disabled={busy}
                  onClick={() => void submitTimeCorrection(true)}
                >
                  Korrigieren und freigeben
                </Button>
              ) : null}
            </>
          }
        >
          {detailIsApproved ? (
            <p className="mb-4 rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-50/95">
              Diese Zeitbuchung wurde bereits freigegeben. Eine Änderung wird als Korrektur gespeichert und in der
              Lohnabrechnung neu berücksichtigt (Original-Stempel bleibt im Protokoll).
            </p>
          ) : null}
          <LargeReviewSection title="Ist-Zustand (gestempelt)">
            <p className="text-xs text-[var(--text-faint)]">
              Aktuell gestempelt:{' '}
              {new Date(detail.timeEntry.startAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} –{' '}
              {detail.timeEntry.endAt
                ? new Date(detail.timeEntry.endAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                : '—'}
            </p>
          </LargeReviewSection>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LargeReviewSection title="Korrigierte Zeiten">
              <label className="block text-xs text-[var(--text-muted)]">Korrigierter Beginn (HH:mm)</label>
              <input
                className="mt-1 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 py-2 text-sm tabular-nums"
                value={tcStartHm}
                onChange={(e) => setTcStartHm(e.target.value)}
                placeholder="07:29"
                autoComplete="off"
              />
              <label className="mt-3 block text-xs text-[var(--text-muted)]">Korrigiertes Ende (HH:mm)</label>
              <input
                className="mt-1 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 py-2 text-sm tabular-nums"
                value={tcEndHm}
                onChange={(e) => setTcEndHm(e.target.value)}
                placeholder="14:00"
                autoComplete="off"
              />
              <label className="mt-3 block text-xs text-[var(--text-muted)]">Pause (Minuten)</label>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 py-2 text-sm"
                value={tcBreak}
                onChange={(e) => setTcBreak(e.target.value)}
              />
            </LargeReviewSection>
            <LargeReviewSection title="Grund & Bemerkung">
              <label className="block text-xs text-[var(--text-muted)]">Grund</label>
              <select
                className="mt-1 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 py-2 text-sm"
                value={tcReason}
                onChange={(e) => setTcReason(e.target.value)}
              >
                {TIME_CORRECTION_REASON_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              <label className="mt-3 block text-xs text-[var(--text-muted)]">
                Bemerkung {tcReason === 'other' ? '(Pflicht)' : '(empfohlen)'}
              </label>
              <textarea
                className="mt-1 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 py-2 text-sm"
                rows={4}
                value={tcNote}
                onChange={(e) => setTcNote(e.target.value)}
              />
              <p className="mt-3 text-[10px] text-[var(--text-faint)]">
                Kalendertag (Europe/Berlin): {detail.workDateYmdBerlin ?? detail.timeEntry.startAt.slice(0, 10)} ·
                Korrigiert von: {user?.displayName?.trim() || user?.username || '—'}
              </p>
            </LargeReviewSection>
          </div>
        </LargeReviewModal>
      ) : null}

      {corrOpen && detail ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-xl border border-violet-400/35 bg-[var(--bg-card)] p-5">
            <p className="font-semibold text-[var(--text-main)]">Korrektur erforderlich</p>
            <label className="mt-3 block text-xs text-[var(--text-muted)]">Was muss korrigiert werden? (Pflicht)</label>
            <textarea
              className="mt-1 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 py-2 text-sm"
              rows={3}
              value={corrNote}
              onChange={(e) => setCorrNote(e.target.value)}
            />
            <div className="mt-4 flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setCorrOpen(false)}>
                Abbrechen
              </Button>
              <Button type="button" variant="primary" className="flex-1" disabled={busy || !corrNote.trim()} onClick={() => void requestCorr()}>
                Speichern
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
