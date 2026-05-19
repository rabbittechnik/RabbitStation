import {
  CalendarDays,
  ClipboardList,
  Clock,
  FileText,
  Shield,
  Building2,
  Lock,
  TrendingUp,
  Smartphone,
  Tablet,
  FileSpreadsheet,
  MessageSquare,
  BarChart3,
  type LucideIcon,
} from 'lucide-react'

export const WELCOME_STORAGE_KEY = 'rabbitstation_landing_welcome_seen'

export const CHALLENGES: { icon: LucideIcon; text: string }[] = [
  {
    icon: FileSpreadsheet,
    text: 'Dienstpläne in Excel sind fehleranfällig, zeitaufwendig und schwer aktuell zu halten.',
  },
  {
    icon: MessageSquare,
    text: 'Arbeitszeiten werden oft manuell über Zettel, WhatsApp oder Tabellen gesammelt.',
  },
  {
    icon: FileText,
    text: 'Wichtige Dokumente, Nachweise und Schulungen sind nicht zentral auffindbar.',
  },
  {
    icon: ClipboardList,
    text: 'Aufgaben gehen ohne klare Zuständigkeit schnell unter.',
  },
  {
    icon: BarChart3,
    text: 'Monatsabschlüsse, Zuschläge und Lohnprüfung kosten unnötig viel Zeit.',
  },
]

export const SOLUTION_MODULES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: CalendarDays,
    title: 'Dienstplan',
    text: 'Klar planen, Verfügbarkeiten berücksichtigen und offene Schichten sofort erkennen.',
  },
  {
    icon: Clock,
    title: 'Zeiterfassung',
    text: 'Mitarbeiter stempeln digital. Zeiten sind direkt sichtbar und nachvollziehbar.',
  },
  {
    icon: ClipboardList,
    title: 'Aufgaben',
    text: 'Aufgaben zuweisen, Fristen überwachen und Erledigungen dokumentieren.',
  },
  {
    icon: FileText,
    title: 'Dokumente',
    text: 'Unterweisungen, Nachweise, Verträge und Checklisten zentral speichern.',
  },
  {
    icon: CalendarDays,
    title: 'Zuschläge & Feiertage',
    text: 'Sonntag, Feiertage, Nachtarbeit und besondere Feiertage sauber berücksichtigen.',
  },
  {
    icon: BarChart3,
    title: 'Lohnprüfung & Auswertungen',
    text: 'Stunden prüfen, Zuschläge kontrollieren und Abrechnungen vorbereiten.',
  },
]

export const TEAM_CARDS = [
  {
    icon: Smartphone,
    title: 'Mitarbeiter-App',
    bullets: [
      'Eigene Schichten im Blick',
      'Zeiterfassung und Monatsübersicht',
      'Aufgaben und wichtige Informationen',
      'Dokumente und Hinweise abrufbar',
    ],
    image: '/marketing/flyer-teams.png',
    imageAlt: 'Mitarbeiter-App und Stationstablet',
  },
  {
    icon: Tablet,
    title: 'Stationstablet',
    bullets: [
      'Mitarbeiter kommt / geht stempeln',
      'Heutige Schichten sichtbar',
      'Offene Aufgaben direkt an der Station',
      'Wichtige Hinweise und Checklisten verfügbar',
    ],
    image: '/marketing/screens-collage.png',
    imageAlt: 'Dashboard, Tablet und Mitarbeiter-App',
  },
]

export const SECURITY_POINTS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Building2,
    title: 'Mandantenfähig',
    text: 'Mehrere Stationen und Unternehmen sicher und getrennt verwalten.',
  },
  {
    icon: Shield,
    title: 'Rollen & Rechte',
    text: 'Jeder Nutzer sieht nur die Bereiche, für die er berechtigt ist.',
  },
  {
    icon: Lock,
    title: 'Geschützte Daten',
    text: 'Strukturierte Speicherung und sichere Übertragung.',
  },
  {
    icon: TrendingUp,
    title: 'Für Wachstum gedacht',
    text: 'Von einer Station bis zu mehreren Standorten nutzbar.',
  },
]

export const WELCOME_BENEFITS = [
  'Dienstpläne schneller erstellen',
  'Arbeitszeiten sauber erfassen',
  'Aufgaben und Dokumente zentral verwalten',
  'Mehrere Stationen sicher getrennt verwalten',
]
