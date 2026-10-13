import i18n from '@/i18n'
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
 *
 * Built per call so the copy follows the current language.
 */
export function badgeCopyForQuality(quality: PositionQuality): BadgeCopy | null {
  switch (quality) {
    case 'estimated':
      return {
        full: i18n.t('liveops.position.estimated'),
        compact: i18n.t('liveops.position.estimatedCompact'),
        title: i18n.t('liveops.position.estimatedTitle'),
      }
    case 'lost':
      return {
        full: i18n.t('liveops.position.lost'),
        compact: i18n.t('liveops.position.lostCompact'),
        title: i18n.t('liveops.position.lostTitle'),
      }
    case 'localized':
      return null
  }
}
