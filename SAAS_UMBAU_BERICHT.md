# SaaS-Umbau Bericht – RabbitStation Pro (Haupt-App)

Stand: Mai 2026 · Projekt: `Projekt Webapp Leer RabbitStation` · **RabbitStation Control Center nicht geändert.**

---

## 1. Geänderte / neue Dateien (Auswahl)

### Backend (Server)
| Bereich | Dateien |
|---------|---------|
| Migration | `server/src/db/saasMigrations.ts`, `server/src/db/migrations.ts` |
| Konstanten | `server/src/constants/saasRoles.ts` |
| Services | `tenantService.ts`, `subscriptionService.ts`, `tenantAuditService.ts`, `mailService.ts`, `registrationService.ts`, `setupService.ts`, `tabletPairingService.ts` |
| Middleware | `trialWriteGate.ts`, `platformAdminGate.ts`, `adminApiGate.ts` (erweitert) |
| Routes | `public.routes.ts`, `tenant.routes.ts`, `setup.routes.ts`, `platformAdmin.routes.ts` |
| Auth/Zugriff | `authService.ts`, `stationAccessService.ts`, `app.ts`, `auth.routes.ts`, `stationTablets.routes.ts`, `tablet.routes.ts` |

### Frontend (Client)
| Bereich | Dateien |
|---------|---------|
| Marketing | `layouts/MarketingLayout.tsx`, `pages/marketing/MarketingPages.tsx` |
| Auth/Setup | `pages/auth/RegisterPage.tsx`, `pages/setup/SetupPage.tsx` |
| SaaS UI | `components/saas/TrialBanner.tsx`, `pages/terminal/TabletPairPage.tsx` |
| Routing | `routes/router.tsx`, `context/auth-context.tsx`, `pages/dashboard/DashboardPage.tsx`, `pages/auth/LoginPage.tsx` |
| Konfiguration | `.env.example`, `client/index.html` |

---

## 2. Tabellen (neu / erweitert)

**Neu:**
- `tenants` – Mandant, Abo, Trial, Setup, Zahlungsfelder
- `tenant_audit_logs` – plattformweite Audit-Einträge
- `password_reset_tokens`, `email_verification_tokens`, `employee_invites` (vorbereitet)
- `tablet_pairing_codes` – Tablet-Pairing

**Erweitert:**
- `users`: `tenant_id`, `platform_role`, `email_verified`
- `stations`: `tenant_id`

Demo-Tenant: `tenant-demo-rabbitstation` (bestehende Demo-Station zugeordnet).

---

## 3. Neue API-Routen

| Route | Beschreibung |
|-------|----------------|
| `POST /api/public/register` | Öffentliche Betreiber-Registrierung |
| `POST /api/public/forgot-password` | Passwort-Reset anfordern |
| `POST /api/public/reset-password` | Passwort mit Token setzen |
| `GET /api/public/plans` | Verfügbare Pläne |
| `POST /api/auth/forgot-password` | (Alias, authentifiziert optional) |
| `POST /api/auth/reset-password` | Passwort zurücksetzen |
| `POST /api/auth/logout` | Logout (Audit) |
| `GET /api/tenant/subscription` | Trial/Abo-Status für eingeloggten Tenant |
| `GET /api/setup/state` | Setup-Fortschritt |
| `POST /api/setup/shift-presets` | Schicht-Vorlagen (Standardarbeitszeiten) |
| `POST /api/setup/complete` | Setup abschließen |
| `POST /api/station-tablets/pairing-code` | Pairing-Code erzeugen |
| `POST /api/tablet/pair` | Tablet mit Code koppeln |
| `GET /api/admin/health` | Health (Plattform) |
| `GET /api/admin/tenants` | Tenant-Übersicht |
| `GET /api/admin/subscriptions/summary` | Abo-/Trial-Zusammenfassung |
| `GET /api/admin/logs` | Audit-Logs |
| `GET /api/admin/security/summary` | Sicherheits-KPIs |
| `GET /api/admin/backups/status` | Backup-Status (Stub) |
| `PATCH /api/admin/tenants/:tenantId/subscription` | Abo manuell setzen (Beta) |

`GET /api/health` liefert jetzt `rabbitstation-pro` / `RabbitStation Pro`.

---

## 4. Rollen

**Plattform:** `saas_owner`, `saas_superadmin` (über `users.platform_role`)

