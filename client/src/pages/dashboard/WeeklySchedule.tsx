import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { WeeklyScheduleTimeline } from '../../components/schedule/WeeklyScheduleTimeline'
import { ScheduleEmployeeSummaryBar } from '../../components/schedule/ScheduleEmployeeSummaryBar'
import {
  calendarMonthRangeForDate,
  addDays,
  startOfWeekMonday,
} from '../../components/schedule/scheduleWeekUtils'
import { buildRequirementGapResolvedBlocks } from '../../data/defaultShiftRequirements'
import { useShiftRequirementOptions } from '../../hooks/useShiftRequirementOptions'
import {
  resolveShiftsForWeekGrid,
  shiftsInWeek,
  toScheduleEmployeeRow,
  toISODate,
  type ResolvedShiftBlock,
  type ScheduleShift,
} from '../../data/mockSchedule'
import { buildEmployeePlannedHoursMap } from '../../utils/employeePlannedHours'
import { useStation } from '../../context/station-context'
import { useEmployees } from '../../context/employees-context'
import { persistShiftDelete, persistShiftUpsert, useScheduleShifts } from '../../context/schedule-shifts-context'
import { useAbsences } from '../../context/absences-context'
import { useAuth } from '../../context/auth-context'
import { useScheduleShiftInteractions } from '../../components/schedule/useScheduleShiftInteractions'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { ShiftModal } from '../../components/schedule/shift/ShiftModal'
import { formatShiftTimeRangeDE } from '../../utils/dateFormat'
import { computeTimelineRangeFromWeekBlocks } from '../../utils/scheduleTimeline'
import { useViewportScheduleDensity } from '../../hooks/useViewportScheduleDensity'

