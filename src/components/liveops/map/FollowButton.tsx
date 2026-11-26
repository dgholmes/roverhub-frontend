import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigation } from 'lucide-react'
import { color, glass, radius } from '@/design-system/tokens'

/**
 * The way back into following after the operator dragged the map, shown only
 * while following is paused, so it is the one accent-coloured control on the
 * map that says "you are no longer watching the robot".
 *
 * It is the same 32 px glass square, with the same corner, as the tools toggle
 * and the other map buttons, and sits in their column (operator, 2026-11-26:
 * the round pill with a crosshair, floating beside the column, matched
 * nothing). Named in its tooltip and for screen readers rather than in text.
 * The crosshair in MapControls is hidden on a small map and with the tools
 * closed, which is most of the time, so this one cannot depend on it.
 */
export const FollowButton = memo(function FollowButton({ onFollow, right, bottom }: {
  onFollow: () => void
  right: number
  bottom: number
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      data-follow-robot
      title={`${t('liveops.map.followRobot')}: ${t('liveops.map.followRobotHint')}`}
      aria-label={t('liveops.map.followRobot')}
      onClick={onFollow}
      style={{
        ...glass.overlay, border: 'none', boxShadow: 'var(--rh-shadow-sm)',
        position: 'absolute', right, bottom, zIndex: 1000,
        width: 32, height: 32, borderRadius: radius.sm + 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        color: color.accent,
      }}
    >
      <Navigation size={16} strokeWidth={1.75} aria-hidden />
    </button>
  )
})
