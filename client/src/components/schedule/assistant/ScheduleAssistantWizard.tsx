import { useCallback, useEffect, useState } from 'react'
import type { AssistantMode, AssistantSuggestedShift, DayRequirement } from '../../../types/scheduleAssistant'
import { useStation } from '../../../context/station-context'
import { scheduleAssistantApply, scheduleAssistantGenerate } from '../../../services/api'
import { buildDefaultWeekRequirements } from '../../../utils/scheduleAssistantWeek'
import { useShiftRequirementOptions } from '../../../hooks/useShiftRequirementOptions'
import { Button } from '../../ui/Button'
import { AssistantRequirementStep } from './AssistantRequirementStep'
import { AssistantRulesStep } from './AssistantRulesStep'
import { AssistantSuggestionPreview } from './AssistantSuggestionPreview'
import { AssistantWeekStep } from './AssistantWeekStep'

const STEPS = ['Woche & Modus', 'Planungsbedarf', 'Regeln & Berechnen', 'Vorschlag']

type Props = {
  open: boolean
  initialWeekStartIso: string
  onClose: () => void
  onApplied: () => void
}

export function ScheduleAssistantWizard({ open, initialWeekStartIso, onClose, onApplied }: Props) {
  const { stationId, federalState, standardWorkTimesJson } = useStation()
  const shiftOpts = useShiftRequirementOptions()
  const [step, setStep] = useState(0)
  const [weekStartIso, setWeekStartIso] = useState(initialWeekStartIso)
  const [mode, setMode] = useState<AssistantMode>('fill_gaps')
  const [requirements, setRequirements] = useState<DayRequirement[]>(() =>
    buildDefaultWeekRequirements(initialWeekStartIso, stationId ?? '', federalState, standardWorkTimesJson, shiftOpts),
  )
  const [suggested, setSuggested] = useState<AssistantSuggestedShift[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setStep(0)
    setWeekStartIso(initialWeekStartIso)
    setMode('fill_gaps')
    setSuggested([])
    setWarnings([])
    setErr(null)
    setRequirements(
      buildDefaultWeekRequirements(initialWeekStartIso, stationId ?? '', federalState, standardWorkTimesJson, shiftOpts),
    )
  }, [open, initialWeekStartIso, stationId, federalState, standardWorkTimesJson, shiftOpts])

  useEffect(() => {
    setRequirements(
      buildDefaultWeekRequirements(weekStartIso, stationId ?? '', federalState, standardWorkTimesJson, shiftOpts),
    )
  }, [weekStartIso, stationId, federalState, standardWorkTimesJson, shiftOpts])

  const runGenerate = useCallback(async () => {
    if (!stationId) return false
    setBusy(true)
    setErr(null)
    const res = await scheduleAssistantGenerate({
      stationId,
      weekStart: weekStartIso,
      mode,
      requirements,
      federalState,
    })
    setBusy(false)
    if (!res.ok) {
      setErr(res.error)
      return false
    }
    setSuggested(res.data.suggestedShifts)
    setWarnings(res.data.warnings ?? [])
    return true
  }, [weekStartIso, mode, requirements, stationId, federalState])

  const apply = async (onlyOpen: boolean) => {
    if (!stationId) return
    setBusy(true)
    setErr(null)
    const list = onlyOpen
      ? suggested.filter((s) => s.employeeId && s.existingShiftId)
      : suggested.filter((s) => s.employeeId)
    const res = await scheduleAssistantApply({
      stationId,
      weekStart: weekStartIso,
      mode,
      onlyOpen,
      suggestions: list.map((s) => ({
        employeeId: s.employeeId,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        workAreaId: s.workAreaId,
        shiftType: s.shiftType,
        existingShiftId: s.existingShiftId,
      })),
    })
    setBusy(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    onApplied()
    onClose()
  }

  if (!open) return null

  return (
    <div className="flex max-h-[90vh] flex-col rounded-[var(--radius-lg)] border border-cyan-500/25 bg-[var(--bg-elevated)] shadow-[0_0_40px_rgba(34,211,238,0.12)]">
      <div className="border-b border-[var(--border-subtle)] px-5 py-4">
        <h2 className="text-lg font-semibold text-[var(--text-main)]">Schichtplan-Assistent</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Erstelle Vorschläge für die aktuelle Woche auf Basis von Verfügbarkeit, Schichtwünschen und offenen
          Diensten.
        </p>
        <div className="mt-3 flex flex-wrap gap-1">
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                i === step
                  ? 'bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/40'
                  : i < step
                    ? 'text-emerald-200/80'
                    : 'text-[var(--text-faint)]'
              }`}
            >
              {i + 1}. {label}
            </span>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {err ? (
          <div className="mb-3 rounded-md border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            {err}
          </div>
        ) : null}
        {step === 0 ? (
          <AssistantWeekStep weekStartIso={weekStartIso} onWeekStartIso={setWeekStartIso} mode={mode} onMode={setMode} />
        ) : null}
        {step === 1 ? (
          <AssistantRequirementStep requirements={requirements} onChange={setRequirements} />
        ) : null}
        {step === 2 ? (
          <div className="space-y-4">
            <AssistantRulesStep />
            <Button type="button" variant="primary" disabled={busy} onClick={() => void runGenerate().then((ok) => ok && setStep(3))}>
              {busy ? 'Berechne…' : 'Vorschläge berechnen'}
            </Button>
          </div>
        ) : null}
        {step === 3 ? <AssistantSuggestionPreview suggestedShifts={suggested} warnings={warnings} /> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-5 py-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Abbrechen
          </Button>
          {step > 0 && step < 3 ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => setStep((s) => s - 1)}>
              Zurück
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {step === 3 ? (
            <>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void runGenerate()}>
                Neu berechnen
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void apply(true)}>
                Nur offene übernehmen
              </Button>
              <Button type="button" variant="primary" disabled={busy} onClick={() => void apply(false)}>
                Vorschlag übernehmen
              </Button>
            </>
          ) : step < 2 ? (
            <Button type="button" variant="primary" disabled={busy} onClick={() => setStep((s) => s + 1)}>
              Weiter
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
