import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import type { RobotState } from '@/types'

/**
 * Quick Actions — SDK canned motions, wired through the existing SET_STATE
 * command. Quad-only: none of these states exist in the wheel-mode FSM, so
 * the whole group is *hidden* (not disabled) when `robot.robot_type ===
 * 'wheel'`, per dispatch — a disabled-with-tooltip control would imply
 * "this could work on a wheel robot under different conditions," which
 * isn't true here.
 *
 * Motion list is driven live from `robot.available_motions` (the edge
 * bridge's real dobot_adapter.get_motions() response, reported every
 * heartbeat) rather than a hardcoded list — a firmware/SDK update can add
 * new canned motions (confirmed live: `backflip` exists on the real robot
 * but wasn't in this component's original hardcoded set), and different
 * robots can report different available sets. `GESTURE_LABELS` supplies a
 * friendly display name for motions we know about; anything present in
 * `available_motions` but not in that map still shows up (via
 * `prettifyMotionId`) rather than being silently hidden, so a newly-added
 * SDK motion is usable from day one, not just after this file is updated.
 * `NON_GESTURE_MOTION_IDS` excludes motion IDs that have their own
 * dedicated UI elsewhere (postures -> PostureButtons, balance/pose/fine
 * movement -> Diagnostics > Movement/Balance) or must never be exposed here
 * (`kill_robot` -- see docs/03-sdk-integration.md §9.1/§9.2).
 *
 * Deliberately a single lighter-weight popover trigger rather than one
 * full-size ActionButton per motion — these are secondary/novelty motions,
 * not mission-critical controls, so the whole group reads as visually
 * quieter than the mission-action row and E-Stop.
 */
const GESTURE_LABELS: Record<string, string> = {
  wave: 'Wave', dance0: 'Dance', jump: 'Jump', choreo: 'Choreo',
  flying_trot: 'Flying Trot', rl: 'RL Gait', backflip: 'Backflip',
}

const NON_GESTURE_MOTION_IDS = new Set([
  // Postures -- PostureButtons.tsx already exposes these directly.
  'stand_down', 'balance_stand', 'ready', 'passive', 'recovery',
  // Continuous gaits -- driven via ManualControlOverlay, not a one-tap action.
  'walk', 'wheel_loco',
  // Fine movement -- Fleet > device drawer > Diagnostics > Movement.
  'line_walk', 'rotation', 'walk_velocity_seq', 'flying_trot_velocity_seq', 'rl_velocity_seq',
  // Balance/pose -- Fleet > device drawer > Diagnostics > Balance.
  'balance_pitch', 'balance_yaw', 'balance_roll', 'balance_height', 'balance_neutral',
  'dynamic_pose', 'static_pose',
  // Mode-switching -- Fleet > device drawer > Diagnostics > Movement.
  'change_mode',
  // Never exposed to operators (engineering-only, see docs/03-sdk-integration.md §9.1/§9.2).
  'kill_robot',
])

function prettifyMotionId(id: string): string {
  return id.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

function gestureActionsFor(robot: RobotState): { id: string; label: string }[] {
  return (robot.available_motions ?? [])
    .filter((id) => !NON_GESTURE_MOTION_IDS.has(id))
    .map((id) => ({ id, label: GESTURE_LABELS[id] ?? prettifyMotionId(id) }))
}

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

  const gestureActions = gestureActionsFor(robot)
  if (gestureActions.length === 0) return null

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
          {gestureActions.map((a) => (
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
