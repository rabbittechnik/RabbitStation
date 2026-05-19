import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/auth-context'

const DEFER_KEY = 'rabbitstation_setup_deferred'

const ALLOWED_PREFIXES = ['/setup', '/logout', '/account']

export function isSetupDeferred(): boolean {
  try {
    return sessionStorage.getItem(DEFER_KEY) === '1'
  } catch {
    return false
  }
}

export function setSetupDeferred(deferred: boolean) {
  try {
    if (deferred) sessionStorage.setItem(DEFER_KEY, '1')
    else sessionStorage.removeItem(DEFER_KEY)
  } catch {
    /* ignore */
  }
}

export function RequireSetup({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const loc = useLocation()
  const path = loc.pathname

  const allowed = ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
  const needsSetup = Boolean(user?.setupRequired && !user?.tenant?.setupCompleted && !isSetupDeferred())

  if (needsSetup && !allowed) {
    return <Navigate to="/setup" replace state={{ from: path }} />
  }

  return <>{children}</>
}
