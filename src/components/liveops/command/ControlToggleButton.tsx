import { Gamepad2, LogOut } from 'lucide-react'
import { color, font, layout, radius } from '@/design-system/tokens'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
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
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, height: layout.actionBtnHeight, minWidth: 64, padding: '0 14px',
        background: active ? color.blueBg : color.card,
        border: `1px solid ${active ? color.blueBorder : color.border}`,
        borderRadius: radius.md, color: active ? color.blue : color.t2, fontFamily: font.family, flexShrink: 0,
      }}
    >
      {active ? <LogOut size={16} strokeWidth={1.8} /> : <Gamepad2 size={16} strokeWidth={1.8} />}
      <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, whiteSpace: 'nowrap' }}>
        {active ? 'Release' : 'Take Control'}
      </span>
    </DisabledReasonButton>
  )
}
