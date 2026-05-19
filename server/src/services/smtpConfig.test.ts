import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  getNodemailerTransportOptions,
  resolveSmtpSecure,
} from './smtpConfig.js'
import { resetSmtpTransportCache } from './smtpMailTransport.js'

describe('smtpConfig', () => {
  const envBackup = { ...process.env }

  beforeEach(() => {
    resetSmtpTransportCache()
  })

  afterEach(() => {
    process.env = { ...envBackup }
    resetSmtpTransportCache()
  })

  it('uses SSL on port 465 with SMTP_SECURE=true', () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    process.env.SMTP_PORT = '465'
    process.env.SMTP_SECURE = 'true'
    const opts = getNodemailerTransportOptions()
    assert.ok(opts)
    assert.equal(opts.port, 465)
    assert.equal(opts.secure, true)
    assert.equal(opts.requireTLS, false)
    assert.equal(opts.connectionTimeout, 10_000)
    assert.equal(opts.greetingTimeout, 10_000)
    assert.equal(opts.socketTimeout, 15_000)
  })

  it('uses STARTTLS on port 587 with SMTP_SECURE=false', () => {
    process.env.SMTP_HOST = 'smtp.gmail.com'
    process.env.SMTP_PORT = '587'
    process.env.SMTP_SECURE = 'false'
    const opts = getNodemailerTransportOptions()
    assert.ok(opts)
    assert.equal(opts.port, 587)
    assert.equal(opts.secure, false)
    assert.equal(opts.requireTLS, true)
  })

  it('resolveSmtpSecure defaults port 465 to SSL', () => {
    assert.equal(resolveSmtpSecure(465, undefined), true)
    assert.equal(resolveSmtpSecure(587, undefined), false)
  })
})
