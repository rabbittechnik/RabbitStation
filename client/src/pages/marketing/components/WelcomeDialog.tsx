import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Rocket, X } from 'lucide-react'
import { WELCOME_BENEFITS, WELCOME_STORAGE_KEY } from '../landingData'

type WelcomeDialogProps = {
  onLearnMore: () => void
}

export function WelcomeDialog({ onLearnMore }: WelcomeDialogProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(WELCOME_STORAGE_KEY) === '1') return
      const t = window.setTimeout(() => setOpen(true), 600)
      return () => window.clearTimeout(t)
    } catch {
      /* private mode */
    }
  }, [])

  const close = (markSeen = true) => {
    if (markSeen) {
      try {
        localStorage.setItem(WELCOME_STORAGE_KEY, '1')
      } catch {
        /* ignore */
      }
    }
    setOpen(false)
  }

  const handleLearnMore = () => {
    close(true)
    onLearnMore()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-dialog-title"
    >
      <div
        className="absolute inset-0 bg-[#02060d]/80 backdrop-blur-sm"
        onClick={() => close(true)}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-400/35 bg-[#0a1424] shadow-[0_0_60px_rgba(34,211,238,0.15)]">
        <div className="border-b border-cyan-500/20 bg-gradient-to-br from-[#07111f] to-[#0f2438] px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">RabbitStation Pro</p>
              <h2 id="welcome-dialog-title" className="mt-2 text-2xl font-bold text-white">
                Willkommen bei RabbitStation Pro
              </h2>
            </div>
            <button
              type="button"
              onClick={() => close(true)}
              className="rounded-lg p-1.5 text-[#94a3b8] transition hover:bg-white/5 hover:text-white"
              aria-label="Schließen"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[#cbd5e1]">
            RabbitStation Pro wurde speziell für den Alltag an Tankstellen entwickelt. Dienstplanung, Zeiterfassung,
            Aufgaben, Dokumente, Zuschläge und Auswertungen werden zentral gebündelt – für Betreiber, Stationsleiter und
            Teams.
          </p>
        </div>
        <div className="px-6 py-5">
          <ul className="space-y-2.5">
            {WELCOME_BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm text-[#e2e8f0]">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-300">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Link
              to="/registrieren"
              onClick={() => close(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-[#03121f] shadow-[0_0_24px_rgba(34,211,238,0.35)]"
            >
              <Rocket className="h-4 w-4" />
              7 Tage kostenlos testen
            </Link>
            <button
              type="button"
              onClick={handleLearnMore}
              className="rounded-xl border border-cyan-500/40 px-5 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/10"
            >
              Mehr erfahren
            </button>
            <button
              type="button"
              onClick={() => close(true)}
              className="rounded-xl px-5 py-2.5 text-sm text-[#94a3b8] transition hover:text-white"
            >
              Schließen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
