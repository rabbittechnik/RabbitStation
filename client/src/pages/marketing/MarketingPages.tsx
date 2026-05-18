import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-semibold text-cyan-100">{title}</h1>
      <div className="space-y-4 leading-relaxed text-[#b8c8e8]">{children}</div>
    </section>
  )
}

export function MarketingHomePage() {
  return (
    <>
      <section className="relative overflow-hidden px-4 py-20 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(34,211,238,0.12),_transparent_60%)]" />
        <div className="relative mx-auto max-w-3xl">
          <p className="mb-3 text-sm uppercase tracking-widest text-cyan-400/80">Tankstellen-SaaS</p>
          <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
            RabbitStation <span className="text-fuchsia-300">Pro</span>
          </h1>
          <p className="mt-6 text-lg text-[#a8b8d8]">
            Schichtplan, Zeiterfassung, Zuschläge, Aufgaben und Dokumente – speziell für Tankstellenbetreiber.
            Mehrere Stationen, ein Konto, saubere Mandantentrennung.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              to="/registrieren"
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-8 py-3 font-medium text-[#060b14]"
            >
              7 Tage kostenlos testen
            </Link>
            <Link
              to="/demo"
              className="rounded-xl border border-cyan-500/40 px-8 py-3 text-cyan-200 hover:bg-cyan-500/10"
            >
              Demo anfragen
            </Link>
          </div>
        </div>
      </section>
      <Section title="Für wen ist RabbitStation Pro?">
        <p>
          Für unabhängige Tankstellenbetreiber und kleine Ketten, die Schichtplanung, Zeiterfassung mit Zuschlägen,
          Feiertagslogik, Lohnprüfung, Aufgaben, Dokumente und Tablet-Betrieb in einer Lösung bündeln möchten.
        </p>
      </Section>
    </>
  )
}

export function MarketingFeaturesPage() {
  return (
    <Section title="Funktionen">
      <ul className="list-inside list-disc space-y-2">
        <li>Schichtplan mit Veröffentlichung und Konfliktprüfung</li>
        <li>Zeiterfassung, Freigaben und Zuschläge (Nacht, Sonntag, Feiertag)</li>
        <li>Aufgaben, Dokumente mit Rollen-Sichtbarkeit</li>
        <li>Mitarbeiter-App und Stations-Tablet</li>
        <li>Lohn- und Auswertungsmodule</li>
        <li>Multi-Tenant: jeder Betreiber sieht nur eigene Daten</li>
      </ul>
    </Section>
  )
}

export function MarketingPricingPage() {
  return (
    <Section title="Preise">
      <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-8">
        <h2 className="text-xl font-semibold text-white">RabbitStation Pro</h2>
        <p className="mt-2 text-[#a8b8d8]">7 Tage kostenlos testen, danach Abo aktivieren.</p>
        <p className="mt-4 text-2xl font-bold text-cyan-200">Beta: Preis auf Anfrage</p>
        <Link
          to="/registrieren"
          className="mt-6 inline-block rounded-lg bg-cyan-500 px-6 py-2 font-medium text-[#060b14]"
        >
          Jetzt registrieren
        </Link>
      </div>
    </Section>
  )
}

export function MarketingDemoPage() {
  return (
    <Section title="Demo">
      <p>
        In der Beta registrieren Sie sich mit einem Klick und testen RabbitStation Pro 7 Tage vollständig.
        Für eine geführte Demo schreiben Sie an{' '}
        <a href="mailto:demo@rabbitstation.local" className="text-cyan-300">
          demo@rabbitstation.local
        </a>
        .
      </p>
      <Link to="/registrieren" className="text-fuchsia-300 hover:underline">
        Direkt starten →
      </Link>
    </Section>
  )
}

export function MarketingLegalPage({ kind }: { kind: 'privacy' | 'imprint' | 'terms' }) {
  const titles = { privacy: 'Datenschutz', imprint: 'Impressum', terms: 'AGB' }
  return (
    <Section title={titles[kind]}>
      <p>Platzhalter für {titles[kind]} – bitte vor Vermarktung juristisch prüfen und ergänzen.</p>
      <p className="text-sm text-[#7a8aa8]">RabbitStation Pro · Demo-Betrieb · Keine Echtdaten.</p>
    </Section>
  )
}
