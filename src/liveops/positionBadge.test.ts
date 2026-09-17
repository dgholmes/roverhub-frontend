import { describe, expect, it } from 'vitest'

import { badgeCopyForQuality } from './positionBadge'

describe('badgeCopyForQuality', () => {
  it('badges a dead-reckoned position as estimated', () => {
    expect(badgeCopyForQuality('estimated')?.full).toBe('estimated')
  })

  it('compacts to "est." for tight spaces', () => {
    expect(badgeCopyForQuality('estimated')?.compact).toBe('est.')
  })

  it('shows no badge when localization is trustworthy', () => {
    expect(badgeCopyForQuality('localized')).toBeNull()
  })

  it('badges lost localization rather than hiding it', () => {
    // The case the old provider-derived badge would have hidden: a SLAM robot
    // that has lost lock is not dead_reckoning, so `provider === 'dead_reckoning'`
    // would have rendered nothing at all.
    expect(badgeCopyForQuality('lost')?.full).toBe('lost')
  })

  it('explains itself differently for estimated and lost', () => {
    expect(badgeCopyForQuality('estimated')?.title)
      .not.toBe(badgeCopyForQuality('lost')?.title)
  })
})
