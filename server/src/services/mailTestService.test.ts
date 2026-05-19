import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTestRecipient } from './mailTestService.js'

describe('mailTestService', () => {
  it('normalizes valid email', () => {
    assert.equal(normalizeTestRecipient('  Info@Example.COM '), 'info@example.com')
  })

  it('rejects invalid email', () => {
    assert.equal(normalizeTestRecipient('not-an-email'), null)
  })
})
