import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Building2,
  CalendarDays,
  Car,
  Check,
  ClipboardList,
  Clock,
  FileText,
  Fuel,
  LineChart,
  Phone,
  Shield,
  Smartphone,
  Sparkles,
  Tablet,
  Users,
  Wand2,
  Wallet,
  Palmtree,
} from 'lucide-react'

export type FeatureModule = {
  icon: LucideIcon
  title: string
  text: string
  bullets: string[]
  note?: string
}

export const FEATURE_HERO_BADGES = [
  'Speziell für Tankstellen entwickelt',
  'Mehrere Stationen möglich',
  'Mitarbeiter-App inklusive',
  'Stationstablet vorbereitet',
]

export const FEATURE_MODULES: FeatureModule[] = [
  {
    icon: CalendarDays,
    title: 'Dienstplan & Schichtplanung',
    text: 'Planen Sie Früh-, Spät-, Nacht- und Mittelschichten oder individuelle Dienste direkt im System. Offene Schichten, Vertretungen und unbesetzte Dienste bleiben jederzeit sichtbar.',
    bullets: [
      'Schichtmodelle pro Station',
      'Früh-, Spät-, Nacht- und Sonderschichten',
      'Unbesetzte Schichten automatisch erkennen',
      'Wochenübersicht',
      'Mitarbeiter-Zuweisung',
      'Konfliktprüfung',
      'Dienstplan für Mitarbeiter sichtbar',
    ],
  },
  {
    icon: Clock,
    title: 'Zeiterfassung',
    text: 'Mitarbeiter erfassen Arbeitszeiten digital. Sie behalten den Überblick über Anwesenheit, laufende Schichten und Monatsstunden.',
    bullets: [
      'Kommen / Gehen',
      'Laufende Schicht erkennen',
      'Anwesenheit seit Uhrzeit',
      'Tages- und Monatsübersicht',
      'Freigabe von Zeiten',
      'Vergleich Planzeit zu Istzeit',
      'Grundlage für Lohnprüfung',
    ],
  },
  {
    icon: Wallet,
    title: 'Lohnprüfung & Zuschläge',
    text: 'RabbitStation Pro unterstützt bei der Vorbereitung der Lohnabrechnung durch Auswertung von Stunden, Zuschlägen und Abweichungen.',
    bullets: [
      'Soll-/Ist-Vergleich',
      'Nachtzuschläge',
      'Sonntagszuschläge',
      'Feiertagszuschläge',
      'Besondere Feiertage / B-Feiertage',
      'Hinweise bei Abweichungen',
      'Monatsübersicht',
      'Exportvorbereitung',
    ],
    note: 'Die App erstellt keine steuerliche Lohnabrechnung, sondern unterstützt bei der Vorbereitung für Steuerberater oder Lohnbüro.',
  },
  {
    icon: ClipboardList,
    title: 'Aufgabenverwaltung',
    text: 'Aufgaben zentral erstellen, priorisieren, zuweisen und nachverfolgen – damit Reinigungen, Kontrollen und Tagesaufgaben nicht mehr untergehen.',
    bullets: [
      'Tagesaufgaben',
      'Schichtabschluss-Aufgaben',
      'Prioritäten',
      'Fälligkeitsdaten',
      'Aufgabenstatus',
      'Mitarbeiter-Zuweisung',
      'Erledigte Aufgaben dokumentieren',
    ],
  },
  {
    icon: FileText,
    title: 'Dokumente & Unterweisungen',
    text: 'Unterlagen sicher und strukturiert ablegen – von Betriebsanweisungen bis zu Unterweisungen und Nachweisen.',
    bullets: [
      'Dokumentenablage',
      'Kategorien',
      'Mitarbeiterbezogene Dokumente',
      'Stationsdokumente',
      'Sichtbarkeitsrechte',
      'Geschützter Download',
      'Unterweisungen und Nachweise zentral speichern',
    ],
  },
  {
    icon: Smartphone,
    title: 'Mitarbeiter-App',
    text: 'Mitarbeiter sehen eigene Schichten, Aufgaben, Zeiten und freigegebene Informationen direkt auf dem Smartphone oder Tablet.',
    bullets: [
      'Eigene Schichten ansehen',
      'Eigene Aufgaben ansehen',
      'Zeiterfassung',
      'Urlaubsbereich',
      'Wochenplan',
      'Dokumente je nach Freigabe',
      'Mobil nutzbar',
    ],
  },
  {
    icon: Tablet,
    title: 'Stationstablet',
    text: 'Einfache Ansicht direkt an der Tankstelle – ideal zum Stempeln, für Aufgaben, Schichtplan und wichtige Hinweise.',
    bullets: [
      'Mitarbeiter kommt',
      'Mitarbeiter geht / Schicht beenden',
      'Aktueller Dienst',
      'Aufgabenübersicht',
      'Schichtplan',
      'Spritpreise optional',
      'Musik/Radio optional',
      'Tablet-Kopplung',
    ],
  },
  {
    icon: Palmtree,
    title: 'Abwesenheiten & Urlaub',
    text: 'Urlaub, Abwesenheiten und Sperrzeiten zentral verwalten – der Dienstplan bleibt übersichtlich und planbar.',
    bullets: [
      'Urlaubsanträge',
      'Abwesenheiten',
      'Urlaubssperren',
      'Abwesenheitsübersicht',
      'Berücksichtigung im Dienstplan',
      'Offene Anträge prüfen',
    ],
  },
  {
    icon: Car,
    title: 'Monatlicher TÜV-Bericht',
    text: 'Wenn eine Station monatliche TÜV-Berichte benötigt, erinnert RabbitStation Pro daran und begleitet den Prozess digital.',
    bullets: [
      'TÜV-Bericht aktivierbar/deaktivierbar',
      'Monatliche Erinnerung',
      'Bericht erstellen',
      'Offene Berichte anzeigen',
      'Dokumentation pro Monat',
      'Optional je Station konfigurierbar',
    ],
  },
  {
    icon: Phone,
    title: 'Kontakte & Vertreter',
    text: 'Telefonnummern, Vertreter, Lieferanten und Ansprechpartner zentral hinterlegen – damit das Team sie schnell findet.',
    bullets: [
      'Telefonnummern',
      'Vertreterkontakte',
      'Lieferantenkontakte',
      'Wichtige Ansprechpartner',
      'Zentrale Kontaktliste',
      'Schneller Zugriff für das Team',
    ],
  },
  {
    icon: LineChart,
    title: 'Auswertungen & Berichte',
    text: 'Übersichten über Arbeitszeiten, Aufgaben, Abwesenheiten und Monatsdaten – auf einen Blick für Betreiber und Stationsleitung.',
    bullets: [
      'Monatsübersichten',
      'Stundenübersicht',
      'Lohnprüfung',
      'Zeitfreigaben',
      'Schichtplan-Auswertung',
      'Mitarbeiterübersicht',
      'Exportvorbereitung',
    ],
  },
  {
    icon: Building2,
    title: 'SaaS & Mandantenfähigkeit',
    text: 'Als SaaS-Plattform aufgebaut: Jeder Betreiber sieht ausschließlich seine eigenen Daten – sauber getrennt und sicher.',
    bullets: [
      'Eigene Betreiber-Umgebung',
      'Getrennte Stationsdaten',
      'Rollen- und Rechteverwaltung',
      'Sichere Datenabgrenzung',
      '7-Tage-Testphase',
      'Abo-Status vorbereitet',
      'Schnittstellen für zentrale Verwaltung vorbereitet',
    ],
  },
  {
    icon: Shield,
    title: 'Rollen & Rechte',
    text: 'Jeder Benutzer erhält nur die Funktionen, die er im Alltag wirklich braucht.',
    bullets: [
      'Betreiber / Owner',
      'Stationsleiter',
      'Teamleiter',
      'Mitarbeiter',
      'Tablet-Rolle',
      'Steuerberater optional',
      'Adminrechte getrennt steuerbar',
    ],
  },
  {
    icon: Wand2,
    title: 'Setup-Assistent',
    text: 'Neue Betreiber werden Schritt für Schritt durch die Einrichtung geführt – schnell startklar ohne leere Standarddaten.',
    bullets: [
      'Schichtmodelle auswählen',
      'Zeiten festlegen',
      'TÜV-Bericht aktivieren/deaktivieren',
      'Ersten Mitarbeiter anlegen',
      'Owner optional als Chef im Dienstplan',
      'Einführungstour durch die App',
    ],
  },
]

