import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Building2,
  Home,
  Layers,
  LayoutGrid,
  MessageSquare,
  Settings,
  Shield,
  UserCircle,
} from 'lucide-react'

export type NavLeaf = {
  to: string
  label: string
  approverOnly?: boolean
  globalAdminOnly?: boolean
  /** Sichtbar, wenn mindestens eine dieser Berechtigungen gesetzt ist (Station-Kontext). */
  anyPermission?: string[]
  dataTour?: string
}

export type NavGroup = {
  type: 'group'
  id: string
  label: string
  icon: LucideIcon
  children: NavLeaf[]
}

export type NavSingle = {
  type: 'single'
  to: string
  label: string
  icon: LucideIcon
  globalAdminOnly?: boolean
  /** Sichtbar, wenn Global-Admin oder mindestens eine Zuweisung mit einer dieser Berechtigungen. */
  anyStationPermission?: string[]
}

export type NavEntry = NavGroup | NavSingle

export const navEntries: NavEntry[] = [
  { type: 'single', to: '/dashboard', label: 'Startseite', icon: Home },
  {
    type: 'group',
    id: 'kommunikation',
    label: 'Kommunikation',
    icon: MessageSquare,
    children: [
      { to: '/communication/chat-groups', label: 'Chat-Gruppen' },
      { to: '/communication/announcements', label: 'Mitteilungen' },
    ],
  },
  {
    type: 'group',
    id: 'organisation',
    label: 'Organisation',
    icon: LayoutGrid,
    children: [
      { to: '/schedule', label: 'Schichtplan', dataTour: 'schedule' },
      { to: '/absences', label: 'Abwesenheiten' },
      { to: '/tasks', label: 'Aufgaben', dataTour: 'tasks' },
      { to: '/lists', label: 'Listen' },
      { to: '/documents', label: 'Dokumente', anyPermission: ['documents.view'], dataTour: 'documents' },
      { to: '/calendar', label: 'Terminkalender' },
      { to: '/contacts', label: 'Kontakte', dataTour: 'contacts' },
      {
        to: '/organisation/representatives',
        label: 'Telefonnummern / Vertreter',
        anyPermission: ['representatives.view', 'representatives.edit'],
      },
      { to: '/counters', label: 'Zählerstände' },
    ],
  },
  {
    type: 'group',
    id: 'verwaltung',
    label: 'Verwaltung',
    icon: Shield,
    children: [
      { to: '/employees', label: 'Mitarbeiter' },
      { to: '/work-areas', label: 'Arbeitsbereiche' },
      { to: '/vacation-blocks', label: 'Urlaubssperren' },
      { to: '/holidays', label: 'Feiertage' },
      {
        to: '/tuv-berichte',
        label: 'Monatlicher TÜV-Bericht',
        anyPermission: ['tuvReports.view', 'tuvReports.create'],
      },
    ],
  },
  {
    type: 'group',
    id: 'auswertungen',
    label: 'Auswertungen',
    icon: BarChart3,
    children: [
      {
        to: '/reports/payroll-time',
        label: 'Lohnabrechnung (Zeiterfassung)',
        anyPermission: ['payroll.view', 'reports.payroll'],
        dataTour: 'payroll',
      },
      { to: '/zeiterfassung/freigaben', label: 'Zeitfreigaben', approverOnly: true },
      {
        to: '/reports/payroll-schedule',
        label: 'Lohnabrechnung (Schichtplan)',
        anyPermission: ['payroll.view', 'reports.payroll'],
      },
      {
        to: '/reports/payroll-summary',
        label: 'Lohnabrechnung Zusammenfassung',
        anyPermission: ['payroll.view', 'reports.payroll'],
      },
      {
        to: '/reports/payroll-audit',
        label: 'Lohnprüfung',
        anyPermission: ['payroll.view', 'reports.payroll'],
      },
      { to: '/reports/tasks', label: 'Aufgaben' },
      {
        to: '/reports/absences',
        label: 'Abwesenheiten',
        anyPermission: ['reports.view', 'absences.view', 'payroll.view'],
      },
    ],
  },
  {
    type: 'group',
    id: 'einstellungen',
    label: 'Einstellungen',
    icon: Settings,
    children: [
      { to: '/settings/general', label: 'Allgemein' },
      { to: '/settings/email', label: 'E-Mail-Benachrichtigungen' },
      {
        to: '/settings/minimum-wage',
        label: 'Mindestlohn',
        anyPermission: ['payroll.view', 'settings.view'],
      },
      { to: '/settings/access', label: 'Zugriffsberechtigungen', globalAdminOnly: true },
    ],
  },
  {
    type: 'group',
    id: 'mein-konto',
    label: 'Mein Konto',
    icon: UserCircle,
    children: [
      { to: '/account', label: 'Profil' },
      { to: '/account/devices', label: 'Geräte & Apps', dataTour: 'tablet' },
      { to: '/account/users', label: 'Benutzer verwalten', globalAdminOnly: true },
      { to: '/account/billing', label: 'Rechnungen' },
      { to: '/account/billing-documents', label: 'Abrechnungsunterlagen' },
    ],
  },
  {
    type: 'single',
    to: '/stations',
    label: 'Stationen verwalten',
    icon: Building2,
    anyStationPermission: ['stations.manage', 'station.profile.edit'],
  },
  {
    type: 'single',
    to: '/modules',
    label: 'Module verwalten',
    icon: Layers,
  },
]
