import { useEffect, useState } from 'react'

import { useStation } from '../../context/station-context'

import { apiGet } from '../../services/api'

import type { TuvCurrentMonthCheck } from '../../types/tuvReport'

import { TuvReportReminderCard } from './TuvReportReminderCard'

import { usePlanEntitlements } from '../../hooks/usePlanEntitlements'

import { FeatureLockedCard } from '../plan/FeatureLockedCard'




export function TuvReportDashboardReminder() {

  const { stationId, hasPermission } = useStation()

  const { hasFeature, planName } = usePlanEntitlements()

  const [check, setCheck] = useState<TuvCurrentMonthCheck | null>(null)

  const [planLocked, setPlanLocked] = useState(false)



  const hasTuvPlan = hasFeature('monthly_tuv_report')

  const show =

    hasTuvPlan &&

    (hasPermission('tuvReports.view') ||

      hasPermission('tuvReports.create') ||

      hasPermission('tuvReports.edit'))



  useEffect(() => {

    let cancelled = false

    if (!stationId || !show) {

      setCheck(null)

      setPlanLocked(false)

      return

    }

    void (async () => {

      setPlanLocked(false)

      const res = await apiGet<TuvCurrentMonthCheck>('/tuv-reports/check-current-month', {

        stationId,

      })

      if (cancelled) return

      if (!res.ok) {

        setCheck(null)

        if (res.code === 'feature_not_available') {
          setPlanLocked(true)
        }

        return

      }

      setCheck(res.data)

    })()

    return () => {

      cancelled = true

    }

  }, [stationId, show])



  if (!hasTuvPlan) {

    return <FeatureLockedCard feature="monthly_tuv_report" currentPlan={planName} compact />

  }



  if (!show) return null



  if (planLocked) {

    return <FeatureLockedCard feature="monthly_tuv_report" currentPlan={planName} compact />

  }



  if (check?.disabled || check?.status === 'disabled') return null



  return <TuvReportReminderCard check={check} />

}


