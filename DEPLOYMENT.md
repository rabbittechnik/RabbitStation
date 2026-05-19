# RabbitStation Haupt-App – Deployment (Railway)

## Persistentes Volume `/data`

Am **server**-Service in Railway ein Volume mit Mount Path **`/data`** anlegen.

Ohne dieses Volume gehen SQLite-Datenbank, Uploads und Dokumente bei jedem Redeploy verloren.

In `server/railway.toml` ist `requiredMountPath = "/data"` gesetzt — Deployments ohne Volume schlagen fehl.

**Häufiger Fehler:** Volume existiert (`server-volume`), aber Mount Path ist nicht `/data` oder zeigt auf einen anderen Ordner. Dann schreibt die App in ein **ephemeres** Verzeichnis und bei jedem Git-Push/Deploy sind alle Registrierungen weg.

Prüfen in Railway → Server → Volume → **Mount Path = `/data`** (exakt).

## Empfohlene Umgebungsvariablen (Production)

```env
NODE_ENV=production

DATABASE_PATH=/data/rabbitstation.db

UPLOAD_DIR=/data/uploads
DOCUMENTS_DIR=/data/documents
BACKUP_DIR=/data/backups
LOG_DIR=/data/logs

DEMO_SEED_ENABLED=false

# Backup (optional)
BACKUP_ENABLED=true
BACKUP_SCHEDULE_CRON=0 3 * * *
BACKUP_RETENTION_DAYS=30

# Remote-Backup S3-kompatibel (optional, z. B. Cloudflare R2)
# BACKUP_REMOTE_ENABLED=true
# BACKUP_REMOTE_PROVIDER=s3
# BACKUP_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
# BACKUP_S3_BUCKET=rabbitstation-backups
# BACKUP_S3_REGION=auto
# BACKUP_S3_ACCESS_KEY_ID=
# BACKUP_S3_SECRET_ACCESS_KEY=
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

## Backup-API (Plattform-Admin)

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| `POST` | `/api/admin/backups/create` | Manuelles Backup (ZIP) |
| `GET` | `/api/admin/backups/status` | Status des letzten Backups |
| `GET` | `/api/admin/backups` | Liste lokaler Backups |
| `GET` | `/api/admin/backups/:fileName/download` | ZIP herunterladen |

Zugriff: `saas_owner`, `saas_superadmin` oder `CONTROL_CENTER_API_TOKEN`.

Backup-Dateien: `rabbitstation-backup-YYYY-MM-DD-HHMM.zip` in `BACKUP_DIR` (Standard `/data/backups`).

Inhalt: `rabbitstation.db`, optional `uploads/`, `documents/`, `backup-manifest.json`.

## Health-Check

`GET /api/admin/health` liefert u. a.:

- `database.path`, `database.exists`, `database.sizeBytes`, `database.persistentVolume`
- `backups.status`, `backups.lastBackupAt`, `backups.localBackupsCount`, `backups.remoteEnabled`
- `storage.dataPath`, `storage.backupDirWritable`, `storage.databasePath`, …

Warnung, wenn die DB in Production **nicht** unter `/data` liegt:

> Datenbank liegt nicht im persistenten Volume /data. Datenverlust bei Deploy möglich.

## Lokale Entwicklung

Ohne `DATABASE_PATH` wird standardmäßig `./data/rabbitstation.db` verwendet (relativ zum Arbeitsverzeichnis).

Demo-Seeding ist lokal standardmäßig aktiv, sofern `DEMO_SEED_ENABLED` nicht auf `false` gesetzt ist.