export const WHY_STATION_CARDS = [
  { icon: CalendarDays, title: 'Schichtbetrieb', text: 'Früh, Spät, Nacht und individuelle Dienste übersichtlich planen.' },
  { icon: Users, title: 'Teamorganisation', text: 'Mitarbeiter, Aufgaben und Informationen zentral verwalten.' },
  { icon: FileText, title: 'Dokumentation', text: 'Unterweisungen, Berichte und Nachweise strukturiert speichern.' },
  { icon: BarChart3, title: 'Auswertung', text: 'Stunden, Zuschläge und Monatsdaten schneller vorbereiten.' },
]

export const AUDIENCE_ITEMS = [
  'Freie Tankstellen',
  'Pächterstationen',
  'Betreiber mit einer Station',
  'Betreiber mit mehreren Stationen',
  'Stationsleiter',
  'Teams mit Aushilfen',
  'Tankstellen mit Schichtbetrieb',
  'Stationen mit monatlichen Prüfungen und Berichten',
]

export const BENEFITS = [
  { icon: Sparkles, text: 'Weniger Zettelwirtschaft' },
  { icon: Check, text: 'Weniger WhatsApp-Chaos' },
  { icon: CalendarDays, text: 'Bessere Übersicht über Schichten' },
  { icon: ClipboardList, text: 'Klare Aufgabenverteilung' },
  { icon: Clock, text: 'Digitale Zeiterfassung' },
  { icon: Wallet, text: 'Bessere Vorbereitung der Lohnabrechnung' },
  { icon: FileText, text: 'Dokumente schneller auffindbar' },
  { icon: Users, text: 'Mitarbeiter besser informiert' },
  { icon: Tablet, text: 'Tablet direkt an der Station nutzbar' },
  { icon: Fuel, text: 'Strukturierter Stationsalltag' },
]

export const START_STEPS = [
  {
    step: '1',
    title: 'Registrieren',
    text: 'Erstellen Sie Ihren Betreiberzugang und starten Sie die 7-Tage-Testphase.',
  },
  {
    step: '2',
    title: 'Station einrichten',
    text: 'Legen Sie Schichtmodelle, TÜV-Bericht, Mitarbeiter und Grunddaten fest.',
  },
  {
    step: '3',
    title: 'Team einladen',
    text: 'Mitarbeiter sehen eigene Schichten, Aufgaben und Zeiten in der App.',
  },
  {
    step: '4',
    title: 'Digital arbeiten',
    text: 'Dienstplan, Zeiterfassung, Aufgaben und Dokumente zentral verwalten.',
  },
  {
    step: '5',
    title: 'Auswerten',
    text: 'Monatsdaten, Zeiten und Zuschläge schneller vorbereiten.',
  },
]
