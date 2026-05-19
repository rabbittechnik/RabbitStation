import { ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useSidebar } from '../../store/sidebar-context'
import { navEntries, type NavEntry, type NavGroup } from './navConfig'
import { useAuth } from '../../context/auth-context'
import { useStation } from '../../context/station-context'
import { canAccessTimeApprovalsPage, canApproveTimeEntries } from '../../utils/timeApproval'
import { featureForPath } from '../../data/planFeatures'
import { usePlanEntitlements } from '../../hooks/usePlanEntitlements'

function pathMatches(pathname: string, to: string) {
  if (to === '/dashboard') return pathname === '/dashboard' || pathname === '/'
  if (to === '/schedule') {
    return pathname === '/schedule' || pathname === '/schichtplan'
  }
  if (to === '/absences') {
    return pathname === '/absences' || pathname === '/abwesenheiten'
  }
  if (to === '/tasks') {
    return pathname === '/tasks' || pathname === '/aufgaben'
  }
  if (to === '/zeiterfassung/freigaben') {
    return pathname === '/zeiterfassung/freigaben' || pathname === '/time-tracking/approvals'
  }
  if (to === '/settings/access') {
    return pathname === '/settings/access' || pathname === '/einstellungen/zugriffsberechtigungen'
  }
  if (to === '/tuv-berichte') {
    return pathname === '/tuv-berichte' || pathname.startsWith('/tuv-berichte/')
  }
  if (to === '/organisation/representatives') {
    return pathname === '/organisation/representatives' || pathname === '/contacts/representatives'
  }
  if (to === '/documents') {
    return pathname === '/documents' || pathname.startsWith('/documents/')
  }
  if (to === '/reports/payroll-time') {
    return pathname === '/reports/payroll-time' || pathname === '/reports/payroll-time-tracking'
  }
  return pathname === to || pathname.startsWith(`${to}/`)
}

function LogoMark() {
  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-gradient-to-br from-cyan-400/30 to-fuchsia-500/25 ring-1 ring-cyan-400/40"
      aria-hidden
    >
      <div className="h-4 w-4 rotate-45 rounded-sm bg-cyan-300/90 shadow-[0_0_12px_rgba(34,211,238,0.6)]" />
    </div>
  )
}

