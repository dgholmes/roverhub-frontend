import { describe, expect, it } from 'vitest'
import { WORKSPACES } from '@/app/routes'
import { shouldShowTabBar } from './touchNav'

describe('shouldShowTabBar', () => {
  it('is false on a fine pointer, whatever else is true', () => {
    expect(shouldShowTabBar({ touch: false, workspace: 'LiveOps', driving: false })).toBe(false)
    expect(shouldShowTabBar({ touch: false, workspace: 'Fleet', driving: false })).toBe(false)
  })

  it('shows on every workspace while nobody is driving', () => {
    for (const w of WORKSPACES) {
      expect(shouldShowTabBar({ touch: true, workspace: w, driving: false })).toBe(true)
    }
  })

  it('hides on LiveOps while the operator holds control', () => {
    expect(shouldShowTabBar({ touch: true, workspace: 'LiveOps', driving: true })).toBe(false)
  })

  // Review Focus 1: control goes to a mission; driving is false again and the bar returns.
  it('returns the moment control is no longer the operator’s', () => {
    expect(shouldShowTabBar({ touch: true, workspace: 'LiveOps', driving: true })).toBe(false)
    expect(shouldShowTabBar({ touch: true, workspace: 'LiveOps', driving: false })).toBe(true)
  })

  it('keeps the bar on the other workspaces even if a robot is being driven elsewhere', () => {
    expect(shouldShowTabBar({ touch: true, workspace: 'Fleet', driving: true })).toBe(true)
  })

  it('always shows in the org console', () => {
    expect(shouldShowTabBar({ touch: true, workspace: null, driving: true })).toBe(true)
  })
})
