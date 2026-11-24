import { describe, expect, it } from 'vitest'
import { WORKSPACES } from '@/app/routes'
import { shouldShowTabBar } from './touchNav'

describe('shouldShowTabBar', () => {
  it('is false on a fine pointer, whatever else is true', () => {
    expect(shouldShowTabBar({ touch: false, workspace: 'LiveOps', driving: false, immersed: true })).toBe(false)
    expect(shouldShowTabBar({ touch: false, workspace: 'Fleet', driving: false, immersed: false })).toBe(false)
  })

  it('shows on every workspace while nobody is driving and nothing is immersed', () => {
    for (const w of WORKSPACES) {
      expect(shouldShowTabBar({ touch: true, workspace: w, driving: false, immersed: false })).toBe(true)
    }
  })

  it('hides on LiveOps while the operator holds control', () => {
    expect(shouldShowTabBar({ touch: true, workspace: 'LiveOps', driving: true, immersed: false })).toBe(false)
  })

  // §6.2: LiveOps on touch opens as the live view, with no bar around it.
  it('hides on LiveOps while immersed, with nobody driving', () => {
    expect(shouldShowTabBar({ touch: true, workspace: 'LiveOps', driving: false, immersed: true })).toBe(false)
  })

  it('shows on LiveOps once the back chevron has un-immersed it', () => {
    expect(shouldShowTabBar({ touch: true, workspace: 'LiveOps', driving: false, immersed: false })).toBe(true)
  })

  // Review Focus 4. The two reasons are independent, and driving is the one
  // the flag may never override: the bottom of the screen is the sticks.
  it('keeps the bar away while driving even after the operator un-immerses', () => {
    expect(shouldShowTabBar({ touch: true, workspace: 'LiveOps', driving: true, immersed: false })).toBe(false)
    expect(shouldShowTabBar({ touch: true, workspace: 'LiveOps', driving: true, immersed: true })).toBe(false)
  })

  // Review Focus 1: control goes to a mission; driving is false again and the bar returns.
  it('returns the moment control is no longer the operator’s', () => {
    expect(shouldShowTabBar({ touch: true, workspace: 'LiveOps', driving: true, immersed: false })).toBe(false)
    expect(shouldShowTabBar({ touch: true, workspace: 'LiveOps', driving: false, immersed: false })).toBe(true)
  })

  // The flag is LiveOps' own: no other workspace has a live view to immerse.
  it('keeps the bar on the other workspaces, driving or immersed', () => {
    expect(shouldShowTabBar({ touch: true, workspace: 'Fleet', driving: true, immersed: false })).toBe(true)
    expect(shouldShowTabBar({ touch: true, workspace: 'Fleet', driving: false, immersed: true })).toBe(true)
  })

  it('always shows in the org console', () => {
    expect(shouldShowTabBar({ touch: true, workspace: null, driving: true, immersed: true })).toBe(true)
  })
})