function NavGroupSection({
  group,
  collapsed,
  open,
  onToggle,
  pathname,
  onNavigate,
}: {
  group: NavGroup
  collapsed: boolean
  open: boolean
  onToggle: () => void
  pathname: string
  onNavigate: () => void
}) {
  const Icon = group.icon
  const childActive = group.children.some((c) => pathMatches(pathname, c.to))

  if (collapsed) {
    const first = group.children[0]
    const tip = `${group.label}: ${group.children.map((c) => c.label).join(', ')}`
    return (
      <NavLink
        to={first?.to ?? '/'}
        title={tip}
        onClick={onNavigate}
        className={({ isActive }) =>
          `mb-1 flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] transition ${
            isActive || childActive
              ? 'bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] shadow-[var(--glow-cyan)] ring-1 ring-cyan-400/35'
              : 'text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-main)]'
          }`
        }
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden />
        <span className="sr-only">{group.label}</span>
      </NavLink>
    )
  }

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-left text-sm font-medium transition ${
          childActive
            ? 'bg-white/5 text-[var(--text-main)]'
            : 'text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-main)]'
        }`}
      >
        <Icon className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{group.label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="mt-0.5 space-y-0.5 border-l border-[var(--border-subtle)] pl-3 ml-4">
          {group.children.map((c) => (
            <NavLink
              key={c.to}
              to={c.to}
              data-tour={c.dataTour}
              onClick={onNavigate}
              className={() => {
                const active = pathMatches(pathname, c.to)
                return `block rounded-[var(--radius-sm)] py-2 pl-3 pr-2 text-sm transition ${
                  active
                    ? 'border-l-2 border-[var(--sidebar-active-border)] bg-gradient-to-r from-cyan-500/15 to-transparent font-medium text-[var(--text-main)] shadow-[inset_0_0_24px_rgba(34,211,238,0.06)]'
                    : 'text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-main)]'
                }`
              }}
            >
              {c.label}
            </NavLink>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function NavSingleRow({
  entry,
  collapsed,
  onNavigate,
}: {
  entry: Extract<NavEntry, { type: 'single' }>
  collapsed: boolean
  onNavigate: () => void
}) {
  const Icon = entry.icon
  return (
    <NavLink
      to={entry.to}
      end={entry.to === '/dashboard'}
      title={collapsed ? entry.label : undefined}
      onClick={onNavigate}
      className={({ isActive }) =>
        `mb-1 flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-medium transition ${
          collapsed ? 'justify-center px-0' : ''
        } ${
          isActive
            ? 'sidebar-nav-active border-l-2 border-[var(--sidebar-active-border)] text-[var(--text-main)] shadow-[var(--glow-cyan)]'
            : 'border-l-2 border-transparent text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-main)]'
        }`
      }
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      {collapsed ? (
        <span className="sr-only">{entry.label}</span>
      ) : (
        <span className="truncate">{entry.label}</span>
      )}
    </NavLink>
  )
}

export function Sidebar() {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar()
  const closeMobile = () => setMobileOpen(false)
  const { pathname } = useLocation()

  const { user } = useAuth()
  const { hasPermission } = useStation()
  const canSeeTimeApprovals = canAccessTimeApprovalsPage(user)
  const canApprove = canApproveTimeEntries(user)
  const { hasFeature: hasPlanFeature } = usePlanEntitlements()
  const visibleNav = useMemo(() => {
    return navEntries
      .filter((e) => {
        if (e.type === 'single' && e.globalAdminOnly && !user?.globalAdmin) return false
        if (e.type === 'single' && e.anyStationPermission?.length) {
          const ok =
            Boolean(user?.globalAdmin) ||
            Boolean(
              user?.stationAccess?.some((a) =>
                e.anyStationPermission!.some((k) => a.permissions[k] === true),
              ),
            )
          if (!ok) return false
        }
        return true
      })
      .map((e) => {
        if (e.type !== 'group') return e
        return {
          ...e,
          children: e.children.filter((c) => {
            if (c.globalAdminOnly && !user?.globalAdmin) return false
            if (c.approverOnly && !canSeeTimeApprovals) return false
            if (c.anyPermission?.length) {
              const ok = c.anyPermission.some((k) => hasPermission(k))
              if (!ok) return false
            }
            const feat = featureForPath(c.to)
            if (feat && !hasPlanFeature(feat)) return false
            return true
          }),
        }
      })
      .filter((e) => (e.type === 'group' ? e.children.length > 0 : true))
  }, [canApprove, canSeeTimeApprovals, hasPermission, hasPlanFeature, user?.globalAdmin, user?.stationAccess])

  const defaultOpen = useMemo(() => {
    const ids = new Set<string>()
    for (const e of visibleNav) {
      if (e.type === 'group' && e.children.some((c) => pathMatches(pathname, c.to))) {
        ids.add(e.id)
      }
    }
    return ids
  }, [pathname, visibleNav])

  const [forcedClosed, setForcedClosed] = useState<Set<string>>(new Set())
  const [forcedOpen, setForcedOpen] = useState<Set<string>>(new Set())

  const isGroupOpen = (id: string) => {
    if (defaultOpen.has(id)) return !forcedClosed.has(id)
    return forcedOpen.has(id)
  }

  const toggleGroup = (id: string) => {
    if (defaultOpen.has(id)) {
      setForcedClosed((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    } else {
      setForcedOpen((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }
  }

  const asideWidth = collapsed ? 'w-[76px]' : 'w-[272px]'

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          aria-label="Menü schließen"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] transition-[transform,width] duration-200 lg:static lg:translate-x-0 ${asideWidth} ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div
          className={`flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-4 ${
            collapsed ? 'justify-center px-2' : ''
          }`}
        >
          <LogoMark />
          {collapsed ? (
            <span className="sr-only">Rabbit-Technik Station</span>
          ) : (
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/90">
                Rabbit-Technik
              </div>
              <div className="truncate text-sm font-semibold text-[var(--text-main)]">
                Station
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
          {visibleNav.map((entry) => {
            if (entry.type === 'single') {
              return (
                <NavSingleRow
                  key={entry.to}
                  entry={entry}
                  collapsed={collapsed}
                  onNavigate={closeMobile}
                />
              )
            }
            return (
              <NavGroupSection
                key={entry.id}
                group={entry}
                collapsed={collapsed}
                open={isGroupOpen(entry.id)}
                onToggle={() => toggleGroup(entry.id)}
                pathname={pathname}
                onNavigate={closeMobile}
              />
            )
          })}
        </nav>

        <div
          className={`border-t border-[var(--border-subtle)] px-3 py-3 text-[10px] leading-relaxed text-[var(--text-faint)] ${
            collapsed ? 'text-center' : ''
          }`}
        >
          {collapsed ? (
            <span className="sr-only">Version 1.0.0</span>
          ) : (
            <span>v1.0.0 · StationGuide-inspiriert</span>
          )}
        </div>
      </aside>
    </>
  )
}
