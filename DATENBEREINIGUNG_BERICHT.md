# Datenbereinigung – RabbitStation (lokale Kopie)

**Datum:** 18.05.2026  
**Projekt:** `C:\Users\rabbi\Documents\Projekt Webapp Leer RabbitStation`  
**Backup:** `C:\Users\rabbi\Documents\Backups\RabbitStation-vor-Datenbereinigung`

---

## 1. Was wurde bereinigt?

| Bereich | Aktion |
|---------|--------|
| **Haupt-Seed** (`server/src/db/seed.ts`) | Komplett auf neutrale Demo-Daten umgestellt (Station, 6 Mitarbeiter, Admin) |
| **Vertreter-Katalog** (`server/src/data/representativeSeedCatalog.ts`) | Echte Firmen/Personen entfernt → 3 Demo-Lieferanten |
| **StationGuide-Import** (`server/src/db/stationGuideScheduleData.ts`) | Echte Namen/Schichten entfernt → kleine Demo-Woche |
| **Stations-IDs** (`server/src/constants/stationIds.ts`) | Nur noch `demo-station-sued` |
| **Client-Station** (`client/src/data/station.ts`) | Demo Station Süd |
| **Terminal-Defaults** | Standard-`stationId` → `demo-station-sued` |
| **Datenbankdateien** | Alte/leere SQLite gelöscht; neue `server/data/demo.sqlite` mit Demo-Seed |
| **Uploads / Logs** | Vorhandene Ordner geleert bzw. nicht vorhanden |
| **`.env`** | Aus `.env.example` mit Platzhaltern (keine echten Secrets) |
| **Legacy-Migrationen** | Bodelshausen/Aral-Migrationen nur noch aktiv, wenn Alt-Station `aral-bodelshausen` in DB existiert |

**Nicht verändert (bewusst):** Berechnungslogik, Tabellenstruktur, API-Routen, Lohn-/Feiertags-/Zuschlags-Services, Schichtplan-, Zeiterfassungs-, TÜV-, Aufgaben- und Dokumenten-Module.

---

## 2. Geänderte Tabellen (Inhalt, nicht Struktur)

Bei **frischer** Demo-Datenbank (`server/data/demo.sqlite`):

| Tabelle | Inhalt nach Bereinigung |
|---------|-------------------------|
| `stations` | 1× Demo Station Süd |
| `work_areas` | Kasse, Shop, Bistro, Waschanlage, Büro, Außenbereich |
| `users` | Demo Admin + Laura Sommer (Stationsleitung) |
| `employees` | Max Becker, Laura Sommer, Tim Wagner, Nina Keller, Jonas Weber, Mia Fischer |
| `roles` | Betreiber, Schichtleiter (Struktur unverändert) |
| `shifts` / `time_entries` / `absences` / `tasks` | Demo-Beispieldaten |
| `representatives` | 3 Demo-Kontakte |
| Legacy `aral-bodelshausen` | **Nicht angelegt** in neuer Demo-DB |

---

## 3. Gelöschte / bereinigte Dateien & Ordner

| Pfad | Aktion |
|------|--------|
| `*.sqlite`, `*.db` im Projekt | Entfernt (werden lokal neu erzeugt) |
| `.env` (mit möglichen Secrets) | Entfernt → neu aus `.env.example` |
| `server/data/absence-uploads/` | Bereinigt / nicht vorhanden |
| `uploads/`, `logs/`, `backups/`, `exports/` | Bereinigt / nicht vorhanden |
| Echte PDFs/XLSX/CSV | Keine im Repo gefunden; `*.pdf` etc. in `.gitignore` |

**Demo-Platzhalter angelegt:**  
`client/public/demo-documents/*.txt` (4 Dateien, nur Textplatzhalter)

---

## 4. Angelegte Demo-Daten

**Station:** Demo Station Süd · Musterstraße 1 · 12345 Demostadt · info@demo-station.de  

**Login (lokal):**

| Feld | Wert |
|------|------|
| Benutzername | `admin` |
| E-Mail | `admin@demo-rabbitstation.local` |
| Passwort | `DemoRS2026!Local` (über `DEMO_ADMIN_PASSWORD` in `.env` änderbar) |

