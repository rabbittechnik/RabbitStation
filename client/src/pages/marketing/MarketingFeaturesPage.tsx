import { Check, Rocket } from 'lucide-react'
import {
  AUDIENCE_ITEMS,
  BENEFITS,
  FEATURE_HERO_BADGES,
  FEATURE_MODULES,
  START_STEPS,
  WHY_STATION_CARDS,
} from './featuresData'
import {
  GhostCta,
  GlowCard,
  PrimaryCta,
  SecondaryCta,
  SectionTitle,
} from './components/marketingUi'

function FeatureModuleCard({
  icon: Icon,
  title,
  text,
  bullets,
  note,
  index,
}: (typeof FEATURE_MODULES)[0] & { index: number }) {
  return (
    <GlowCard className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-fuchsia-500/10 text-cyan-300 ring-1 ring-cyan-400/25">
          <Icon className="h-6 w-6" />
        </span>
        <span className="text-2xl font-bold text-cyan-500/25">{index + 1}</span>
      </div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-[#94a3b8]">{text}</p>
      <ul className="mt-4 space-y-1.5 border-t border-cyan-500/15 pt-4">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm text-[#cbd5e1]">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" strokeWidth={3} />
            {b}
          </li>
        ))}
      </ul>
      {note ? (
        <p className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100/90">
          {note}
        </p>
      ) : null}
    </GlowCard>
  )
}

export function MarketingFeaturesPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-cyan-500/10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(34,211,238,0.14),_transparent_55%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 text-center md:py-24">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">
            Funktionen · RabbitStation Pro
          </p>
          <h1 className="text-3xl font-bold leading-tight text-white md:text-5xl">
            Alle Funktionen für den{' '}
            <span className="text-cyan-300">digitalen Stationsalltag</span>
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-[#94a3b8]">
            RabbitStation Pro bündelt Dienstplan, Zeiterfassung, Aufgaben, Dokumente, Mitarbeiter-App,
            Stationstablet und Auswertungen in einer modernen Plattform für Tankstellenbetreiber.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <PrimaryCta to="/registrieren">7 Tage kostenlos testen</PrimaryCta>
            <SecondaryCta to="/demo">Demo ansehen</SecondaryCta>
            <GhostCta to="/start">App starten</GhostCta>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {FEATURE_HERO_BADGES.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-100"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Module cards */}
      <section id="module" className="scroll-mt-20 border-b border-cyan-500/10 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <SectionTitle
            subtitle="Vom Dienstplan bis zur Auswertung – alle Module sind auf den Tankstellenalltag abgestimmt."
          >
            Alle Module im Überblick
          </SectionTitle>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_MODULES.map((mod, i) => (
              <FeatureModuleCard key={mod.title} {...mod} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* Why tankstellen */}
      <section className="border-b border-cyan-500/10 bg-[#07111f]/50 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <SectionTitle
            subtitle="Tankstellen haben andere Abläufe als normale Büros. Frühschichten, Spätschichten, Wochenenden, Feiertage, Aushilfen, Zeiterfassung, TÜV-Berichte, Aufgaben im Shop, Kontakte zu Vertretern und Dokumentationspflichten gehören zum Alltag. RabbitStation Pro bündelt genau diese Abläufe in einer Plattform."
          >
            Warum RabbitStation Pro speziell für Tankstellen entwickelt wurde
          </SectionTitle>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {WHY_STATION_CARDS.map(({ icon: Icon, title, text }) => (
              <GlowCard key={title} className="p-5 text-center md:text-left">
                <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/30 md:mx-0">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#94a3b8]">{text}</p>
              </GlowCard>
            ))}
          </div>
        </div>
      </section>

      {/* Audience */}
      <section className="border-b border-cyan-500/10 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <SectionTitle subtitle="Ob eine Station oder mehrere Standorte – RabbitStation Pro wächst mit Ihrem Betrieb.">
            Für wen ist RabbitStation Pro geeignet?
          </SectionTitle>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {AUDIENCE_ITEMS.map((item) => (
              <span
                key={item}
                className="rounded-xl border border-cyan-500/25 bg-[#0a1424] px-4 py-2.5 text-sm text-[#e2e8f0] shadow-[0_0_20px_rgba(34,211,238,0.05)]"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="border-b border-cyan-500/10 bg-[#07111f]/50 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <SectionTitle>Ihre Vorteile auf einen Blick</SectionTitle>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {BENEFITS.map(({ icon: Icon, text }) => (
              <GlowCard key={text} className="flex items-start gap-3 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
                  <Icon className="h-4 w-4" />
                </span>
                <p className="text-sm font-medium leading-snug text-[#e2e8f0]">{text}</p>
              </GlowCard>
            ))}
          </div>
        </div>
      </section>

      {/* Start steps */}
      <section className="border-b border-cyan-500/10 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <SectionTitle subtitle="In wenigen Minuten von der Registrierung zum digitalen Stationsalltag.">
            So einfach starten Sie
          </SectionTitle>
          <div className="mt-12 grid gap-5 md:grid-cols-5">
            {START_STEPS.map((s) => (
              <GlowCard key={s.step} className="relative p-5">
                <span className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500 text-sm font-bold text-[#03121f]">
                  {s.step}
                </span>
                <h3 className="font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#94a3b8]">{s.text}</p>
              </GlowCard>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-4xl px-4">
          <div className="relative overflow-hidden rounded-3xl border border-cyan-400/40 bg-gradient-to-br from-[#0a1a2e] to-[#07111f] p-8 text-center shadow-[0_0_60px_rgba(34,211,238,0.12)] md:p-12">
            <div className="pointer-events-none absolute -left-20 -top-20 h-40 w-40 rounded-full bg-cyan-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -right-20 h-40 w-40 rounded-full bg-fuchsia-500/15 blur-3xl" />
            <div className="relative">
              <Rocket className="mx-auto mb-4 h-10 w-10 text-cyan-300" />
              <h2 className="text-2xl font-bold text-white md:text-3xl">
                Bereit für weniger Chaos im Stationsalltag?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[#94a3b8]">
                Testen Sie RabbitStation Pro 7 Tage kostenlos und richten Sie Ihre Station in wenigen
                Minuten ein.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-4">
                <PrimaryCta to="/registrieren">Jetzt kostenlos testen</PrimaryCta>
                <SecondaryCta to="/demo">Demo ansehen</SecondaryCta>
                <GhostCta to="/login">Anmelden</GhostCta>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
