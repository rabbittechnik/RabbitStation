/**
 * Statisches SPA aus ./dist – nur Node-Standardbibliothek (kein `serve`-CLI).
 * Zuverlässiger hinter Railway/Railpack-Proxies.
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(__dirname, '..', 'dist')

const rawPort = process.env.PORT
const port =
  rawPort != null && String(rawPort).trim() !== ''
    ? parseInt(String(rawPort), 10)
    : 3000
if (!Number.isFinite(port) || port <= 0 || port > 65535) {
  console.error('[static] Ungültige PORT-Umgebungsvariable:', rawPort)
  process.exit(1)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
}

function mimeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
}

/** Map URL path to absolute file under dist; null if path escapes dist */
function fileUnderDist(urlPathname) {
  const raw = decodeURIComponent(String(urlPathname).split('?')[0])
  const rel =
    raw === '/' || raw === '' ? 'index.html' : path.normalize(raw.replace(/^\//, ''))
  if (rel.includes('..')) return null
  const full = path.resolve(dist, rel)
  const distWithSep = dist.endsWith(path.sep) ? dist : dist + path.sep
  if (full !== dist && !full.startsWith(distWithSep)) return null
  return full
}

function sendFile(req, res, filePath) {
  const type = mimeFor(filePath)
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      sendSpaIndex(req, res)
      return
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': st.size,
        'Cache-Control': 'public, max-age=3600',
      })
      res.end()
      return
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=3600',
    })
    fs.createReadStream(filePath).pipe(res)
  })
}

function sendSpaIndex(req, res) {
  const indexHtml = path.join(dist, 'index.html')
  fs.stat(indexHtml, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('dist/index.html missing')
      return
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': st.size,
      })
      res.end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    fs.createReadStream(indexHtml).pipe(res)
  })
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end()
    return
  }

  const host = req.headers.host || 'localhost'
  let pathname = '/'
  try {
    pathname = new URL(req.url || '/', `http://${host}`).pathname
  } catch {
    res.writeHead(400).end()
    return
  }

  if (pathname.startsWith('/api/')) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(
      JSON.stringify({
        ok: false,
        error: 'api_not_on_frontend_host',
        message:
          'Diese URL liefert nur das Frontend. Bitte RABBITSTATION_API_URL auf den API-Server setzen (Express mit /api/health), nicht auf den Static-Client-Service.',
      }),
    )
    return
  }

  const candidate = fileUnderDist(pathname)
  if (!candidate) {
    res.writeHead(403).end()
    return
  }

  fs.stat(candidate, (err, st) => {
    if (!err && st.isFile()) {
      sendFile(req, res, candidate)
      return
    }
    if (!err && st.isDirectory()) {
      const idx = path.join(candidate, 'index.html')
      fs.stat(idx, (e2, st2) => {
        if (!e2 && st2.isFile()) {
          sendFile(req, res, idx)
        } else {
          sendSpaIndex(req, res)
        }
      })
      return
    }
    sendSpaIndex(req, res)
  })
})

server.on('error', (err) => {
  console.error('[static] listen error', err)
  process.exit(1)
})

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('[static] FEHLER: dist/index.html fehlt. Zuerst build ausführen.')
  console.error('[static] dist=', dist)
  process.exit(1)
}

server.listen(port, '0.0.0.0', () => {
  console.info(
    `[static] listening PORT=${rawPort ?? '(default 3000)'} bind=0.0.0.0:${port} dist=${dist}`
  )
})
