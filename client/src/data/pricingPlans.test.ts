import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePlanId, registerUrlForPlan } from './pricingPlans.js'

describe('pricingPlans', () => {
  it('register URLs include plan query', () => {
    assert.equal(registerUrlForPlan('starter'), '/registrieren?plan=starter')
    assert.equal(registerUrlForPlan('pro'), '/registrieren?plan=pro')
    assert.equal(registerUrlForPlan('multi_station'), '/registrieren?plan=multi_station')
  })

  it('normalizes unknown plan to pro', () => {
    assert.equal(normalizePlanId('invalid'), 'pro')
  })
})
