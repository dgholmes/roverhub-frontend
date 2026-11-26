import { describe, expect, it } from 'vitest'
import { orgAdminOf } from './useOrgAdmin'

describe('who may create, edit and delete sites', () => {
  it('everyone with sign-in off (the dev user), as the backend agrees', () => {
    expect(orgAdminOf({ status: 'off', user: { org_role: 'member' } })).toBe(true)
  })

  it('signed in: org owners and admins only', () => {
    expect(orgAdminOf({ status: 'signedIn', user: { org_role: 'owner' } })).toBe(true)
    expect(orgAdminOf({ status: 'signedIn', user: { org_role: 'admin' } })).toBe(true)
    expect(orgAdminOf({ status: 'signedIn', user: { org_role: 'member' } })).toBe(false)
    expect(orgAdminOf({ status: 'signedIn', user: null })).toBe(false)
  })
})
