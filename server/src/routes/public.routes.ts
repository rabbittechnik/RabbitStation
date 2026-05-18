import { Router } from 'express'
import { getDb } from '../db/database.js'
import { jsonErr, jsonOk } from '../utils/http.js'
import { registerNewTenant, createPasswordResetToken, resetPasswordWithToken } from '../services/registrationService.js'

export const publicRouter = Router()

publicRouter.post('/register', (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    const out = registerNewTenant(
      getDb(),
      {
        companyName: String(body.companyName ?? ''),
        stationName: String(body.stationName ?? ''),
        firstName: String(body.firstName ?? ''),
        lastName: String(body.lastName ?? ''),
        email: String(body.email ?? ''),
        password: String(body.password ?? ''),
        phone: body.phone != null ? String(body.phone) : undefined,
        address: body.address != null ? String(body.address) : undefined,
        plan: body.plan != null ? String(body.plan) : undefined,
        acceptTerms: Boolean(body.acceptTerms),
        acceptPrivacy: Boolean(body.acceptPrivacy),
      },
      req,
    )
    jsonOk(res, out)
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Registrierung fehlgeschlagen', 400)
  }
})

publicRouter.post('/forgot-password', (req, res) => {
  const email = String((req.body as { email?: string })?.email ?? '').trim()
  if (!email) {
    jsonErr(res, 'E-Mail erforderlich', 400)
    return
  }
  createPasswordResetToken(getDb(), email)
  jsonOk(res, { ok: true, message: 'Falls ein Konto existiert, wurde eine E-Mail vorbereitet.' })
})

publicRouter.post('/reset-password', (req, res) => {
  try {
    const body = req.body as { token?: string; password?: string }
    resetPasswordWithToken(getDb(), String(body.token ?? ''), String(body.password ?? ''))
    jsonOk(res, { ok: true })
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 400)
  }
})

publicRouter.get('/plans', (_req, res) => {
  jsonOk(res, {
    plans: [
      {
        id: 'rabbitstation_pro',
        name: 'RabbitStation Pro',
        description: 'Vollständige Stationsverwaltung für Tankstellenbetreiber',
        trialDays: 7,
        priceLabel: 'Auf Anfrage (Beta)',
      },
    ],
  })
})
