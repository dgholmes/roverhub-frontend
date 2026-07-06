import { useState } from 'react'
import { OctagonX } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { color, font, layout, radius } from '@/design-system/tokens'
import { DisabledReasonButton } from '@/legacy/liveops-v1/common/DisabledReason'
import type { CommandAvailability } from '@/legacy/liveops-v1/types'

/**
 * Spatially distinct from the rest of the command bar (docs/05-ui-ux.md §3
 * ascii: "[CommandBar] [E-Stop Button]") and confirm-guarded since it is
 * destructive-to-mission-progress, even though it is a recoverable soft stop.
 *
 * Dialog state is controlled explicitly rather than via DialogTrigger
 * asChild — Radix's Slot clones the trigger and expects its onClick to
 * forward the native event, but DisabledReasonButton's onClick is a bare
 * () => void, which crashes Slot's event-merging on click.
 */
export function EStopButton({ availability, onConfirm }: { availability: CommandAvailability; onConfirm: () => void }) {
  const [open, setOpen] = useState(false)

  const btn = (
    <DisabledReasonButton
      enabled={availability.enabled}
      reason={availability.reason}
      onClick={() => setOpen(true)}
      aria-label="Emergency stop"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, height: layout.actionBtnHeight, minWidth: 64, padding: '0 14px',
        background: color.estop, border: `1px solid ${color.estopBorder}`, borderRadius: radius.md,
        color: color.red, fontFamily: font.family, flexShrink: 0,
      }}
    >
      <OctagonX size={18} strokeWidth={2.2} />
      <span style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, whiteSpace: 'nowrap' }}>E-STOP</span>
    </DisabledReasonButton>
  )

  if (!availability.enabled) return btn

  return (
    <>
      {btn}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={{ background: color.elevated, border: `1px solid ${color.estopBorder}`, color: color.t1 }}>
          <DialogHeader>
            <DialogTitle style={{ color: color.red }}>Confirm Emergency Stop</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>
              This immediately engages a soft stop (stand_down) on the robot. The mission will halt and
              require an engineer on-site for hard recovery. This action cannot be undone remotely.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => {
                onConfirm()
                setOpen(false)
              }}
              style={{
                padding: '8px 16px', borderRadius: radius.md, background: color.red, border: 'none',
                color: '#fff', fontWeight: font.weight.bold, cursor: 'pointer', fontFamily: font.family,
              }}
            >
              Engage E-Stop
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
