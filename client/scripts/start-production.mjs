/**
 * Railway Production: Express-API + gebautes React-Frontend aus einem Prozess.
 * Ersetzt reinen Static-Server (serve-dist), damit /api/auth/login funktioniert.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(clientDir, '..')
const serverEntry = path.join(repoRoot, 'server', 'dist', 'index.js')
const clientDist = path.join(clientDir, 'dist')

if (!fs.existsSync(serverEntry)) {
  console.error('[start-production] Server nicht gebaut:', serverEntry)
  console.error('Build aus Repo-Root: npm run build')
  process.exit(1)
}
if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
  console.error('[start-production] client/dist fehlt. Zuerst: npm run build -w client')
  process.exit(1)
}

process.env.SERVE_CLIENT_STATIC = '1'
process.env.NODE_ENV = process.env.NODE_ENV || 'production'

console.info('[start-production] API + SPA aus', repoRoot)
await import(pathToFileURL(serverEntry).href)
