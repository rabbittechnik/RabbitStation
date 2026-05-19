import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDays, startOfWeekMonday } from '../../components/schedule/scheduleWeekUtils'
import type { ScheduleShift } from '../../data/mockSchedule'
import { toISODate } from '../../data/mockSchedule'
import { calculateOpenShiftsForWeek, type OpenShiftWeekSummary } from '../../data/defaultShiftRequirements'
import { useShiftRequirementOptions } from '../../hooks/useShiftRequirementOptions'
import { apiGet } from '../../services/api'
import { localTodayYmd } from '../../utils/dateFormat'
import { useAbsences } from '../../context/absences-context'
import { useStation } from '../../context/station-context'

function emptyOpenSummary(): OpenShiftWeekSummary {
  return {
    totalMissingRequired: 0,
    earlyMissing: 0,
    lateMissing: 0,
    missingRequiredFlat: [],
    missingByDay: [],
    openDbShifts: [],
    totalOpenDb: 0,
    totalCount: 0,
    summaryLine: '',
  }
}

export function useDashboardLiveStats() {
  const { stationId, federalState, standardWorkTimesJson } = useStation()
  const { absences, loading: absencesLoading, error: absencesError } = useAbsences()
  const [loading, setLoading] = useState(true)
  const [shiftError, setShiftError] = useState<string | null>(null)
  const [todayShifts, setTodayShifts] = useState<ScheduleShift[]>([])
  const [weekShifts, setWeekShifts] = useState<ScheduleShift[]>([])
  const [openShifts, setOpenShifts] = useState<ScheduleShift[]>([])

  const weekAnchor = useMemo(() => {
    const mon = startOfWeekMonday(new Date())
    return { from: toISODate(mon), to: toISODate(addDays(mon, 6)), weekStart: toISODate(mon) }
  }, [])

  useEffect(() => {
    setTodayShifts([])
    setWeekShifts([])
    setOpenShifts([])
    setShiftError(null)
  }, [stationId])

  const reload = useCallback(async () => {
    if (!stationId) {
      setTodayShifts([])
      setWeekShifts([])
      setOpenShifts([])
      setLoading(false)
      setShiftError(null)
      return
    }
    setLoading(true)
    setShiftError(null)
    const today = localTodayYmd()
    const [tRes, wRes, oRes] = await Promise.all([
      apiGet<ScheduleShift[]>('/shifts', { stationId, from: today, to: today }),
      apiGet<ScheduleShift[]>('/shifts', { stationId, from: weekAnchor.from, to: weekAnchor.to }),
      apiGet<ScheduleShift[]>('/shifts/open', { stationId }),
    ])
    const errs: string[] = []
    if (!tRes.ok) {
      errs.push(tRes.error)
      setTodayShifts([])
    } else {
      setTodayShifts(Array.isArray(tRes.data) ? tRes.data : [])
    }
    if (!wRes.ok) {
      errs.push(wRes.error)
      setWeekShifts([])
    } else {
      setWeekShifts(Array.isArray(wRes.data) ? wRes.data : [])
    }
    if (!oRes.ok) {
      errs.push(oRes.error)
      setOpenShifts([])
    } else {
      setOpenShifts(Array.isArray(oRes.data) ? oRes.data : [])
    }
    setShiftError(errs.length ? errs.join(' · ') : null)
    setLoading(false)
  }, [stationId, weekAnchor.from, weekAnchor.to])

  useEffect(() => {
    void reload()
  }, [reload])

  const shiftOpts = useShiftRequirementOptions()

  const openShiftsWeek = useMemo(() => {
    if (!stationId) return emptyOpenSummary()
    return calculateOpenShiftsForWeek(
      weekAnchor.weekStart,
      weekShifts,
      openShifts,
      stationId,
      federalState,
      standardWorkTimesJson,
      shiftOpts,
    )
  }, [stationId, federalState, standardWorkTimesJson, weekShifts, openShifts, weekAnchor.weekStart, shiftOpts])

  const stats = useMemo(() => {
    const today = localTodayYmd()
    const totalToday = todayShifts.length
    const filledToday = todayShifts.filter((s) => Boolean(s.employeeId && String(s.employeeId).trim())).length
    const openThisWeek = openShiftsWeek.totalCount
    const approvedAwayToday = absences.filter(
      (a) => a.status === 'genehmigt' && a.startDate <= today && a.endDate >= today,
    ).length
    return { totalToday, filledToday, openThisWeek, approvedAwayToday, openShiftsWeek }
  }, [todayShifts, openShiftsWeek, absences])

  return {
    ...stats,
    loading: loading || absencesLoading,
    shiftError,
    absencesError,
    reload,
  }
}
