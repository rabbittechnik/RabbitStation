import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatPermission, groupActivePermissions, summarizePermissionProfile } from './permissionLabels.js'

describe('permissionLabels', () => {
  it('formats known permission keys', () => {
    assert.equal(formatPermission('dashboard.view'), 'Dashboard ansehen')
    assert.equal(formatPermission('unknown.custom'), 'Weitere Berechtigung')
  })

  it('groups active permissions', () => {
    const groups = groupActivePermissions({
      'dashboard.view': true,
      'schedule.edit': true,
      'employees.create': true,
    })
    assert.ok(groups.some((g) => g.label.includes('Schichtplan')))
    assert.ok(groups.some((g) => g.label.includes('Mitarbeiter')))
  })

  it('summarizes owner profile', () => {
    assert.equal(
      summarizePermissionProfile({ role: 'tenant_owner', permissions: { 'dashboard.view': true } }),
      'Vollzugriff auf diese Station',
    )
  })
})
