import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { apiSend } from '../../services/api'
import { Button } from '../ui/Button'
import {
  computeTooltipPosition,
  highlightFromRect,
  isRectUsable,
  shouldUseCenteredHighlight,
  TOUR_MARGIN,
} from './tourPosition'

const Z_OVERLAY = 9000
const Z_HIGHLIGHT = 9010
const Z_TOOLTIP = 9020

const TOUR_STEPS: {
  target: string
  title: string
  body: string
  path?: string
  missingHint?: string
}[] = [
  {
    target: 'dashboard-overview',
    title: 'Dashboard',
    body: 'Ihr Überblick: offene Schichten, Abwesenheiten und Erinnerungen.',
    path: '/dashboard',
  },
  {
    target: 'schedule',
    title: 'Schichtplan',
    body: 'Hier planen Sie Früh-, Spät-, Nacht- oder individuelle Schichten für Ihre Station.',
    path: '/schedule',
    missingHint: 'Den Schichtplan finden Sie im Menü unter Organisation.',
  },
  {
    target: 'tasks',
    title: 'Aufgaben',
    body: 'Wiederkehrende und einmalige Aufgaben für die Station.',
    path: '/tasks',
    missingHint: 'Aufgaben finden Sie im Menü unter Organisation.',
  },
  {
    target: 'payroll',
    title: 'Auswertungen',
    body: 'Lohn- und Zeit-Auswertungen finden Sie unter Auswertungen.',
    path: '/reports/payroll-time',
    missingHint: 'Auswertungen finden Sie im Menü unter Auswertungen.',
  },
  {
    target: 'documents',
    title: 'Dokumente',
    body: 'Vorlagen, Checklisten und Stationsdokumente.',
    path: '/documents',
    missingHint: 'Dokumente finden Sie im Menü unter Organisation.',
  },
  {
    target: 'contacts',
    title: 'Kontakte',
    body: 'Team, Vertreter und wichtige Rufnummern.',
    path: '/contacts',
    missingHint: 'Kontakte finden Sie im Menü unter Organisation.',
  },
  {
    target: 'tablet',
    title: 'Tablet',
    body: 'Koppeln Sie ein Stations-Tablet für Zeiterfassung und Terminal.',
    path: '/account/devices',
    missingHint: 'Geräte finden Sie unter Mein Konto → Geräte & Apps.',
  },
]

type Props = {
  active: boolean
  onDone: () => void
}

export function OnboardingTour({ active, onDone }: Props) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [targetMissing, setTargetMissing] = useState(false)
  const [tooltipSize, setTooltipSize] = useState({ w: 360, h: 220 })
  const tooltipRef = useRef<HTMLDivElement>(null)
  const readyRef = useRef(false)

  const current = TOUR_STEPS[step]

  const measure = useCallback(() => {
    if (!current) return
    const el = document.querySelector(`[data-tour="${current.target}"]`)
    if (!el) {
      setRect(null)
      setTargetMissing(true)
      return
    }
    const r = el.getBoundingClientRect()
    if (!isRectUsable(r) || shouldUseCenteredHighlight(r)) {
      setRect(null)
      setTargetMissing(true)
      return
    }
    setRect(r)
    setTargetMissing(false)
  }, [current])

  useEffect(() => {
    if (!active) {
      setStep(0)
      setRect(null)
      setTargetMissing(false)
      readyRef.current = false
    }
  }, [active])

  useEffect(() => {
    if (!active || !current) return

    let cancelled = false
    readyRef.current = false
    setRect(null)

    const run = async () => {
      if (current.path) navigate(current.path)

      await new Promise((r) => window.setTimeout(r, 120))
      if (cancelled) return

      const el = document.querySelector(`[data-tour="${current.target}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
        await new Promise((r) => window.setTimeout(r, 280))
      }
      if (cancelled) return

      measure()
      readyRef.current = true
    }

    void run()

    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)

    return () => {
      cancelled = true
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [active, current, measure, navigate, step])

  useLayoutEffect(() => {
    if (!active || !tooltipRef.current) return
    const { width, height } = tooltipRef.current.getBoundingClientRect()
    if (width > 0 && height > 0) {
      setTooltipSize({ w: width, h: height })
    }
  }, [active, step, rect, targetMissing, current?.title])

  const finish = useCallback(
    async (persist: boolean) => {
      if (persist) await apiSend('POST', '/setup/tour-complete', {})
      onDone()
    },
    [onDone],
  )

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void finish(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, finish])

  if (!active || !current) return null

  const showHighlight = rect && !targetMissing
  const highlight = showHighlight ? highlightFromRect(rect) : null
  const tooltipPos = computeTooltipPosition(
    showHighlight ? rect : null,
    tooltipSize.w,
    tooltipSize.h,
  )

  const bodyText =
    targetMissing ?
      (current.missingHint ??
        'Dieser Bereich ist aktuell nicht sichtbar. Sie können später über das Menü darauf zugreifen.')
    : current.body

  const content = (
      <TourRoot>
      {/* Overlay (ohne Spotlight bei zentriertem Fallback) */}
      {!highlight ?
        <div
          className="fixed inset-0 bg-black/65"
          style={{ zIndex: Z_OVERLAY }}
          aria-hidden
        />
      : null}

      {/* Spotlight */}
      {highlight ?
        <div
          className="pointer-events-none fixed rounded-lg ring-2 ring-cyan-400 shadow-[0_0_24px_rgba(34,211,238,0.45)]"
          style={{
            zIndex: Z_HIGHLIGHT,
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
            boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.65)`,
          }}
        />
      : null}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="pointer-events-auto fixed rounded-xl border border-cyan-500/45 bg-[#0a1220] p-4 shadow-[0_0_32px_rgba(34,211,238,0.2)]"
        style={{
          zIndex: Z_TOOLTIP,
          top: tooltipPos.top,
          left: tooltipPos.left,
          width: `min(${tooltipPos.maxWidth}px, calc(100vw - ${TOUR_MARGIN * 2}px))`,
          maxWidth: tooltipPos.maxWidth,
        }}
      >
        <button
          type="button"
          onClick={() => void finish(true)}
          className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:bg-white/10 hover:text-cyan-200"
          style={{ zIndex: Z_TOOLTIP + 1 }}
          aria-label="Tour schließen"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="pr-8 text-xs font-medium uppercase tracking-wide text-cyan-300/80">
          Schritt {step + 1} von {TOUR_STEPS.length}
        </p>
        <h2 id="tour-title" className="mt-1 text-lg font-semibold text-cyan-50">
          {current.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#a8b8d8]">{bodyText}</p>

        <div
          className="relative mt-4 flex flex-wrap items-center gap-2"
          style={{ zIndex: Z_TOOLTIP + 1 }}
        >
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
            className="text-xs font-medium text-orange-300 underline-offset-2 hover:underline"
            onClick={() => void finish(true)}
          >
            Einführung beenden
          </button>
        </div>
      </div>
    </TourRoot>
  )

  return createPortal(content, document.body)
}

function TourRoot({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none fixed inset-0">{children}</div>
}
