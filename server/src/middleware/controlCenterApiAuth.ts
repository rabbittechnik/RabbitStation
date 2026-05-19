import { timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'

/** Prüft Bearer-Token gegen CONTROL_CENTER_API_TOKEN (serverseitig, kein Logging). */
export function isControlCenterApiRequest(req: Request): boolean {
  const expected = process.env.CONTROL_CENTER_API_TOKEN?.trim()
  if (!expected) return false
  const h = req.headers.authorization
  const token = typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7).trim() : ''
  if (!token) return false
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