**Kunden:** `tenant_owner`, `station_admin`, `stationsleiter`, `teamleiter`, `mitarbeiter`, `tablet`, `steuerberater` (über `roles.role_key` + `user_station_access`)

Demo-Admin: `platform_role = saas_owner` für Control-Center-API-Tests.

---

## 5. Registrierung

1. Betreiber füllt `/registrieren` aus (Firma, Station, Name, E-Mail, Passwort, AGB/Datenschutz).
2. Backend legt an: **Tenant** (Trial 7 Tage), **erste Station**, **Owner-User** (`tenant_owner`), **Stationszugriff** mit Vollrechten, **Arbeitsbereiche**, **Feiertags-Seed**.
3. JWT-Login wird zurückgegeben → Weiterleitung zu `/setup`.
4. Willkommens-E-Mail als Stub/Log (SMTP über `.env` vorbereitet).

Mitarbeiter können sich **nicht** öffentlich registrieren (nur Einladung vorbereitet).

---

## 6. 7-Tage-Testphase

- Bei Registrierung: `subscription_status = trial`, `trial_start` = jetzt, `trial_end` = +7 Tage.
- Dashboard: `TrialBanner` mit Resttagen / Ablauf-Hinweis (`/auth/me` → `subscription.message`).
- Nach Ablauf: **GET** weiter möglich, **POST/PUT/PATCH/DELETE** → HTTP 402 (`trialWriteGate`).
- Manuelle Freischaltung: `PATCH /api/admin/tenants/:id/subscription` mit `subscriptionStatus: active`.

---

## 7. Tenant-Trennung

- `tenant_id` aus Session/JWT (`getUserTenantContext`), **nie** blind aus dem Frontend übernommen.
- `buildAccessContext` filtert Stationen nach `tenant_id` (außer `saas_owner`/`saas_superadmin` ohne Tenant-Filter).
- `user_station_access`-Join prüft `stations.tenant_id`.
- Neue Stationen/Mitarbeiter nur innerhalb des eigenen Tenants.

---

## 8. Control-Center-API (nur Haupt-App)

Unter `/api/admin/*`, geschützt durch `requirePlatformAdmin` (`saas_owner` / `saas_superadmin`).

Das **RabbitStation Control Center** wurde nicht angepasst; es kann diese Endpunkte später mit dem Admin-JWT der Haupt-App konsumieren.

---

## 9. Durchgeführte Tests

| Test | Ergebnis |
|------|----------|
| `npm run build` (Server + Client) | OK |
| `GET /api/health` | OK (`rabbitstation-pro`) |
| `POST /api/public/register` | OK – Tenant, Station, User, Trial 7 Tage |
| Duplikat-E-Mail | OK – Fehlermeldung |
| `POST /api/auth/login` (Demo-Admin) + `GET /api/admin/tenants` | OK – 2 Tenants sichtbar |
| Control Center UI | **Nicht geändert** (wie gefordert) |

---

## 10. Offen vor Vermarktung

- [ ] Echte SMTP-/Zahlungsintegration (Stripe/Lexoffice o.ä.)
- [ ] E-Mail-Verifizierung & Mitarbeiter-Einladung UI fertigstellen
- [ ] PostgreSQL-Produktionspfad (`DATABASE_URL`) statt SQLite
- [ ] Juristisch geprüfte AGB/Datenschutz/Impressum
- [ ] Vollständige tenant_id-Migration auf alle historischen Tabellen (employees etc. weiter über `station_id` auflösbar)
- [ ] Automatisierte Test-Suite (Jest/Playwright)
- [ ] Control Center an `/api/admin/*` anbinden (**Änderung nur im Control Center**, nicht in dieser Aufgabe)
- [ ] Dokument-Download: zusätzliche Sichtbarkeitsprüfung `admin_only` / `employee` pro Rolle verfeinern
- [ ] Abo-Seite `/account/billing` mit echtem Checkout

---

## Wichtige Hinweise

- **Bestehende Module** (Schichtplan, Zeiterfassung, Zuschläge, Feiertage, Lohnprüfung, Aufgaben, Dokumente, Tablet, Mitarbeiter-App) wurden nicht entfernt.
- **App-Einstieg:** Marketing unter `/`, Admin-App unter `/dashboard`, bisheriger Modus-Wähler unter `/start`.
- Für Funktionen, die **UI im Control Center** erfordern: *„Für diese Funktion wäre später eine Änderung am RabbitStation Control Center nötig.“*