**Zuschlags-Preset (Demo-Station):** Sonntag/Feiertag aktiv (125 % / B-Feiertag 150 %), Nacht/Samstag deaktiviert – Logik in `DEMO_STATION_PAYROLL_SURCHARGE_RULES` erhalten.

---

## 5. Erhaltene Berechnungsgrundlagen

- Zuschlagsregel-Engine (`payrollSurchargeService`, `stationPayrollSurchargeRules`)
- Feiertags- und B-Feiertags-Logik
- Schichtplan vs. Zeiterfassung / Plausibilitätsprüfungen
- Monatsauswertung, Lohnprüfung, TÜV-Modul
- Aufgaben-, Dokumenten-, Tablet- und Rollenlogik
- Alle API-Routen und Frontend-Komponenten

---

## 6. Manuelle Prüfung empfohlen

1. **Import-Skripte** (`server/scripts/importMay2026BodelshausenShifts.ts` usw.) – enthalten noch historische Bodelshausen-Referenzen im Code, laufen aber nur bei Legacy-Station oder manuell.
2. **Dokumenten-Vorlagen** – Server meldet fehlende PDFs unter `server/data/document-templates/` (für Demo optional nachrüsten oder Modul mit Platzhaltern testen).
3. **Grep nach Restnamen** vor Git-Push: `Bodelshausen`, `Raselowski`, `rabbit.technik`, echte Telefonnummern.
4. **Client-Build:** `npm run build` im Monorepo.
5. **UI-Durchklick** mit Demo-Admin.

---

## 7. Gefundene Secrets

| Fundort | Befund | Aktion |
|---------|--------|--------|
| `seed.ts` (alt) | Demo-Passwörter `00066777`, `200520`, E-Mail `rabbit.technik@gmail.com` | **Entfernt** |
| `.env` | War im Projekt | **Gelöscht**, neu aus Example |
| Code | Keine SMTP/API-Keys im Repo gefunden | `.env` in `.gitignore` |

---

## 8. Echte Uploads

Keine echten Upload-Dateien im Projektbaum gefunden (Ordner leer oder nicht vorhanden).

---

## 9. Startfähigkeit

- **Datenbank:** Demo-Seed erfolgreich (6 Mitarbeiter, 1 Station, Demo-Users in SQLite verifiziert).
- **Server:** `npm run dev:server` – nach Migration-Fix (Reihenfolge `tankerkoenig_station_id`) startet die API.
- **Login:** Benutzer `admin` / Passwort `DemoRS2026!Local` (JWT in `.env` setzen).

**Startbefehle:**

```powershell
cd "C:\Users\rabbi\Documents\Projekt Webapp Leer RabbitStation"
npm install
npm run dev:server   # API :3001
npm run dev:client   # UI (Vite)
```

---

## 10. Risiken vor dem ersten Git-Push

| Risiko | Status |
|--------|--------|
| `.env` im Commit | Mitigiert durch `.gitignore` |
| SQLite mit Echtdaten | `*.sqlite` ignoriert; nur frische `demo.sqlite` lokal |
| Code mit Echtnamen | Reduziert; Rest in Legacy-Import-Dateien (nicht ausgeführt bei Demo-DB) |
| PDF/XLSX mit PII | In `.gitignore` |
| Push zu Neondeskaral | `pre-push`-Hook blockiert weiterhin |

**Vor Push prüfen:**

```powershell
git status
git grep -i "bodelshausen\|raselowski\|rabbit.technik" -- ':!DATENBEREINIGUNG_BERICHT.md'
```

Erst committen, wenn keine Treffer in produktionsrelevanten Dateien und keine `.env`/DB/Uploads staged sind.

---

## Technische Fixes während der Bereinigung

1. **Migration** `ensureFuelPriceCacheAndStationTankerkoenig`: Spalte wird vor UPDATE angelegt (Frischinstallation).
2. **Seed-Reihenfolge:** `INSERT OR IGNORE` für Station, Arbeitsbereiche, Rollen; User-Update für Passwort-Idempotenz.
3. **Demo-Zuschlagspolicy** für `demo-station-sued` in Migrationen ergänzt.

---

*Neondeskaral (GitHub-Ausgangsrepo) wurde nicht verändert. Arbeit nur in dieser lokalen Kopie.*
