import { useEffect } from 'react'
import { Crown, Lock, X } from 'lucide-react'
import type { FeatureKey } from '../../data/planFeatures'
import { FEATURE_MIN_PLAN } from '../../data/planFeatures'
import { getPlanFeatureCopy } from '../../data/planFeatureCopy'
import { usePlanUpgrade } from '../../context/plan-upgrade-context'
import { planLabel } from '../../data/pricingPlans'

type FeatureLockedModalProps = {
  open: boolean
  onClose: () => void
  feature: FeatureKey
}

function upgradeCtaLabel(feature: FeatureKey, isLoggedIn: boolean): string {
  const min = FEATURE_MIN_PLAN[feature]
  if (!isLoggedIn) {
    if (min === 'multi_station') return 'Multi-Station testen'
    if (min === 'pro') return 'Pro 7 Tage testen'
    return 'Starter testen'
  }
  if (min === 'multi_station') return 'Multi-Station testen'
  return 'Pro 7 Tage testen'
}

export function FeatureLockedModal({ open, onClose, feature }: FeatureLockedModalProps) {
  const { isLoggedIn, currentPlanId, openPlanUpgrade } = usePlanUpgrade()
  const copy = getPlanFeatureCopy(feature)
  const targetPlan = FEATURE_MIN_PLAN[feature]
  const currentPlanLabel = currentPlanId ? planLabel(currentPlanId) : 'Starter'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feature-lock-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Dialog schließen"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-cyan-400/40 bg-gradient-to-br from-[#0c1424] via-[#0a101c] to-[#060b14] p-6 shadow-[0_0_48px_rgba(34,211,238,0.15)] ring-1 ring-cyan-500/20">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
          aria-label="Schließen"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        <div className="flex items-start gap-3 pr-8">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 ring-1 ring-cyan-400/45 shadow-[0_0_20px_rgba(34,211,238,0.2)]"
            aria-hidden
          >
            <Lock className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-cyan-300/90">
              <Crown className="h-3.5 w-3.5" aria-hidden />
              Upgrade
            </p>
            <h2 id="feature-lock-title" className="text-lg font-semibold leading-snug text-cyan-50">
              {copy.title}
            </h2>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-[#a8b8d8]">{copy.description}</p>
        <dl className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-white/10 bg-black/25 p-3 text-sm">
          <dt className="text-[var(--text-faint)]">Aktueller Plan</dt>
          <dd className="font-medium text-[var(--text-main)]">{currentPlanLabel}</dd>
          <dt className="text-[var(--text-faint)]">Benötigter Plan</dt>
          <dd className="font-medium text-cyan-200">{copy.requiredPlanLabel}</dd>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              onClose()
              openPlanUpgrade(targetPlan)
            }}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-[#060b14] shadow-[0_0_20px_rgba(34,211,238,0.35)] hover:bg-cyan-400"
          >
            {upgradeCtaLabel(feature, isLoggedIn)}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            Später
          </button>
        </div>
      </div>
    </div>
  )
}
