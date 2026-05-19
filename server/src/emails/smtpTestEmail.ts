const APP_NAME = () => process.env.MAIL_FROM_NAME?.trim() || process.env.APP_NAME?.trim() || 'RabbitStation Pro'

export const SMTP_TEST_SUBJECT = `${APP_NAME()} – SMTP-Test`

export const SMTP_TEST_TEXT =
  'Dies ist eine Testmail von RabbitStation Pro. Wenn diese Mail ankommt, funktioniert der SMTP-Versand.'

export function buildSmtpTestHtml(): string {
  const name = APP_NAME()
  return `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#060b14;font-family:Segoe UI,Arial,sans-serif;color:#e8eef8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#060b14;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:linear-gradient(145deg,#0c1424 0%,#0a101c 100%);border:1px solid rgba(34,211,238,0.35);border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 28px 8px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#67e8f9;">SMTP-Test</p>
          <h1 style="margin:12px 0 0;font-size:22px;font-weight:600;color:#f0f9ff;">${name}</h1>
        </td></tr>
        <tr><td style="padding:8px 28px 28px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#a8b8d8;">
            Dies ist eine Testmail von RabbitStation Pro. Wenn diese Mail ankommt, funktioniert der SMTP-Versand.
          </p>
          <p style="margin:0;font-size:12px;color:#64748b;">Gesendet am ${new Date().toLocaleString('de-DE')}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
