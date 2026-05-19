# Plan-Grenzen & Feature-Gating — Abschlussbericht

**Datum:** 2026-05-19  
**Projekt:** RabbitStation Haupt-App  
**Control Center:** nicht geändert

---

## 1. Plan-Konfiguration

Zentral in `server/src/config/planConfig.ts`:

| Plan | Preis/Monat | Stationen | Mitarbeiter | Tablets |
|------|-------------|-----------|-------------|---------|
| `starter` | 19,90 € | 1 | 5 | 0 |
| `pro` | 39,90 € | 1 | 15 | 1 |
| `multi_station` | 69,90 € | 2 | 30 | 10 |

`server/src/constants/plans.ts` bleibt für IDs, Normalisierung und öffentliche `/api/public/plans`.

---

## 2. Features pro Plan

**Starter:** schedule, shift_templates, tasks, basic_documents, employee_app

**Pro (+ Starter):** protected_documents, time_tracking, time_approvals, payroll_audit, surcharges, holidays, absences, monthly_tuv_report, station_tablet, contacts, monthly_reports

**Multi-Station (+ Pro):** multi_station, advanced_roles, exports, priority_support, multiple_tablets

---

## 3. Backend-Helfer

`server/src/services/planFeatureService.ts`:

- `hasFeature(tenant, featureKey)`
- `requireFeature(tenant, featureKey)` → `PlanFeatureError` (403)
- `getPlanLimits(plan)`
- `canAddEmployee` / `canAddStation` / `canAddTablet`
- `buildTenantPlanEntitlements` für `/auth/me` und `/api/tenant/plan`

Fehler-JSON:

```json
{
  "ok": false,
  "error": "feature_not_available",
  "message": "Diese Funktion ist in Ihrem aktuellen Plan nicht enthalten.",
  "requiredPlan": "pro"
}
```

Limit:

```json
{
  "ok": false,
  "error": "plan_limit_reached",
  "message": "Das Mitarbeiterlimit Ihres Plans wurde erreicht.",
  "current": 5,
  "limit": 5,
  "upgradePlan": "pro"
}
```

---

## 4. Trial & Schreibschutz

- Trial nutzt den **gewählten Plan** (`tenant.plan` bei Registrierung).
- `subscriptionService` + `trialWriteGate`: nach Trial-Ablauf **GET erlaubt**, **POST/PUT/PATCH/DELETE** → 402.
- Statuszeile: z. B. `Testphase: Pro – noch 7 Tage` / `Plan: Pro aktiv` / `Testphase abgelaufen – Plan aktivieren`.

---

## 5. Geschützte API-Routen

**Middleware:** `planFeatureGate` in `adminApiGate` (nach Auth, vor `trialWriteGate`).

Pfad-Regeln u. a.:

- `/api/time-entries` → time_tracking
- `/api/reports/payroll*` → payroll_audit
- `/api/tuv-reports` → monthly_tuv_report
- `/api/station-tablets`, `/api/tablet` → station_tablet
- `/api/representatives` → contacts
- `/api/absences` → absences
- `/api/station-extra-holidays` → holidays

**Explizite Limits:**

- `POST /api/employees` → `canAddEmployee`
- `POST /api/stations` → `canAddStation` (+ `tenant_id` am Station-Insert)
- `POST /api/station-tablets` → `canAddTablet`

---

## 6. Frontend

- `planEntitlements` in `/auth/me`
- `PlanStatusBanner` im App-Layout (Trial/Plan/Limits)
- Sidebar blendet Pro-Menüpunkte aus (`planFeatures.ts` + `usePlanEntitlements`)
- `PlanUpgradeModal` für gesperrte Funktionen (Komponente bereit)

---

## 7. Manuelle Freischaltung (Beta)

`PATCH /api/admin/tenants/:tenantId/subscription`

Felder: `plan`, `subscription_status`, `trial_end`, `current_period_start`, `current_period_end`, `blocked_reason`

Nur Plattform-Admin-JWT oder Control-Center-Token (GET-Admin-API unverändert).

---

## 8. Datenbank

Felder in `tenants` (saasMigrations) vorhanden: plan, subscription_status, trial_start, trial_end, current_period_*, cancelled_at, payment_*, blocked_reason — **keine neue Migration nötig**.

---

## 9. Tests

| Test | Ergebnis |
|------|----------|
| `npm run test` (8 Tests) | ✅ |
| `npm run build` | ✅ |

Manuell nach Deploy: Registrierung pro Plan, Mitarbeiter-Limit, Lohnprüfung nur Pro, Admin-PATCH subscription.

---

## Wichtige Dateien

- `server/src/config/planConfig.ts`
- `server/src/services/planFeatureService.ts`
- `server/src/middleware/planFeatureGate.ts`
- `client/src/data/planFeatures.ts`
- `client/src/hooks/usePlanEntitlements.ts`
- `client/src/components/saas/PlanStatusBanner.tsx`
