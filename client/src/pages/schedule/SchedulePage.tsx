import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildRequirementGapResolvedBlocks } from '../../data/defaultShiftRequirements'
import { useShiftRequirementOptions } from '../../hooks/useShiftRequirementOptions'
import {
  resolveShiftsForWeekGrid,
  shiftsInWeek,
  toISODate,
  toScheduleEmployeeRow,
  type ResolvedShiftBlock,
  type ScheduleConflict,
  type ScheduleShift,
  type WeekAbsence,
} from '../../data/mockSchedule'
import { buildEmployeePlannedHoursMap } from '../../utils/employeePlannedHours'
import { buildMonthHourLimitConflicts } from '../../utils/employeeMonthHourLimit'
import { ScheduleStatsPanel } from '../../components/schedule/ScheduleStatsPanel'
import { ScheduleToolbar } from '../../components/schedule/ScheduleToolbar'
import type { ScheduleViewMode } from '../../components/schedule/ScheduleViewTabs'
import { ScheduleViewTabs } from '../../components/schedule/ScheduleViewTabs'
import { ScheduleViewPlaceholder } from '../../components/schedule/ScheduleViewPlaceholder'
import {
  addDays,
  addWeeks,
  calendarMonthRangeForDate,
  formatDE,
  getISOWeek,
  startOfWeekMonday,
} from '../../components/schedule/scheduleWeekUtils'
import { ScheduleEmployeeSummaryBar } from '../../components/schedule/ScheduleEmployeeSummaryBar'
import { WeeklyScheduleGrid } from '../../components/schedule/WeeklyScheduleGrid'
import { ShiftModal } from '../../components/schedule/shift/ShiftModal'
import {
  openShiftSlotsFromBlocks,
  openShiftWarnings,
} from '../../components/schedule/schedulePanelUtils'
import { useEmployees } from '../../context/employees-context'
import {
  persistShiftDelete,
  persistShiftsBulk,
  persistShiftUpsert,
  useScheduleShifts,
} from '../../context/schedule-shifts-context'
import { PublishWeekDialog, type WeekPublicationApi } from '../../components/schedule/PublishWeekDialog'
import { WeekPublicationBadge } from '../../components/schedule/WeekPublicationBadge'
import { useStation } from '../../context/station-context'
import { ScheduleAssistantModal } from '../../components/schedule/assistant/ScheduleAssistantModal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useScheduleShiftInteractions } from '../../components/schedule/useScheduleShiftInteractions'
import { useAbsences } from '../../context/absences-context'
import { useAuth } from '../../context/auth-context'
import { canCorrectStampTimes } from '../../utils/timeApproval'
import { formatShiftTimeRangeDE } from '../../utils/dateFormat'
import { computeTimelineRangeFromWeekBlocks } from '../../utils/scheduleTimeline'
import { useViewportScheduleDensity } from '../../hooks/useViewportScheduleDensity'
import { useTimeTracking } from '../../context/time-tracking-context'
import {
  enrichBlocksWithStampStatus,
  filterRenderableScheduleBlocks,
} from '../../utils/scheduleActualTimes'
import { apiGet, apiSend } from '../../services/api'
import type { ShiftDraft } from '../../components/schedule/shift/shiftConflicts'

