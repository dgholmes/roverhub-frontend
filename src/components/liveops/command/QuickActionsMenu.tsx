import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { confirmationTextFor, quickActionsFor, type QuickAction } from '@/liveops/postureModel'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import type { RobotState } from '@/types'

/**
 * Quick Actions — SDK canned motions, wired through the existing SET_STATE
 * command.
 *
 * Motion list is driven live from `robot.available_motions` (the edge
 * bridge's real dobot_adapter.get_motions() response, reported every
 * heartbeat) rather than a hardcoded list — a firmware/SDK update can add
 * new canned motions (confirmed live: `backflip` exists on the real robot
 * but wasn't in this component's original hardcoded set), and different
 * robots can report different available sets. Filtering, labelling and the
 * confirmation policy all live in `@/liveops/postureModel` so they're testable
 * in this project's node-environment Vitest setup.
 *
 * ⚠️ This component used to return null for `robot.robot_type === 'wheel'`, on
 * the belief that no canned motions exist in the wheel FSM. A real miniQuadW
 * reports three — `drift`, `climb` and `handstand` — so that hid genuine
 * capability. Because the list is driven from `available_motions`, they appear
 * automatically now the early return is gone. `handstand` and `climb` are
 * physically dramatic and were hardware-unverified as of 2026-08-04, so they
 * require an explicit confirm step; `drift` dispatches on one tap like the quad
 * gestures.
 *
 * Deliberately a single lighter-weight popover trigger rather than one
 * full-size ActionButton per motion — these are secondary/novelty motions,
 * not mission-critical controls, so the whole group reads as visually
 * quieter than the mission-action row and E-Stop.
 *
 * Lives as a floating overlay on the live view/map (mounted from HeroView,
 * bottom-left, opening upward) rather than in the bottom command panel —
 * moved there per operator feedback so it's reachable without competing
 * for space with mission-critical controls, and so triggering several
 * gestures in a row doesn't require reopening the menu each time: the
 * popover deliberately stays open after a click (no auto-close), only
 * closing on an explicit outside click.
 */
export function QuickActionsMenu({
  robot, onSetState,
}: {
  robot: RobotState
  onSetState: (state: string, label: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<QuickAction | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const gestureActions = quickActionsFor(robot)
  if (gestureActions.length === 0) return null

  const availability = getCommandAvailability(robot, 'SET_STATE')

  return (
    // Bottom-right corner -- HeroInset already occupies bottom-left,
    // MediaControlsOverlay/ManualControlOverlay occupy bottom-center.
    <div ref={ref} style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 900 }}>
      <DisabledReasonButton
        enabled={availability.enabled}
        reason={availability.reason}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px',
          ...glass.overlay, borderRadius: radius.md,
          color: open ? color.t1 : color.t2, fontFamily: font.family, flexShrink: 0,
        }}
      >
        <Sparkles size={13} strokeWidth={1.6} />
        <span style={{ fontSize: font.size.xs, fontWeight: font.weight.medium, whiteSpace: 'nowrap' }}>Quick Actions</span>
      </DisabledReasonButton>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, width: 150,
          ...glass.heavy, borderRadius: radius.lg,
          padding: space[2], display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {gestureActions.map((a) => (
            <button
              key={a.id}
              // Deliberately no setOpen(false) here -- stays open after a
              // click so the operator can fire several gestures in a row
              // without reopening the menu each time. Only an explicit
              // outside click (see the effect above) closes it.
              onClick={() => {
                if (a.requiresConfirmation) setPending(a)
                else onSetState(a.id, a.label)
              }}
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

      <Dialog open={pending !== null} onOpenChange={(isOpen) => !isOpen && setPending(null)}>
        <DialogContent style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1 }}>
          <DialogHeader>
            <DialogTitle style={{ color: color.red }}>Confirm {pending?.label}</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>
              {pending ? confirmationTextFor(pending) : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => {
                if (pending) onSetState(pending.id, pending.label)
                setPending(null)
              }}
              style={{
                padding: '8px 16px', borderRadius: radius.md, background: color.red, border: 'none',
                color: '#fff', fontWeight: font.weight.bold, cursor: 'pointer', fontFamily: font.family,
              }}
            >
              Confirm {pending?.label}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
