import { describe, expect, it } from 'vitest'
import { siteRoleOf } from './useCan'
import { siteRoleFor } from '@/lib/auth/types'

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
