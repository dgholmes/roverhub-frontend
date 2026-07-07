import { useState } from 'react'
import { LockOpen, OctagonAlert } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { color, font, radius, space } from '@/design-system/tokens'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import type { CommandAvailability } from '@/types'

/**
 * Non-dismissible while state is E_STOP (docs/05-ui-ux.md §5.3), except via
 * the confirmed release action below — E-Stop is a recoverable toggle
 * (docs/01-prd.md §16.2: E_STOP -> STAND, "Authorized reset (Operator+ with
 * confirmation)"), not a one-way state requiring an on-site engineer.
 */
export function EStopBanner({
  availability, onConfirmRelease,
}: {
  availability: CommandAvailability
  onConfirmRelease: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div
      role="alert"
      style={{
        display: 'flex', alignItems: 'center', gap: space[2],
        padding: `${space[2]}px ${space[4]}px`,
        background: color.estop, borderTop: `1px solid ${color.estopBorder}`,
        borderBottom: `1px solid ${color.estopBorder}`,
        color: color.red, flexShrink: 0,
      }}
    >
      <OctagonAlert size={16} strokeWidth={2} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, lineHeight: 1.4, flex: 1 }}>
        <strong>E-Stop Active</strong> — The robot is held in a safe stopped state. An operator can release
        E-Stop once it's confirmed safe to resume.
      </span>

      <DisabledReasonButton
        enabled={availability.enabled}
        reason={availability.reason}
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          padding: '6px 12px', borderRadius: radius.md,
          background: 'transparent', border: `1px solid ${color.estopBorder}`,
          color: color.red, fontSize: font.size.sm, fontWeight: font.weight.bold, fontFamily: font.family,
        }}
      >
        <LockOpen size={13} strokeWidth={2} />
        Release E-Stop
      </DisabledReasonButton>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={{ background: color.elevated, border: `1px solid ${color.estopBorder}`, color: color.t1 }}>
          <DialogHeader>
            <DialogTitle style={{ color: color.red }}>Confirm E-Stop Release</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>
              This returns the robot to Standing. Only confirm if the area around the robot is clear and it is
              safe for it to resume normal operation.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => {
                onConfirmRelease()
                setOpen(false)
              }}
              style={{
                padding: '8px 16px', borderRadius: radius.md, background: color.red, border: 'none',
                color: '#fff', fontWeight: font.weight.bold, cursor: 'pointer', fontFamily: font.family,
              }}
            >
              Release E-Stop
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
