import type { ReactNode } from 'react'
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  CloudSun,
  FileText,
  LayoutDashboard,
  Users,
} from 'lucide-react'

function ShowcaseShell({
  children,
  className = '',
  label = 'RabbitStation Pro – Dashboard-Vorschau',
}: {
  children: ReactNode
  className?: string
  label?: string
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={`overflow-hidden rounded-2xl border border-cyan-500/35 bg-[#060b14] shadow-[0_0_48px_rgba(34,211,238,0.14)] ring-1 ring-cyan-400/20 ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-cyan-500/15 bg-[#0a101c] px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/90" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/90" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/90" aria-hidden />
        <span className="ml-2 truncate text-[10px] font-medium text-cyan-200/70">app.rabbitstation.de/dashboard</span>
      </div>
      {children}
    </div>
  )
}

function NavItem({
  icon: Icon,
  label,
  active = false,
}: {
  icon: typeof LayoutDashboard
  label: string
  active?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[10px] font-medium ${
        active
          ? 'border-l-2 border-cyan-400 bg-cyan-500/10 text-cyan-100'
          : 'text-slate-400'
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </div>
  )
}

function StatTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${tone}`}>
      <p className="text-[9px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-white">{value}</p>
    </div>
  )
}

/** Scharfer Dashboard-Mockup im echten RabbitStation-Stil (Hero). */
export function MarketingDashboardShowcase({ className = '' }: { className?: string }) {
  const weekDays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

  return (
    <ShowcaseShell className={className}>
      <div className="flex min-h-[280px] md:min-h-[320px]">
        <aside className="hidden w-[108px] shrink-0 border-r border-cyan-500/10 bg-[#070d18] p-2 sm:block">
          <div className="mb-3 flex items-center gap-2 px-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400/30 to-fuchsia-500/20 ring-1 ring-cyan-400/40">
              <span className="h-2.5 w-2.5 rotate-45 rounded-sm bg-cyan-300" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[8px] font-semibold uppercase tracking-wider text-cyan-300/90">Rabbit</p>
              <p className="truncate text-[9px] font-semibold text-white">Station</p>
            </div>
          </div>
          <nav className="space-y-0.5" aria-hidden>
            <NavItem icon={LayoutDashboard} label="Dashboard" active />
            <NavItem icon={CalendarDays} label="Dienstplan" />
            <NavItem icon={ClipboardList} label="Aufgaben" />
            <NavItem icon={Clock} label="Zeiterfassung" />
            <NavItem icon={BarChart3} label="Auswertungen" />
            <NavItem icon={FileText} label="Dokumente" />
            <NavItem icon={Users} label="Mitarbeiter" />
          </nav>
        </aside>

        <div className="min-w-0 flex-1 p-3 md:p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-medium text-cyan-300/80">Guten Tag, Max</p>
              <h3 className="text-sm font-semibold text-white md:text-base">Dashboard · Station Nord</h3>
            </div>
            <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium text-emerald-200">
              4 anwesend
            </span>
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2">
            <StatTile label="Offene Schichten" value="3" tone="border-amber-400/30 bg-amber-500/5" />
            <StatTile label="Offene Aufgaben" value="7" tone="border-cyan-400/30 bg-cyan-500/5" />
            <StatTile label="Zeitfreigaben" value="2" tone="border-fuchsia-400/25 bg-fuchsia-500/5" />
          </div>

          <div className="mb-3 rounded-lg border border-cyan-500/20 bg-[#0a1424]/80 p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-semibold text-white">Wochen-Dienstplan</p>
              <span className="text-[9px] text-cyan-300/80">KW 21</span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((d, i) => (
                <div key={d} className="text-center">
                  <p className="text-[8px] text-slate-500">{d}</p>
                  <div
                    className={`mt-0.5 rounded px-0.5 py-1 text-[8px] font-medium ${
                      i === 2
                        ? 'bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-400/40'
                        : i >= 5
                          ? 'bg-fuchsia-500/10 text-fuchsia-200/80'
                          : 'bg-white/5 text-slate-300'
                    }`}
                  >
                    {i === 2 ? '6–14' : i >= 5 ? 'WE' : '8–16'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-cyan-500/15 bg-[#0a1424]/80 p-2.5">
              <p className="mb-1.5 text-[10px] font-semibold text-white">Offene Aufgaben</p>
              <ul className="space-y-1" aria-hidden>
                {['Shop reinigen', 'Kühler prüfen', 'TÜV-Checkliste'].map((t, i) => (
                  <li key={t} className="flex items-center gap-1.5 text-[9px] text-slate-300">
                    {i === 2 ? (
                      <Clock className="h-3 w-3 text-amber-300" aria-hidden />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400/80" aria-hidden />
                    )}
                    <span className={i === 2 ? 'text-amber-100/90' : ''}>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-cyan-500/15 bg-[#0a1424]/80 p-2.5">
              <div className="flex items-center gap-2">
                <CloudSun className="h-8 w-8 text-cyan-300/90" aria-hidden />
                <div>
                  <p className="text-[10px] font-semibold text-white">Wetter heute</p>
                  <p className="text-lg font-bold text-cyan-100">18°C</p>
                  <p className="text-[9px] text-slate-400">Leicht bewölkt · Nord</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ShowcaseShell>
  )
}

/** Modul-Übersicht für den Lösungs-Bereich – scharf, ohne Bild. */
export function MarketingSolutionShowcase({ className = '' }: { className?: string }) {
  const modules = [
    { icon: CalendarDays, title: 'Dienstplan', color: 'from-cyan-500/20 to-cyan-500/5' },
    { icon: Clock, title: 'Zeiterfassung', color: 'from-sky-500/20 to-sky-500/5' },
    { icon: ClipboardList, title: 'Aufgaben', color: 'from-fuchsia-500/15 to-fuchsia-500/5' },
    { icon: FileText, title: 'Dokumente', color: 'from-violet-500/15 to-violet-500/5' },
    { icon: BarChart3, title: 'Lohn & Auswertung', color: 'from-emerald-500/15 to-emerald-500/5' },
  ]

  return (
    <div
      className={`rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-[#0a1424] to-[#060b14] p-4 shadow-[0_0_40px_rgba(34,211,238,0.1)] md:p-6 ${className}`}
      role="img"
      aria-label="RabbitStation Pro Module: Dienstplan, Zeiterfassung, Aufgaben, Dokumente, Lohn"
    >
      <div className="mb-4 flex items-center justify-between gap-2 border-b border-cyan-500/15 pb-3">
        <p className="text-sm font-semibold text-white">Alle Module in einer Oberfläche</p>
        <span className="rounded-md bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium text-cyan-200 ring-1 ring-cyan-400/30">
          Dark · Cyan
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {modules.map(({ icon: Icon, title, color }) => (
          <div
            key={title}
            className={`flex flex-col items-center rounded-xl border border-cyan-500/20 bg-gradient-to-b ${color} p-4 text-center`}
          >
            <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/35">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-xs font-semibold text-white">{title}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
