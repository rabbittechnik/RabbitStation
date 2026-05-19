import { ChevronRight, Crown, Lock } from 'lucide-react'
import type { FeatureKey } from '../../data/planFeatures'
import { getPlanFeatureCopy } from '../../data/planFeatureCopy'
import { usePlanUpgrade } from '../../context/plan-upgrade-context'

type FeatureLockDashboardBannerProps = {
  feature: FeatureKey
  className?: string
}

/** Kompakte Dashboard-Karte; Klick öffnet das zentrale Feature-Lock-Modal. */
export function FeatureLockDashboardBanner({ feature, className = '' }: FeatureLockDashboardBannerProps) {
  const copy = getPlanFeatureCopy(feature)
  const { showFeatureLocked } = usePlanUpgrade()

  return (
    <button
      type="button"
      onClick={() => showFeatureLocked(feature)}
      className={`group w-full rounded-xl border border-cyan-500/35 bg-gradient-to-br from-cyan-950/40 via-[#0c1424] to-[#0a101c] p-4 text-left shadow-[0_0_32px_rgba(34,211,238,0.08)] transition hover:border-cyan-400/50 hover:shadow-[0_0_40px_rgba(34,211,238,0.12)] ${className}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 ring-1 ring-cyan-400/40"
          aria-hidden
        >
          <Lock className="h-4 w-4 text-cyan-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-cyan-300/90">
            <Crown className="h-3 w-3" aria-hidden />
            Pro-Funktion
          </p>
          <p className="mt-0.5 text-sm font-semibold text-cyan-50">{copy.title}</p>
          <p className="mt-1 line-clamp-2 text-xs text-[#a8b8d8]">{copy.description}</p>
        </div>
        <ChevronRight
          className="mt-1 h-5 w-5 shrink-0 text-cyan-400/70 transition group-hover:translate-x-0.5 group-hover:text-cyan-300"
          aria-hidden
        />
      </div>
    </button>
  )
}
