import { Gamepad2, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const availability = active ? releaseAvailability : takeAvailability

  return (
    <DisabledReasonButton
      enabled={availability.enabled}
      reason={availability.reason}
      onClick={() => (active ? onRelease() : onTake())}
      aria-label={active ? t('command.control.releaseAria') : t('command.control.takeAria')}
      style={commandButtonStyle(active ? 'blue' : 'default')}
    >
      <CommandFace icon={active ? LogOut : Gamepad2} label={active ? t('command.control.release') : t('command.control.take')} />
    </DisabledReasonButton>
  )
}
