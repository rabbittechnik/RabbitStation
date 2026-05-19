# Preis-Seite & Plan-Auswahl — Abschlussbericht

**Datum:** 2026-05-19  
**Projekt:** RabbitStation Haupt-App  
**Control Center:** nicht geändert

---

## 1. Geänderte Dateien

| Datei | Zweck |
|-------|--------|
| `client/src/pages/marketing/MarketingPricingPage.tsx` | Neue Preis-Seite mit 3 Paketen + FAQ |
| `client/src/data/pricingPlans.ts` | Plan-Daten, URLs, FAQ |
| `client/src/data/pricingPlans.test.ts` | Unit-Tests |
| `client/src/pages/marketing/MarketingPages.tsx` | Export der neuen Preis-Seite |
| `client/src/pages/auth/RegisterPage.tsx` | Plan aus URL + Auswahl im Formular |
| `server/src/constants/plans.ts` | Plan-IDs, Normalisierung, PUBLIC_PLANS |
| `server/src/constants/plans.test.ts` | Unit-Tests |
| `server/src/services/registrationService.ts` | `tenant.plan` via `normalizePlanId` |
| `server/src/routes/public.routes.ts` | `/api/public/plans` mit 3 Tarifen |
| `package.json` | `npm run test` für Plan-Tests |

---

## 2. Aufbau der Preis-Seite (`/preise`)

- **Hero:** Titel, Untertitel, Hinweis-Chips (7 Tage Test, kündbar, zzgl. MwSt., …)
- **3 Karten:** Starter (19,90 €), **Pro (39,90 €, Badge „Empfohlen“)**, Multi-Station (ab 69,90 €)
- **Feature-Listen:** ✓ enthalten / ✗ nicht enthalten (Starter)
- **CTAs:** Links zu `/registrieren?plan=…`
- **FAQ:** 5 Fragen, aufklappbar
- **Stil:** Dark Mode, Neon-Cyan, responsive Grid (1/3 Spalten)

---

## 3. Plan an die Registrierung

1. Preis-Button → `/registrieren?plan=starter|pro|multi_station`
2. `RegisterPage` liest `useSearchParams().get('plan')`
3. `normalizePlanId()` — unbekannt/leer → **`pro`**
4. Plan-Picker im Formular synchronisiert URL (`setSearchParams`)
5. POST `/api/public/register` mit `{ …form, plan: selectedPlan }`

---

## 4. Speicherort des Plans

In `registrationService.registerNewTenant()`:

```sql
INSERT INTO tenants (…, plan, subscription_status, trial_start, trial_end, …)
VALUES (…, ?, 'trial', ?, ?, …)
```

- `plan`: `starter` | `pro` | `multi_station` (Legacy `rabbitstation_pro` → `pro`)
- `subscription_status`: `trial`
- `trial_start` / `trial_end`: jetzt + 7 Tage

---

## 5. Tests

| Test | Ergebnis |
|------|----------|
| `npm run test` (5 Tests Plan/URLs) | ✅ |
| `npm run build` (Client + Server) | ✅ |
| Manuell /preise, Links, Registrierung | Nach Deploy prüfen |

**Manuelle Checkliste:**

- [ ] `/preise` — 3 Karten, Pro hervorgehoben, FAQ
- [ ] `/registrieren?plan=starter` — Starter vorausgewählt
- [ ] `/registrieren` — Standard Pro
- [ ] Neuer Tenant in DB: `plan` + `trial` korrekt

---

## Plan-IDs

| Paket | ID | Preis |
|-------|-----|-------|
| Starter | `starter` | 19,90 €/Monat |
| Pro | `pro` | 39,90 €/Monat |
| Multi-Station | `multi_station` | ab 69,90 €/Monat |
