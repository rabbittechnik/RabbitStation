# Railway Redeploy (Haupt-App)

Wenn Railway ausgefallen war, landen Commits oft nur auf GitHub — der Server bleibt auf altem Stand.

## Schnell

```powershell
cd "C:\Users\rabbi\Documents\Projekt Webapp Leer RabbitStation"
git pull origin main
git commit --allow-empty -m "chore: Railway-Redeploy ausloesen"
git push origin main
```

Danach im Railway-Dashboard: **Deployments** → neuesten Build prüfen.

## Control Center

```powershell
cd "C:\Users\rabbi\Documents\Projekt Verkauf WEBAPP"
git pull origin main
git commit --allow-empty -m "chore: Railway-Redeploy ausloesen"
git push origin main
```

## Beide Repos immer gemeinsam

Nach Ausfällen **Haupt-App und Control Center** nacheinander pushen.
