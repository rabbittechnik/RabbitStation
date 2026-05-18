import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8')) as { version: string }

/** Ersetzt __CACHE_BUILD_ID__ in dist/sw.js nach dem Kopieren aus public/. */
function injectSwCacheBuildId(): Plugin {
  return {
    name: 'inject-sw-cache-build-id',
    closeBundle() {
      const swPath = path.resolve(process.cwd(), 'dist', 'sw.js')
      if (!existsSync(swPath)) return
      let src = readFileSync(swPath, 'utf8')
      const buildId = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 22)
      src = src.replace(/__CACHE_BUILD_ID__/g, buildId)
      writeFileSync(swPath, src, 'utf8')
    },
  }
}

const rawPort = process.env.PORT
const port =
  rawPort !== undefined && rawPort !== '' && !Number.isNaN(Number(rawPort))
    ? Number(rawPort)
    : 5173

// https://vite.dev/config/
export default defineConfig({
  /** Außerhalb von node_modules, damit paralleles `npm ci` auf Railway nicht EBUSY auf .vite wirft. */
  cacheDir: path.resolve(process.cwd(), '.cache/vite'),
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME_ISO__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [react(), tailwindcss(), injectSwCacheBuildId()],
  server: {
    host: '0.0.0.0',
    port,
    // Ohne gesetztes PORT (lokal): anderen Port probieren; mit PORT (Replit): strikt
    strictPort: Boolean(rawPort),
    // Replit / andere Proxies mit wechselndem Host-Header
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port,
    strictPort: Boolean(rawPort),
    allowedHosts: true,
  },
})
