import { Link } from 'react-router-dom'
import { usePlanEntitlements } from '../../hooks/usePlanEntitlements'

export function PlanStatusBanner() {
  const {
    canWrite,
    statusMessage,
    employeeLimitReached,
    employeeUsage,
    employeeLimit,
    planName,
  } = usePlanEntitlements()

  const lines: string[] = []
  if (statusMessage) lines.push(statusMessage)
  if (employeeLimitReached && employeeLimit != null && employeeUsage != null) {
    lines.push(`${employeeUsage} von ${employeeLimit} Mitarbeitern genutzt`)
  }

  if (lines.length === 0) return null

  const expired = !canWrite

  return (
    <div
      className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
        expired ?
          'border-amber-500/50 bg-amber-500/10 text-amber-100'
        : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100'
      }`}
      role="status"
    >
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {expired ?
        <Link to="/preise" className="mt-2 inline-block font-medium text-fuchsia-300 hover:underline">
          Plan {planName} aktivieren →
        </Link>
      : null}
    </div>
  )
}
