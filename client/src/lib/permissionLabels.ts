import { ADMIN_PERMISSION_UI } from '../config/adminUserPermissionUi'

const LABEL_BY_KEY = new Map(ADMIN_PERMISSION_UI.map((p) => [p.key, p.label]))

/** Einzelne Permission in lesbaren Text (ohne rohen Code). */
export function formatPermission(permissionKey: string): string {
  return LABEL_BY_KEY.get(permissionKey) ?? 'Weitere Berechtigung'
}

export type PermissionGroup = {
  id: string
  label: string
}

const PERMISSION_GROUPS: { id: string; label: string; keys: string[] }[] = [
  {
    id: 'dashboard',
    label: 'Dashboard anzeigen',
    keys: ['dashboard.view'],
  },
  {
    id: 'schedule',
    label: 'Schichtplan ansehen und bearbeiten',
    keys: ['schedule.view', 'schedule.edit', 'schedule.create', 'schedule.delete', 'schedule.publish'],
  },
  {
    id: 'employees',
    label: 'Mitarbeiter verwalten',
    keys: [
      'employees.view',
      'employees.create',
      'employees.edit',
      'employees.deactivate',
      'employees.delete',
      'employees.qr',
      'employees.viewAppAccess',
      'employees.manageAppAccess',
    ],
  },
  {
    id: 'tasks',
    label: 'Aufgaben verwalten',
    keys: ['tasks.view', 'tasks.create', 'tasks.edit', 'tasks.control'],
  },
  {
    id: 'documents',
    label: 'Dokumente verwalten',
    keys: [
      'documents.view',
      'documents.upload',
      'documents.edit',
      'documents.archive',
      'documents.print',
      'documents.create_employee_from_document',
    ],
  },
  {
    id: 'reports',
    label: 'Auswertungen ansehen',
    keys: ['reports.view', 'reports.payroll', 'reports.export', 'payroll.view', 'payroll.export'],
  },
  {
    id: 'time',
    label: 'Zeiterfassung und Freigaben',
    keys: ['time.view', 'time.approve', 'time.correct', 'time.checklists'],
  },
  {
    id: 'settings',
    label: 'Einstellungen verwalten',
    keys: ['settings.view', 'settings.edit', 'access.manage', 'stations.manage', 'station.profile.edit'],
  },
  {
    id: 'tuv',
    label: 'TÜV-Berichte',
    keys: [
      'tuvReports.view',
      'tuvReports.create',
      'tuvReports.edit',
      'tuvReports.complete',
      'tuvReports.sign',
      'tuvReports.print',
      'tuvReports.manage',
    ],
  },
]

export function groupActivePermissions(permissions: Record<string, boolean>): PermissionGroup[] {
  const active = new Set(
    Object.entries(permissions)
      .filter(([, v]) => v)
      .map(([k]) => k),
  )
  const groups: PermissionGroup[] = []
  for (const g of PERMISSION_GROUPS) {
    if (g.keys.some((k) => active.has(k))) {
      groups.push({ id: g.id, label: g.label })
    }
  }
  return groups
}

export function countActivePermissions(permissions: Record<string, boolean>): number {
  return Object.values(permissions).filter(Boolean).length
}

/** Kurzprofil für Profilseite (ohne Code-Liste). */
export function summarizePermissionProfile(opts: {
  role?: string
  globalAdmin?: boolean
  permissions: Record<string, boolean>
  totalKeys?: number
}): string {
  if (opts.globalAdmin) return 'Vollzugriff (Plattform-Administration)'
  const role = (opts.role ?? '').toLowerCase()
  const total = opts.totalKeys ?? Object.keys(opts.permissions).length
  const active = countActivePermissions(opts.permissions)

  if (role.includes('owner') || role.includes('betreiber') || role === 'tenant_owner') {
    return 'Vollzugriff auf diese Station'
  }
  if (role.includes('teamleiter') || role.includes('team_lead') || role === 'station_team_lead') {
    return 'Teamleiter-Rechte'
  }
  if (role.includes('stationsleiter') || role.includes('station_manager')) {
    return 'Stationsleiter-Rechte'
  }
  if (role.includes('buero') || role.includes('lohn')) {
    return 'Büro- und Lohnrechte'
  }
  if (active >= Math.max(8, Math.floor(total * 0.85))) {
    return 'Vollzugriff auf diese Station'
  }
  if (active <= 3) {
    return 'Mitarbeiterzugang'
  }
  return 'Erweiterte Rechte'
}

export function roleDisplayLabel(role?: string, roleLabel?: string): string {
  if (roleLabel?.trim()) return roleLabel.trim()
  const r = (role ?? '').toLowerCase()
  if (r.includes('owner') || r === 'tenant_owner') return 'Betreiber / Owner'
  if (r.includes('teamleiter') || r.includes('team_lead')) return 'Teamleiter'
  if (r.includes('stationsleiter')) return 'Stationsleiter'
  if (r.includes('buero')) return 'Büro / Lohn'
  if (r.includes('admin')) return 'Administrator'
  return role || 'Benutzer'
}
