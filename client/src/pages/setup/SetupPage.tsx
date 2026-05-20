import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiGet, apiSend } from '../../services/api'
import { useAuth } from '../../context/auth-context'
import { Button } from '../../components/ui/Button'
import { setSetupDeferred } from '../../components/auth/RequireSetup'
import {
  GERMAN_FEDERAL_STATES,
  GERMAN_STATE_LABELS,
  parseGermanState,
  type GermanState,
} from '../../data/germanFederalStates'

type ShiftTypeKey = 'early' | 'middle' | 'late' | 'night' | 'office' | 'custom'

type SetupState = {
  setupCompleted: boolean
  stationId: string | null
  federalStateSetupCompleted?: boolean
  shiftSetupCompleted: boolean
  monthlyTuvReportEnabled: boolean | null
  setupOwnerAnswered: boolean
  ownerAsEmployeeEnabled: boolean
  canComplete: boolean
  employeeCount: number
}

const SHIFT_DEFS: { type: ShiftTypeKey; label: string; start: string; end: string }[] = [
  { type: 'early', label: 'Frühschicht', start: '06:00', end: '14:00' },
  { type: 'middle', label: 'Mittelschicht', start: '08:00', end: '16:00' },
  { type: 'late', label: 'Spätschicht', start: '14:00', end: '22:00' },
  { type: 'night', label: 'Nachtschicht', start: '22:00', end: '06:00' },
  { type: 'office', label: 'Büro / Verwaltung', start: '08:00', end: '17:00' },
]

const TOTAL_STEPS = 7

