import { useEffect, useState } from 'react'
import { Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { formatRemaining, gestureCardView, gestureSpec } from '@/liveops/gestures'
import type { RobotState } from '@/types'

/**
 * The gesture the robot is performing, while it performs it: how long is left
 * (or that it runs until stopped) and a Stop button where one is offered.
 *
 * Appears when a gesture is started from Quick Actions and goes when it ends --
 * time up, the robot leaving the gesture's state, Stop acked, or any other
 * motion or state command. See liveops/gestures.ts for which gestures run until
 * stopped, how long the others take, and what Stop sends.
 */
export function GestureCard({ robot }: { robot: RobotState }) {
  const { t } = useTranslation()
  const gesture = useLiveOpsStore((s) => s.activeGestures[robot.robot_id])
  const stopGesture = useLiveOpsStore((s) => s.stopGesture)
  const markGestureSeen = useLiveOpsStore((s) => s.markGestureSeen)
  const clearGesture = useLiveOpsStore((s) => s.clearGesture)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!gesture) return
    const tick = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(tick)
  }, [gesture])

  useEffect(() => {
    if (gesture && robot.sdk_state === gesture.id) markGestureSeen(robot.robot_id)
  }, [gesture, robot.sdk_state, robot.robot_id, markGestureSeen])

  const view = gesture ? gestureCardView(gesture, robot, now) : null
  useEffect(() => {
    if (view?.over) clearGesture(robot.robot_id)
  }, [view?.over, robot.robot_id, clearGesture])

  if (!gesture || !view || view.over) return null
  const spec = gestureSpec(gesture.id)

  return (
    <div
      role="status"
      aria-label={t('command.gestureCard.aria', { gesture: gesture.label })}
      style={{
        width: 200, ...glass.heavy, borderRadius: radius.lg, padding: space[3],
        display: 'flex', flexDirection: 'column', gap: space[2], fontFamily: font.family,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color.accent, flexShrink: 0 }} />
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {gesture.label}
        </span>
        <span style={{ fontSize: font.size.xs, color: color.t2, fontVariantNumeric: 'tabular-nums' }}>
          {view.remainingS === null
            ? t('command.gestureCard.untilStopped')
            : t('command.gestureCard.left', { time: formatRemaining(view.remainingS) })}
        </span>
      </div>

      {view.progress !== null && (
        <div style={{ height: 3, background: color.hover, borderRadius: radius.full, overflow: 'hidden' }}>
          <div style={{ width: `${view.progress * 100}%`, height: '100%', background: color.accent, transition: 'width 250ms linear' }} />
        </div>
      )}

      {spec?.stop && (view.canStop || gesture.stopping) && (
        <button
          onClick={() => stopGesture(robot.robot_id)}
          disabled={gesture.stopping}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '6px 8px', borderRadius: radius.sm, border: 'none',
            background: color.redBg, color: color.red,
            fontSize: font.size.sm, fontWeight: font.weight.semibold, fontFamily: font.family,
            cursor: gesture.stopping ? 'progress' : 'pointer', opacity: gesture.stopping ? 0.6 : 1,
          }}
        >
          <Square size={10} strokeWidth={2.6} />
          {gesture.stopping ? t('command.gestureCard.stopping') : t('command.gestureCard.stop', { gesture: gesture.label })}
        </button>
      )}
    </div>
  )
}
