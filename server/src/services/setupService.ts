import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { nowIso } from '../utils/timestamps.js'
import { getUserTenantContext, getTenantById } from './tenantService.js'
import { assertTenantCanWrite } from './subscriptionService.js'
import { type ShiftTemplateInput, listShiftTemplates, replaceShiftTemplates } from './shiftTemplateService.js'
import { createEmployee } from './employeeService.js'
import { parseGermanState, type GermanState } from '../data/germanFederalStates.js'
import {
  seedStationHolidaysForYears,
  updateStationHolidaySettings,
} from './stationExtraHolidayService.js'
import type { StationHolidayOptions } from '../data/stationHolidayDefaults.js'

export type SetupWizardStep = 'welcome' | 'federal' | 'shifts' | 'tuv' | 'employee' | 'owner' | 'finish'

export type SetupState = {
  setupCompleted: boolean
  onboardingTourCompleted: boolean
  shiftSetupCompleted: boolean
  monthlyTuvReportEnabled: boolean | null
  ownerAsEmployeeEnabled: boolean
  setupOwnerAnswered: boolean
  selectedShiftTypes: string[]
  stationId: string | null
  wizardStep: SetupWizardStep
  canComplete: boolean
  employeeCount: number
  federalStateSetupCompleted: boolean
  steps: {
    federal: boolean
    shifts: boolean
    tuv: boolean
    owner: boolean
    complete: boolean
  }
}

type StationOnboardingRow = {
  id: string
  shift_setup_completed: number
  monthly_tuv_report_enabled: number | null
  owner_as_employee_enabled: number
  setup_owner_answered: number
  federal_state_setup_completed?: number
}

function primaryStation(db: Database, tenantId: string): StationOnboardingRow | undefined {
  return db
    .prepare(
      `SELECT id, shift_setup_completed, monthly_tuv_report_enabled,
              owner_as_employee_enabled, setup_owner_answered,
              COALESCE(federal_state_setup_completed, 1) as federal_state_setup_completed
       FROM stations WHERE tenant_id = ? ORDER BY created_at LIMIT 1`,
    )
    .get(tenantId) as StationOnboardingRow | undefined
}

function resolveWizardStep(
  setupCompleted: boolean,
  st: StationOnboardingRow | undefined,
): SetupWizardStep {
  if (setupCompleted) return 'finish'
  if (!st) return 'welcome'
  if ((st.federal_state_setup_completed ?? 1) !== 1) return 'federal'
  if (st.shift_setup_completed !== 1) return 'shifts'
  if (st.monthly_tuv_report_enabled == null) return 'tuv'
  if (st.setup_owner_answered !== 1) return 'owner'
  return 'finish'
}

export function getSetupState(db: Database, userId: string): SetupState {
  const ctx = getUserTenantContext(db, userId)
  if (!ctx?.tenantId) {
    return {
      setupCompleted: true,
      onboardingTourCompleted: true,
      shiftSetupCompleted: true,
      monthlyTuvReportEnabled: null,
      ownerAsEmployeeEnabled: false,
      setupOwnerAnswered: true,
      selectedShiftTypes: [],
      stationId: null,
      wizardStep: 'finish',
      canComplete: true,
      employeeCount: 0,
      federalStateSetupCompleted: true,
      steps: { federal: true, shifts: true, tuv: true, owner: true, complete: true },
    }
  }
  const tenant = getTenantById(db, ctx.tenantId)
  const st = primaryStation(db, ctx.tenantId)
  const stationId = st?.id ?? null
  const templates = stationId ? listShiftTemplates(db, stationId, ctx.tenantId) : []
  const empCount =
    stationId ?
      (db.prepare(`SELECT COUNT(*) as c FROM employees WHERE station_id = ? AND deleted_at IS NULL`).get(stationId) as {
        c: number
      }).c
    : 0

  const setupCompleted = tenant?.setup_completed === 1
  const onboardingTourCompleted = (tenant as { onboarding_tour_completed?: number } | undefined)?.onboarding_tour_completed === 1
  const shiftSetupCompleted = st?.shift_setup_completed === 1
  const tuvAnswered = st != null && st.monthly_tuv_report_enabled != null
  const ownerAnswered = st?.setup_owner_answered === 1
  const federalStateSetupCompleted = (st?.federal_state_setup_completed ?? 1) === 1
  const canComplete = Boolean(federalStateSetupCompleted && shiftSetupCompleted && tuvAnswered && ownerAnswered)

  return {
    setupCompleted,
    onboardingTourCompleted,
    shiftSetupCompleted,
    monthlyTuvReportEnabled:
      st?.monthly_tuv_report_enabled == null ? null : st.monthly_tuv_report_enabled === 1,
    ownerAsEmployeeEnabled: st?.owner_as_employee_enabled === 1,
    setupOwnerAnswered: ownerAnswered,
    selectedShiftTypes: templates.map((t) => t.type),
    stationId,
    wizardStep: resolveWizardStep(setupCompleted, st),
    canComplete,
    employeeCount: empCount,
    federalStateSetupCompleted,
    steps: {
      federal: federalStateSetupCompleted,
      shifts: shiftSetupCompleted,
      tuv: tuvAnswered,
      owner: ownerAnswered,
      complete: setupCompleted,
    },
  }
}

