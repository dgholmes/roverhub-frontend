import { describe, expect, it } from 'vitest'
import { canWith, siteRoleOf } from './useCan'
import { engineerToolsOn, siteRoleFor } from '@/lib/auth/types'
import { CAPABILITIES, can } from './roles'

describe('site role derivation', () => {
  const user = { site_roles: { 'site-a': 'operator' as const, '*': 'viewer' as const } }

  it('uses the role for the site when there is one', () => {
    expect(siteRoleFor(user, 'site-a')).toBe('operator')
  })

  it('falls back to the every-site role', () => {
    expect(siteRoleFor(user, 'site-b')).toBe('viewer')
  })

  it('is null at a site the user has no role at', () => {
    expect(siteRoleFor({ site_roles: { 'site-a': 'engineer' } }, 'site-b')).toBeNull()
    expect(siteRoleFor(null, 'site-a')).toBeNull()
  })

  it('comes from the signed-in user, ignoring the Role preview', () => {
    expect(siteRoleOf({ status: 'signedIn', user }, 'supervisor', 'site-a')).toBe('operator')
    expect(siteRoleOf({ status: 'signedIn', user: { site_roles: {} } }, 'supervisor', 'site-a')).toBeNull()
  })

  it('is the Role preview with sign-in off', () => {
    expect(siteRoleOf({ status: 'off', user }, 'technician', 'site-a')).toBe('technician')
  })
})

describe('engineer tools', () => {
  const all = CAPABILITIES.flatMap((g) => g.items.map((c) => c.id))

  it("add the engineer role's capabilities to a supervisor's only while on", () => {
    expect(canWith('supervisor', false, 'configure')).toBe(false)
    expect(canWith('supervisor', false, 'edgeTools')).toBe(false)
    expect(canWith('supervisor', true, 'configure')).toBe(true)
    expect(canWith('supervisor', true, 'edgeTools')).toBe(true)
    expect(canWith('supervisor', true, 'runTests')).toBe(true)
  })

  it("are the union: the user's own role and the engineer's, nothing more", () => {
    for (const id of all) {
      expect(canWith('viewer', true, id)).toBe(can('viewer', id) || can('engineer', id))
      expect(canWith('supervisor', true, id)).toBe(can('supervisor', id) || can('engineer', id))
    }
    // A supervisor keeps what an engineer lacks.
    expect(canWith('supervisor', true, 'planPatrols')).toBe(true)
    expect(canWith('supervisor', true, 'override')).toBe(true)
  })

  it('never open a site the user has no role at', () => {
    for (const id of all) expect(canWith(null, true, id)).toBe(false)
  })

  it("count only with both fields, so an older backend's user is off", () => {
    expect(engineerToolsOn({})).toBe(false)
    expect(engineerToolsOn(null)).toBe(false)
    expect(engineerToolsOn({ engineer_tools: true })).toBe(false)
    expect(engineerToolsOn({ engineer_tools: false, can_use_engineer_tools: true })).toBe(false)
    expect(engineerToolsOn({ engineer_tools: true, can_use_engineer_tools: true })).toBe(true)
  })
})
