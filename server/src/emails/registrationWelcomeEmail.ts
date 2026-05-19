export const REGISTRATION_WELCOME_SUBJECT = 'Willkommen bei RabbitStation Pro'

export type RegistrationWelcomeEmailVars = {
  name: string
  companyName: string
  stationName: string
  planLabel: string
  trialEnd: string
  setupUrl: string
  loginUrl: string
  appUrl: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function formatTrialEndDe(value: Date | string): string {
  if (value instanceof Date) {
    return value.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  const d = new Date(value)
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  return String(value)
}

export function buildRegistrationWelcomeHtml(vars: RegistrationWelcomeEmailVars): string {
  const name = escapeHtml(vars.name)
  const companyName = escapeHtml(vars.companyName)
  const stationName = escapeHtml(vars.stationName)
  const trialEnd = escapeHtml(vars.trialEnd)
  const planLabel = escapeHtml(vars.planLabel)
  const setupUrl = escapeHtml(vars.setupUrl)
  const loginUrl = escapeHtml(vars.loginUrl)
  const appUrl = escapeHtml(vars.appUrl)

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Willkommen bei RabbitStation Pro</title>
</head>
<body style="margin:0;padding:0;background:#07111f;font-family:Arial,Helvetica,sans-serif;color:#f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#07111f;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px;width:100%;background:#0f1b2d;border:1px solid rgba(34,211,238,0.35);border-radius:18px;overflow:hidden;">
          <tr>
            <td style="padding:32px;background:linear-gradient(135deg,#07111f,#0f2a3a);border-bottom:1px solid rgba(34,211,238,0.25);">
              <div style="font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#22d3ee;font-weight:bold;">
                RabbitStation Pro
              </div>
              <h1 style="margin:12px 0 0;font-size:32px;line-height:1.2;color:#ffffff;">
                Willkommen bei RabbitStation Pro
              </h1>
              <p style="margin:12px 0 0;font-size:16px;line-height:1.6;color:#cbd5e1;">
                Ihre digitale Verwaltungsplattform für Tankstellen ist bereit.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#f8fafc;">
                Hallo <strong>${name}</strong>,
              </p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#cbd5e1;">
                vielen Dank für Ihre Registrierung bei <strong style="color:#22d3ee;">RabbitStation Pro</strong>.
                Ihre 7-Tage-Testphase wurde erfolgreich gestartet. Sie können jetzt Ihre Station einrichten,
                Schichtmodelle festlegen, Mitarbeiter anlegen und die wichtigsten Funktionen direkt ausprobieren.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:24px 0;background:#071827;border:1px solid rgba(34,211,238,0.25);border-radius:14px;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:#22d3ee;font-weight:bold;">
                      Ihre Testphase
                    </p>
                    <p style="margin:0;font-size:22px;color:#ffffff;font-weight:bold;">
                      7 Tage kostenlos testen
                    </p>
                    <p style="margin:8px 0 0;font-size:15px;color:#94a3b8;">
                      Aktiv bis: <strong style="color:#22c55e;">${trialEnd}</strong>
                    </p>
                    <p style="margin:8px 0 0;font-size:15px;color:#94a3b8;">
                      Station: <strong style="color:#ffffff;">${stationName}</strong>
                    </p>
                    <p style="margin:8px 0 0;font-size:15px;color:#94a3b8;">
                      Firma: <strong style="color:#ffffff;">${companyName}</strong>
                    </p>
                    <p style="margin:8px 0 0;font-size:15px;color:#94a3b8;">
                      Paket: <strong style="color:#ffffff;">${planLabel}</strong>
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#cbd5e1;">
                RabbitStation Pro unterstützt Sie dabei, den Stationsalltag digitaler, übersichtlicher und professioneller
                zu organisieren – von der Dienstplanung über Zeiterfassung bis hin zu Aufgaben, Dokumenten und dem Stationstablet.
              </p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#cbd5e1;">
                Richten Sie jetzt Ihre Station ein, legen Sie Ihre Schichtmodelle fest und testen Sie die wichtigsten Funktionen
                direkt im echten Stationsalltag.
              </p>
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0;">
                <tr>
                  <td align="center" style="background:#22d3ee;border-radius:12px;">
                    <a href="${setupUrl}" style="display:inline-block;padding:14px 24px;color:#03121f;text-decoration:none;font-weight:bold;font-size:16px;">
                      Station jetzt einrichten
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#94a3b8;text-align:center;">
                <a href="${appUrl}" style="color:#22d3ee;">Zur App</a>
                · <a href="${loginUrl}" style="color:#22d3ee;">Zur Anmeldung</a>
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:24px 0;">
                <tr>
                  <td style="padding:16px;background:#0b1626;border-radius:14px;">
                    <p style="margin:0 0 12px;font-size:15px;font-weight:bold;color:#ffffff;">
                      Das können Sie jetzt testen:
                    </p>
                    <ul style="margin:0;padding-left:20px;color:#cbd5e1;font-size:15px;line-height:1.8;">
                      <li>Dienstplan &amp; Schichtmodelle</li>
                      <li>Zeiterfassung &amp; Monatsübersicht</li>
                      <li>Aufgabenverwaltung für Ihr Team</li>
                      <li>Dokumente &amp; Unterweisungen</li>
                      <li>TÜV-Bericht optional monatlich</li>
                      <li>Mitarbeiter-App</li>
                      <li>Stationstablet</li>
                      <li>Lohn- und Zuschlagsauswertung</li>
                    </ul>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#94a3b8;">
                Bei Fragen erreichen Sie uns unter der in Ihrem Konto hinterlegten Kontakt-E-Mail oder über den Rabbit-Technik Support.
                Wenn Sie diese Registrierung nicht selbst durchgeführt haben, können Sie diese E-Mail ignorieren.
              </p>
              <p style="margin:28px 0 0;font-size:16px;line-height:1.6;color:#f8fafc;">
                Viele Grüße<br>
                <strong>Ihr RabbitStation-Pro-Team</strong><br>
                Rabbit-Technik · Mathias Raselowski
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#08111f;border-top:1px solid rgba(34,211,238,0.2);">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">
                RabbitStation Pro ist eine SaaS-Lösung von Rabbit-Technik zur digitalen Organisation von Tankstellen.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function buildRegistrationWelcomeText(vars: RegistrationWelcomeEmailVars): string {
  return [
    `Hallo ${vars.name},`,
    '',
    'vielen Dank für Ihre Registrierung bei RabbitStation Pro.',
    '',
    'Ihre 7-Tage-Testphase wurde erfolgreich gestartet.',
    'Sie können jetzt Ihre Station einrichten, Schichtmodelle festlegen, Mitarbeiter anlegen und die wichtigsten Funktionen testen.',
    '',
    `Station: ${vars.stationName}`,
    `Firma: ${vars.companyName}`,
    `Paket: ${vars.planLabel}`,
    `Testphase aktiv bis: ${vars.trialEnd} (7 Tage kostenlos testen)`,
    '',
    'RabbitStation Pro unterstützt Sie bei:',
    '- Dienstplan und Schichtmodellen',
    '- Zeiterfassung und Monatsübersicht',
    '- Aufgabenverwaltung',
    '- Dokumenten und Unterweisungen',
    '- optionalem TÜV-Bericht',
    '- Mitarbeiter-App',
    '- Stationstablet',
    '- Lohn- und Zuschlagsauswertung',
    '',
    'Zur App:',
    vars.appUrl,
    '',
    'Station jetzt einrichten:',
    vars.setupUrl,
    '',
    'Zur Anmeldung:',
    vars.loginUrl,
    '',
    'Wenn Sie diese Registrierung nicht selbst durchgeführt haben, können Sie diese E-Mail ignorieren oder uns kontaktieren.',
    '',
    'Viele Grüße',
    'Ihr RabbitStation-Pro-Team',
    'Rabbit-Technik',
    'Mathias Raselowski',
  ].join('\n')
}