export function saveSetupFederalState(
  db: Database,
  userId: string,
  stationId: string,
  federalState: GermanState,
  options: StationHolidayOptions = {},
) {
  const ctx = getUserTenantContext(db, userId)
  if (!ctx?.tenantId) throw new Error('Kein Tenant')
  assertTenantCanWrite(db, ctx.tenantId)
  const state = parseGermanState(federalState)
  updateStationHolidaySettings(db, stationId, { federalState: state, options })
  const y = new Date().getFullYear()
  seedStationHolidaysForYears(db, stationId, [y, y + 1], state)
  const ts = nowIso()
  db.prepare(
    `UPDATE stations SET federal_state_setup_completed = 1, updated_at = ? WHERE id = ? AND tenant_id = ?`,
  ).run(ts, stationId, ctx.tenantId)
}

export function saveSetupShiftTemplates(
  db: Database,
  userId: string,
  stationId: string,
  templates: ShiftTemplateInput[],
) {
  const ctx = getUserTenantContext(db, userId)
  if (!ctx?.tenantId) throw new Error('Kein Tenant')
  assertTenantCanWrite(db, ctx.tenantId)
  return replaceShiftTemplates(db, ctx.tenantId, stationId, templates)
}

export function saveTuvPreference(db: Database, userId: string, stationId: string, enabled: boolean) {
  const ctx = getUserTenantContext(db, userId)
  if (!ctx?.tenantId) throw new Error('Kein Tenant')
  assertTenantCanWrite(db, ctx.tenantId)
  const ts = nowIso()
  const n = db
    .prepare(
      `UPDATE stations SET monthly_tuv_report_enabled = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`,
    )
    .run(enabled ? 1 : 0, ts, stationId, ctx.tenantId).changes
  if (n === 0) throw new Error('Station nicht gefunden')
}

export function saveOwnerAsEmployee(db: Database, userId: string, stationId: string, enabled: boolean) {
  const ctx = getUserTenantContext(db, userId)
  if (!ctx?.tenantId) throw new Error('Kein Tenant')
  assertTenantCanWrite(db, ctx.tenantId)
  const ts = nowIso()
  const user = db
    .prepare(`SELECT id, display_name, email, phone, employee_id FROM users WHERE id = ?`)
    .get(userId) as
    | { id: string; display_name: string | null; email: string | null; phone: string | null; employee_id: string | null }
    | undefined
  if (!user) throw new Error('Benutzer nicht gefunden')

  db.prepare(
    `UPDATE stations SET owner_as_employee_enabled = ?, setup_owner_answered = 1, updated_at = ?
     WHERE id = ? AND tenant_id = ?`,
  ).run(enabled ? 1 : 0, ts, stationId, ctx.tenantId)

  if (enabled) {
    if (!user.employee_id?.trim()) {
      const parts = String(user.display_name ?? 'Betreiber').trim().split(/\s+/)
      const first = parts[0] ?? 'Betreiber'
      const last = parts.slice(1).join(' ') || 'Inhaber'
      const empId = randomUUID()
      createEmployee(
        db,
        {
          id: empId,
          firstName: first,
          lastName: last,
          displayName: user.display_name ?? `${first} ${last}`,
          email: user.email,
          phone: user.phone,
          employmentRole: 'Chef / Betreiber',
          role: 'Chef / Betreiber',
          employmentType: 'vollzeit',
          workAreaIds: ['kasse'],
        },
        stationId,
      )
      db.prepare(`UPDATE users SET employee_id = ?, updated_at = ? WHERE id = ?`).run(empId, ts, userId)
    }
  }
}

export function createSetupFirstEmployee(
  db: Database,
  userId: string,
  stationId: string,
  body: Record<string, unknown>,
) {
  const ctx = getUserTenantContext(db, userId)
  if (!ctx?.tenantId) throw new Error('Kein Tenant')
  assertTenantCanWrite(db, ctx.tenantId)
  return createEmployee(db, body, stationId)
}

export function completeSetup(db: Database, userId: string) {
  const ctx = getUserTenantContext(db, userId)
  if (!ctx?.tenantId) throw new Error('Kein Tenant')
  assertTenantCanWrite(db, ctx.tenantId)
  const state = getSetupState(db, userId)
  if (!state.canComplete) {
    throw new Error('Pflichtschritte noch nicht abgeschlossen (Schichten, TÜV-Entscheidung, Inhaber-Frage)')
  }
  const ts = nowIso()
  db.prepare(`UPDATE tenants SET setup_completed = 1, updated_at = ? WHERE id = ?`).run(ts, ctx.tenantId)
}

export function completeOnboardingTour(db: Database, userId: string) {
  const ctx = getUserTenantContext(db, userId)
  if (!ctx?.tenantId) throw new Error('Kein Tenant')
  const ts = nowIso()
  db.prepare(`UPDATE tenants SET onboarding_tour_completed = 1, updated_at = ? WHERE id = ?`).run(ts, ctx.tenantId)
}

export function resetOnboardingTour(db: Database, userId: string) {
  const ctx = getUserTenantContext(db, userId)
  if (!ctx?.tenantId) throw new Error('Kein Tenant')
  const ts = nowIso()
  db.prepare(`UPDATE tenants SET onboarding_tour_completed = 0, updated_at = ? WHERE id = ?`).run(ts, ctx.tenantId)
}

/** @deprecated Delegiert auf shift_templates */
export function applySetupShiftPresets(db: Database, userId: string, stationId: string) {
  const ctx = getUserTenantContext(db, userId)
  if (!ctx?.tenantId) throw new Error('Kein Tenant')
  assertTenantCanWrite(db, ctx.tenantId)
  return replaceShiftTemplates(db, ctx.tenantId, stationId, [
    { type: 'early', startTime: '06:00', endTime: '14:00' },
    { type: 'late', startTime: '14:00', endTime: '22:00' },
    { type: 'night', startTime: '22:00', endTime: '06:00' },
  ])
}
