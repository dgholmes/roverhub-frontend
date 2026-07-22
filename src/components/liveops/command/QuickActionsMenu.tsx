import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import type { RobotState } from '@/types'

/**
 * Quick Actions — SDK canned motions (docs/03-sdk-integration.md §7.1 quad
 * state list), wired through the existing SET_STATE command. Quad-only:
 * none of these states exist in the wheel-mode FSM (§7.2), so the whole
 * group is *hidden* (not disabled) when `robot.robot_type === 'wheel'`,
 * per dispatch — a disabled-with-tooltip control would imply "this could
 * work on a wheel robot under different conditions," which isn't true here.
 *
 * State name note: the plan draft that seeded this component said "dance";
 * the real SDK state (confirmed against §7.1) is `dance0`, not `dance` —
 * using the wrong string would silently fail at the edge bridge, so the
 * label reads "Dance" but the dispatched value is the verified `dance0`.
 *
 * Deliberately a single lighter-weight popover trigger rather than six
 * full-size ActionButtons — these are secondary/novelty motions, not
 * mission-critical controls, so the whole group reads as visually quieter
 * than the mission-action row and E-Stop.
 */
const QUICK_ACTIONS: { id: string; label: string }[] = [
  { id: 'wave', label: 'Wave' },
  { id: 'dance0', label: 'Dance' },
  { id: 'jump', label: 'Jump' },
  { id: 'choreo', label: 'Choreo' },
  { id: 'flying_trot', label: 'Flying Trot' },
  { id: 'rl', label: 'RL Gait' },
]

export function QuickActionsMenu({
  robot, onSetState,
}: {
  robot: RobotState
  onSetState: (state: string, label: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [open])

  if (robot.robot_type === 'wheel') return null

  const availability = getCommandAvailability(robot, 'SET_STATE')

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <DisabledReasonButton
        enabled={availability.enabled}
        reason={availability.reason}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 40, padding: '0 12px',
          background: 'transparent', border: `1px solid ${color.border}`, borderRadius: radius.md,
          color: color.t3, fontFamily: font.family, flexShrink: 0,
        }}
      >
        <Sparkles size={13} strokeWidth={1.6} />
        <span style={{ fontSize: font.size.xs, fontWeight: font.weight.medium, whiteSpace: 'nowrap' }}>Quick Actions</span>
      </DisabledReasonButton>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, width: 150,
          background: color.elevated, border: `1px solid ${color.border}`, borderRadius: radius.lg,
          padding: space[2], zIndex: 50, display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.id}
              onClick={() => { onSetState(a.id, a.label); setOpen(false) }}
              style={{
                padding: '6px 8px', borderRadius: radius.sm,
                background: 'transparent', border: 'none', color: color.t2, fontSize: font.size.sm,
                fontFamily: font.family, cursor: 'pointer', textAlign: 'left', width: '100%',
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
