# Admin-API für Control Center — Abschlussbericht

**Projekt:** RabbitStation Haupt-App (`Projekt Webapp Leer RabbitStation`)  
**Control Center:** nicht geändert

---

## 1. Warum „Ungültige JSON-Antwort“?

**Hauptursache:** `RABBITSTATION_API_URL` zeigte auf den **Client-Static-Service** (`client-production-cc0f.up.railway.app`).

Dieser Service startet nur `client/scripts/serve-dist.mjs` (reines Vite-`dist`). Für unbekannte Pfade wie `/api/admin/health` wurde **`index.html`** (HTML) zurückgegeben — kein gültiges JSON.

**Zweitursache (behoben):** Selbst auf dem API-Server akzeptierte `/api/admin/*` bisher nur **JWT-Login-Token**, nicht `CONTROL_CENTER_API_TOKEN`. Das führte zu 401-JSON, nicht zu HTML — war aber für das Control Center trotzdem unbrauchbar.

---

## 2. Reparierte API-Routen

Alle unter `GET /api/admin/*`, Antwortformat `{ ok: true, data: ... }` bzw. Fehler `{ ok: false, error, message }`:

| Route | Inhalt |
|-------|--------|
| `/health` | Robuster Health-Block (`buildAdminHealthPayload`) |
| `/tenants` | Echte Tenants aus SQLite |
| `/subscriptions/summary` | Abo-Status-Aggregation |
| `/logs` | `tenant_audit_logs` |
| `/security/summary` | KPIs inkl. `activeSupportSessions: 0` |
| `/backups/status` | Konfigurationsstatus aus `BACKUP_PATH` |

`PATCH /tenants/:id/subscription` bleibt nur für **Plattform-Admin-JWT** (Control-Center-Token nur **GET**).

---

## 3. React-Fallback vor API?

**Auf dem Express-Server:** Nein. API-Routen werden in `app.ts` **vor** Static/SPA registriert. Unbekannte `/api/*` → JSON-404.

**Auf dem reinen Client-Service:** Ja — dort gab es keinen Express-API-Stack, nur SPA-Fallback → HTML.  
**Fix:** `serve-dist.mjs` antwortet auf `/api/*` mit **JSON 503** und klarer Meldung.

**Optional Produktion:** `attachClientStatic()` kann `client/dist` **nach** den API-Routen ausliefern (`SERVE_CLIENT_STATIC=1` oder `NODE_ENV=production`), damit eine URL API + Frontend vereint.

---

## 4. CONTROL_CENTER_API_TOKEN

- Neue Prüfung: `server/src/middleware/controlCenterApiAuth.ts`
- `adminApiGate`: gültiger Bearer = `process.env.CONTROL_CENTER_API_TOKEN` → `req.controlCenterApiAuth = true`
- `requirePlatformAdmin`: erlaubt Control-Center-Token für **GET**, JWT-Plattformadmin unverändert

---

## 5. Railway ENV (Haupt-App API-Service)

```env
CONTROL_CENTER_API_TOKEN=<gleicher Wert wie im Control Center>
PORT=<von Railway gesetzt>
NODE_ENV=production
JWT_SECRET=<stark>
SERVE_CLIENT_STATIC=1
```

Optional getrennt:

- **API-Service** (server): `RABBITSTATION_API_URL` im CC → diese URL  
- **Client-Service** (nur Static): nicht als API-URL verwenden

Im **Control Center**:

```env
RABBITSTATION_API_URL=https://<API-SERVER-URL ohne trailing slash>
CONTROL_CENTER_API_TOKEN=<identisch zur Haupt-App>
```

Wenn weiterhin die Client-URL genutzt wird: jetzt mindestens **JSON-Fehler** statt HTML (503 mit Hinweistext).

---

## 6. Tests

`server/src/routes/platformAdmin.api.test.ts`:

1. `/api/admin/health` ohne Token → JSON **401**  
2. mit korrektem Bearer → JSON **200**, `overallStatus` gesetzt  
3. `/api/admin/tenants` mit Token → JSON **200**  
4. unbekannte Admin-Route → JSON **404**  
5. Kein HTML in Antworten (Prüfung `!text.startsWith('<')`)

Ausführen (im Repo-Root, falls Vitest konfiguriert):  
`npx vitest run server/src/routes/platformAdmin.api.test.ts`

---

## 7. Geänderte Dateien

- `server/src/middleware/controlCenterApiAuth.ts` (neu)
- `server/src/middleware/adminApiGate.ts`
- `server/src/middleware/platformAdminGate.ts`
- `server/src/services/adminHealthService.ts` (neu)
- `server/src/routes/platformAdmin.routes.ts`
- `server/src/utils/http.ts` (`jsonErrAdmin`)
- `server/src/attachClientStatic.ts` (neu)
- `server/src/app.ts`
- `client/scripts/serve-dist.mjs`
- `.env.example`
- `server/src/routes/platformAdmin.api.test.ts` (neu)

---

## 8. Control Center unverändert

Keine Änderungen am Control Center. Nach Deploy der Haupt-App: CC mit **API-Server-URL** + gleichem Token testen.
