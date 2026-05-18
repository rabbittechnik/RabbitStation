import type { Database } from 'better-sqlite3'
import type { ShiftCloseChecklistKind } from '../constants/shiftCloseChecklistCatalog.js'
import { buildStructuredChecklistFromTabletConfirm } from '../utils/tabletShiftClosePayload.js'
import { getEmployeeByCard, getEmployeeRowInternal } from './employeeService.js'
import {
  clockCheckInByEmployeeId,
  clockCheckOutComplete,
  clockCheckOutStartByEmployeeId,
} from './clockService.js'
import { getRunningForEmployee, getTimeEntry, logCardEvent } from './timeTrackingService.js'
import { acknowledgeShiftWarning } from './employeeShiftWarningService.js'
import { ymdBerlinFromUtcMs } from '../utils/europeBerlinWallTime.js'
import { upsertBackshopNoticeAcknowledgement } from './backshopNoticeAckService.js'
import { resolveBackshopNoticeForStationAndDate, type BackshopItemSnapshot } from './backshopRoutineService.js'

function resolveEmployeeForTerminal(
  db: Database,
  stationId: string,
  body: { cardNumber?: string; employeeId?: string },
  actionType: 'check_in' | 'check_out',
): { ok: true; employeeId: string; cardForLog: string } | { ok: false; message: string } {
  const empId = String(body.employeeId ?? '').trim()
  if (empId) {
    const row = getEmployeeRowInternal(db, empId)
    if (!row || row.station_id !== stationId) {
      return { ok: false, message: 'Mitarbeiter nicht gefunden oder gehört nicht zu dieser Station.' }
    }
    return { ok: true, employeeId: empId, cardForLog: '' }
  }
  const card = String(body.cardNumber ?? '').trim()
  if (!card) {
    return {
      ok: false,
      message:
        actionType === 'check_in'
          ? 'Bitte einen Mitarbeiter auswählen oder die Kassenkartennummer eingeben.'
          : 'Bitte einen Mitarbeiter auswählen oder die Kassenkartennummer eingeben.',
    }
  }
  const emp = getEmployeeByCard(db, card, stationId)
  if (!emp) {
    logCardEvent(db, {
      cardNumber: card,
      stationId,
      actionType,
      result: 'unknown_card',
      message: 'Diese Kassenkartennummer wurde keinem aktiven Mitarbeiter dieser Station zugeordnet.',
    })
    return {
      ok: false,
      message: 'Diese Kassenkartennummer wurde keinem aktiven Mitarbeiter dieser Station zugeordnet.',
    }
  }
  return { ok: true, employeeId: emp.id, cardForLog: card }
}

export function terminalCheckIn(
  db: Database,
  body: { cardNumber?: string; employeeId?: string; stationId: string; force?: boolean; shiftId?: string },
) {
  const stationId = body.stationId || 'demo-station-sued'
  const force = Boolean(body.force)
  const shiftId = String(body.shiftId ?? '').trim() || undefined
  const res = resolveEmployeeForTerminal(db, stationId, body, 'check_in')
  if (!res.ok) {
    return {
      ok: false as const,
      result: 'unknown_card' as const,
      message: res.message,
    }
  }
  console.log('terminal check-in employee lookup', {
    stationId,
    employeeId: res.employeeId,
    viaCard: Boolean(res.cardForLog),
  })
  return clockCheckInByEmployeeId(db, {
    employeeId: res.employeeId,
    stationId,
    force,
    source: 'tablet',
    startedBy: 'Terminal',
    cardNumberForLog: res.cardForLog || undefined,
    shiftId,
  })
}

export function terminalCheckOutStart(
  db: Database,
  body: { cardNumber?: string; employeeId?: string; stationId: string },
) {
  const stationId = body.stationId || 'demo-station-sued'
  const res = resolveEmployeeForTerminal(db, stationId, body, 'check_out')
  if (!res.ok) {
    const card = String(body.cardNumber ?? '').trim()
    if (card) {
      logCardEvent(db, {
        cardNumber: card,
        stationId,
        actionType: 'check_out',
        result: 'unknown_card',
        message: res.message,
      })
    }
    return {
      ok: false as const,
      result: 'unknown_card' as const,
      message: res.message,
    }
  }
  return clockCheckOutStartByEmployeeId(db, {
    employeeId: res.employeeId,
    stationId,
    cardNumberForLog: res.cardForLog,
  })
}

export function terminalCheckOutComplete(
  db: Database,
  body: {
    timeEntryId: string
    checklist: Record<string, unknown>
    cardNumber?: string
    force?: boolean
    taskCloseDeclarations?: { taskId: string; outcome: 'done' | 'not_done'; notDoneReason?: string }[]
    taskCloseAccuracyConfirmed?: boolean
    earlyLeaveAck?: { reason: string; note?: string | null }
  },
) {
  const card = String(body.cardNumber ?? '').trim()
  const force = Boolean(body.force)
  const teBefore = getTimeEntry(db, body.timeEntryId)
  const out = clockCheckOutComplete(
    db,
    {
      timeEntryId: body.timeEntryId,
      checklist: body.checklist,
      endedBy: 'Terminal',
      force,
      taskCloseDeclarations: body.taskCloseDeclarations,
      taskCloseAccuracyConfirmed: body.taskCloseAccuracyConfirmed,
      checkoutSource: 'tablet',
      earlyLeaveAck: body.earlyLeaveAck,
    },
    card && teBefore
      ? { logCardOnSuccess: { cardNumber: card, stationId: teBefore.stationId, employeeId: teBefore.employeeId } }
      : undefined,
  )
  if (!out.ok) return out
  const te = getTimeEntry(db, body.timeEntryId)
  if (te && !card) {
    logCardEvent(db, {
      cardNumber: '',
      employeeId: te.employeeId,
      stationId: te.stationId,
      actionType: 'check_out',
      result: 'success',
      message: 'Ausgestempelt',
    })
  }
  return out
}

