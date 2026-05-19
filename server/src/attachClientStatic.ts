import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Express } from 'express'
import express from 'express'

const serverDir = path.dirname(fileURLToPath(import.meta.url))

/** Optional: React-Build aus client/dist ausliefern (API bleibt zuerst registriert). */
export function attachClientStatic(app: Express) {
  const clientDist = path.resolve(serverDir, '../../client/dist')
  if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
    return false
  }

  app.use(
    express.static(clientDist, {
      index: false,
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    }),
  )

  app.get('*', (req, res, next) => {
    const p = req.path ?? ''
    if (p.startsWith('/api')) {
      return next()
    }
    res.sendFile(path.join(clientDist, 'index.html'))
  })

  return true
}
