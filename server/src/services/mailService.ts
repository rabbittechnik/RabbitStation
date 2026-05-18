export type MailTemplateKey =
  | 'welcome_registration'
  | 'email_verify'
  | 'password_reset'
  | 'employee_invite'
  | 'trial_expiring'
  | 'trial_expired'
  | 'subscription_active'
  | 'payment_past_due'
  | 'support_access_started'

const TEMPLATE_SUBJECTS: Record<MailTemplateKey, string> = {
  welcome_registration: 'Willkommen bei RabbitStation Pro',
  email_verify: 'E-Mail-Adresse bestätigen – RabbitStation Pro',
  password_reset: 'Passwort zurücksetzen – RabbitStation Pro',
  employee_invite: 'Einladung zu RabbitStation Pro',
  trial_expiring: 'Deine Testphase endet bald – RabbitStation Pro',
  trial_expired: 'Testphase beendet – RabbitStation Pro',
  subscription_active: 'Abo aktiv – RabbitStation Pro',
  payment_past_due: 'Zahlung offen – RabbitStation Pro',
  support_access_started: 'Support-Zugriff – RabbitStation Pro',
}

/** SMTP optional – ohne Konfiguration nur Log/Preview (kein Hardcoding von Zugangsdaten). */
export async function sendTemplateMail(
  to: string,
  template: MailTemplateKey,
  vars: Record<string, string>,
): Promise<{ sent: boolean; preview?: string }> {
  const appName = process.env.APP_NAME?.trim() || 'RabbitStation Pro'
  const subject = TEMPLATE_SUBJECTS[template]
  const body = renderTemplate(template, { ...vars, appName })
  const host = process.env.SMTP_HOST?.trim()
  if (!host) {
    console.info(`[mail:stub] ${template} → ${to}\n${subject}\n${body}`)
    return { sent: false, preview: body }
  }
  console.info(`[mail:queued] ${template} → ${to} (SMTP_HOST=${host})`)
  return { sent: false, preview: body }
}

function renderTemplate(template: MailTemplateKey, vars: Record<string, string>): string {
  const lines: Record<MailTemplateKey, string[]> = {
    welcome_registration: [
      `Hallo ${vars.displayName || ''},`,
      '',
      `willkommen bei ${vars.appName}!`,
      `Dein Konto für „${vars.companyName || 'Ihr Betrieb'}“ wurde angelegt.`,
      vars.trialEnd ? `Deine 7-Tage-Testphase endet am ${vars.trialEnd}.` : '',
      vars.setupUrl ? `Setup starten: ${vars.setupUrl}` : '',
    ],
    email_verify: [`Bitte bestätige deine E-Mail für ${vars.appName}:`, vars.verifyUrl || ''],
    password_reset: [
      `Neues Passwort für ${vars.appName}:`,
      vars.resetUrl || '',
      'Der Link ist 24 Stunden gültig.',
    ],
    employee_invite: [`Einladung zu ${vars.appName}:`, vars.inviteUrl || ''],
    trial_expiring: [`Testphase endet bald (${vars.trialDaysLeft || '?'} Tage).`],
    trial_expired: [`Testphase abgelaufen.`, vars.billingUrl || ''],
    subscription_active: [`Abo aktiv bei ${vars.appName}.`],
    payment_past_due: [`Zahlung offen bei ${vars.appName}.`],
    support_access_started: [`Support-Zugriff: ${vars.companyName || ''}`],
  }
  return lines[template].filter(Boolean).join('\n')
}
