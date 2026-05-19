import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { AbsenceStatusBadge } from '../../components/absences/AbsenceStatusBadge'
import { AbsenceTypeBadge } from '../../components/absences/AbsenceTypeBadge'
import { useAbsences } from '../../context/absences-context'
import { useEmployees } from '../../context/employees-context'
import { useStation } from '../../context/station-context'
import { apiGet } from '../../services/api'
import type { ScheduleShift } from '../../data/mockSchedule'
import { toISODate } from '../../data/mockSchedule'
import { addDays, startOfWeekMonday } from '../../components/schedule/scheduleWeekUtils'
import { calculateOpenShiftsForWeek } from '../../data/defaultShiftRequirements'
import { useShiftRequirementOptions } from '../../hooks/useShiftRequirementOptions'

function formatDeRange(start: string, end: string): string {
  const f = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return `${d}.${m}.${y}`
  }
  return start === end ? f(start) : `${f(start)} – ${f(end)}`
}

export function PendingAbsencesCard() {
  const { absences, loading, error } = useAbsences()
  const { employees } = useEmployees()
  const pending = absences.filter((a) => a.status === 'beantragt')

  return (
    <Card>
      <h3 className="text-base font-semibold text-[var(--text-main)]">Offene Abwesenheitsanträge</h3>
      {error ? (
        <p className="mt-3 text-sm text-rose-300">{error}</p>
      ) : loading ? (
        <p className="mt-3 text-sm text-[var(--text-muted)]">Lade Anträge…</p>
      ) : pending.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--text-faint)]">Keine offenen Abwesenheitsanträge.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {pending.map((a) => {
            const emp = employees.find((e) => e.id === a.employeeId)
            return (
              <li
                key={a.id}
                className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/35 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--text-main)]">
                    {emp?.displayName ?? a.employeeId}
                  </span>
                  <AbsenceTypeBadge type={a.type} />
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{formatDeRange(a.startDate, a.endDate)}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <AbsenceStatusBadge status={a.status} />
                  <Link
                    to="/absences?view=requests"
                    className="text-xs font-medium text-cyan-300/90 underline-offset-2 hover:text-cyan-200 hover:underline"
                  >
                    Antrag prüfen
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

