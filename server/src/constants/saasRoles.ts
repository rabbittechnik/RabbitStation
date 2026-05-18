/** Plattformrollen (SaaS-Betrieb) – kein Tenant-Zwang. */
export const PLATFORM_ROLES = ['saas_owner', 'saas_superadmin'] as const
export type PlatformRole = (typeof PLATFORM_ROLES)[number]

/** Kundenrollen – immer an einen Tenant gebunden. */
export const TENANT_ROLES = [
  'tenant_owner',
  'station_admin',
  'stationsleiter',
  'teamleiter',
  'mitarbeiter',
  'tablet',
  'steuerberater',
] as const
export type TenantRoleKey = (typeof TENANT_ROLES)[number]

export function isPlatformRole(role: string | null | undefined): role is PlatformRole {
  return role != null && (PLATFORM_ROLES as readonly string[]).includes(role)
}

export function isTenantRole(role: string | null | undefined): role is TenantRoleKey {
  return role != null && (TENANT_ROLES as readonly string[]).includes(role)
}
