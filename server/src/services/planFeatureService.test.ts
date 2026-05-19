import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hasFeature, getPlanLimits } from './planFeatureService.js'
import type { TenantRow } from './tenantService.js'

function mockTenant(plan: string): TenantRow {
  return {
    id: 't1',
    company_name: 'Test',
    slug: 'test',
    plan,
    subscription_status: 'trial',
    trial_start: new Date().toISOString(),
    trial_end: new Date().toISOString(),
    payment_provider: null,
    payment_customer_id: null,
    payment_subscription_id: null,
    current_period_start: null,
    current_period_end: null,
    cancelled_at: null,
    blocked_reason: null,
    setup_completed: 0,
    contact_email: null,
    contact_phone: null,
    address_json: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

describe('planFeatureService', () => {
  it('starter has schedule but not payroll_audit', () => {
    const t = mockTenant('starter')
    assert.equal(hasFeature(t, 'schedule'), true)
    assert.equal(hasFeature(t, 'payroll_audit'), false)
  })

  it('pro has time_tracking', () => {
    const t = mockTenant('pro')
    assert.equal(hasFeature(t, 'time_tracking'), true)
  })

  it('limits for starter', () => {
    const limits = getPlanLimits('starter')
    assert.equal(limits.maxEmployees, 5)
    assert.equal(limits.maxStations, 1)
  })
})
