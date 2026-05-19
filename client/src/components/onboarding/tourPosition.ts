export const TOUR_MARGIN = 20
export const TOUR_TOOLTIP_MAX_W = 420
export const TOUR_TOOLTIP_MIN_W = 280

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center'

export type RectLike = Pick<DOMRect, 'top' | 'left' | 'width' | 'height' | 'bottom' | 'right'>

function viewportSize() {
  if (typeof window !== 'undefined') {
    return { width: window.innerWidth, height: window.innerHeight }
  }
  return { width: 1280, height: 800 }
}

export type TourTooltipPos = {
  top: number
  left: number
  placement: TourPlacement
  maxWidth: number
}

export type TourHighlightBox = {
  top: number
  left: number
  width: number
  height: number
}

export function isRectUsable(rect: RectLike | null): rect is RectLike {
  if (!rect) return false
  const { height: vh, width: vw } = viewportSize()
  if (rect.width < 4 || rect.height < 4) return false
  if (rect.bottom < 8 || rect.top > vh - 8) return false
  if (rect.right < 8 || rect.left > vw - 8) return false
  return true
}

export function highlightFromRect(rect: RectLike, pad = 8): TourHighlightBox {
  return {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }
}

/** Berechnet eine sichtbare Tooltip-Position innerhalb des Viewports. */
export function computeTooltipPosition(
  rect: RectLike | null,
  tooltipWidth: number,
  tooltipHeight: number,
): TourTooltipPos {
  const { width: vw, height: vh } = viewportSize()
  const maxWidth = Math.min(TOUR_TOOLTIP_MAX_W, Math.max(TOUR_TOOLTIP_MIN_W, vw - TOUR_MARGIN * 2))
  const w = Math.min(tooltipWidth, maxWidth)
  const h = tooltipHeight
  const gap = 14

  if (!isRectUsable(rect)) {
    return {
      top: Math.max(TOUR_MARGIN, (vh - h) / 2),
      left: Math.max(TOUR_MARGIN, (vw - w) / 2),
      placement: 'center',
      maxWidth,
    }
  }

  const candidates: { placement: TourPlacement; top: number; left: number }[] = [
    {
      placement: 'bottom',
      top: rect.bottom + gap,
      left: rect.left + rect.width / 2 - w / 2,
    },
    {
      placement: 'top',
      top: rect.top - gap - h,
      left: rect.left + rect.width / 2 - w / 2,
    },
    {
      placement: 'right',
      top: rect.top + rect.height / 2 - h / 2,
      left: rect.right + gap,
    },
    {
      placement: 'left',
      top: rect.top + rect.height / 2 - h / 2,
      left: rect.left - gap - w,
    },
  ]

  const fits = (top: number, left: number) =>
    top >= TOUR_MARGIN &&
    left >= TOUR_MARGIN &&
    top + h <= vh - TOUR_MARGIN &&
    left + w <= vw - TOUR_MARGIN

  const chosen = candidates.find((c) => fits(c.top, c.left)) ?? candidates[0]

  return {
    top: Math.min(Math.max(TOUR_MARGIN, chosen.top), vh - h - TOUR_MARGIN),
    left: Math.min(Math.max(TOUR_MARGIN, chosen.left), vw - w - TOUR_MARGIN),
    placement: chosen.placement,
    maxWidth,
  }
}

/** Sehr große Ziele (z. B. gesamtes main) nicht vollflächig highlighten. */
export function shouldUseCenteredHighlight(rect: RectLike): boolean {
  const { width: vw, height: vh } = viewportSize()
  return rect.width > vw * 0.72 || rect.height > vh * 0.55
}
