import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/auth-context'
import { useStation } from '../context/station-context'
import type { ShiftRequirementOptions, ShiftTemplateRef } from '../data/defaultShiftRequirements'
import { apiGet } from '../services/api'

type SetupStateLite = {
  setupCompleted: boolean
  shiftSetupCompleted: boolean
}

type TemplatesResponse = { templates: ShiftTemplateRef[] }

export function useShiftRequirementOptions(): ShiftRequirementOptions & { loading: boolean } {
  const { user, token } = useAuth()
  const { stationId } = useStation()
  const [setupState, setSetupState] = useState<SetupStateLite | null>(null)
  const [templates, setTemplates] = useState<ShiftTemplateRef[]>([])
  const [loading, setLoading] = useState(true)

  const setupCompleted = user?.tenant?.setupCompleted ?? setupState?.setupCompleted ?? true
  const shiftSetupCompleted = setupState?.shiftSetupCompleted ?? setupCompleted

  useEffect(() => {
    if (!token) {
      setSetupState(null)
      setTemplates([])
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      const stateRes = await apiGet<SetupStateLite>('/setup/state')
      if (cancelled) return
      if (stateRes.ok) setSetupState(stateRes.data)
      if (stationId && stateRes.ok && stateRes.data.shiftSetupCompleted) {
        const tplRes = await apiGet<TemplatesResponse>(`/stations/${stationId}/shift-templates`)
        if (!cancelled && tplRes.ok) {
          setTemplates(
            (tplRes.data.templates ?? []).map((t) => ({
              id: t.id,
              name: t.name,
              type: t.type,
              startTime: t.startTime,
              endTime: t.endTime,
            })),
          )
        }
      } else if (!cancelled) {
        setTemplates([])
      }
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [token, stationId, setupCompleted])

  const options = useMemo(
    (): ShiftRequirementOptions => ({
      setupCompleted,
      shiftSetupCompleted,
      shiftTemplates: templates,
    }),
    [setupCompleted, shiftSetupCompleted, templates],
  )

  return { ...options, loading }
}
