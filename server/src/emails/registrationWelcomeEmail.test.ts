import { describe, expect, it } from 'vitest'
import {
  REGISTRATION_WELCOME_SUBJECT,
  buildRegistrationWelcomeHtml,
  buildRegistrationWelcomeText,
  formatTrialEndDe,
} from './registrationWelcomeEmail.js'

describe('registrationWelcomeEmail', () => {
  const vars = {
    name: 'Max Mustermann',
    companyName: 'Mustermann Tankstellen GmbH',
    stationName: 'Tankstelle Nord',
    planLabel: 'Pro',
    trialEnd: '26.05.2026',
    setupUrl: 'https://app.example.com/setup',
    loginUrl: 'https://app.example.com/login',
    appUrl: 'https://app.example.com',
  }

  it('uses the specified subject line', () => {
    expect(REGISTRATION_WELCOME_SUBJECT).toContain('Willkommen bei RabbitStation Pro')
    expect(REGISTRATION_WELCOME_SUBJECT).toBe('Willkommen bei RabbitStation Pro')
  })

  it('renders HTML with dynamic fields', () => {
    const html = buildRegistrationWelcomeHtml(vars)
    expect(html).toContain('Max Mustermann')
    expect(html).toContain('Mustermann Tankstellen GmbH')
    expect(html).toContain('Tankstelle Nord')
    expect(html).toContain('26.05.2026')
    expect(html).toContain('https://app.example.com/setup')
    expect(html).toContain('Station jetzt einrichten')
    expect(html).toContain('Dienstplan &amp; Schichtmodelle')
  })

  it('escapes HTML in user-provided values', () => {
    const html = buildRegistrationWelcomeHtml({
      ...vars,
      name: '<script>alert(1)</script>',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders plain-text fallback', () => {
    const text = buildRegistrationWelcomeText(vars)
    expect(text).toContain('Hallo Max Mustermann')
    expect(text).toContain('Tankstelle Nord')
    expect(text).toContain('https://app.example.com/setup')
  })

  it('formats trial end as German date', () => {
    const formatted = formatTrialEndDe(new Date('2026-05-26T12:00:00Z'))
    expect(formatted).toMatch(/26\.05\.2026/)
  })
})
