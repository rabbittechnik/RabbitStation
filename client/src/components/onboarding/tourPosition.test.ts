import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeTooltipPosition,
  isRectUsable,
  shouldUseCenteredHighlight,
} from './tourPosition.js'

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): { top: number; left: number; width: number; height: number; bottom: number; right: number } {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

describe('tourPosition', () => {
  it('centers tooltip when rect is null', () => {
    const pos = computeTooltipPosition(null, 360, 200)
    assert.equal(pos.placement, 'center')
    assert.ok(pos.top >= 20)
    assert.ok(pos.left >= 20)
  })

  it('rejects unusable rects', () => {
    assert.equal(isRectUsable(rect(0, 0, 0, 0)), false)
  })

  it('flags oversized highlight targets', () => {
    assert.equal(shouldUseCenteredHighlight(rect(0, 0, 1200, 900)), true)
  })
})
