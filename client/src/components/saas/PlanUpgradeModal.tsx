import { Link } from 'react-router-dom'
import type { FeatureKey } from '../../data/planFeatures'

type PlanUpgradeModalProps = {
  open: boolean
  onClose: () => void
  feature: FeatureKey
  featureTitle: string
  requiredPlan: string
  description?: string
}

export function PlanUpgradeModal({
  open,
  onClose,
  featureTitle,
  requiredPlan,
  description,
}: PlanUpgradeModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" role="dialog">
      <div className="w-full max-w-md rounded-2xl border border-cyan-500/30 bg-[#0c1424] p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-cyan-100">{featureTitle}</h2>
        <p className="mt-2 text-sm text-[#a8b8d8]">
          {description ?? `${featureTitle} ist im ${requiredPlan}-Paket enthalten.`}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/preise"
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-[#060b14] hover:bg-cyan-400"
            onClick={onClose}
          >
            {requiredPlan} ansehen
          </Link>
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
