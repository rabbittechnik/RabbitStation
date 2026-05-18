import { Link } from 'react-router-dom'
import { useAuth } from '../../context/auth-context'

export function TrialBanner() {
  const { user } = useAuth()
  const sub = (user as { subscription?: { message?: string; canWrite?: boolean; status?: string } } | null)
    ?.subscription
  if (!sub?.message) return null
  const expired = sub.canWrite === false
  return (
    <div
      className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
        expired ?
          'border-amber-500/50 bg-amber-500/10 text-amber-100'
        : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100'
      }`}
      role="status"
    >
      <p>{sub.message}</p>
      {expired ?
        <Link to="/preise" className="mt-2 inline-block font-medium text-fuchsia-300 hover:underline">
          Abo wählen →
        </Link>
      : null}
    </div>
  )
}
