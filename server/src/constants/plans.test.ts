import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PLAN_ID, normalizePlanId } from './plans.js'

describe('normalizePlanId', () => {
  it('defaults to pro', () => {
    assert.equal(normalizePlanId(undefined), DEFAULT_PLAN_ID)
    assert.equal(normalizePlanId(''), 'pro')
  })

  it('maps legacy rabbitstation_pro to pro', () => {
    assert.equal(normalizePlanId('rabbitstation_pro'), 'pro')
  })

  it('accepts starter and multi_station', () => {
    assert.equal(normalizePlanId('starter'), 'starter')
    assert.equal(normalizePlanId('multi_station'), 'multi_station')
    assert.equal(normalizePlanId('multi-station'), 'multi_station')
  })
})