export function UnfilledShiftsCard() {
  const { stationId, federalState, standardWorkTimesJson } = useStation()
  const shiftOpts = useShiftRequirementOptions()
  const setupIncomplete = !shiftOpts.setupCompleted || !shiftOpts.shiftSetupCompleted
  const [open, setOpen] = useState<ScheduleShift[]>([])
  const [weekShifts, setWeekShifts] = useState<ScheduleShift[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const weekBounds = useMemo(() => {
    const mon = startOfWeekMonday(new Date())
    const sun = addDays(mon, 6)
    return { from: toISODate(mon), to: toISODate(sun), weekStart: toISODate(mon) }
  }, [])

  const load = useCallback(async () => {
    if (!stationId) {
      setOpen([])
      setWeekShifts([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const [oRes, wRes] = await Promise.all([
      apiGet<ScheduleShift[]>('/shifts/open', { stationId }),
      apiGet<ScheduleShift[]>('/shifts', { stationId, from: weekBounds.from, to: weekBounds.to }),
    ])
    const errs: string[] = []
    if (!oRes.ok) {
      setOpen([])
      errs.push(oRes.error)
    } else {
      const list = Array.isArray(oRes.data) ? oRes.data : []
      setOpen(list.filter((s) => s.date >= weekBounds.from && s.date <= weekBounds.to))
    }
    if (!wRes.ok) {
      setWeekShifts([])
      errs.push(wRes.error)
    } else {
      setWeekShifts(Array.isArray(wRes.data) ? wRes.data : [])
    }
    setError(errs.length ? errs.join(' · ') : null)
    setLoading(false)
  }, [stationId, weekBounds.from, weekBounds.to])

  useEffect(() => {
    void load()
  }, [load])

  const weekSummary = useMemo(
    () =>
      calculateOpenShiftsForWeek(
        weekBounds.weekStart,
        weekShifts,
        open,
        stationId ?? '',
        federalState,
        standardWorkTimesJson,
        shiftOpts,
      ),
    [weekBounds.weekStart, weekShifts, open, stationId, federalState, standardWorkTimesJson, shiftOpts],
  )

  const hasMissing = weekSummary.missingRequiredFlat.length > 0
  const showEmpty = !error && !loading && weekSummary.totalCount === 0

  return (
    <Card>
      <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--text-main)]">
        <AlertTriangle className="h-4 w-4 text-amber-400" aria-hidden />
        Unbesetzte Schichten
      </h3>
      {error ? (
        <p className="mt-3 text-sm text-rose-300">{error}</p>
      ) : loading || shiftOpts.loading ? (
        <p className="mt-3 text-sm text-[var(--text-muted)]">Lade offene Schichten…</p>
      ) : setupIncomplete ? (
        <p className="mt-3 text-sm text-amber-100/90">
          Bitte richten Sie zuerst Ihre Schichtmodelle ein.{' '}
          <Link to="/setup" className="font-medium text-cyan-300 underline-offset-2 hover:underline">
            Zum Setup
          </Link>
        </p>
      ) : showEmpty ? (
        <p className="mt-3 text-sm text-[var(--text-faint)]">Keine offenen Schichten in dieser Woche.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {hasMissing ? (
            <li>
              <p className="text-xs font-medium uppercase tracking-wide text-amber-200/90">Soll fehlt (nicht besetzt)</p>
              <ul className="mt-2 space-y-2">
                {weekSummary.missingByDay.map(({ date, items }) => {
                  const de = `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`
                  return (
                    <li key={date} className="rounded-[var(--radius-sm)] border border-amber-500/25 bg-amber-500/5 px-3 py-2">
                      <p className="text-xs text-[var(--text-muted)]">{de}</p>
                      {items.map((m, idx) => (
                        <p key={`${date}-${idx}`} className="text-sm text-[var(--text-main)]">
                          {m.shiftType === 'early' ? 'Früh' : 'Spät'}:{' '}
                          {m.partialGap
                            ? `${m.startTime}–${m.endTime}`
                            : m.detailHint ?? `${m.startTime}–${m.endTime}`}
                        </p>
                      ))}
                    </li>
                  )
                })}
              </ul>
            </li>
          ) : null}
          {weekSummary.openDbShifts.length > 0 ? (
            <li>
              <p className="text-xs font-medium uppercase tracking-wide text-rose-200/80">Offen in DB</p>
              <ul className="mt-2 space-y-2">
                {weekSummary.openDbShifts.map((s) => {
                  const de = `${s.date.slice(8, 10)}.${s.date.slice(5, 7)}.${s.date.slice(0, 4)}`
                  return (
                    <li
                      key={s.id}
                      className="flex items-start justify-between gap-2 rounded-[var(--radius-sm)] border border-red-500/25 bg-red-500/5 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-[var(--text-main)]">
                          {s.startTime}–{s.endTime}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {de} · {s.workAreaId}
                        </p>
                      </div>
                      <Badge tone="danger">Unbesetzt</Badge>
                    </li>
                  )
                })}
              </ul>
            </li>
          ) : null}
        </ul>
      )}
    </Card>
  )
}

function birthdaySortKey(ymd: string | undefined): number {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return Number.POSITIVE_INFINITY
  const [, m, d] = ymd.split('-').map(Number)
  const today = new Date()
  const y = today.getFullYear()
  const t = new Date(y, m! - 1, d!)
  if (t < new Date(y, today.getMonth(), today.getDate())) {
    t.setFullYear(y + 1)
  }
  return t.getTime()
}

export function BirthdaysCard() {
  const { employees, loading, error } = useEmployees()

  const upcoming = useMemo(() => {
    return employees
      .filter((e) => e.birthday?.trim() && e.status !== 'inaktiv')
      .map((e) => ({ e, key: birthdaySortKey(e.birthday) }))
      .filter((x) => Number.isFinite(x.key))
      .sort((a, b) => a.key - b.key)
      .slice(0, 6)
      .map((x) => x.e)
  }, [employees])

  const formatBirth = (ymd: string) => {
    const [, m, d] = ymd.split('-')
    return `${d}.${m}.`
  }

  const daysUntil = (ymd: string) => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const [, mo, da] = ymd.split('-').map(Number)
    let next = new Date(now.getFullYear(), mo! - 1, da!)
    if (next < now) next = new Date(now.getFullYear() + 1, mo! - 1, da!)
    const diff = Math.ceil((next.getTime() - now.getTime()) / 86400000)
    if (diff === 0) return 'heute'
    if (diff === 1) return 'morgen'
    return `in ${diff} Tagen`
  }

  return (
    <Card>
      <h3 className="text-base font-semibold text-[var(--text-main)]">Kommende Geburtstage</h3>
      {error ? (
        <p className="mt-3 text-sm text-rose-300">{error}</p>
      ) : loading ? (
        <p className="mt-3 text-sm text-[var(--text-muted)]">Lade Mitarbeiter…</p>
      ) : upcoming.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--text-faint)]">Keine Geburtstage in den nächsten Monaten hinterlegt.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {upcoming.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-[var(--text-main)]">{b.displayName}</p>
                <p className="text-xs text-[var(--text-muted)]">{b.birthday ? formatBirth(b.birthday) : '—'}</p>
              </div>
              <span className="text-xs text-[var(--text-faint)]">{b.birthday ? daysUntil(b.birthday) : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function WeatherCard() {
  const { selectedStation } = useStation()
  return (
    <Card>
      <h3 className="text-base font-semibold text-[var(--text-main)]">Wetter</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{selectedStation?.name ?? 'Station'}</p>
      <p className="mt-6 text-sm text-[var(--text-muted)]">
        Wetterdaten werden hier später angezeigt (keine Live-Anbindung).
      </p>
    </Card>
  )
}
