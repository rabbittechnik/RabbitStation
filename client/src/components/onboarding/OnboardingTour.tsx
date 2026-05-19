import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiSend } from '../../services/api'
import { Button } from '../ui/Button'

const TOUR_STEPS: { target: string; title: string; body: string; path?: string }[] = [
  { target: 'dashboard', title: 'Dashboard', body: 'Ihr Überblick: offene Schichten, Abwesenheiten und Erinnerungen.', path: '/dashboard' },
  { target: 'schedule', title: 'Schichtplan', body: 'Planen und veröffentlichen Sie Wochenschichten für Ihr Team.', path: '/schedule' },
  { target: 'tasks', title: 'Aufgaben', body: 'Wiederkehrende und einmalige Aufgaben für die Station.', path: '/tasks' },
  { target: 'payroll', title: 'Auswertungen', body: 'Lohn- und Zeit-Auswertungen finden Sie unter Berichte.', path: '/reports/payroll-time' },
  { target: 'documents', title: 'Dokumente', body: 'Vorlagen, Checklisten und Stationsdokumente.', path: '/documents' },
  { target: 'contacts', title: 'Kontakte', body: 'Team, Vertreter und wichtige Rufnummern.', path: '/contacts' },
  { target: 'tablet', title: 'Tablet', body: 'Koppeln Sie ein Stations-Tablet für Zeiterfassung und Terminal.', path: '/account/devices' },
]

type Props = {
  active: boolean
  onDone: () => void
}

export function OnboardingTour({ active, onDone }: Props) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const current = TOUR_STEPS[step]

  const measure = useCallback(() => {
    if (!current) return
    const el = document.querySelector(`[data-tour="${current.target}"]`)
    if (el) setRect(el.getBoundingClientRect())
    else setRect(null)
  }, [current])

  useEffect(() => {
    if (!active || !current) return
    if (current.path) navigate(current.path)
    const t = window.setTimeout(measure, 120)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [active, current, measure, navigate])

  const finish = async (dismiss: boolean) => {
    if (dismiss) await apiSend('POST', '/setup/tour-complete', {})
    onDone()
  }

  if (!active || !current) return null

  const pad = 8
  const box = rect ?
    {
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    }
  : { top: '20%', left: '50%', width: 280, height: 80 }

  const tooltipTop = typeof box.top === 'number' ? box.top + (typeof box.height === 'number' ? box.height : 80) + 12 : '30%'

  return (
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-label="Einführung">
      <div className="absolute inset-0 bg-black/65" />
      <div
        className="pointer-events-none absolute rounded-lg ring-2 ring-cyan-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]"
        style={{
          top: box.top,
          left: box.left,
          width: box.width,
          height: box.height,
        }}
      />
      <div
        className="absolute z-10 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-cyan-500/40 bg-[#0a1220] p-4 shadow-xl"
        style={{
          top: tooltipTop,
          left: typeof box.left === 'number' ? Math.min(box.left, window.innerWidth - 360) : '50%',
          transform: typeof box.left === 'number' ? undefined : 'translateX(-50%)',
        }}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-cyan-300/80">
          Schritt {step + 1} von {TOUR_STEPS.length}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-cyan-50">{current.title}</h2>
        <p className="mt-2 text-sm text-[#a8b8d8]">{current.body}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {step > 0 ?
            <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
              Zurück
            </Button>
          : null}
          {step < TOUR_STEPS.length - 1 ?
            <Button type="button" onClick={() => setStep((s) => s + 1)}>
              Weiter
            </Button>
          : <Button type="button" onClick={() => void finish(true)}>Tour abschließen</Button>}
          <button
            type="button"
            className="text-xs text-[#a8b8d8] underline-offset-2 hover:text-cyan-200 hover:underline"
            onClick={() => void finish(true)}
          >
            Nicht mehr anzeigen
          </button>
          <button
            type="button"
            className="ml-auto text-xs text-[#a8b8d8] underline-offset-2 hover:underline"
            onClick={() => void finish(false)}
          >
            Beenden
          </button>
        </div>
      </div>
    </div>
  )
}
