import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatApiError, isPlanErrorCode, normalizeApiFailure } from './apiErrors.js'

describe('apiErrors', () => {
  it('maps feature_not_available', () => {
    assert.equal(
      formatApiError('feature_not_available'),
      'Diese Funktion ist in Ihrem aktuellen Plan nicht enthalten.',
    )
  })

  it('prefers server message when human', () => {
    const norm = normalizeApiFailure({
      error: 'feature_not_available',
      message: 'Stationstablet ist ab Pro verfügbar.',
    })
    assert.equal(norm.code, 'feature_not_available')
    assert.equal(norm.error, 'Stationstablet ist ab Pro verfügbar.')
  })

  it('detects plan errors', () => {
    assert.equal(isPlanErrorCode('feature_not_available'), true)
    assert.equal(isPlanErrorCode('Netzwerkfehler'), false)
  })
})