export function SetupPage() {
  const { token, refreshMe } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [state, setState] = useState<SetupState | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [selected, setSelected] = useState<Record<ShiftTypeKey, boolean>>({
    early: true,
    late: true,
    middle: false,
    night: false,
    office: false,
    custom: false,
  })
  const [times, setTimes] = useState<Record<ShiftTypeKey, { start: string; end: string }>>(() => ({
    ...Object.fromEntries(SHIFT_DEFS.map((d) => [d.type, { start: d.start, end: d.end }])),
    custom: { start: '10:00', end: '18:00' },
  }) as Record<ShiftTypeKey, { start: string; end: string }>)
  const [customName, setCustomName] = useState('Sonderschicht')
  const [tuvEnabled, setTuvEnabled] = useState<boolean | null>(null)
  const [ownerEnabled, setOwnerEnabled] = useState<boolean | null>(null)
  const [empFirst, setEmpFirst] = useState('')
  const [empLast, setEmpLast] = useState('')
  const [skipEmployee, setSkipEmployee] = useState(true)
  const [setupFederalState, setSetupFederalState] = useState<GermanState>('BW')
  const [setupBavariaAssumption, setSetupBavariaAssumption] = useState(false)

  const reload = useCallback(async () => {
    const r = await apiGet<SetupState>('/setup/state')
    if (r.ok) {
      setState(r.data)
      if (r.data.monthlyTuvReportEnabled != null) setTuvEnabled(r.data.monthlyTuvReportEnabled)
      if (r.data.setupOwnerAnswered) setOwnerEnabled(r.data.ownerAsEmployeeEnabled)
      if (r.data.setupCompleted) setStep(7)
      else if (!r.data.federalStateSetupCompleted) setStep(2)
      else if (!r.data.shiftSetupCompleted) setStep(3)
      else if (r.data.monthlyTuvReportEnabled == null) setStep(4)
      else if (!r.data.setupOwnerAnswered) setStep(6)
      else setStep(7)
    }
  }, [])

  useEffect(() => {
    if (!token) return
    void reload()
  }, [token, reload])

  if (!token) {
    return (
      <p className="p-8 text-center text-[#a8b8d8]">
        <Link to="/login" className="text-cyan-300">
          Bitte anmelden
        </Link>
      </p>
    )
  }

  const stationId = state?.stationId ?? ''

  const saveFederalState = async () => {
    if (!stationId) return
    setBusy(true)
    setErr(null)
    const res = await apiSend('POST', '/setup/federal-state', {
      stationId,
      federalState: setupFederalState,
      options: { bavariaAssumptionDayEnabled: setupBavariaAssumption },
    })
    setBusy(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    await reload()
    setStep(3)
  }

  const saveShifts = async () => {
    if (!stationId) return
    const templates: Array<{ type: string; startTime: string; endTime: string; name?: string }> =
      SHIFT_DEFS.filter((d) => selected[d.type]).map((d) => ({
        type: d.type,
        startTime: times[d.type].start,
        endTime: times[d.type].end,
      }))
    if (selected.custom) {
      templates.push({
        type: 'custom',
        name: customName.trim() || 'Eigene Schicht',
        startTime: times.custom.start,
        endTime: times.custom.end,
      })
    }
    setBusy(true)
    setErr(null)
    const res = await apiSend('POST', '/setup/shift-templates', { stationId, templates })
    setBusy(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    await reload()
    setStep(4)
  }

  const saveTuv = async () => {
    if (!stationId || tuvEnabled == null) return
    setBusy(true)
    const res = await apiSend('POST', '/setup/tuv-preference', { stationId, enabled: tuvEnabled })
    setBusy(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    await reload()
    setStep(5)
  }

  const saveEmployee = async () => {
    if (skipEmployee) {
      setStep(6)
      return
    }
    if (!empFirst.trim() || !empLast.trim()) {
      setErr('Vor- und Nachname erforderlich')
      return
    }
    setBusy(true)
    const res = await apiSend('POST', '/setup/first-employee', {
      stationId,
      firstName: empFirst.trim(),
      lastName: empLast.trim(),
    })
    setBusy(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    await reload()
    setStep(6)
  }

  const saveOwner = async () => {
    if (!stationId || ownerEnabled == null) return
    setBusy(true)
    const res = await apiSend('POST', '/setup/owner-as-employee', { stationId, enabled: ownerEnabled })
    setBusy(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    await reload()
    setStep(7)
  }

  const finish = async () => {
    setBusy(true)
    const res = await apiSend('POST', '/setup/complete', {})
    setBusy(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setSetupDeferred(false)
    await refreshMe()
    navigate('/dashboard', { replace: true })
  }

  const defer = () => {
    setSetupDeferred(true)
    navigate('/dashboard', { replace: true })
  }

  const progress = Math.round((step / TOTAL_STEPS) * 100)

  return (
    <div className="min-h-screen bg-[#060b14] px-4 py-10 text-[#e8f0ff]">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <p className="text-xs font-medium uppercase tracking-wider text-cyan-400/90">
            Schritt {step} von {TOTAL_STEPS}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cyan-950">
            <div className="h-full bg-cyan-400 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {err ? <p className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{err}</p> : null}

        {step === 1 ?
          <section>
            <h1 className="text-2xl font-semibold text-cyan-100">Willkommen bei RabbitStation</h1>
            <p className="mt-3 text-sm leading-relaxed text-[#a8b8d8]">
              In wenigen Schritten richten Sie Schichtmodelle, TÜV-Berichte und Ihr Team ein. Danach sehen Sie im
              Dashboard nur noch die Schichtlücken, die zu Ihrem Betrieb passen.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button type="button" onClick={() => setStep(2)}>
                Einrichtung starten
              </Button>
              <Button type="button" variant="ghost" onClick={defer}>
                Später fortfahren
              </Button>
            </div>
          </section>
        : null}

        {step === 2 ?
          <section>
            <h1 className="text-xl font-semibold text-cyan-100">Bundesland Ihrer Tankstelle</h1>
            <p className="mt-2 text-sm text-[#a8b8d8]">
              In welchem Bundesland befindet sich Ihre Tankstelle? Die gesetzlichen Feiertage werden dafür automatisch
              für das aktuelle und das nächste Jahr angelegt.
            </p>
            <label className="mt-6 block text-sm">
              <span className="mb-1 block text-[#a8b8d8]">Bundesland</span>
              <select
                className="w-full rounded-lg border border-cyan-500/30 bg-[#0a1220] px-3 py-2"
                value={setupFederalState}
                onChange={(e) => setSetupFederalState(parseGermanState(e.target.value))}
              >
                {GERMAN_FEDERAL_STATES.map((code) => (
                  <option key={code} value={code}>
                    {GERMAN_STATE_LABELS[code]}
                  </option>
                ))}
              </select>
            </label>
            {setupFederalState === 'BY' ?
              <label className="mt-4 flex items-start gap-2 text-sm text-[#a8b8d8]">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={setupBavariaAssumption}
                  onChange={(e) => setSetupBavariaAssumption(e.target.checked)}
                />
                <span>Mariä Himmelfahrt gilt in Bayern nur in bestimmten Gemeinden (optional aktivieren).</span>
              </label>
            : null}
            <div className="mt-8 flex gap-3">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                Zurück
              </Button>
              <Button type="button" disabled={busy} onClick={() => void saveFederalState()}>
                Weiter
              </Button>
            </div>
          </section>
        : null}

        {step === 3 ?
          <section>
            <h1 className="text-xl font-semibold text-cyan-100">Schichtmodelle</h1>
            <p className="mt-2 text-sm text-[#a8b8d8]">Welche Schichten nutzen Sie? Mindestens eine auswählen.</p>
            <ul className="mt-6 space-y-3">
              {SHIFT_DEFS.map((d) => (
                <li key={d.type} className="rounded-lg border border-cyan-500/20 px-4 py-3">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected[d.type]}
                      onChange={(e) => setSelected((s) => ({ ...s, [d.type]: e.target.checked }))}
                    />
                    <span className="font-medium">{d.label}</span>
                  </label>
                  {selected[d.type] ?
                    <div className="mt-3 flex flex-wrap gap-3 pl-7">
                      <label className="text-xs text-[#a8b8d8]">
                        Von
                        <input
                          type="time"
                          className="ml-2 rounded border border-cyan-500/30 bg-[#0a1220] px-2 py-1"
                          value={times[d.type].start}
                          onChange={(e) =>
                            setTimes((t) => ({ ...t, [d.type]: { ...t[d.type], start: e.target.value } }))
                          }
                        />
                      </label>
                      <label className="text-xs text-[#a8b8d8]">
                        Bis
                        <input
                          type="time"
                          className="ml-2 rounded border border-cyan-500/30 bg-[#0a1220] px-2 py-1"
                          value={times[d.type].end}
                          onChange={(e) =>
                            setTimes((t) => ({ ...t, [d.type]: { ...t[d.type], end: e.target.value } }))
                          }
                        />
                      </label>
                    </div>
                  : null}
                </li>
              ))}
              <li className="rounded-lg border border-cyan-500/20 px-4 py-3">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.custom}
                    onChange={(e) => setSelected((s) => ({ ...s, custom: e.target.checked }))}
                  />
                  <span className="font-medium">Eigene Schicht</span>
                </label>
                {selected.custom ?
                  <div className="mt-3 space-y-2 pl-7">
                    <input
                      type="text"
                      placeholder="Name"
                      className="w-full rounded border border-cyan-500/30 bg-[#0a1220] px-3 py-2 text-sm"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-3">
                      <input
                        type="time"
                        className="rounded border border-cyan-500/30 bg-[#0a1220] px-2 py-1"
                        value={times.custom.start}
                        onChange={(e) => setTimes((t) => ({ ...t, custom: { ...t.custom, start: e.target.value } }))}
                      />
                      <input
                        type="time"
                        className="rounded border border-cyan-500/30 bg-[#0a1220] px-2 py-1"
                        value={times.custom.end}
                        onChange={(e) => setTimes((t) => ({ ...t, custom: { ...t.custom, end: e.target.value } }))}
                      />
                    </div>
                  </div>
                : null}
              </li>
            </ul>
            <div className="mt-8 flex gap-3">
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                Zurück
              </Button>
              <Button type="button" disabled={busy} onClick={() => void saveShifts()}>
                Weiter
              </Button>
            </div>
          </section>
        : null}

        {step === 4 ?
          <section>
            <h1 className="text-xl font-semibold text-cyan-100">Monatlicher TÜV-Bericht</h1>
            <p className="mt-2 text-sm text-[#a8b8d8]">Möchten Sie monatliche TÜV-Sicherheitsberichte führen?</p>
            <div className="mt-6 space-y-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-cyan-500/25 px-4 py-3">
                <input type="radio" name="tuv" checked={tuvEnabled === true} onChange={() => setTuvEnabled(true)} />
                Ja, TÜV-Erinnerungen aktivieren
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-cyan-500/25 px-4 py-3">
                <input type="radio" name="tuv" checked={tuvEnabled === false} onChange={() => setTuvEnabled(false)} />
                Nein, nicht benötigt
              </label>
            </div>
            <div className="mt-8 flex gap-3">
              <Button type="button" variant="outline" onClick={() => setStep(3)}>
                Zurück
              </Button>
              <Button type="button" disabled={busy || tuvEnabled == null} onClick={() => void saveTuv()}>
                Weiter
              </Button>
            </div>
          </section>
        : null}

        {step === 5 ?
          <section>
            <h1 className="text-xl font-semibold text-cyan-100">Erster Mitarbeiter</h1>
            <p className="mt-2 text-sm text-[#a8b8d8]">Optional — Sie können Mitarbeiter auch später anlegen.</p>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={skipEmployee} onChange={(e) => setSkipEmployee(e.target.checked)} />
              Überspringen
            </label>
            {!skipEmployee ?
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input
                  placeholder="Vorname"
                  className="rounded border border-cyan-500/30 bg-[#0a1220] px-3 py-2"
                  value={empFirst}
                  onChange={(e) => setEmpFirst(e.target.value)}
                />
                <input
                  placeholder="Nachname"
                  className="rounded border border-cyan-500/30 bg-[#0a1220] px-3 py-2"
                  value={empLast}
                  onChange={(e) => setEmpLast(e.target.value)}
                />
              </div>
            : null}
            <div className="mt-8 flex gap-3">
              <Button type="button" variant="outline" onClick={() => setStep(4)}>
                Zurück
              </Button>
              <Button type="button" disabled={busy} onClick={() => void saveEmployee()}>
                Weiter
              </Button>
            </div>
          </section>
        : null}

        {step === 6 ?
          <section>
            <h1 className="text-xl font-semibold text-cyan-100">Sie im Schichtplan</h1>
            <p className="mt-2 text-sm text-[#a8b8d8]">Sollen Sie selbst als Mitarbeiter im Plan erscheinen?</p>
            <div className="mt-6 space-y-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-cyan-500/25 px-4 py-3">
                <input type="radio" name="owner" checked={ownerEnabled === true} onChange={() => setOwnerEnabled(true)} />
                Ja, als Chef / Betreiber einplanen
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-cyan-500/25 px-4 py-3">
                <input
                  type="radio"
                  name="owner"
                  checked={ownerEnabled === false}
                  onChange={() => setOwnerEnabled(false)}
                />
                Nein, nur verwalten
              </label>
            </div>
            <div className="mt-8 flex gap-3">
              <Button type="button" variant="outline" onClick={() => setStep(5)}>
                Zurück
              </Button>
              <Button type="button" disabled={busy || ownerEnabled == null} onClick={() => void saveOwner()}>
                Weiter
              </Button>
            </div>
          </section>
        : null}

        {step === 7 ?
          <section>
            <h1 className="text-xl font-semibold text-cyan-100">Fertig</h1>
            <ul className="mt-4 space-y-2 text-sm text-[#a8b8d8]">
              <li>{state?.federalStateSetupCompleted ? '✓' : '○'} Bundesland & Feiertage</li>
              <li>{state?.shiftSetupCompleted ? '✓' : '○'} Schichtmodelle</li>
              <li>{state?.monthlyTuvReportEnabled != null ? '✓' : '○'} TÜV-Entscheidung</li>
              <li>{state?.setupOwnerAnswered ? '✓' : '○'} Inhaber im Plan</li>
              <li>{(state?.employeeCount ?? 0) > 0 ? '✓' : '○'} Mitarbeiter (optional)</li>
            </ul>
            <Button type="button" className="mt-8" disabled={busy || !state?.canComplete} onClick={() => void finish()}>
              Setup abschließen
            </Button>
          </section>
        : null}
      </div>
    </div>
  )
}

