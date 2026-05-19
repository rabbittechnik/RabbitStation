# Onboarding & Setup-Assistent — Abschlussbericht

**Projekt:** RabbitStation Haupt-App (`Projekt Webapp Leer RabbitStation`)  
**Datum:** Mai 2026  
**Control Center:** nicht geändert (neue Felder später für Admin-APIs relevant)

---

## 1. Datenbank & Migrationen

- Neue Datei `server/src/db/onboardingMigrations.ts`, eingebunden in `runMigrations()` nach SaaS-Migrationen.
- **tenants:** `onboarding_tour_completed`
- **stations:** `monthly_tuv_report_enabled`, `shift_setup_completed`, `owner_as_employee_enabled`, `setup_owner_answered`
- **users:** `employee_id`
- **Tabelle** `shift_templates` (Typen: early, middle, late, night, office, custom)
- **Backfill:** Bestehende Stationen mit `standard_work_times_json` → Templates + `shift_setup_completed = 1`

## 2. Backend-API

| Endpoint | Zweck |
|----------|--------|
| `GET /api/setup/state` | Erweiterter Setup-Status inkl. Tour, TÜV, Schichten |
| `POST /api/setup/shift-templates` | Schichten speichern (transaktional) |
| `POST /api/setup/tuv-preference` | TÜV Ja/Nein |
| `POST /api/setup/first-employee` | Optional erster Mitarbeiter |
| `POST /api/setup/owner-as-employee` | Inhaber im Plan |
| `POST /api/setup/complete` | Abschluss (Pflichtschritte) |
| `POST /api/setup/tour-complete` / `tour-reset` | Guided Tour |
| `GET /api/stations/:id/shift-templates` | Templates für Dashboard/Plan |

- `authService` `/me`: `setupCompleted`, `onboardingTourCompleted`
- `tuvReportService.checkCurrentMonth`: bei `monthly_tuv_report_enabled !== 1` → `required: false`, `disabled: true`

## 3. Schichtlücken (Kernfix)

- `defaultShiftRequirements.ts`: Keine Soll-Lücken wenn `!setupCompleted` oder `!shiftSetupCompleted`
- Templates aus DB erzeugen Soll-Slots; Legacy nur bei `early`+`late` in JSON oder Demo-Station `aral-bodelshausen`
- Kein Kalender-Default mehr für neue Tenants ohne Konfiguration
- Dashboard, Schichtplan, Assistent nutzen `useShiftRequirementOptions`

## 4. Setup-Wizard (6 Schritte)

- `SetupPage.tsx`: Willkommen → Schichten → TÜV → Mitarbeiter → Owner → Fertig
- `RequireSetup.tsx`: Redirect zu `/setup` (Ausnahme: defer per Session, `/account/*`)
- `SetupIncompleteBanner.tsx` in `AppLayout`

## 5. Dashboard & TÜV

- `UnfilledShiftsCard`: Hinweis statt Demo-Lücken vor Setup
- `TuvReportDashboardReminder`: rendert nichts wenn TÜV deaktiviert

## 6. Guided Tour

- `OnboardingTour.tsx` (7 Stationen, ohne neue Dependency)
- `data-tour` an Sidebar-Links + Dashboard-`main`
- Start nach `setupCompleted` wenn Tour offen
- Einstellungen → „Einführung erneut starten“

## 7. Tests

- `server/src/services/onboardingSetup.test.ts` (Vitest): Validierung Schichten, JSON-Sync, TÜV-Gate

## 8. Manuelle Checkliste

- [ ] Neuer Tenant: Setup erscheint, keine Früh/Spät-Lücken vor Setup
- [ ] Nur gewählte Schichttypen erzeugen Lücken
- [ ] TÜV Ja → Erinnerung; Nein → keine Erinnerung
- [ ] Mitarbeiter anlegen / überspringen
- [ ] Owner Ja/Nein
- [ ] „Später fortfahren“ → Dashboard + Banner
- [ ] Tour einmalig nach Setup
- [ ] Demo-/Bestands-Tenant unverändert

## 9. Risiken / Hinweise

- Mittel-/Büro-/Nacht-Schichten im Plan: Abdeckung über erweiterte `RequiredShiftType` und Block-Mapping
- Control Center kann später `setup_completed` und Schichtanzahl aus Tenant-API lesen

## 10. Geänderte Kern-Dateien

| Bereich | Dateien |
|---------|---------|
| DB | `onboardingMigrations.ts`, `migrations.ts` |
| API | `setupService.ts`, `setup.routes.ts`, `shiftTemplateService.ts`, `tuvReportService.ts`, `authService.ts`, `stations.routes.ts` |
| Client | `SetupPage.tsx`, `RequireSetup.tsx`, `SetupIncompleteBanner.tsx`, `OnboardingTour.tsx`, `defaultShiftRequirements.ts`, `useShiftRequirementOptions.ts`, `AppLayout.tsx`, `router.tsx` |
