import { Link } from 'react-router-dom'
import { Crown, Lock } from 'lucide-react'
import type { FeatureKey } from '../../data/planFeatures'
import { getPlanFeatureCopy } from '../../data/planFeatureCopy'

type FeatureLockedCardProps = {
  feature: FeatureKey
  currentPlan?: string
  compact?: boolean
  onDismiss?: () => void
  className?: string
}

export function FeatureLockedCard({
  feature,
  currentPlan,
  compact = false,
  onDismiss,
  className = '',
}: FeatureLockedCardProps) {
  const copy = getPlanFeatureCopy(feature)

  return (
    <div
      className={`rounded-xl border border-cyan-500/35 bg-gradient-to-br from-cyan-950/40 via-[#0c1424] to-[#0a101c] ${compact ? 'p-4' : 'p-6'} shadow-[0_0_32px_rgba(34,211,238,0.08)] ${className}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 ring-1 ring-cyan-400/40"
          aria-hidden
        >
          <Lock className="h-5 w-5 text-cyan-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-cyan-300/90">
            <Crown className="h-3.5 w-3.5" aria-hidden />
            Upgrade
          </p>
          <h3 className={`font-semibold text-cyan-50 ${compact ? 'text-sm' : 'text-base'}`}>{copy.title}</h3>
          {!compact ? <p className="mt-2 text-sm leading-relaxed text-[#a8b8d8]">{copy.description}</p> : null}
          {currentPlan ? (
            <p className="mt-2 text-xs text-[var(--text-faint)]">Aktueller Plan: {currentPlan}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/preise"
              className="inline-flex items-center rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-medium text-[#060b14] hover:bg-cyan-400"
            >
              {copy.requiredPlanLabel}-Paket ansehen
            </Link>
            {onDismiss ? (
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
              >
                Später
              </button>
            ) : (
              <button
                type="button"
                onClick={() => window.history.back()}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
              >
                Zurück
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
