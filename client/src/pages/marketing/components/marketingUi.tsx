import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function SectionTitle({
  children,
  id,
  subtitle,
}: {
  children: string
  id?: string
  subtitle?: string
}) {
  return (
    <div className="text-center">
      <h2 id={id} className="text-2xl font-bold tracking-tight text-white md:text-3xl">
        {children}
      </h2>
      {subtitle ? <p className="mx-auto mt-4 max-w-2xl text-[#94a3b8]">{subtitle}</p> : null}
    </div>
  )
}

export function GlowCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-cyan-500/25 bg-[#0a1424]/90 shadow-[0_0_40px_rgba(34,211,238,0.06)] backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  )
}

export function PrimaryCta({
  to,
  children,
  className = '',
}: {
  to: string
  children: ReactNode
  className?: string
}) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-500 px-6 py-3 text-sm font-semibold text-[#03121f] shadow-[0_0_32px_rgba(34,211,238,0.35)] transition hover:brightness-110 md:px-8 md:py-3.5 md:text-base ${className}`}
    >
      {children}
    </Link>
  )
}

export function SecondaryCta({
  to,
  children,
  className = '',
}: {
  to: string
  children: ReactNode
  className?: string
}) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center rounded-xl border border-cyan-500/45 bg-cyan-500/5 px-6 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/15 md:px-8 md:py-3.5 md:text-base ${className}`}
    >
      {children}
    </Link>
  )
}

export function GhostCta({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-medium text-[#94a3b8] transition hover:text-white md:px-8 md:py-3.5"
    >
      {children}
    </Link>
  )
}
