# Registrierungs-Willkommensmail – Abschlussbericht

**Projekt:** RabbitStation Haupt-App  
**Datum:** 2026-05-19  
**Control Center:** nicht geändert

## 1. Geänderte / neue Dateien

| Datei | Zweck |
|-------|--------|
| `server/src/emails/registrationWelcomeEmail.ts` | HTML- und Plain-Text-Template, Betreff, Datumsformat |
| `server/src/emails/registrationWelcomeEmail.test.ts` | Unit-Tests für Template-Inhalte |
| `server/src/services/registrationWelcomeEmailService.ts` | `sendRegistrationWelcomeEmail()` inkl. Audit-Log |
| `server/src/services/smtpMailTransport.ts` | Nodemailer-SMTP-Transport |
| `server/src/services/mailService.ts` | SMTP-Versand für weitere Text-Templates |
| `server/src/services/registrationService.ts` | Aufruf nach erfolgreicher Registrierung |
| `server/package.json` | Dependency `nodemailer` |
| `.env.example` | SMTP- und Mail-From-Variablen dokumentiert |

## 2. E-Mail-Template

- **HTML:** `server/src/emails/registrationWelcomeEmail.ts` → `buildRegistrationWelcomeHtml()`
- **Plain-Text:** `buildRegistrationWelcomeText()`
- **Betreff:** `REGISTRATION_WELCOME_SUBJECT` = „Willkommen bei RabbitStation Pro – Ihre Testphase wurde gestartet“
- Design: Dark/Neon (#07111f, #0f1b2d, Cyan #22d3ee, Trial-Grün #22c55e)

## 3. Benötigte ENV-Variablen

| Variable | Beschreibung |
|----------|----------------|
| `SMTP_HOST` | SMTP-Server (Pflicht für echten Versand) |
| `SMTP_PORT` | Port (Default 587) |
| `SMTP_SECURE` | `true`/`false` oder `1`/`0` (Default: 465 → secure) |
| `SMTP_USER` | SMTP-Benutzer (optional je Provider) |
| `SMTP_PASS` | SMTP-Passwort |
| `MAIL_FROM_NAME` | Absendername (Default: RabbitStation Pro) |
| `MAIL_FROM_ADDRESS` | Absender-Adresse |
| `SMTP_FROM` | Legacy-Alias für Absender, falls `MAIL_FROM_ADDRESS` leer |
| `PUBLIC_APP_URL` | Basis-URL für Setup-/Login-Links |
| `APP_NAME` | Optional, Anzeigename |

Keine Secrets im Repository.

## 4. Verhalten ohne SMTP

- Registrierung **bleibt erfolgreich** (kein Throw).
- **Development:** vollständiger Plain-Text-Inhalt in der Konsole (`[mail:registration-welcome]`).
- **Production:** Warning-Log, kein Versand.
- Tenant-Audit: `registration_welcome_email_failed` mit `reason: smtp_not_configured`.

## 5. Auslösung nach Registrierung

In `registerNewTenant()` nach Tenant-, Station-, User-Erstellung und Audit `registration.completed`:

```ts
void sendRegistrationWelcomeEmail({
  to: email,
  name: displayName,
  companyName,
  stationName,
  trialEnd,
  setupUrl: `${PUBLIC_APP_URL}/setup`,
  loginUrl: `${PUBLIC_APP_URL}/login`,
  db, tenantId, userId, req,
})
```

`void` = asynchron, blockiert die API-Antwort nicht.

## 6. Audit / Logging

| Ereignis | Action |
|----------|--------|
| Versand OK | `registration_welcome_email_sent` |
| Fehler / kein SMTP | `registration_welcome_email_failed` |

Keine Passwörter oder Tokens in Logs/Metadaten.

## 7. Durchgeführte Tests

- `npm run build` (Server TypeScript) – OK
- Unit-Tests `registrationWelcomeEmail.test.ts` (Name, Station, Trial, Setup-URL, HTML-Escape)
- Manuell: Registrierungsflow ruft `sendRegistrationWelcomeEmail` auf; bei fehlendem `SMTP_HOST` kein Abbruch

## 8. Offen / optional

- Produktions-SMTP auf Railway setzen und einen Test-Registrierungslauf mit echtem Postfach prüfen
- Weitere Templates (Passwort-Reset, Einladung) können später auf HTML umgestellt werden (aktuell Plain-Text via `mailService`)
