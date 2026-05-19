import { Link } from 'react-router-dom'
import { useAuth } from '../../context/auth-context'

export function SetupIncompleteBanner() {
  const { user } = useAuth()
  if (!user?.setupRequired || user.tenant?.setupCompleted) return null

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-50"
    >
      <span>Einrichtung noch nicht abgeschlossen — Schichtmodelle, TÜV und weitere Schritte fehlen.</span>
      <Link
        to="/setup"
        className="shrink-0 rounded-md border border-cyan-400/50 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30"
      >
        Einrichtung fortsetzen
      </Link>
    </div>
  )
}