export function terminalAckBakingNotice(
  db: Database,
  body: {
    stationId: string
    timeEntryId: string
    remark?: string | null
    routineType?: string
    routineId?: string | null
    title?: string | null
    itemSnapshots?: BackshopItemSnapshot[]
    items?: string[]
  },
): { ok: true } | { ok: false; error: string } {
  const stationId = String(body.stationId ?? '').trim() || 'demo-station-sued'
  const timeEntryId = String(body.timeEntryId ?? '').trim()
  if (!timeEntryId) return { ok: false, error: 'Angaben unvollständig.' }
  const te = getTimeEntry(db, timeEntryId)
  if (!te || te.stationId !== stationId || te.status !== 'running') {
    return { ok: false, error: 'Kein passender laufender Eintrag.' }
  }
  const employeeId = te.employeeId
  const workYmd = ymdBerlinFromUtcMs(new Date(te.startAt).getTime())
  const resolved = resolveBackshopNoticeForStationAndDate(db, stationId, workYmd)
  const routineType = String(body.routineType ?? resolved.routineType)
  const routineId = body.routineId !== undefined ? (body.routineId as string | null) : resolved.routineId
  const titleSnapshot = body.title?.trim() || resolved.title
  const itemSnapshots =
    body.itemSnapshots && body.itemSnapshots.length > 0 ? body.itemSnapshots : resolved.itemSnapshots
  const displayLines = body.items && body.items.length > 0 ? body.items : resolved.displayLines
  upsertBackshopNoticeAcknowledgement(db, {
    stationId,
    employeeId,
    shiftId: te.shiftId ?? null,
    timeEntryId,
    routineId,
    routineType,
    titleSnapshot,
    itemSnapshots: itemSnapshots.length ? itemSnapshots : undefined,
    displayLines: displayLines.length ? displayLines : undefined,
    remark: body.remark ?? null,
  })
  return { ok: true }
}

export function terminalCheckOutFull(
  db: Database,
  body: {
    stationId: string
    employeeId: string
    timeEntryId?: string
    confirmedAllDone: boolean
    notDoneItems?: { itemKey: string; reason: string }[]
    cashDifference?: number
    force?: boolean
    earlyLeaveAck?: { reason: string; note?: string | null }
  },
) {
  const stationId = body.stationId || 'demo-station-sued'
  const employeeId = String(body.employeeId ?? '').trim()
  if (!employeeId) {
    return { ok: false as const, error: 'employeeId erforderlich' }
  }
  const empRow = getEmployeeRowInternal(db, employeeId)
  if (!empRow || empRow.station_id !== stationId) {
    return { ok: false as const, error: 'Mitarbeiter nicht gefunden oder gehört nicht zu dieser Station.' }
  }
  const running = getRunningForEmployee(db, employeeId, stationId)
  if (!running) {
    return {
      ok: false as const,
      result: 'not_checked_in' as const,
      message: 'Für diesen Mitarbeiter ist aktuell keine laufende Schicht vorhanden.',
    }
  }
  if (body.timeEntryId && body.timeEntryId !== running.id) {
    return { ok: false as const, error: 'Zeiteintrag passt nicht zur laufenden Schicht.' }
  }

  const startPayload = clockCheckOutStartByEmployeeId(db, {
    employeeId,
    stationId,
    cardNumberForLog: '',
  })
  if (!startPayload.ok) return startPayload

  const checklistType = startPayload.checklistType as ShiftCloseChecklistKind
  const cash =
    typeof body.cashDifference === 'number' && Number.isFinite(body.cashDifference) ? body.cashDifference : 0

  const built = buildStructuredChecklistFromTabletConfirm(
    db,
    stationId,
    checklistType,
    Boolean(body.confirmedAllDone),
    body.notDoneItems ?? [],
    cash,
  )
  if (!built.ok) {
    return { ok: false as const, error: built.error }
  }

  return terminalCheckOutComplete(db, {
    timeEntryId: running.id,
    checklist: built.checklist,
    force: Boolean(body.force),
    earlyLeaveAck: body.earlyLeaveAck,
  })
}

export function terminalAcknowledgeShiftWarning(
  db: Database,
  body: { cardNumber?: string; employeeId?: string; stationId: string; warningId: string },
) {
  const stationId = body.stationId || 'demo-station-sued'
  const warningId = String(body.warningId ?? '').trim()
  if (!warningId) {
    return { ok: false as const, message: 'warningId erforderlich' }
  }
  const res = resolveEmployeeForTerminal(db, stationId, body, 'check_in')
  if (!res.ok) {
    return { ok: false as const, message: res.message }
  }
  try {
    acknowledgeShiftWarning(db, warningId, res.employeeId)
    return { ok: true as const }
  } catch {
    return { ok: false as const, message: 'Hinweis konnte nicht bestätigt werden' }
  }
}
