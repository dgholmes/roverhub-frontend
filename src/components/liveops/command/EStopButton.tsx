import { useState } from 'react'
import { LockOpen, OctagonX } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { color, font, layout, radius } from '@/design-system/tokens'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import type { AbstractState, CommandAvailability } from '@/types'

/**
 * Single toggle control for E-Stop (docs/01-prd.md §16.2: a recoverable
 * toggle, not a one-way state) — engages when not in E_STOP, releases when
 * it is. This is the only control surface for both actions; the banner
 * shown while E_STOP is active is purely informational, not a second button
 * for the same thing.
 *
 * Dialog state is controlled explicitly rather than via DialogTrigger
 * asChild — Radix's Slot clones the trigger and expects its onClick to
 * forward the native event, but DisabledReasonButton's onClick is a bare
 * () => void, which crashes Slot's event-merging on click.
 */
export function EStopButton({
  state, estopAvailability, resetAvailability, onEngage, onRelease,
}: {
  state: AbstractState
  estopAvailability: CommandAvailability
  resetAvailability: CommandAvailability
  onEngage: () => void
  onRelease: () => void
}) {
  const [open, setOpen] = useState(false)
  const isEstop = state === 'E_STOP'
  const availability = isEstop ? resetAvailability : estopAvailability

  const btn = (
    <DisabledReasonButton
      enabled={availability.enabled}
      reason={availability.reason}
      onClick={() => setOpen(true)}
      aria-label={isEstop ? 'Release emergency stop' : 'Emergency stop'}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, height: layout.actionBtnHeight, minWidth: 64, padding: '0 14px',
        background: color.estop, border: `1px solid ${color.estopBorder}`, borderRadius: radius.md,
        color: color.red, fontFamily: font.family, flexShrink: 0,
      }}
    >
      {isEstop ? <LockOpen size={18} strokeWidth={2.2} /> : <OctagonX size={18} strokeWidth={2.2} />}
      <span style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, whiteSpace: 'nowrap' }}>
        {isEstop ? 'RELEASE' : 'E-STOP'}
      </span>
    </DisabledReasonButton>
  )

  if (!availability.enabled) return btn

  return (
    <>
      {btn}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={{ background: color.elevated, border: `1px solid ${color.estopBorder}`, color: color.t1 }}>
          <DialogHeader>
            <DialogTitle style={{ color: color.red }}>
              {isEstop ? 'Confirm E-Stop Release' : 'Confirm Emergency Stop'}
            </DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>
              {isEstop
                ? "This returns the robot to Standing. Only confirm if the area around the robot is clear and it is safe for it to resume normal operation."
                : 'This immediately engages a soft stop on the robot. The mission will halt. An operator can release E-Stop once it is confirmed safe to resume.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => {
                if (isEstop) onRelease()
                else onEngage()
                setOpen(false)
              }}
              style={{
                padding: '8px 16px', borderRadius: radius.md, background: color.red, border: 'none',
                color: '#fff', fontWeight: font.weight.bold, cursor: 'pointer', fontFamily: font.family,
              }}
            >
              {isEstop ? 'Release E-Stop' : 'Engage E-Stop'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
