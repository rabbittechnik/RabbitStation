import { useCallback, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Rocket, Sparkles } from 'lucide-react'
import { WelcomeDialog } from './components/WelcomeDialog'
import {
  MarketingDashboardShowcase,
  MarketingSolutionShowcase,
} from './components/MarketingProductShowcase'
import {
  CHALLENGES,
  SECURITY_POINTS,
  SOLUTION_MODULES,
  TEAM_CARDS,
} from './landingData'

function SectionTitle({ children, id }: { children: string; id?: string }) {
  return (
    <h2
      id={id}
      className="text-center text-2xl font-bold tracking-tight text-white md:text-3xl"
    >
      {children}
    </h2>
  )
}

function GlowCard({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl border border-cyan-500/25 bg-[#0a1424]/90 p-6 shadow-[0_0_40px_rgba(34,211,238,0.06)] backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  )
}

function PrimaryCta({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-500 px-8 py-3.5 text-base font-semibold text-[#03121f] shadow-[0_0_32px_rgba(34,211,238,0.35)] transition hover:brightness-110"
    >
      {children}
    </Link>
  )
}

function SecondaryCta({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center justify-center rounded-xl border border-cyan-500/45 bg-cyan-500/5 px-8 py-3.5 text-base font-medium text-cyan-100 transition hover:bg-cyan-500/15"
    >
      {children}
    </Link>
  )
}

export function MarketingHomePage() {
  const infoRef = useRef<HTMLElement>(null)

  const scrollToInfo = useCallback(() => {
    infoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
  <>
      <WelcomeDialog onLearnMore={scrollToInfo} />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-cyan-500/10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(34,211,238,0.14),_transparent_55%)]" />
        <div className="pointer-events-none absolute -right-32 top-20 h-96 w-96 rounded-full bg-fuchsia-600/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">
              Tankstellen-SaaS
            </p>
            <h1 className="text-4xl font-bold leading-tight text-white md:text-5xl lg:text-6xl">
              RabbitStation <span className="text-cyan-300">Pro</span>
            </h1>
            <p className="mt-4 text-xl font-medium text-cyan-100/90">Mehr Überblick. Weniger Aufwand.</p>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-[#94a3b8]">
              Alle wichtigen Abläufe deiner Tankstelle – gebündelt in einer digitalen Plattform.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <PrimaryCta to="/registrieren">
                <Rocket className="h-5 w-5" />
                7 Tage kostenlos testen
              </PrimaryCta>
              <SecondaryCta to="/demo">Demo anfragen</SecondaryCta>
            </div>
            <p className="mt-6 text-sm leading-relaxed text-[#64748b]">
              Schichtplan, Zeiterfassung, Aufgaben, Dokumente, Mitarbeiter-App und Stationstablet – alles in einer
              Lösung.
            </p>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute -inset-1 rounded-3xl bg-cyan-500/8" aria-hidden />
            <MarketingDashboardShowcase className="relative w-full" />
          </div>
        </div>
      </section>

      {/* Problem */}
      <section id="info" ref={infoRef} className="scroll-mt-20 border-b border-cyan-500/10 bg-[#07111f]/50 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <SectionTitle>Die typischen Herausforderungen im Tankstellenalltag</SectionTitle>
          <p className="mx-auto mt-4 max-w-2xl text-center text-[#94a3b8]">
            Viele Betriebe kämpfen noch mit verstreuten Tools und manuellen Prozessen – RabbitStation Pro bündelt das
            zentral.
          </p>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {CHALLENGES.map(({ icon: Icon, text }) => (
              <GlowCard key={text} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/30">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="text-sm leading-relaxed text-[#cbd5e1]">{text}</p>
              </GlowCard>
            ))}
          </div>
        </div>
      </section>

      {/* Solution */}
      <section className="border-b border-cyan-500/10 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <SectionTitle>Die Lösung mit RabbitStation Pro</SectionTitle>
          <p className="mx-auto mt-4 max-w-2xl text-center text-[#94a3b8]">
            Keine allgemeine Bürosoftware – sondern speziell für den echten Tankstellenalltag entwickelt.
          </p>
          <div className="mt-10">
            <MarketingSolutionShowcase />
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SOLUTION_MODULES.map(({ icon: Icon, title, text }, i) => (
              <GlowCard key={title} className="relative overflow-hidden">
                <span className="absolute right-4 top-4 text-3xl font-bold text-cyan-500/20">{i + 1}</span>
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-fuchsia-500/10 text-cyan-300 ring-1 ring-cyan-400/25">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#94a3b8]">{text}</p>
              </GlowCard>
            ))}
          </div>
        </div>
      </section>

      {/* Teams: App + Tablet */}
      <section className="border-b border-cyan-500/10 bg-[#07111f]/50 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <SectionTitle>Für Betreiber, Stationsleiter und Teams</SectionTitle>
          <div className="mt-12 grid gap-8 lg:grid-cols-2">
            {TEAM_CARDS.map((card) => (
              <GlowCard key={card.title} className="flex flex-col p-0 overflow-hidden">
                <img
                  src={card.image}
                  alt={card.imageAlt}
                  className="h-48 w-full object-cover object-top border-b border-cyan-500/20 md:h-56"
                  loading="lazy"
                />
                <div className="p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
                      <card.icon className="h-6 w-6" />
                    </span>
                    <h3 className="text-xl font-semibold text-white">{card.title}</h3>
                  </div>
                  <ul className="space-y-2">
                    {card.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm text-[#cbd5e1]">
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </GlowCard>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="border-b border-cyan-500/10 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <SectionTitle>Sicher als SaaS-Lösung</SectionTitle>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {SECURITY_POINTS.map(({ icon: Icon, title, text }) => (
              <GlowCard key={title} className="text-center md:text-left">
                <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/30 md:mx-0">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#94a3b8]">{text}</p>
              </GlowCard>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section id="demo-cta" className="py-16 md:py-24">
        <div className="mx-auto max-w-4xl px-4">
          <div className="relative overflow-hidden rounded-3xl border border-cyan-400/40 bg-gradient-to-br from-[#0a1a2e] to-[#07111f] p-8 text-center shadow-[0_0_60px_rgba(34,211,238,0.12)] md:p-12">
            <div className="pointer-events-none absolute -left-20 -top-20 h-40 w-40 rounded-full bg-cyan-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -right-20 h-40 w-40 rounded-full bg-fuchsia-500/15 blur-3xl" />
            <div className="relative">
              <Rocket className="mx-auto mb-4 h-10 w-10 text-cyan-300" />
              <h2 className="text-2xl font-bold text-white md:text-3xl">
                Jetzt anfragen oder{' '}
                <span className="text-cyan-300">7 Tage kostenlos testen</span>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[#94a3b8]">
                Überzeugende Funktionen. Einfach starten. Sofort mehr Überblick im Stationsalltag.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-4">
                <PrimaryCta to="/registrieren">7 Tage kostenlos testen</PrimaryCta>
                <SecondaryCta to="/demo">Demo anfragen</SecondaryCta>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
