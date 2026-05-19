import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveFeatureKey } from './featureLock.js'

describe('resolveFeatureKey', () => {
  it('maps payroll alias to payroll_audit', () => {
    assert.equal(resolveFeatureKey('payroll'), 'payroll_audit')
  })

  it('maps tuv_report alias to monthly_tuv_report', () => {
    assert.equal(resolveFeatureKey('tuv_report'), 'monthly_tuv_report')
  })

  it('maps payroll_time alias to payroll_time_tracking', () => {
    assert.equal(resolveFeatureKey('payroll_time'), 'payroll_time_tracking')
  })

  it('passes through known feature keys', () => {
    assert.equal(resolveFeatureKey('station_tablet'), 'station_tablet')
    assert.equal(resolveFeatureKey('payroll_schedule'), 'payroll_schedule')
  })
})
