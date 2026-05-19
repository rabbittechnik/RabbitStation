import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ExternalLink, ShieldAlert } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useStation } from '../../context/station-context'
import { apiGet } from '../../services/api'
import { useRequirePlanFeature } from '../../hooks/useRequirePlanFeature'
import { formatApiError } from '../../lib/apiErrors'

type ValidationIssue = {
  severity: 'warning' | 'error'
  code: string
  employeeId: string
  employeeName: string
  message: string
  detail?: string
}

type ValidationPayload = {
  stationId: string
  stationName: string
  federalState: string
  fromDate: string
  toDate: string
  stationPolicy: {
    summaryLinesDe: string[]
  }
  issues: ValidationIssue[]
}

type CombinedRow = {
  employeeId: string
  employeeName: string
  scheduleHoursTotal: number
  timeTrackingHoursTotal: number
  usedHoursTotal: number
  supplementsTotal: number
  basePay: number
  total: number
}

type CombinedPayload = {
  rows: CombinedRow[]
}

function defaultPeriod(): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return { from: `${y}-${m}-01`, to: `${y}-${m}-15` }
}

export function PayrollAuditPage() {
  const { stationId, hasPermission } = useStation()
  const hasPayrollAudit = useRequirePlanFeature('payroll_audit')
  const canView = hasPermission('payroll.view') || hasPermission('reports.payroll')
  const { from: defFrom, to: defTo } = defaultPeriod()
  const [from, setFrom] = useState(defFrom)
  const [to, setTo] = useState(defTo)
  const [validation, setValidation] = useState<ValidationPayload | null>(null)
  const [combined, setCombined] = useState<CombinedPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!stationId || !canView) return
    setLoading(true)
    setError(null)
    const q = { stationId, from, to }
    const vRes = await apiGet<ValidationPayload>('/reports/payroll-validation', q, { timeoutMs: 60_000 })
    if (!vRes.ok) {
      setValidation(null)
      setCombined(null)
      setError(formatApiError(vRes))
      setLoading(false)
      return
    }
    setValidation(vRes.data)

    const cRes = await apiGet<CombinedPayload>('/reports/payroll-combined', { ...q, includeDetails: '0' }, {
      timeoutMs: 90_000,
    })
    if (!cRes.ok) {
      setCombined(null)
      const isTimeout = cRes.error.includes('Zeitüberschreitung') || cRes.error.includes('timeout')
      setError(
        isTimeout
          ? `Berechnung der Zusammenfassung abgebrochen (Server-Timeout). Schichtplan- und Zeiterfassungs-Lohn laden weiterhin. ${cRes.error}`
          : `Kombi-Lohn: ${cRes.error}`,
      )
    } else {
      setCombined(cRes.data)
      setError(null)
    }
    setLoading(false)
  }, [stationId, from, to, canView])

  useEffect(() => {
    void load()
  }, [load])

  const errors = useMemo(
    () => (validation?.issues ?? []).filter((i) => i.severity === 'error'),
    [validation],
  )
  const warnings = useMemo(
    () => (validation?.issues ?? []).filter((i) => i.severity === 'warning'),
    [validation],
  )

  if (!stationId) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-xl font-semibold text-[var(--text-main)]">Lohnprüfung</h1>
        <p className="text-sm text-[var(--text-muted)]">Bitte zuerst eine Station auswählen.</p>
      </div>
    )
  }

  if (!hasPayrollAudit) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Lohnprüfung"
          description="Berechnungsprüfung vor Monatsabschluss — Detailnachweis pro Tag in der Lohnabrechnung Zusammenfassung."
        />
      </div>
    )
  }

  if (!canView) {
    return <div className="p-6 text-sm text-[var(--text-muted)]">Keine Berechtigung für Lohnauswertungen.</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lohnprüfung"
        description="Berechnungsprüfung vor Monatsabschluss — Detailnachweis pro Tag in der Lohnabrechnung Zusammenfassung."
      />

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <label className="text-sm">
          <span className="mb-1 block text-[var(--text-muted)]">Von</span>
          <input
            type="date"
            className="rounded border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-1.5"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--text-muted)]">Bis</span>
          <input
            type="date"
            className="rounded border border-[var(--border-soft)] bg-[var(--bg-card)] px-2 py-1.5"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <Button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? 'Prüfe…' : 'Prüfen'}
        </Button>
        <Link
          to={`/reports/payroll-summary?from=${from}&to=${to}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--accent-text)] underline"
        >
          Zur Lohn-Zusammenfassung
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </Card>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {validation ? (
        <>
          <Card className="space-y-3 p-4">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-text)]" aria-hidden />
              <div>
                <h2 className="font-semibold text-[var(--text-main)]">
                  Zuschlagsregeln — {validation.stationName} ({validation.federalState})
                </h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--text-muted)]">
                  {validation.stationPolicy.summaryLinesDe.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-red-300">
                <AlertTriangle className="h-5 w-5" aria-hidden />
                <span className="font-semibold">Fehler ({errors.length})</span>
              </div>
              {errors.length === 0 ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-emerald-300/90">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  Keine kritischen Fehler
                </p>
              ) : (
                <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
                  {errors.map((i, idx) => (
                    <li key={`${i.code}-${idx}`} className="rounded border border-red-500/25 bg-red-500/5 px-2 py-1.5">
                      <strong>{i.employeeName || '—'}</strong>: {i.message}
                      {i.detail ? <div className="text-xs text-[var(--text-faint)]">{i.detail}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-amber-200">
                <AlertTriangle className="h-5 w-5" aria-hidden />
                <span className="font-semibold">Hinweise ({warnings.length})</span>
              </div>
              {warnings.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--text-muted)]">Keine Warnungen</p>
              ) : (
                <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
                  {warnings.map((i, idx) => (
                    <li
                      key={`${i.code}-${idx}`}
                      className="rounded border border-amber-500/25 bg-amber-500/5 px-2 py-1.5"
                    >
                      <strong>{i.employeeName || '—'}</strong>: {i.message}
                      {i.detail ? <div className="text-xs text-[var(--text-faint)]">{i.detail}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {combined?.rows?.length ? (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80 text-xs uppercase text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Mitarbeiter</th>
                    <th className="px-3 py-2 text-right">Plan Std.</th>
                    <th className="px-3 py-2 text-right">Ist Std.</th>
                    <th className="px-3 py-2 text-right">Verwendet</th>
                    <th className="px-3 py-2 text-right">Zuschläge</th>
                    <th className="px-3 py-2 text-right">Grundlohn</th>
                    <th className="px-3 py-2 text-right">Summe</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {combined.rows.map((r) => (
                    <tr key={r.employeeId} className="border-b border-[var(--border-subtle)]/60">
                      <td className="px-3 py-2 font-medium">{r.employeeName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.scheduleHoursTotal.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.timeTrackingHoursTotal.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.usedHoursTotal.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.supplementsTotal.toFixed(2)} €</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.basePay.toFixed(2)} €</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.total.toFixed(2)} €</td>
                      <td className="px-3 py-2">
                        <Link
                          to={`/reports/payroll-summary/employee/${encodeURIComponent(r.employeeId)}?from=${from}&to=${to}`}
                          className="text-[var(--accent-text)] underline"
                        >
                          Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
