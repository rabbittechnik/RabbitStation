import { useCallback, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useStation } from '../../context/station-context'
import { useEmployees } from '../../context/employees-context'
import { apiGet, apiSend } from '../../services/api'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { StationTabletsPanel } from './StationTabletsPanel'
import { PwaInstallPanel } from '../../components/pwa/PwaInstallPanel'
import { PlanFeatureGate } from '../../components/plan/PlanFeatureGate'

type DeviceRow = {
  id: string
  deviceLabel: string | null
  platform: string | null
  firstSeenAt: string | null
  lastSeenAt: string | null
  isActive: boolean
  lastIp?: string | null
}

type OverviewRow = {
  employeeId: string
  employeeName: string
  stationId: string
  stationName: string
  accessEnabled: boolean
  hasToken: boolean
  tokenTail: string | null
  tokenCreatedAt: string | null
  lastUsedAt: string | null
  activeDeviceCount: number
  lastDeviceLabel: string | null
  lastDeviceSeenAt: string | null
  devices: DeviceRow[]
}

function formatDeDt(iso?: string | null): string {
  if (!iso?.trim()) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const day = String(d.getDate()).padStart(2, '0')
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const y = d.getFullYear()
  const h = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${day}.${mo}.${y}, ${h}:${mi} Uhr`
}

function appAccessLabel(r: OverviewRow): string {
  if (!r.hasToken) return 'Kein Zugang eingerichtet'
  if (!r.accessEnabled) return 'Deaktiviert'
  return 'Aktiv'
}

export function DevicesPage() {
  const { stationId, hasPermission } = useStation()
  const {
    refetch,
    regenerateEmployeeAccess,
    disableEmployeeAccess,
    enableEmployeeAccess,
    revokeAllEmployeeAppDevices,
  } = useEmployees()

  const canViewEmployeeApps =
    hasPermission('employees.viewAppAccess') ||
    hasPermission('employees.viewDevices') ||
    hasPermission('employees.qr')
  const canMutateEmployeeApps =
    hasPermission('employees.revokeDevices') ||
    hasPermission('employees.manageAppAccess') ||
    hasPermission('employees.qr')

  /** Sichtbarkeit wie API: stationTablets.* oder bestehende Mitarbeiter-App-/Schichtrechte. */
  const canViewStationTablets =
    hasPermission('stationTablets.view') ||
    hasPermission('stationTablets.manage') ||
    hasPermission('employees.viewAppAccess') ||
    hasPermission('employees.manageAppAccess') ||
    hasPermission('employees.viewDevices') ||
    hasPermission('employees.qr') ||
    hasPermission('schedule.edit')

  const canManageStationTablets =
    hasPermission('stationTablets.manage') ||
    hasPermission('employees.manageAppAccess') ||
    hasPermission('employees.revokeDevices') ||
    hasPermission('employees.qr') ||
    hasPermission('schedule.edit')

  const canView = canViewEmployeeApps || canViewStationTablets

  const [rows, setRows] = useState<OverviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'disabled' | 'none' | 'used'>('all')
  const [detail, setDetail] = useState<OverviewRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmRegen, setConfirmRegen] = useState<OverviewRow | null>(null)
  const [confirmRevokeAll, setConfirmRevokeAll] = useState<OverviewRow | null>(null)

  const load = useCallback(async () => {
    if (!stationId || !canViewEmployeeApps) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setErr(null)
    const res = await apiGet<OverviewRow[]>('/employee-app/devices', { stationId })
    if (res.ok && Array.isArray(res.data)) setRows(res.data)
    else setErr(res.ok === false ? res.error : 'Daten konnten nicht geladen werden.')
    setLoading(false)
  }, [stationId, canViewEmployeeApps])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setDetail((prev) => {
      if (!prev) return null
      return rows.find((x) => x.employeeId === prev.employeeId) ?? prev
    })
  }, [rows])

  const filtered = useMemo(() => {
    let list = rows
    if (filter === 'active') list = list.filter((r) => r.accessEnabled)
    if (filter === 'disabled') list = list.filter((r) => r.hasToken && !r.accessEnabled)
    if (filter === 'none') list = list.filter((r) => !r.hasToken)
    if (filter === 'used') list = list.filter((r) => Boolean(r.lastUsedAt?.trim()) || r.activeDeviceCount > 0)
    return list
  }, [rows, filter])

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id)
    setErr(null)
    try {
      await fn()
      await load()
      await refetch()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Aktion fehlgeschlagen')
    } finally {
      setBusyId(null)
    }
  }

  const revokeDevice = async (deviceRowId: string) => {
    setBusyId(deviceRowId)
    setErr(null)
    try {
      const res = await apiSend('POST', `/employee-app/devices/${encodeURIComponent(deviceRowId)}/revoke`, {})
      if (!res.ok) throw new Error(res.error)
      await load()
      await refetch()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gerät konnte nicht deaktiviert werden')
    } finally {
      setBusyId(null)
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader title="Geräte & Apps" description="Mitarbeiter-App und Stations-Tablet" />
        <p className="text-sm text-[var(--text-muted)]">
          Sie haben keine Berechtigung für diesen Bereich. Üblicherweise sind z. B. Mitarbeiter-App-Zugänge (
          <span className="text-cyan-200/85">employees.viewAppAccess</span>) oder Schichtplan bearbeiten (
          <span className="text-cyan-200/85">schedule.edit</span>) nötig — oder explizite Rechte für Stations-Tablets.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Geräte & Apps"
        description="Persönliche Mitarbeiter-App (Handy mit QR je Person) · Stations-Tablet (ein QR pro Gerät an der Tankstelle)"
      />

      <PwaInstallPanel />

      {canViewEmployeeApps ? (
      <section className="space-y-3" aria-labelledby="devices-employee-app-heading">
        <h2 id="devices-employee-app-heading" className="text-base font-semibold text-[var(--text-main)]">
          Mitarbeiter-App Zugänge
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Übersicht aller Mitarbeiter der gewählten Station. Token werden nicht vollständig angezeigt. Die Mitarbeiter-App
          ist vom Stations-Tablet getrennt: ein persönlicher Zugang fürs Handy, eigene Aufgaben, Urlaub und Stempeln mit
          Mitarbeitenden-Profil — nicht dasselbe wie das Stations-Tablet ohne persönlichen Login.
        </p>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', 'Alle'],
              ['active', 'Aktiv'],
              ['disabled', 'Deaktiviert'],
              ['none', 'Ohne Zugang'],
              ['used', 'Zuletzt genutzt'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                filter === k
                  ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100'
                  : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {err ? (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</p>
        ) : null}

        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Lade…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Keine Einträge für diesen Filter.</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)]">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Mitarbeiter</th>
                  <th className="px-3 py-2 font-medium">Station</th>
                  <th className="px-3 py-2 font-medium">App-Zugang</th>
                  <th className="px-3 py-2 font-medium">Token</th>
                  <th className="px-3 py-2 font-medium">Geräte</th>
                  <th className="px-3 py-2 font-medium">Zuletzt genutzt</th>
                  <th className="px-3 py-2 font-medium">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.employeeId} className="border-b border-[var(--border-subtle)]/80 hover:bg-white/[0.03]">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left font-medium text-cyan-100/95 hover:underline"
                        onClick={() => setDetail(r)}
                      >
                        {r.employeeName}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{r.stationName}</td>
                    <td className="px-3 py-2">
                      <span className={r.accessEnabled ? 'text-emerald-300' : 'text-amber-200'}>{appAccessLabel(r)}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                      {r.hasToken ? <span>{r.tokenTail ?? '****'}</span> : <span>Nein</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.activeDeviceCount > 0 ? (
                        <span className="text-emerald-200/90">{r.activeDeviceCount} aktiv</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">0 aktiv</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                      {r.lastUsedAt ? formatDeDt(r.lastUsedAt) : 'Noch nie genutzt'}
                    </td>
                    <td className="px-3 py-2">
                      {canMutateEmployeeApps ? (
                        <div className="flex flex-wrap gap-1">
                          {r.accessEnabled ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="text-[10px] px-2 py-1"
                              disabled={busyId === r.employeeId}
                              onClick={() => void run(r.employeeId, () => disableEmployeeAccess(r.employeeId))}
                            >
                              Zugang deaktivieren
                            </Button>
                          ) : r.hasToken ? (
                            <Button
                              type="button"
                              variant="primary"
                              className="text-[10px] px-2 py-1"
                              disabled={busyId === r.employeeId}
                              onClick={() => void run(r.employeeId, () => enableEmployeeAccess(r.employeeId))}
                            >
                              Zugang aktivieren
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="primary"
                              className="text-[10px] px-2 py-1"
                              disabled={busyId === r.employeeId}
                              onClick={() => void run(r.employeeId, async () => {
                                await regenerateEmployeeAccess(r.employeeId)
                              })}
                            >
                              QR erstellen
                            </Button>
                          )}
                          {r.hasToken ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                className="text-[10px] px-2 py-1"
                                disabled={busyId === r.employeeId}
                                onClick={() => setConfirmRegen(r)}
                              >
                                QR neu
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="text-[10px] px-2 py-1"
                                disabled={busyId === r.employeeId}
                                onClick={() => setConfirmRevokeAll(r)}
                              >
                                Geräte zurücksetzen
                              </Button>
                            </>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-[10px] text-[var(--text-faint)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : null}

      {canViewStationTablets ? (
        <PlanFeatureGate feature="station_tablet">
          <div className="border-t border-[var(--border-subtle)] pt-8 mt-8 space-y-4">
            <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/80 p-4 text-sm text-[var(--text-muted)]">
              <h3 className="text-base font-semibold text-[var(--text-main)]">Dynamische Wochenend-Aufgaben</h3>
              <p className="mt-2">
                Vorbereitet für spätere Konfiguration pro Station. Aktuell (Standard): Zusatzaufgaben für Samstag/Sonntag
                werden nach Veröffentlichen des Schichtplans erzeugt; pro Wochenend-Schicht zwei dynamische Aufgaben plus
                die Pflichten „Außenbereich kontrollieren“ und „Mülleimer kontrollieren“; „Fenster putzen“ höchstens drei
                automatische Zuweisungen pro Kalenderjahr (gesteuert über erledigte Einträge).
              </p>
            </section>
            <StationTabletsPanel canView={canViewStationTablets} canManage={canManageStationTablets} />
          </div>
        </PlanFeatureGate>
      ) : null}

      {detail ? (
        <div className="fixed inset-0 z-[90] flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Schließen"
            onClick={() => setDetail(null)}
          />
          <div className="relative flex h-full w-full max-w-lg flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-[-12px_0_40px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-[var(--text-main)]">{detail.employeeName}</h2>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{detail.stationName}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded p-1 text-[var(--text-muted)] hover:bg-white/10"
                aria-label="Schließen"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
              <dl className="space-y-2 text-[var(--text-muted)]">
                <div className="flex justify-between gap-2">
                  <dt>App-Zugang</dt>
                  <dd className={detail.accessEnabled ? 'text-emerald-300' : 'text-amber-200'}>{appAccessLabel(detail)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Token (maskiert)</dt>
                  <dd>{detail.hasToken ? detail.tokenTail ?? '****' : '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Erstellt am</dt>
                  <dd>{detail.tokenCreatedAt ? formatDeDt(detail.tokenCreatedAt) : '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Zuletzt genutzt</dt>
                  <dd>{detail.lastUsedAt ? formatDeDt(detail.lastUsedAt) : 'Noch nie genutzt'}</dd>
                </div>
              </dl>

              <div>
                <h3 className="text-sm font-semibold text-[var(--text-main)]">Geräte</h3>
                {detail.devices.length === 0 ? (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    {detail.hasToken && detail.accessEnabled
                      ? 'Noch keine verbundenen Geräte — Zugang erstellt, aber noch nicht verwendet.'
                      : 'Noch keine verbundenen Geräte.'}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {detail.devices.map((d) => (
                      <li
                        key={d.id}
                        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-3 py-2 text-xs"
                      >
                        <p className="font-medium text-[var(--text-main)]">{d.deviceLabel ?? 'Gerät'}</p>
                        <p className="text-[var(--text-muted)]">{d.platform ?? '—'}</p>
                        <p className="mt-1 text-[var(--text-faint)]">
                          Erstmals: {d.firstSeenAt ? formatDeDt(d.firstSeenAt) : '—'} · Zuletzt:{' '}
                          {d.lastSeenAt ? formatDeDt(d.lastSeenAt) : '—'}
                        </p>
                        <p className={d.isActive ? 'text-emerald-300' : 'text-amber-200'}>
                          {d.isActive ? 'Aktiv' : 'Deaktiviert'}
                        </p>
                        {d.lastIp ? <p className="text-[10px] text-slate-500">IP: {d.lastIp}</p> : null}
                        {canMutateEmployeeApps && d.isActive ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="mt-2 text-[10px]"
                            disabled={busyId === d.id}
                            onClick={() => void revokeDevice(d.id)}
                          >
                            Gerät deaktivieren
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmRegen)}
        title="QR-Code neu generieren?"
        message="Der alte QR-Code und bereits verbundene Geräte funktionieren danach nicht mehr. Der Mitarbeiter muss den neuen QR-Code erneut scannen."
        cancelLabel="Abbrechen"
        confirmLabel="Neu generieren"
        variant="primary"
        onCancel={() => setConfirmRegen(null)}
        onConfirm={() => {
          const r = confirmRegen
          setConfirmRegen(null)
          if (r)
            void run(r.employeeId, async () => {
              await regenerateEmployeeAccess(r.employeeId)
            })
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmRevokeAll)}
        title="Alle Geräte zurücksetzen?"
        message="Alle bisher verbundenen Geräte werden deaktiviert. Der QR-Zugang bleibt unverändert, bis Sie ihn neu generieren."
        cancelLabel="Abbrechen"
        confirmLabel="Zurücksetzen"
        variant="danger"
        onCancel={() => setConfirmRevokeAll(null)}
        onConfirm={() => {
          const r = confirmRevokeAll
          setConfirmRevokeAll(null)
          if (r) void run(r.employeeId, () => revokeAllEmployeeAppDevices(r.employeeId))
        }}
      />
    </div>
  )
}
