import 'dotenv/config'
import { createApp } from './app.js'
import { initDatabase } from './db/database.js'

initDatabase()

const app = createApp()
const PORT = Number(process.env.PORT) || 3001
if (!process.env.PORT) {
  console.warn('[server] PORT nicht gesetzt — Fallback', PORT)
}
const HOST = process.env.HOST || '0.0.0.0'

const server = app.listen(PORT, HOST, () => {
  console.log(`Neonshift API http://${HOST}:${PORT}/api/health`)
})

function shutdown(signal: string) {
  console.log(`Received ${signal}, closing HTTP server…`)
  server.close((err) => {
    if (err) console.error('Error while closing server:', err)
    process.exit(err ? 1 : 0)
  })
  setTimeout(() => {
    console.warn('Shutdown timeout, exiting')
    process.exit(0)
  }, 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