export function SchedulePage() {
  const { federalState, stationId, hasPermission, selectedStation, standardWorkTimesJson } = useStation()
  const shiftOpts = useShiftRequirementOptions()
  const { user } = useAuth()
  const canCorrectTime = canCorrectStampTimes(user)
  const { absences } = useAbsences()
  const { employees } = useEmployees()
  const { shifts, setShifts, ensureWeekSeeded, loading: shiftsLoading, error: shiftsError, refetchRange } =
    useScheduleShifts()
  const { timeEntries } = useTimeTracking()

  const [weekOffset, setWeekOffset] = useState(0)
  const [workAreaFilter, setWorkAreaFilter] = useState('all')
  const [employeeFilter, setEmployeeFilter] = useState('all')
  const [view, setView] = useState<ScheduleViewMode>('calendar')

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [modalShift, setModalShift] = useState<ScheduleShift | null>(null)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [pruneConfirmOpen, setPruneConfirmOpen] = useState(false)
  const [pruneBusy, setPruneBusy] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [weekPublication, setWeekPublication] = useState<WeekPublicationApi | null>(null)
  const [weekPubLoading, setWeekPubLoading] = useState(false)
  const [weekPubError, setWeekPubError] = useState<string | null>(null)

  const viewportDensity = useViewportScheduleDensity()

  const weekMonday = useMemo(() => {
    const base = startOfWeekMonday(new Date())
    return addWeeks(base, weekOffset)
  }, [weekOffset])

  const weekSunday = useMemo(() => addDays(weekMonday, 6), [weekMonday])
  const isoWeek = useMemo(() => getISOWeek(weekMonday), [weekMonday])
  const weekStartIso = useMemo(() => toISODate(weekMonday), [weekMonday])
  const weekEndIso = useMemo(() => toISODate(weekSunday), [weekSunday])

  const scheduleRows = useMemo(
    () => employees.map(toScheduleEmployeeRow),
    [employees],
  )

  const shiftEmployeeOptions = useMemo(
    () =>
      employees.map((e) => ({
        id: e.id,
        displayName: e.displayName,
        role: e.role,
      })),
    [employees],
  )

  const getEmployeeDisplayName = useCallback(
    (id: string) =>
      employees.find((e) => e.id === id)?.displayName ??
      shifts.find((s) => s.employeeId === id && s.employeeDisplayName)?.employeeDisplayName ??
      'Mitarbeiter',
    [employees, shifts],
  )

  const monthRange = useMemo(() => calendarMonthRangeForDate(weekMonday), [weekMonday])

  const handleAssistantApplied = useCallback(async () => {
    await refetchRange(monthRange.fromYmd, monthRange.toYmd)
  }, [refetchRange, monthRange.fromYmd, monthRange.toYmd])

  const employeeHourLabels = useMemo(
    () =>
      employees.map((e) => ({
        id: e.id,
        label: e.displayName.split(/\s+/)[0] ?? e.displayName,
      })),
    [employees],
  )

  const employeesByIdForHours = useMemo(
    () =>
      new Map(
        employees.map((e) => [
          e.id,
          { displayName: e.displayName, employmentType: e.employmentType },
        ]),
      ),
    [employees],
  )

  useEffect(() => {
    ensureWeekSeeded(weekMonday)
  }, [weekMonday, ensureWeekSeeded])

  const allBlocks = useMemo(
    () => resolveShiftsForWeekGrid(shifts, weekMonday),
    [shifts, weekMonday],
  )

  const shiftsThisWeek = useMemo(() => shiftsInWeek(shifts, weekMonday), [shifts, weekMonday])

  const requirementGapBlocks = useMemo(() => {
    if (!stationId) return [] as ResolvedShiftBlock[]
    return buildRequirementGapResolvedBlocks(
      weekMonday,
      stationId,
      federalState,
      shiftsThisWeek,
      standardWorkTimesJson,
      shiftOpts,
    )
  }, [weekMonday, stationId, federalState, shiftsThisWeek, standardWorkTimesJson, shiftOpts])

  const timelineRange = useMemo(
    () => computeTimelineRangeFromWeekBlocks([...allBlocks, ...requirementGapBlocks]),
    [allBlocks, requirementGapBlocks],
  )

  /** Wochenraster: nur geplante Schichten + offene Schichten (kein „Frei“, kein Ist-Balken). */
  const gridBlocks = useMemo(() => {
    let list = allBlocks.filter(
      (b) => b.type !== 'frei' && (b.open || Boolean(b.employeeId)),
    )
    if (workAreaFilter !== 'all') {
      list = list.filter((b) => b.open || b.workAreaCode === workAreaFilter)
    }
    if (employeeFilter !== 'all') {
      list = list.filter((b) => b.open || b.employeeId === employeeFilter)
    }
    list = enrichBlocksWithStampStatus(list, timeEntries)
    const gaps =
      workAreaFilter === 'all' || workAreaFilter === 'K' ? requirementGapBlocks : []
    return filterRenderableScheduleBlocks([...list, ...gaps])
  }, [allBlocks, workAreaFilter, employeeFilter, requirementGapBlocks, timeEntries])

  const weeklyHoursBreakdownById = useMemo(
    () =>
      buildEmployeePlannedHoursMap(
        employees.map((e) => e.id),
        shifts,
        absences,
        employeesByIdForHours,
        weekStartIso,
        weekEndIso,
        federalState,
      ),
    [employees, shifts, absences, employeesByIdForHours, weekStartIso, weekEndIso, federalState],
  )

  const monthlyHoursBreakdownById = useMemo(() => {
    const { fromYmd, toYmd } = monthRange
    return buildEmployeePlannedHoursMap(
      employees.map((e) => e.id),
      shifts,
      absences,
      employeesByIdForHours,
      fromYmd,
      toYmd,
      federalState,
    )
  }, [employees, shifts, absences, employeesByIdForHours, monthRange, federalState])

  const hoursByEmployee = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of employees) {
      m.set(e.id, weeklyHoursBreakdownById.get(e.id)?.totalHours ?? 0)
    }
    return m
  }, [employees, weeklyHoursBreakdownById])

  const monthlyPlannedHoursById = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of employees) {
      m.set(e.id, monthlyHoursBreakdownById.get(e.id)?.totalHours ?? 0)
    }
    return m
  }, [employees, monthlyHoursBreakdownById])

  const monthHourLimitConflicts = useMemo(
    () => buildMonthHourLimitConflicts(employees, monthlyPlannedHoursById),
    [employees, monthlyPlannedHoursById],
  )

  const openShiftsThisWeek = useMemo(
    () => openShiftSlotsFromBlocks(allBlocks),
    [allBlocks],
  )

  const [scheduleConflicts, setScheduleConflicts] = useState<ScheduleConflict[]>([])
  const [conflictsError, setConflictsError] = useState<string | null>(null)

  const panelConflicts = useMemo(
    () => [...openShiftWarnings(allBlocks), ...scheduleConflicts, ...monthHourLimitConflicts],
    [allBlocks, scheduleConflicts, monthHourLimitConflicts],
  )

  useEffect(() => {
    setScheduleConflicts([])
    setConflictsError(null)
  }, [stationId])

  useEffect(() => {
    if (!stationId) {
      return
    }
    let cancelled = false
    void (async () => {
      const res = await apiGet<ScheduleShift[]>('/shifts/conflicts', {
        stationId,
        from: weekStartIso,
        to: weekEndIso,
      })
      if (cancelled) return
      if (!res.ok) {
        setScheduleConflicts([])
        setConflictsError(res.error)
        return
      }
      setConflictsError(null)
      const list = Array.isArray(res.data) ? res.data : []
      setScheduleConflicts(
        list.map((s) => ({
          id: `conf-${s.id}`,
          message: 'Schichtkonflikt',
          detail: `${getEmployeeDisplayName(s.employeeId ?? '')} · ${s.date} · ${s.workAreaId} · ${s.startTime}–${s.endTime}`,
        })),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [stationId, weekStartIso, weekEndIso, getEmployeeDisplayName])

  const weekAbsencesPanel = useMemo((): WeekAbsence[] => {
    const typeLabel: Record<string, string> = {
      paid_vacation: 'Bezahlter Urlaub',
      unpaid_vacation: 'Unbezahlter Urlaub',
      urlaub: 'Bezahlter Urlaub',
      vacation: 'Bezahlter Urlaub',
      sick: 'Krank',
      krankheit: 'Krank',
      school: 'Berufsschule',
      berufsschule: 'Berufsschule',
      day_off: 'Frei',
      frei: 'Frei',
      special_leave: 'Sonderurlaub',
      sonderurlaub: 'Sonderurlaub',
      unbezahlt: 'Unbezahlt',
      unpaid: 'Unbezahlt',
      child_sick: 'Kind krank',
      kind_krank: 'Kind krank',
      other: 'Sonstiges',
      sonstiges: 'Sonstiges',
    }
    const fmt = (iso: string) => {
      const [y, m, d] = iso.split('-')
      return d && m && y ? `${d}.${m}.${y}` : iso
    }
    const out: WeekAbsence[] = []
    for (const a of absences) {
      if (a.status === 'storniert') continue
      if (a.endDate < weekStartIso || a.startDate > weekEndIso) continue
      const emp = employees.find((e) => e.id === a.employeeId)
      const tl = typeLabel[a.type] ?? a.type
      const range =
        a.startDate === a.endDate ? fmt(a.startDate) : `${fmt(a.startDate)} – ${fmt(a.endDate)}`
      out.push({
        id: a.id,
        employeeName: emp?.displayName ?? 'Mitarbeiter',
        type: tl,
        range,
      })
    }
    return out
  }, [absences, employees, weekStartIso, weekEndIso])

  const openCreate = () => {
    setModalMode('create')
    setModalShift(null)
    setModalOpen(true)
  }

  const openEdit = (block: ResolvedShiftBlock) => {
    if (block.istOnly || block.requirementGap) return
    const s = shifts.find((x) => x.id === block.id)
    if (!s) return
    setModalMode('edit')
    setModalShift(s)
    setModalOpen(true)
  }

  const handleUpsert = async (s: ScheduleShift) => {
    if (!stationId) return
    const saved = await persistShiftUpsert(s, stationId)
    if (!saved) {
      window.alert('Schicht konnte nicht gespeichert werden. Bitte API/Server prüfen.')
      return
    }
    setShifts((prev) => {
      const i = prev.findIndex((x) => x.id === saved.id)
      if (i === -1) return [...prev, saved]
      const next = [...prev]
      next[i] = saved
      return next
    })
  }

  const handleDelete = async (id: string) => {
    const ok = await persistShiftDelete(id)
    if (!ok) {
      window.alert('Schicht konnte nicht gelöscht werden.')
      return
    }
    setShifts((prev) => prev.filter((x) => x.id !== id))
  }

  const handleBulkCreate = async (draft: ShiftDraft, dates: string[]) => {
    if (!stationId) return
    const result = await persistShiftsBulk(
      {
        dates,
        employeeId: draft.employeeId,
        workAreaId: draft.workAreaId,
        startTime: draft.shiftType === 'frei' ? '' : draft.startTime,
        endTime: draft.shiftType === 'frei' ? '' : draft.endTime,
        breakMinutes: draft.breakMinutes,
        shiftType: draft.shiftType,
        note: draft.note,
        conflict: draft.conflict,
      },
      stationId,
    )
    if (!result) {
      window.alert('Schichten konnten nicht gespeichert werden.')
      return
    }
    if (result.created.length) {
      setShifts((prev) => {
        const map = new Map(prev.map((s) => [s.id, s]))
        for (const s of result.created) map.set(s.id, s)
        return [...map.values()]
      })
    }
    const msg: string[] = []
    if (result.created.length) msg.push(`${result.created.length} Schicht(en) angelegt.`)
    if (result.skipped.length) msg.push(`${result.skipped.length} übersprungen.`)
    if (result.errors.length) msg.push(`${result.errors.length} Fehler.`)
    if (msg.length > 1 || result.skipped.length || result.errors.length) {
      window.alert(msg.join(' '))
    }
    void loadWeekPublication()
  }

  const loadWeekPublication = useCallback(async () => {
    if (!stationId) return
    setWeekPubLoading(true)
    setWeekPubError(null)
    const res = await apiGet<{ publication: WeekPublicationApi }>('/shifts/week-publication', {
      stationId,
      weekMonday: weekStartIso,
    })
    setWeekPubLoading(false)
    if (res.ok && res.data?.publication) {
      setWeekPublication(res.data.publication)
      return
    }
    setWeekPubError(res.ok === false ? res.error : 'Wochenstatus konnte nicht geladen werden.')
    setWeekPublication((prev) => prev ?? null)
  }, [stationId, weekStartIso])

  useEffect(() => {
    void loadWeekPublication()
  }, [loadWeekPublication])

  const runPruneOpenShifts = useCallback(async () => {
    if (!stationId) return
    setPruneBusy(true)
    try {
      const res = await apiSend<{ deletedIds?: string[] }>('POST', '/shifts/open/prune-covered', {
        stationId,
        from: weekStartIso,
        to: weekEndIso,
      })
      if (!res.ok) {
        window.alert(res.error ?? 'Offene Schichten konnten nicht bereinigt werden.')
        return
      }
      const n = Array.isArray(res.data?.deletedIds) ? res.data.deletedIds.length : 0
      await refetchRange(weekStartIso, weekEndIso)
      window.alert(n > 0 ? `${n} überdeckte offene Schicht(en) entfernt.` : 'Keine überdeckten offenen Schichten gefunden.')
    } finally {
      setPruneBusy(false)
      setPruneConfirmOpen(false)
    }
  }, [stationId, weekStartIso, weekEndIso, refetchRange])

  const toggleEmployeeFilter = (id: string) => {
    setEmployeeFilter((prev) => (prev === id ? 'all' : id))
  }

  const canEditPlan = hasPermission('schedule.edit')
  const canPublishPlan = hasPermission('schedule.publish')
  const currentUserId = user?.id ?? ''
  const weekRangeLabel = `${formatDE(weekMonday)} – ${formatDE(weekSunday)}`

  const shiftInteractions = useScheduleShiftInteractions({
    canEdit: canEditPlan,
    shifts,
    setShifts,
    allBlocks,
    employees,
    absences,
    stationId,
    currentUserId,
    federalState,
    monthShifts: shifts,
    monthRange,
  })

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-main)]">
            Schichtplan
          </h1>
          <p className="max-w-2xl text-sm text-[var(--text-muted)]">
            Wochenübersicht und Dienstplanung für die aktuelle Station
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-faint)]">
            <span>
              Station:{' '}
              <span className="font-medium text-cyan-200/90">{selectedStation?.name ?? '—'}</span>
            </span>
            {shiftsLoading ? <span>Schichten werden geladen…</span> : null}
            {shiftsError ? (
              <span className="text-amber-300/90" title={shiftsError}>
                Schichten: {shiftsError}
              </span>
            ) : null}
            {conflictsError ? (
              <span className="text-amber-300/90" title={conflictsError}>
                Konflikte: {conflictsError}
              </span>
            ) : null}
            <span>
              Kalenderwoche:{' '}
              <span className="font-medium text-[var(--text-main)]">KW {isoWeek}</span>
            </span>
            <span>
              Zeitraum:{' '}
              <span className="font-medium text-[var(--text-main)]">
                {formatDE(weekMonday)} – {formatDE(weekSunday)}
              </span>
            </span>
            <WeekPublicationBadge
              status={weekPublication?.status ?? 'draft'}
              hasUnpublishedChanges={weekPublication?.hasUnpublishedChanges ?? false}
              loading={weekPubLoading}
            />
            {weekPubError ? (
              <span className="text-xs text-amber-200/90" title={weekPubError}>
                Wochenstatus nicht geladen
              </span>
            ) : null}
          </div>
        </div>
        <ScheduleViewTabs active={view} onChange={setView} />
      </header>

      {view === 'calendar' ? (
        <ScheduleEmployeeSummaryBar
          employees={scheduleRows}
          weeklyHoursById={hoursByEmployee}
          monthlyPlannedHoursById={monthlyPlannedHoursById}
          weeklyHoursBreakdownById={weeklyHoursBreakdownById}
          monthlyHoursBreakdownById={monthlyHoursBreakdownById}
          selectedId={employeeFilter === 'all' ? null : employeeFilter}
          onToggleEmployee={toggleEmployeeFilter}
          viewportDensity={viewportDensity}
          assignDragEnabled={canEditPlan}
          onEmployeePointerDownCapture={shiftInteractions.onEmployeePointerDownCapture}
        />
      ) : null}

      <ScheduleToolbar
        workAreaFilter={workAreaFilter}
        onWorkAreaFilter={setWorkAreaFilter}
        employeeFilter={employeeFilter}
        onEmployeeFilter={setEmployeeFilter}
        onToday={() => setWeekOffset(0)}
        onPrevWeek={() => setWeekOffset((w) => w - 1)}
        onNextWeek={() => setWeekOffset((w) => w + 1)}
        onNewShift={openCreate}
        onPublish={() => setPublishOpen(true)}
        onPrint={() => setView('print')}
        onMore={canEditPlan ? () => setPruneConfirmOpen(true) : () => {}}
        moreDisabled={pruneBusy}
        moreTitle={
          canEditPlan
            ? 'Offene Schichten neu berechnen (überdeckte Einträge entfernen)'
            : 'Mehr (nur mit Planbearbeitung)'
        }
        scheduleEmployees={scheduleRows}
        onOpenAssistant={() => setAssistantOpen(true)}
      />

      <ConfirmDialog
        open={pruneConfirmOpen}
        title="Offene Schichten neu berechnen?"
        message="Automatisch erzeugte oder manuell angelegte offene Schichten (ohne Mitarbeiter) werden geprüft. Einträge, die durch besetzte Schichten vollständig überdeckt sind, werden entfernt. Zugewiesene Mitarbeiter-Schichten bleiben unverändert."
        confirmLabel={pruneBusy ? 'Bitte warten…' : 'Bereinigen'}
        cancelLabel="Abbrechen"
        variant="danger"
        confirmDisabled={pruneBusy}
        onCancel={() => !pruneBusy && setPruneConfirmOpen(false)}
        onConfirm={() => {
          void runPruneOpenShifts()
        }}
      />

      <ScheduleAssistantModal
        open={assistantOpen}
        initialWeekStartIso={weekStartIso}
        onClose={() => setAssistantOpen(false)}
        onApplied={handleAssistantApplied}
      />

      {stationId ? (
        <PublishWeekDialog
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          stationId={stationId}
          weekMondayIso={weekStartIso}
          weekRangeLabel={weekRangeLabel}
          calendarWeek={isoWeek}
          canPublish={canPublishPlan}
          onChanged={() => {
            void loadWeekPublication()
            void refetchRange(weekStartIso, weekEndIso)
          }}
        />
      ) : null}

      <ShiftModal
        open={modalOpen}
        mode={modalMode}
        shift={modalShift}
        weekMonday={weekMonday}
        allShifts={shifts}
        onClose={() => setModalOpen(false)}
        onUpsert={handleUpsert}
        onDelete={handleDelete}
        getEmployeeDisplayName={getEmployeeDisplayName}
        employeeSelectOptions={shiftEmployeeOptions}
        absences={absences}
        onBulkCreate={handleBulkCreate}
        timeEntries={timeEntries}
        canCorrectTime={canCorrectTime}
      />

      <ConfirmDialog
        open={Boolean(shiftInteractions.pendingAssign)}
        title="Schicht neu zuweisen?"
        message={
          shiftInteractions.pendingAssign ? shiftInteractions.buildAssignMessage(shiftInteractions.pendingAssign) : ''
        }
        confirmLabel="Schicht übertragen"
        onCancel={() => shiftInteractions.setPendingAssign(null)}
        onConfirm={() => {
          const p = shiftInteractions.pendingAssign
          if (p) void shiftInteractions.confirmAssign(p)
          shiftInteractions.setPendingAssign(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(shiftInteractions.pendingAssignConflict)}
        title="Achtung: Konflikt erkannt"
        variant="danger"
        message={
          shiftInteractions.pendingAssignConflict
            ? shiftInteractions.buildConflictMessage(shiftInteractions.pendingAssignConflict)
            : ''
        }
        confirmLabel="Trotzdem übertragen"
        cancelLabel="Abbrechen"
        onCancel={() => shiftInteractions.setPendingAssignConflict(null)}
        onConfirm={() => {
          const p = shiftInteractions.pendingAssignConflict
          if (p) void shiftInteractions.confirmAssign(p)
          shiftInteractions.setPendingAssignConflict(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(shiftInteractions.pendingTime)}
        title="Schichtzeit ändern?"
        message={
          shiftInteractions.pendingTime
            ? [
                `Alt: ${formatShiftTimeRangeDE(shiftInteractions.pendingTime.oldStart, shiftInteractions.pendingTime.oldEnd)}`,
                `Neu: ${formatShiftTimeRangeDE(shiftInteractions.pendingTime.newStart, shiftInteractions.pendingTime.newEnd)}`,
              ].join('\n')
            : ''
        }
        confirmLabel="Speichern"
        onCancel={() => shiftInteractions.setPendingTime(null)}
        onConfirm={() => {
          const p = shiftInteractions.pendingTime
          if (p) void shiftInteractions.confirmTime(p)
          shiftInteractions.setPendingTime(null)
        }}
      />

      {shiftInteractions.ghost ? (
        <div
          className="pointer-events-none fixed z-[200] max-w-[220px] rounded-xl border border-cyan-400/50 bg-slate-950/95 px-3 py-2 text-sm font-semibold text-white shadow-[0_0_32px_rgba(34,211,238,0.45)]"
          style={{
            left: shiftInteractions.ghost.x,
            top: shiftInteractions.ghost.y,
            transform: 'translate(-50%, -120%)',
            borderColor: `${shiftInteractions.ghost.color}99`,
            boxShadow: `0 0 36px ${shiftInteractions.ghost.color}66`,
          }}
        >
          {shiftInteractions.ghost.name}
        </div>
      ) : null}

      {view === 'calendar' ? (
        <div className="grid min-w-0 grid-cols-1 gap-4 min-[1400px]:grid-cols-12 min-[1400px]:gap-6">
          <div className="min-w-0 space-y-4 min-[1400px]:col-span-9">
            <WeeklyScheduleGrid
              variant="full"
              stationFederalState={federalState}
              stationName={selectedStation?.name}
              weekMonday={weekMonday}
              employees={scheduleRows}
              blocks={gridBlocks}
              onShiftSelect={openEdit}
              timelineDayStart={timelineRange.start}
              timelineDayEnd={timelineRange.end}
              viewportDensity={viewportDensity}
              shiftEdit={shiftInteractions.shiftEdit}
            />
          </div>
          <div className="min-w-0 space-y-4 min-[1400px]:col-span-3">
            <ScheduleStatsPanel
              blocks={allBlocks}
              openShifts={openShiftsThisWeek}
              absences={weekAbsencesPanel}
              conflicts={panelConflicts}
              conflictsLoadError={conflictsError}
              employeeHourLabels={employeeHourLabels}
              weeklyEmployeeHoursById={hoursByEmployee}
            />
          </div>
        </div>
      ) : null}

      {view === 'employee' ? (
        <ScheduleViewPlaceholder
          title="Mitarbeiteransicht"
          description="Hier entsteht die zeilenbasierte Mitarbeiteransicht mit Zeitachse. In dieser Phase ist nur die Kalenderansicht befüllt."
        />
      ) : null}

      {view === 'print' ? (
        <ScheduleViewPlaceholder
          title="Druckansicht"
          description="Optimierte Drucklayout-Ansicht (PDF / Druck) wird später ergänzt. Nutzen Sie vorerst die Kalenderansicht."
        />
      ) : null}
    </div>
  )
}
