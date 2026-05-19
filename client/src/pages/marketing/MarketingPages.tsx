import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export { MarketingHomePage } from './MarketingHomePage'
export { MarketingFeaturesPage } from './MarketingFeaturesPage'
export { MarketingPricingPage } from './MarketingPricingPage'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-semibold text-cyan-100">{title}</h1>
      <div className="space-y-4 leading-relaxed text-[#b8c8e8]">{children}</div>
    </section>
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
      <Link to="/registrieren?plan=pro" className="text-fuchsia-300 hover:underline">
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
