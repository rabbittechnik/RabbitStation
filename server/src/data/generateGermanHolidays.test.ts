import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { bussUndBettag, easterSunday, generateGermanHolidays } from './generateGermanHolidays.js'

describe('generateGermanHolidays', () => {
  it('computes Easter 2026 correctly', () => {
    const e = easterSunday(2026)
    assert.equal(e.getFullYear(), 2026)
    assert.equal(e.getMonth(), 3)
    assert.equal(e.getDate(), 5)
  })

  it('computes Buß- und Bettag 2026 for Saxony', () => {
    const d = bussUndBettag(2026)
    assert.equal(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, '2026-11-18')
  })

  it('generates BW holidays including Heilige Drei Könige', () => {
    const h = generateGermanHolidays(2026, 'BW')
    assert.ok(h.some((x) => x.name === 'Heilige Drei Könige' && x.date === '2026-01-06'))
    assert.ok(h.some((x) => x.name === 'Fronleichnam'))
    assert.ok(h.some((x) => x.name === 'Heiligabend' && x.startTime === '14:00'))
  })

  it('generates Berlin-specific Frauentag', () => {
    const h = generateGermanHolidays(2026, 'BE')
    assert.ok(h.some((x) => x.name.includes('Frauentag')))
    assert.ok(!h.some((x) => x.name === 'Heilige Drei Könige'))
  })

  it('generates Bayern without Mariä Himmelfahrt unless option enabled', () => {
    const without = generateGermanHolidays(2026, 'BY')
    assert.ok(!without.some((x) => x.name === 'Mariä Himmelfahrt'))
    const withOpt = generateGermanHolidays(2026, 'BY', { bavariaAssumptionDayEnabled: true })
    assert.ok(withOpt.some((x) => x.name === 'Mariä Himmelfahrt'))
  })

  it('includes Saarland Mariä Himmelfahrt by default', () => {
    const h = generateGermanHolidays(2026, 'SL')
    assert.ok(h.some((x) => x.name === 'Mariä Himmelfahrt' && x.date === '2026-08-15'))
  })
})
