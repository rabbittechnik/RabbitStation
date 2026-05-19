# RabbitStation Haupt-App – Deployment (Railway)

## Persistentes Volume `/data`

Am **server**-Service in Railway ein Volume mit Mount Path **`/data`** anlegen.

Ohne dieses Volume gehen SQLite-Datenbank, Uploads und Dokumente bei jedem Redeploy verloren.

## Empfohlene Umgebungsvariablen (Production)

```env
NODE_ENV=production

DATABASE_PATH=/data/rabbitstation.db

UPLOAD_DIR=/data/uploads
DOCUMENTS_DIR=/data/documents
BACKUP_DIR=/data/backups
LOG_DIR=/data/logs

DEMO_SEED_ENABLED=false
```

Optional (Legacy-Aliase werden weiterhin unterstützt):

- `BACKUP_PATH` → gleichwertig zu `BACKUP_DIR`
- `STATION_DOCUMENTS_DIR` → überschreibt den Station-Dokumenten-Stamm
- `SEED_DEMO=1` → Demo-Seeding (nur für Testumgebungen)

## Verhalten

| Situation | Verhalten |
|-----------|-----------|
| `/data/rabbitstation.db` existiert | Datenbank öffnen, Migrationen ausführen, **keine** Daten löschen |
| Datei fehlt | Neue DB unter `/data` anlegen |
| `DEMO_SEED_ENABLED=false` | Keine Demo-Tenants, keine Demo-User, kein Demo-Schedule-Import |
| `DEMO_SEED_ENABLED=true` | Demo-Daten nur bei **leerer** Datenbank (keine User/Employees) |

## Startup-Logs

Beim Start erscheinen u. a.:

```
RabbitStation database path: /data/rabbitstation.db
Persistent volume /data exists: yes
Persistent volume writable: yes
Database exists: yes
Migrations completed
Demo seed enabled: false
```

## Health-Check

`GET /api/admin/health` liefert u. a.:

- `database.path`, `database.exists`, `database.sizeBytes`, `database.persistentVolume`
- `storage.dataPath`, `storage.uploadDir`, `storage.documentsDir`, …

Warnung, wenn die DB in Production **nicht** unter `/data` liegt:

> Datenbank liegt nicht im persistenten Volume /data. Datenverlust bei Deploy möglich.

## Lokale Entwicklung

Ohne `DATABASE_PATH` wird standardmäßig `./data/rabbitstation.db` verwendet (relativ zum Arbeitsverzeichnis).

Demo-Seeding ist lokal standardmäßig aktiv, sofern `DEMO_SEED_ENABLED` nicht auf `false` gesetzt ist.
