import { useState } from 'react'
import { Crown, Sparkles } from 'lucide-react'
import { Button } from '../ui/Button'
import type { PlanId } from '../../data/pricingPlans'
import { planLabel } from '../../data/pricingPlans'
import { changeSubscriptionPlan } from '../../services/subscriptionApi'
import { useAuth } from '../../context/auth-context'

const PRO_BODY =
  'Sie testen aktuell RabbitStation Starter. Mit RabbitStation Pro erhalten Sie zusätzlich Zeiterfassung, Lohnprüfung, Zuschläge, TÜV-Bericht, Stationstablet, geschützte Dokumente und erweiterte Auswertungen.'

const MULTI_BODY =
  'Mit RabbitStation Multi-Station verwalten Sie mehrere Standorte, erweiterte Rollen und zusätzliche Tablets in einem Mandanten.'

type Props = {
  open: boolean
  targetPlan: PlanId
  onClose: () => void
  onSuccess?: () => void
}

export function PlanTrialUpgradeDialog({ open, targetPlan, onClose, onSuccess }: Props) {
  const { refreshMe } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  if (!open) return null

  const label = planLabel(targetPlan)
  const isMulti = targetPlan === 'multi_station'
  const title = isMulti ? 'Multi-Station kostenlos testen?' : 'Pro-Version kostenlos testen?'
  const body = isMulti ? MULTI_BODY : PRO_BODY
  const confirmLabel = isMulti ? 'Multi-Station testen' : 'Pro 7 Tage testen'
  const successTitle = isMulti ? 'Multi-Station-Test aktiviert' : 'Pro-Test aktiviert'

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    const res = await changeSubscriptionPlan(targetPlan)
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    await refreshMe()
    setSuccess(true)
    onSuccess?.()
  }

  function handleClose() {
    if (loading) return
    setSuccess(false)
    setError(null)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-cyan-500/35 bg-gradient-to-br from-[#0c1424] via-[#0a101c] to-[#080d16] p-6 shadow-[0_0_48px_rgba(34,211,238,0.12)]">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/25 to-fuchsia-500/20 ring-1 ring-cyan-400/40">
          <Crown className="h-6 w-6 text-cyan-300" aria-hidden />
        </div>
        {success ?
          <>
            <h2 className="text-lg font-semibold text-cyan-50">{successTitle}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[#a8b8d8]">
              Ihre Station wurde erfolgreich auf RabbitStation {label} umgestellt. Ihre bestehenden Daten
              bleiben erhalten.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="primary" onClick={handleClose}>
                Weiter
              </Button>
            </div>
          </>
        : <>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-cyan-300/90">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Upgrade
            </p>
            <h2 className="text-lg font-semibold text-cyan-50">{title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[#a8b8d8]">{body}</p>
            <p className="mt-3 text-sm text-cyan-100/90">
              Ihre bestehenden Daten bleiben erhalten. Es wird kein neues Konto erstellt.
            </p>
            <p className="mt-2 text-xs text-[var(--text-faint)]">
              Die {label}-Testphase läuft maximal 7 Tage ab Aktivierung.
            </p>
            {error ?
              <p className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                {error}
              </p>
            : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={handleClose} disabled={loading}>
                Abbrechen
              </Button>
              <Button type="button" variant="primary" onClick={() => void handleConfirm()} disabled={loading}>
                {loading ? 'Wird aktiviert…' : confirmLabel}
              </Button>
            </div>
          </>
        }
      </div>
    </div>
  )
}
