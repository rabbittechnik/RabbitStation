import { Router, type Request, type Response } from 'express'
import { getDb } from '../db/database.js'
import { jsonErr, jsonOk } from '../utils/http.js'
import * as stationService from '../services/stationService.js'
import {
  getTabletWeekSchedule,
  getTabletTasksPayload,
  listEmployeesTabletClock,
  listTabletRunningPresence,
  listTabletShiftsRange,
  listTabletTimeEntriesWide,
  listTabletWorkAreas,
} from '../services/tabletDataService.js'
import { buildTabletCheckInSuggestions } from '../services/tabletCheckInSuggestionsService.js'
import { confirmTaskFromTablet } from '../services/taskService.js'
import type { StationTabletDeviceRow } from '../services/stationTabletDeviceService.js'
import { touchTabletByToken } from '../services/stationTabletDeviceService.js'
import { pairTabletWithCode } from '../services/tabletPairingService.js'

export const tabletRouter = Router()

tabletRouter.post('/pair', (req, res) => {
  try {
    const code = String((req.body as { code?: string })?.code ?? '').trim()
    if (!code) return jsonErr(res, 'Pairing-Code erforderlich', 400)
    const out = pairTabletWithCode(getDb(), code)
    jsonOk(res, out)
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Pairing fehlgeschlagen', 400)
  }
})

function stationRadioFromRow(st: Record<string, unknown>) {
  const enabled = st.radio_enabled == null || Number(st.radio_enabled) === 1
  const streamName =
    typeof st.radio_stream_name === 'string' && st.radio_stream_name.trim() ? st.radio_stream_name.trim() : null
  const streamUrl =
    typeof st.radio_stream_url === 'string' && st.radio_stream_url.trim() ? st.radio_stream_url.trim() : null
  const streamUrlFallback =
    typeof st.radio_stream_url_fallback === 'string' && st.radio_stream_url_fallback.trim()
      ? st.radio_stream_url_fallback.trim()
      : null
  let defaultVolume = 0.5
  const rv = st.radio_default_volume
  if (typeof rv === 'number' && !Number.isNaN(rv)) defaultVolume = rv
  else if (rv != null) defaultVolume = Number(rv) || 0.5
  defaultVolume = Math.min(1, Math.max(0, defaultVolume))
  const defaultPresetId =
    typeof st.radio_default_preset_id === 'string' && st.radio_default_preset_id.trim()
      ? st.radio_default_preset_id.trim()
      : null
  return { enabled, streamName, streamUrl, streamUrlFallback, defaultVolume, defaultPresetId }
}

tabletRouter.get('/session/:tabletToken', (req, res) => {
  try {
    const token = decodeURIComponent(String(req.params.tabletToken ?? '').trim())
    if (!token) return jsonErr(res, 'Kein Tablet-Zugang angegeben.', 400)
    const db = getDb()
    const raw = db
      .prepare(`SELECT * FROM station_tablet_devices WHERE tablet_token = ?`)
      .get(token) as StationTabletDeviceRow | undefined
    const invalidMsg = 'Dieser Stations-Tablet-Zugang ist ungültig oder wurde deaktiviert.'
    if (!raw) {
      return jsonErr(res, invalidMsg, 403)
    }
    if (raw.is_active !== 1) {
      return jsonErr(res, invalidMsg, 403)
    }
    const stRow = stationService.getStation(db, raw.station_id) as Record<string, unknown> | undefined
    if (!stRow) {
      return jsonErr(res, invalidMsg, 403)
    }
    const active = stRow.active == null || stRow.active === 1
    if (!active) {
      return jsonErr(res, invalidMsg, 403)
    }
    touchTabletByToken(db, token, req)
    const federal = String(stRow.federal_state ?? 'BW').toUpperCase().slice(0, 2)
    jsonOk(res, {
      station: { id: String(stRow.id), name: String(stRow.name ?? ''), federalState: federal },
      tablet: { id: raw.id, name: raw.name },
      radio: stationRadioFromRow(stRow),
    })
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 500)
  }
})

function resolveTabletStationId(req: Request, res: Response): string | null {
  const db = getDb()
  const tt = typeof req.query.tabletToken === 'string' ? req.query.tabletToken.trim() : ''
  if (tt) {
    const row = touchTabletByToken(db, tt, req)
    if (!row) {
      jsonErr(res, 'Tablet-Zugang ungültig oder deaktiviert', 403)
      return null
    }
    return row.station_id
  }
  const stationId = typeof req.query.stationId === 'string' ? req.query.stationId.trim() : ''
  if (!stationId) {
    jsonErr(res, 'stationId oder tabletToken erforderlich', 400)
    return null
  }
  const row = stationService.getStation(db, stationId)
  if (!row) {
    jsonErr(res, 'Station nicht gefunden', 404)
    return null
  }
  return stationId
}

