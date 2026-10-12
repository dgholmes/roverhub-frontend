import { Gamepad2, LogOut } from 'lucide-react'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import { CommandFace, commandButtonStyle } from '../mission/ActionButton'
import type { CommandAvailability } from '@/types'

/**
 * Single toggle for manual-control ownership (docs/01-prd.md §16.2, §16.4) —
 * same button relabels between "Take Control" and "Release" rather than
 * being two separate controls, matching the E-Stop button's toggle pattern.
 * No confirm dialog either direction: unlike E-Stop this is fully reversible
 * and not a safety-critical one-way action.
 */
export function ControlToggleButton({
  active, takeAvailability, releaseAvailability, onTake, onRelease,
}: {
  active: boolean
  takeAvailability: CommandAvailability
  releaseAvailability: CommandAvailability
  onTake: () => void
  onRelease: () => void
}) {
  const availability = active ? releaseAvailability : takeAvailability

  return (
    <DisabledReasonButton
      enabled={availability.enabled}
      reason={availability.reason}
      onClick={() => (active ? onRelease() : onTake())}
      aria-label={active ? 'Release manual control' : 'Take manual control'}
      style={commandButtonStyle(active ? 'blue' : 'default')}
    >
      <CommandFace icon={active ? LogOut : Gamepad2} label={active ? 'Release control' : 'Take control'} />
    </DisabledReasonButton>
  )
}
