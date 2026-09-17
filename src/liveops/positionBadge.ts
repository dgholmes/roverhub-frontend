import type { PositionQuality } from '@/types/robotState'

export interface BadgeCopy {
  full: string
  compact: string
  title: string
}

/**
 * Which badge a position value earns, keyed on `quality` rather than
 * `provider` (docs/05-ui-ux.md §7.1, §18.4). A SLAM robot that has lost lock
 * is provider: 'slam' but quality: 'lost' — deriving the badge from
 * `provider === 'dead_reckoning'` would hide the warning in exactly the case
 * that matters most.
 *
 * null means "no badge": the position is trustworthy.
 */
const COPY: Record<PositionQuality, BadgeCopy | null> = {
  estimated: {
    full: 'estimated',
    compact: 'est.',
    title: 'Position is dead-reckoned, not absolute — may drift from the true location',
  },
  localized: null,
  lost: {
    full: 'lost',
    compact: 'lost',
    title: 'Localization lost — the reported position is not trustworthy',
  },
}

export function badgeCopyForQuality(quality: PositionQuality): BadgeCopy | null {
  return COPY[quality]
}
