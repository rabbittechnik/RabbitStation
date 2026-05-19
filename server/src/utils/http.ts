import type { Response } from 'express'

export function jsonOk<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ ok: true, data })
}

export function jsonErr(res: Response, message: string, status = 400) {
  return res.status(status).json({ ok: false, error: message })
}

/** Admin-/Control-Center-API: einheitliches Fehler-JSON (niemals HTML). */
export function jsonErrAdmin(
  res: Response,
  error: string,
  message: string,
  status: number,
) {
  return res.status(status).json({ ok: false, error, message })
}
