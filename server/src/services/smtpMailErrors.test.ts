import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { classifySmtpError, assertSmtpReadyToSend } from './smtpMailErrors.js'
import { resetSmtpTransportCache } from './smtpMailTransport.js'

describe('smtpMailErrors', () => {
  const envBackup = { ...process.env }

  afterEach(() => {
    process.env = { ...envBackup }
    resetSmtpTransportCache()
  })

  beforeEach(() => {
    resetSmtpTransportCache()
  })

  it('detects missing SMTP_HOST', () => {
    delete process.env.SMTP_HOST
    const c = classifySmtpError(new Error('fail'))
    assert.equal(c.errorCode, 'smtp_not_configured')
  })

  it('detects MAIL_FROM mismatch with SMTP_USER', () => {
    process.env.SMTP_HOST = 'smtp.gmail.com'
    process.env.SMTP_USER = 'a@gmail.com'
    process.env.SMTP_PASS = 'secret'
    process.env.MAIL_FROM_ADDRESS = 'b@gmail.com'
    const pre = assertSmtpReadyToSend()
    assert.ok(pre !== null)
    assert.equal(pre!.errorCode, 'mail_from_mismatch')
  })

  it('classifies EAUTH', () => {
    process.env.SMTP_HOST = 'smtp.gmail.com'
    process.env.SMTP_USER = 'a@gmail.com'
    process.env.SMTP_PASS = 'x'
    process.env.MAIL_FROM_ADDRESS = 'a@gmail.com'
    const c = classifySmtpError({ code: 'EAUTH', response: '535 Authentication failed' })
    assert.equal(c.errorCode, 'smtp_auth_failed')
    assert.match(c.safeMessage, /Authentifizierung/)
  })
})