tabletRouter.get('/shifts-range', (req, res) => {
  try {
    const sid = resolveTabletStationId(req, res)
    if (!sid) return
    const from = typeof req.query.from === 'string' ? req.query.from.trim() : ''
    const to = typeof req.query.to === 'string' ? req.query.to.trim() : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return jsonErr(res, 'from und to als YYYY-MM-DD erforderlich', 400)
    }
    jsonOk(res, listTabletShiftsRange(getDb(), sid, from, to))
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 500)
  }
})

tabletRouter.get('/employees', (req, res) => {
  try {
    const sid = resolveTabletStationId(req, res)
    if (!sid) return
    jsonOk(res, listEmployeesTabletClock(getDb(), sid))
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 500)
  }
})

tabletRouter.get('/check-in-suggestions', (req, res) => {
  try {
    const sid = resolveTabletStationId(req, res)
    if (!sid) return
    jsonOk(res, buildTabletCheckInSuggestions(getDb(), sid, new Date()))
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 500)
  }
})

tabletRouter.get('/time-entries', (req, res) => {
  try {
    const sid = resolveTabletStationId(req, res)
    if (!sid) return
    jsonOk(res, listTabletTimeEntriesWide(getDb(), sid))
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 500)
  }
})

tabletRouter.get('/running-presence', (req, res) => {
  try {
    const sid = resolveTabletStationId(req, res)
    if (!sid) return
    jsonOk(res, listTabletRunningPresence(getDb(), sid))
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 500)
  }
})

tabletRouter.get('/week-schedule', (req, res) => {
  try {
    const sid = resolveTabletStationId(req, res)
    if (!sid) return
    const weekStart = typeof req.query.weekStart === 'string' ? req.query.weekStart.trim() : ''
    jsonOk(res, getTabletWeekSchedule(getDb(), sid, weekStart))
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 500)
  }
})

tabletRouter.get('/work-areas', (req, res) => {
  try {
    const sid = resolveTabletStationId(req, res)
    if (!sid) return
    jsonOk(res, listTabletWorkAreas(getDb(), sid))
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 500)
  }
})

tabletRouter.get('/tasks-today', (req, res) => {
  try {
    const sid = resolveTabletStationId(req, res)
    if (!sid) return
    const employeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId.trim() : undefined
    jsonOk(res, getTabletTasksPayload(getDb(), sid, employeeId || null))
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 500)
  }
})

tabletRouter.post('/tasks/:taskId/complete', (req, res) => {
  try {
    const db = getDb()
    const tt = typeof req.query.tabletToken === 'string' ? req.query.tabletToken.trim() : ''
    const stationIdFromQuery = typeof req.query.stationId === 'string' ? req.query.stationId.trim() : ''
    let stationId = ''
    if (tt) {
      const row = touchTabletByToken(db, tt, req)
      if (!row) return jsonErr(res, 'Tablet-Zugang ungültig oder deaktiviert', 403)
      stationId = row.station_id
    } else if (stationIdFromQuery) {
      const row = stationService.getStation(db, stationIdFromQuery)
      if (!row) return jsonErr(res, 'Station nicht gefunden', 404)
      stationId = stationIdFromQuery
    } else {
      return jsonErr(res, 'stationId oder tabletToken erforderlich', 400)
    }
    const taskId = String(req.params.taskId ?? '').trim()
    if (!taskId) return jsonErr(res, 'taskId erforderlich', 400)
    const body = (req.body ?? {}) as { date?: string; employeeId?: string; displayName?: string; comment?: string }
    const date = String(body.date ?? '').trim()
    const employeeId = String(body.employeeId ?? '').trim()
    const displayName = String(body.displayName ?? '').trim()
    if (!date) return jsonErr(res, 'date erforderlich', 400)
    if (!employeeId) return jsonErr(res, 'employeeId erforderlich', 400)
    if (!displayName) return jsonErr(res, 'displayName erforderlich', 400)
    const logs = confirmTaskFromTablet(getDb(), taskId, {
      date,
      employeeId,
      displayName,
      comment: body.comment,
      stationId,
    })
    jsonOk(res, { logs })
  } catch (e) {
    jsonErr(res, e instanceof Error ? e.message : 'Fehler', 400)
  }
})
