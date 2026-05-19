import { useState } from 'react'
import { Check, X, Sparkles } from 'lucide-react'
import {
  PRICING_FAQ,
  PRICING_PLANS,
  registerUrlForPlan,
  type PricingPlan,
} from '../../data/pricingPlans'
import { GlowCard, PrimaryCta, SectionTitle } from './components/marketingUi'

const HINTS = [
  '7 Tage kostenlos testen',
  'monatlich kündbar',
  'Preise zzgl. MwSt.',
  'keine Installation notwendig',
  'direkt im Browser nutzbar',
] as const

function PricingCard({ plan }: { plan: PricingPlan }) {
  const highlighted = Boolean(plan.recommended)

  return (
    <GlowCard
      className={`relative flex h-full flex-col p-6 md:p-8 ${
        highlighted ?
          'border-cyan-400/50 shadow-[0_0_48px_rgba(34,211,238,0.18)] ring-1 ring-cyan-400/30'
        : ''
      }`}
    >
      {highlighted ?
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-cyan-400 to-cyan-500 px-4 py-1 text-xs font-bold uppercase tracking-wide text-[#03121f] shadow-[0_0_20px_rgba(34,211,238,0.4)]">
          Empfohlen
        </span>
      : null}

      <PricingCardBody plan={plan} highlighted={highlighted} />
    </GlowCard>
  )
}

function PricingCardBody({ plan, highlighted }: { plan: PricingPlan; highlighted: boolean }) {
  return (
    <>
      <div className="mb-6 pt-2">
        <h3 className="text-xl font-bold text-white">{plan.name}</h3>
        <p className="mt-2 text-sm text-[#94a3b8]">{plan.subtitle}</p>
        <p className="mt-4 flex items-baseline gap-1">
          <span className="text-3xl font-bold text-cyan-300 md:text-4xl">{plan.price}</span>
          <span className="text-sm text-[#64748b]">/ Monat</span>
        </p>
      </div>

      <ul className="mb-8 flex-1 space-y-2.5">
        {plan.features.map((f) => (
          <li
            key={f.text}
            className={`flex items-start gap-2.5 text-sm ${
              f.included ? 'text-[#cbd5e1]' : 'text-[#64748b]'
            }`}
          >
            {f.included ?
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" strokeWidth={2.5} />
            : <X className="mt-0.5 h-4 w-4 shrink-0 text-[#475569]" strokeWidth={2} />}
            <span className={f.included ? '' : 'line-through decoration-[#475569]/80'}>
              {f.text}
              {!f.included ?
                <span className="ml-1 text-xs font-normal text-[#64748b] no-underline">
                  (nicht enthalten)
                </span>
              : null}
            </span>
          </li>
        ))}
      </ul>

      {plan.footnote ?
        <p className="mb-4 text-xs text-[#94a3b8]">{plan.footnote}</p>
      : null}

      <PrimaryCta
        to={registerUrlForPlan(plan.id)}
        className={`w-full ${highlighted ? '' : '!from-cyan-500/90 !to-cyan-600/90'}`}
      >
        {plan.cta}
      </PrimaryCta>
    </>
  )
}

function FaqItem({
  q,
  a,
  open,
  onToggle,
}: {
  q: string
  a: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-b border-cyan-500/15 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium text-white hover:text-cyan-100"
      >
        {q}
        <span className="shrink-0 text-cyan-400">{open ? '−' : '+'}</span>
      </button>
      {open ?
        <p className="pb-4 text-sm leading-relaxed text-[#94a3b8]">{a}</p>
      : null}
    </div>
  )
}

export function MarketingPricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <div className="pb-16">
      <section className="relative overflow-hidden border-b border-cyan-500/10 px-4 py-14 md:py-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(34,211,238,0.12),_transparent_55%)]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
            <Sparkles className="h-4 w-4" />
            Preise
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Wählen Sie den passenden Plan für Ihre Tankstelle
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[#94a3b8] md:text-lg">
            Starten Sie 7 Tage kostenlos und digitalisieren Sie Dienstplan, Zeiterfassung, Aufgaben,
            Dokumente und Stationsorganisation.
          </p>
          <ul className="mt-8 flex flex-wrap justify-center gap-2 md:gap-3">
            {HINTS.map((h) => (
              <li
                key={h}
                className="rounded-full border border-cyan-500/25 bg-cyan-500/5 px-3 py-1.5 text-xs text-cyan-100/90 md:text-sm"
              >
                {h}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="grid gap-6 lg:grid-cols-3 lg:gap-8 lg:items-stretch">
          {PRICING_PLANS.map((plan) => (
            <PricingCard key={plan.id} plan={plan} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <SectionTitle id="faq" subtitle="Antworten auf die häufigsten Fragen zu Tarifen und Testphase.">
          Häufige Fragen
        </SectionTitle>
        <GlowCard className="mt-8 p-2 md:p-4">
          {PRICING_FAQ.map((item, i) => (
            <FaqItem
              key={item.q}
              q={item.q}
              a={item.a}
              open={openFaq === i}
              onToggle={() => setOpenFaq(openFaq === i ? null : i)}
            />
          ))}
        </GlowCard>
      </section>
    </div>
  )
}
