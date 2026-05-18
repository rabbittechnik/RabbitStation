import { Link, Outlet } from 'react-router-dom'

const nav = [
  { to: '/funktionen', label: 'Funktionen' },
  { to: '/preise', label: 'Preise' },
  { to: '/demo', label: 'Demo' },
]

export function MarketingLayout() {
  return (
    <div className="min-h-screen bg-[#060b14] text-[#e8f0ff]">
      <header className="sticky top-0 z-40 border-b border-cyan-500/20 bg-[#060b14]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="text-lg font-semibold tracking-tight text-cyan-200">
            RabbitStation <span className="text-fuchsia-300">Pro</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-[#a8b8d8] md:flex">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className="hover:text-cyan-200">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-lg px-3 py-2 text-sm text-[#a8b8d8] hover:text-white"
            >
              Anmelden
            </Link>
            <Link
              to="/registrieren"
              className="rounded-lg bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-[#060b14]"
            >
              7 Tage testen
            </Link>
          </div>
          </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="mt-16 border-t border-cyan-500/15 py-10 text-center text-sm text-[#7a8aa8]">
        <p className="mb-3">RabbitStation Pro – SaaS für Tankstellenbetreiber</p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link to="/impressum" className="hover:text-cyan-200">
            Impressum
          </Link>
          <Link to="/datenschutz" className="hover:text-cyan-200">
            Datenschutz
          </Link>
          <Link to="/agb" className="hover:text-cyan-200">
            AGB
          </Link>
          <Link to="/start" className="hover:text-cyan-200">
            App starten
          </Link>
        </div>
      </footer>
    </div>
  )
}
