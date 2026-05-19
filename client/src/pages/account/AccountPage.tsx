import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlanUpgrade } from '../../context/plan-upgrade-context'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useAuth } from '../../context/auth-context'
import { apiSend } from '../../services/api'
import {
  groupActivePermissions,
  roleDisplayLabel,
  summarizePermissionProfile,
} from '../../lib/permissionLabels'
import { formatApiError } from '../../lib/apiErrors'

function subscriptionStatusLabel(status?: string): string {
  const s = (status ?? '').toLowerCase()
  if (s === 'trialing' || s === 'trial') return 'Testphase'
  if (s === 'active') return 'Aktiv'
  if (s === 'past_due') return 'Zahlung ausstehend'
  if (s === 'canceled' || s === 'cancelled') return 'Beendet'
  if (s === 'expired') return 'Abgelaufen'
  return status || '—'
}

export function AccountPage() {
  const { user, refreshMe } = useAuth()
  const { openPlanUpgrade, currentPlanId } = usePlanUpgrade()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [permDetailsOpen, setPermDetailsOpen] = useState(false)

  const showDebugPermissions =
    import.meta.env.DEV ||
    user?.platformRole === 'saas_owner' ||
    user?.roleKey === 'saas_owner'

  useEffect(() => {
    setDisplayName(user?.displayName ?? '')
    setEmail(user?.email ?? '')
    setPhone(user?.phone ?? '')
  }, [user])

  const stationAccessRows = useMemo(() => {
    const stations = user?.stations ?? []
    const access = user?.stationAccess ?? []
    return access.map((a) => {
      const station = stations.find((s) => s.id === a.stationId)
      return {
        stationId: a.stationId,
        stationName: station?.name ?? a.stationId,
        role: a.role,
        active: a.active,
        profile: summarizePermissionProfile({
          role: a.role,
          globalAdmin: user?.globalAdmin,
          permissions: a.permissions,
        }),
        groups: groupActivePermissions(a.permissions),
      }
    })
  }, [user])

  const planName = user?.planEntitlements?.planName ?? user?.tenant?.plan ?? '—'
  const subStatus = subscriptionStatusLabel(
    user?.subscription?.status ?? user?.tenant?.subscriptionStatus,
  )
  const trialDays =
    user?.subscription?.trialDaysLeft ?? user?.tenant?.trialDaysLeft ?? null

  const save = async () => {
    setLoading(true)
    setErr(null)
    setMsg(null)
    const res = await apiSend<typeof user>('PUT', '/auth/me', {
      displayName,
      email: email.trim() || null,
      phone: phone.trim() || null,
      ...(newPassword.trim() ? { currentPassword, newPassword: newPassword.trim() } : {}),
    })
    if (!res.ok) setErr(formatApiError(res))
    else {
      setMsg('Profil gespeichert.')
      setCurrentPassword('')
      setNewPassword('')
      await refreshMe()
    }
    setLoading(false)
  }

  if (!user) {
    return (
      <div className="p-6">
        <p className="text-sm text-[var(--text-muted)]">Bitte anmelden.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6 pb-16">
      <PageHeader title="Mein Konto · Profil" description="Eigene Kontaktdaten und Passwort" />
      {err ? <p className="text-sm text-red-200/90">{err}</p> : null}
      {msg ? <p className="text-sm text-emerald-200/90">{msg}</p> : null}

      <Card padding="md" className="border-[var(--border-subtle)] space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text-main)]">Ihr Paket</h3>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--text-muted)]">Aktueller Plan</dt>
            <dd className="font-medium text-[var(--text-main)]">{planName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--text-muted)]">Status</dt>
            <dd className="text-[var(--text-main)]">{subStatus}</dd>
          </div>
          {trialDays != null && trialDays > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--text-muted)]">Testphase</dt>
              <dd className="text-cyan-200">noch {trialDays} Tage</dd>
            </div>
          ) : null}
        </dl>
        {currentPlanId === 'pro' || currentPlanId === 'multi_station' ?
          <Link
            to="/preise"
            className="inline-flex rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20"
          >
            Paket ansehen
          </Link>
        : <button
            type="button"
            onClick={() => openPlanUpgrade('pro')}
            className="inline-flex rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20"
          >
            Pro 7 Tage testen
          </button>
        }
      </Card>

      <Card padding="md" className="border-[var(--border-subtle)] space-y-3">
        <label className="block text-xs text-[var(--text-faint)]">
          Anzeigename
          <input className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label className="block text-xs text-[var(--text-faint)]">
          E-Mail
          <input className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block text-xs text-[var(--text-faint)]">
          Telefon (optional)
          <input className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <p className="text-xs text-[var(--text-muted)]">
          Rolle: {user.roleLabel ?? user.roleKey ?? '—'} {user.globalAdmin ? '· Global-Admin' : ''}
        </p>
        <div className="border-t border-white/10 pt-3">
          <p className="text-xs font-semibold text-[var(--text-main)]">Passwort ändern (optional)</p>
          <input
            type="password"
            placeholder="Aktuelles Passwort"
            className="mt-2 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <input
            type="password"
            placeholder="Neues Passwort"
            className="mt-2 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <Button type="button" onClick={() => void save()} disabled={loading}>
          Profil speichern
        </Button>
      </Card>

      <Card padding="md" className="border-[var(--border-subtle)]">
        <h3 className="text-sm font-semibold text-[var(--text-main)]">Stationen & Berechtigungen</h3>
        <ul className="mt-3 space-y-4">
          {stationAccessRows.map((row) => (
            <li key={row.stationId} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
              <p className="text-sm font-medium text-[var(--text-main)]">Station: {row.stationName}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Rolle: {roleDisplayLabel(row.role, user.roleLabel)}
              </p>
              <p className="text-xs text-[var(--text-muted)]">Berechtigungsprofil: {row.profile}</p>
              <p className="text-xs text-[var(--text-muted)]">Status: {row.active ? 'aktiv' : 'inaktiv'}</p>
            </li>
          ))}
        </ul>
        {stationAccessRows.length > 0 ? (
          <div className="mt-3">
            <button
              type="button"
              className="text-xs font-medium text-cyan-300 hover:underline"
              onClick={() => setPermDetailsOpen((v) => !v)}
            >
              {permDetailsOpen ? 'Details ausblenden' : 'Details anzeigen'}
            </button>
            {permDetailsOpen ? (
              <ul className="mt-2 space-y-3 text-xs text-[var(--text-muted)]">
                {stationAccessRows.map((row) => (
                  <li key={`${row.stationId}-detail`}>
                    <p className="font-medium text-[var(--text-main)]">{row.stationName}</p>
                    <ul className="mt-1 list-inside list-disc">
                      {row.groups.map((g) => (
                        <li key={g.id}>{g.label}</li>
                      ))}
                    </ul>
                    {showDebugPermissions ? (
                      <p className="mt-1 font-mono text-[10px] text-[var(--text-faint)]">
                        Debug:{' '}
                        {Object.entries(
                          user.stationAccess?.find((a) => a.stationId === row.stationId)?.permissions ??
                            {},
                        )
                          .filter(([, v]) => v)
                          .map(([k]) => k)
                          .join(', ')}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-xs text-[var(--text-muted)]">Keine Stationszuweisungen.</p>
        )}
      </Card>
    </div>
  )
}

