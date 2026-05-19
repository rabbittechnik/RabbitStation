import { useEffect, useState } from 'react'
import { useStation } from '../../context/station-context'
import { apiGet } from '../../services/api'
import type { TuvCurrentMonthCheck } from '../../types/tuvReport'
import { TuvReportReminderCard } from './TuvReportReminderCard'

export function TuvReportDashboardReminder() {
  const { stationId, hasPermission } = useStation()
  const [check, setCheck] = useState<TuvCurrentMonthCheck | null>(null)
  const [error, setError] = useState<string | null>(null)

  const show =
    hasPermission('tuvReports.view') ||
    hasPermission('tuvReports.create') ||
    hasPermission('tuvReports.edit')

  useEffect(() => {
    let cancelled = false
    if (!stationId || !show) {
      setCheck(null)
      setError(null)
      return
    }
    void (async () => {
      setError(null)
      const res = await apiGet<TuvCurrentMonthCheck>('/tuv-reports/check-current-month', {
        stationId,
      })
      if (cancelled) return
      if (!res.ok) {
        setCheck(null)
        setError(res.error)
        return
      }
      setCheck(res.data)
    })()
    return () => {
      cancelled = true
    }
  }, [stationId, show])

  if (!show) return null

  if (check?.disabled || check?.status === 'disabled') return null

  if (error) {
    return (
      <div className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
        TÜV-Status konnte nicht geladen werden: {error}
      </div>
    )
  }

  return <TuvReportReminderCard check={check} />
}
