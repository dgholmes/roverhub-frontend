import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { LocateFixed } from 'lucide-react'
import { color, font, glass, radius } from '@/design-system/tokens'

/**
 * The way back into following after the operator dragged the map: a labelled
 * pill, shown only while following is paused, so it is the one thing on the
 * map that says "you are no longer watching the robot".
 *
 * Labelled rather than an icon because the crosshair in MapControls is hidden
 * on a small map and with the tools closed, which is most of the time -- an
 * operator who dragged a Split view map had no way back at all.
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
      title={t('liveops.map.followRobotHint')}
      onClick={onFollow}
      style={{
        ...glass.overlay, border: 'none', boxShadow: 'var(--rh-shadow-sm)',
        position: 'absolute', right, bottom, zIndex: 1000,
        height: 32, padding: '0 12px 0 10px', borderRadius: radius.full,
        display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
        color: color.accent, fontFamily: 'inherit', fontSize: font.size.sm, fontWeight: font.weight.semibold,
        whiteSpace: 'nowrap',
      }}
    >
      <LocateFixed size={16} strokeWidth={2} />
      {t('liveops.map.followRobot')}
    </button>
  )
})
