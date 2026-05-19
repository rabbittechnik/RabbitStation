import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export { MarketingHomePage } from './MarketingHomePage'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-semibold text-cyan-100">{title}</h1>
      <div className="space-y-4 leading-relaxed text-[#b8c8e8]">{children}</div>
    </section>
  )
}

export { MarketingFeaturesPage } from './MarketingFeaturesPage'

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
