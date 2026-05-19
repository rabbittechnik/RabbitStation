import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mailTestFailureToJson, normalizeTestRecipient } from './mailTestService.js'

describe('mailTestService', () => {
  it('normalizes valid email', () => {
    assert.equal(normalizeTestRecipient('  Info@Example.COM '), 'info@example.com')
  })

  it('rejects invalid email', () => {
    assert.equal(normalizeTestRecipient('not-an-email'), null)
  })

  it('mailTestFailureToJson includes safe fields without secrets', () => {
    const json = mailTestFailureToJson({
      ok: false,
      message: 'Testmail konnte nicht gesendet werden',
      step: 'verify',
      errorCode: 'smtp_timeout',
      safeMessage: 'Zeitüberschreitung',
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      secure: false,
      responseCode: 421,
      command: 'CONN',
    })
    assert.equal(json.step, 'verify')
    assert.equal(json.errorCode, 'smtp_timeout')
    assert.equal(json.secure, false)
    assert.equal(json.smtpPort, 587)
    const serialized = JSON.stringify(json).toLowerCase()
    assert.ok(!serialized.includes('password'))
    assert.ok(!serialized.includes('smtp_pass'))
    assert.ok(!serialized.includes('secret'))
  })
})
