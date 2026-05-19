# Login / Railway API — Abschlussbericht (RabbitStation Haupt-App)

**Datum:** 2026-05-19  
**Betroffene URL:** `https://client-production-cc0f.up.railway.app`  
**Nicht geändert:** RabbitStation Control Center (`Projekt Verkauf WEBAPP`)

---

## 1. Welche Login-URL das Frontend vorher aufgerufen hat

In `client/src/services/api.ts` galt ohne gesetzte `VITE_API_URL`:

```text
http://localhost:3001/api/auth/login
```

Im Production-Build im Browser führt das zu einem Cross-Origin-/Netzwerkfehler → **`Failed to fetch`**.

---

## 2. Warum „Failed to fetch“ entstanden ist

**Zwei Ursachen gleichzeitig:**

| # | Ursache | Wirkung |
|---|---------|--------|
| A | `API_BASE` Fallback auf `localhost:3001` | Browser auf Railway ruft nicht erreichbaren Host auf |
| B | Railway-Start nur `serve-dist.mjs` (Static) | Kein Express-Backend; `POST /api/*` nicht möglich |

Der Static-Server lieferte für GET `/api/*` ggf. 503-JSON, für POST aber **405** — Login scheitert in jedem Fall ohne API-Prozess.

---

## 3. Welche API-Route jetzt verwendet wird

| Methode | Route | Antwort |
|---------|-------|---------|
| `POST` | `/api/auth/login` | JSON (`jsonOk` / `jsonErr`) |
| `GET` | `/api/health` | JSON Health-Check |

Frontend (Production ohne `VITE_API_URL`):

```text
/api/auth/login   (relativ, gleicher Host)
```

---

## 4. Änderungen im Code

| Datei | Änderung |
|-------|----------|
| `client/src/lib/apiBase.ts` | Production: `/api`; Dev: `127.0.0.1:3001` oder `VITE_API_URL` |
| `client/src/lib/authErrors.ts` | Deutsche Fehlermeldungen, kein „Failed to fetch“ in der UI |
| `client/src/context/auth-context.tsx` | Sicheres JSON-Parsing, `loginErrorMessage`, Console-Log bei Fehlern |
| `client/scripts/start-production.mjs` | Express + `client/dist` (ersetzt reinen Static-Start) |
| `client/railway.toml` | `cd .. && npm run build`, Healthcheck `/api/health` |
| `client/package.json` | `start` → `start-production.mjs` |
| `client/vite.config.ts` | Dev-Proxy `/api` → `:3001` |
| `server/src/app.ts` | Health mit `time`; CORS aus `CLIENT_ORIGIN` + `PUBLIC_APP_URL` |
| `.env.example` | Hinweise zu `VITE_API_URL`, `SERVE_CLIENT_STATIC` |

**Reihenfolge Express:** API-Routen → Static → SPA-`GET *` (nur Nicht-`/api`) → 404 JSON für unbekannte API-Pfade.

---

## 5. `/api/health` und `/api/auth/login`

Lokal mit `start-production.mjs` (PORT=3099) getestet:

- **GET `/api/health`** → `{"ok":true,"service":"RabbitStation Haupt-App","product":"...","time":"..."}`
- **POST `/api/auth/login`** (falsche Daten) → `401` + `{"ok":false,"error":"..."}` (JSON, kein HTML)

Nach **Railway-Redeploy** im Browser prüfen:

- `https://client-production-cc0f.up.railway.app/api/health`
- Login auf `/login`

---

## 6. Railway Environment Variables (Haupt-App)

| Variable | Pflicht | Zweck |
|----------|---------|--------|
| `NODE_ENV` | ja | `production` |
| `PORT` | Railway setzt | Server-Port |
| `JWT_SECRET` | ja | Auth-Tokens |
| `DATABASE_URL` | ja | SQLite/PG je nach Setup |
| `PUBLIC_APP_URL` | ja | `https://client-production-cc0f.up.railway.app` |
| `CLIENT_ORIGIN` | empfohlen | Gleiche URL für CORS (falls getrennt) |
| `SERVE_CLIENT_STATIC` | auto | Wird von `start-production.mjs` auf `1` gesetzt |
| `CONTROL_CENTER_API_TOKEN` | für CC-API | Nur wenn Control Center Admin-API nutzt |
| `SMTP_*` | optional | E-Mail |
| `VITE_API_URL` | **nicht nötig** | Nur bei separatem API-Host beim Build setzen |

**Build/Start (Service `client-production`):**

- Build: `cd .. && npm run build` (Client + Server)
- Start: `node scripts/start-production.mjs` (aus `client/`)
- Healthcheck: `/api/health`

**Wichtig:** Railway **Root Directory** muss das Monorepo enthalten (`client/` als Service-Root reicht, wenn `cd ..` zum Repo-Root führt). Sonst schlägt der Server-Build fehl.

---

## 7. Registrierung + Login

| Schritt | Status |
|---------|--------|
| Code-Fix + lokaler API-Test | ✅ |
| Voller E2E Registrierung → Login auf Railway | ⏳ Nach Redeploy durch Betreiber |

Empfohlener Test nach Deploy:

1. `/registrieren` — neuer Tenant
2. `/login` — gleiche E-Mail
3. Dashboard / Setup bei `setup_completed=false`
4. Keine „Failed to fetch“-Meldung

---

## 8. Control Center

Keine Dateien im Projekt **RabbitStation Control Center** geändert.

---

## 9. Fehlermeldungen Login (UI)

| Situation | Anzeige |
|-----------|---------|
| Netzwerk / Failed to fetch | Verbindung zur Haupt-App konnte nicht hergestellt werden. |
| API down / 503 | Die RabbitStation-API ist aktuell nicht erreichbar… |
| 401 | Benutzername oder Passwort ist falsch. |
| 403 | Dieser Zugang ist nicht berechtigt. |
| 500+ | Serverfehler beim Login… |

Technische Details nur in der Browser-Konsole (`console.error` / `console.warn`).