export function WeeklySchedule() {
  const { selectedStation, federalState, stationId, hasPermission, standardWorkTimesJson } = useStation()
  const shiftOpts = useShiftRequirementOptions()
  const { user } = useAuth()
  const { absences } = useAbsences()
  const { employees } = useEmployees()
  const { shifts, setShifts, ensureWeekSeeded } = useScheduleShifts()
  const [employeeFilter, setEmployeeFilter] = useState<string>('all')

  const viewportDensity = useViewportScheduleDensity()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalShift, setModalShift] = useState<ScheduleShift | null>(null)

  const weekMonday = useMemo(() => startOfWeekMonday(new Date()), [])

  const weekSunday = useMemo(() => addDays(weekMonday, 6), [weekMonday])
  const weekStartIso = useMemo(() => toISODate(weekMonday), [weekMonday])
  const weekEndIso = useMemo(() => toISODate(weekSunday), [weekSunday])

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
    const { fromYmd, toYmd } = calendarMonthRangeForDate(weekMonday)
    return buildEmployeePlannedHoursMap(
      employees.map((e) => e.id),
      shifts,
      absences,
      employeesByIdForHours,
      fromYmd,
      toYmd,
      federalState,
    )
  }, [employees, shifts, absences, employeesByIdForHours, weekMonday, federalState])

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

  const gridBlocks = useMemo(() => {
    let list = allBlocks.filter((b) => b.type !== 'frei' && (b.open || Boolean(b.employeeId)))
    if (employeeFilter !== 'all') {
      list = list.filter((b) => b.open || b.employeeId === employeeFilter)
    }
    return [...list, ...requirementGapBlocks]
  }, [allBlocks, employeeFilter, requirementGapBlocks])

  const toggleEmployeeFilter = (id: string) => {
    setEmployeeFilter((prev) => (prev === id ? 'all' : id))
  }

  const canEditPlan = hasPermission('schedule.edit')
  const currentUserId = user?.id ?? ''
  const monthRange = useMemo(() => calendarMonthRangeForDate(weekMonday), [weekMonday])

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

  const openEdit = (block: ResolvedShiftBlock) => {
    if (!canEditPlan) return
    const s = shifts.find((x) => x.id === block.id)
    if (!s) return
    setModalShift(s)
    setModalOpen(true)
  }

  const handleUpsert = async (s: ScheduleShift) => {
    if (!stationId) return
    const saved = await persistShiftUpsert(s, stationId)
    if (!saved) {
      window.alert('Schicht konnte nicht gespeichert werden.')
      return
    }
    setShifts((prev) => {
      const i = prev.findIndex((x) => x.id === saved.id)
      if (i === -1) return [...prev, saved]
      const next = [...prev]
      next[i] = saved
      return next
    })
    setModalOpen(false)
    setModalShift(null)
  }

  const handleDelete = async (id: string) => {
    const ok = await persistShiftDelete(id)
    if (!ok) {
      window.alert('Schicht konnte nicht gelöscht werden.')
      return
    }
    setShifts((prev) => prev.filter((x) => x.id !== id))
    setModalOpen(false)
    setModalShift(null)
  }

  return (
    <Card
      className="min-w-0 w-full max-w-full border-cyan-500/25 shadow-[0_0_28px_rgba(34,211,238,0.12)]"
      padding="md"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold tracking-tight text-[var(--text-main)]">
            Schichtplan – Diese Woche
          </h3>
          <p className="text-sm text-[var(--text-muted)]">
            Aktuelle Wochenplanung für {selectedStation?.name ?? '—'}
          </p>
        </div>
        <Link
          to="/schedule"
          className="shrink-0 rounded-[var(--radius-sm)] border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-center text-sm font-medium text-cyan-200 transition hover:border-cyan-300/60 hover:bg-cyan-500/15"
        >
          Vollständiger Schichtplan
        </Link>
      </div>

      {canEditPlan ? (
        <p className="mb-2 text-[11px] text-[var(--text-faint)]">
          Mit Bearbeitungsrecht: Schichten hier verschieben, Größe ändern oder per Mitarbeiter-Karte zuweisen (wie im
          Schichtplan). Änderungen werden nach Bestätigung gespeichert.
        </p>
      ) : (
        <p className="mb-2 text-[11px] text-[var(--text-faint)]">
          Nur Ansicht. Zum Bearbeiten wird die Berechtigung <span className="text-cyan-200/80">schedule.edit</span>{' '}
          benötigt.
        </p>
      )}

      <ScheduleEmployeeSummaryBar
        employees={scheduleRows}
        weeklyHoursById={hoursByEmployee}
        monthlyPlannedHoursById={monthlyPlannedHoursById}
        weeklyHoursBreakdownById={weeklyHoursBreakdownById}
        monthlyHoursBreakdownById={monthlyHoursBreakdownById}
        selectedId={employeeFilter === 'all' ? null : employeeFilter}
        onToggleEmployee={toggleEmployeeFilter}
        dashboardCompact
        viewportDensity={viewportDensity}
        assignDragEnabled={canEditPlan}
        onEmployeePointerDownCapture={shiftInteractions.onEmployeePointerDownCapture}
      />

      <WeeklyScheduleTimeline
        weekMonday={weekMonday}
        employees={scheduleRows}
        blocks={gridBlocks}
        variant="compact"
        stationFederalState={federalState}
        stationName={selectedStation?.name}
        timelineDayStart={timelineRange.start}
        timelineDayEnd={timelineRange.end}
        viewportDensity={viewportDensity}
        showTitle={false}
        showLegend={false}
        showFooterLink
        onShiftSelect={canEditPlan ? openEdit : undefined}
        shiftEdit={shiftInteractions.shiftEdit}
      />

      <ShiftModal
        open={modalOpen}
        mode="edit"
        shift={modalShift}
        weekMonday={weekMonday}
        allShifts={shifts}
        onClose={() => {
          setModalOpen(false)
          setModalShift(null)
        }}
        onUpsert={handleUpsert}
        onDelete={handleDelete}
        getEmployeeDisplayName={getEmployeeDisplayName}
        employeeSelectOptions={shiftEmployeeOptions}
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
    </Card>
  )
}
