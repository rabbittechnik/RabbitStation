import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  apiGet,
  clearAdminToken,
  getAdminToken,
  setAdminToken,
  API_BASE,
  DEFAULT_FETCH_TIMEOUT_MS,
  type ApiEnvelope,
} from '../services/api'
import { fetchWithTimeout } from '../lib/fetchWithTimeout'
import { loginErrorMessage } from '../lib/authErrors'

export type StationInfo = {
  id: string
  name: string
  brand?: string
  city?: string
  federalState: string
  active?: number
  /** Roh-JSON der Standardarbeitszeiten (Stationseinstellungen). */
  standardWorkTimesJson?: string
}

export type StationAccessInfo = {
  stationId: string
  role: string
  permissions: Record<string, boolean>
  active: boolean
}

export type AuthUser = {
  id: string
  username: string
  displayName: string
  email?: string
  phone?: string
  /** Optional, falls später aus dem Backend geliefert */
  firstName?: string
  /** Optionaler alternativer vollständiger Name */
  name?: string
  roleId: string
  /** z. B. chief_admin, station_team_lead */
  roleKey?: string
  /** Anzeige z. B. „Chef / Administrator“ */
  roleLabel?: string
  globalAdmin?: boolean
  stations?: StationInfo[]
  stationAccess?: StationAccessInfo[]
  canSwitchStation?: boolean
  tenantId?: string
  platformRole?: string
  setupRequired?: boolean
  setupCompleted?: boolean
  onboardingTourCompleted?: boolean
  subscription?: {
    canWrite: boolean
    status: string
    trialDaysLeft: number | null
    message: string | null
  }
  tenant?: {
    companyName: string
    subscriptionStatus: string
    trialDaysLeft: number | null
    setupCompleted: boolean
    onboardingTourCompleted?: boolean
  }
}

type AuthContextValue = {
  token: string | null
  user: AuthUser | null
  loading: boolean
  authError: string | null
  login: (username: string, password: string, rememberMe: boolean) => Promise<void>
  logout: () => void
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function logStartup(label: string, ms: number) {
  if (import.meta.env.DEV || ms >= 800) {
    console.info(`[startup] ${label} ${ms}ms`)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getAdminToken())
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  const refreshMe = useCallback(async () => {
    const t0 = performance.now()
    setAuthError(null)
    const t = getAdminToken()
    setToken(t)
    if (!t) {
      setUser(null)
      setLoading(false)
      logStartup('auth (no token)', performance.now() - t0)
      return
    }
    try {
      const res = await apiGet<AuthUser>('/auth/me', undefined, { timeoutMs: DEFAULT_FETCH_TIMEOUT_MS })
      if (res.ok) {
        setUser(res.data)
      } else {
        setUser(null)
        clearAdminToken()
        setToken(null)
        setAuthError(res.error)
      }
    } catch (e) {
      setUser(null)
      clearAdminToken()
      setToken(null)
      setAuthError(e instanceof Error ? e.message : 'Sitzung konnte nicht geladen werden.')
    } finally {
      setLoading(false)
      logStartup('GET /auth/me', performance.now() - t0)
    }
  }, [])

  useEffect(() => {
    void refreshMe()
  }, [refreshMe])

  const login = useCallback(async (username: string, password: string, rememberMe: boolean) => {
    let res: Response
    try {
      res = await fetchWithTimeout(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username, password, rememberMe }),
        timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
      })
    } catch (e) {
      console.error('[auth] login network error', e)
      throw new Error(loginErrorMessage(e))
    }

    let json: ApiEnvelope<{ token: string; user: AuthUser }>
    try {
      const text = await res.text()
      json = JSON.parse(text) as ApiEnvelope<{ token: string; user: AuthUser }>
    } catch (e) {
      console.error('[auth] login invalid response', res.status, e)
      throw new Error(loginErrorMessage(e, res))
    }

    if (!res.ok || !json.ok) {
      const msg =
        res.status === 401 || res.status === 403
          ? loginErrorMessage(null, res)
          : (!json.ok ? json.error : loginErrorMessage(null, res))
      if (!res.ok) console.warn('[auth] login failed', res.status, msg)
      throw new Error(msg || loginErrorMessage(null, res))
    }
    setAdminToken(json.data.token, rememberMe)
    setToken(json.data.token)
    setUser(json.data.user)
    setAuthError(null)
  }, [])

  const logout = useCallback(() => {
    clearAdminToken()
    setToken(null)
    setUser(null)
    setAuthError(null)
  }, [])

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      authError,
      login,
      logout,
      refreshMe,
    }),
    [token, user, loading, authError, login, logout, refreshMe],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
