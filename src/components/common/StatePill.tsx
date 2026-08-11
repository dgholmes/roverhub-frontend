import { ShieldCheck } from 'lucide-react'
import { font, radius, space } from '@/design-system/tokens'
import { stateVisualFor } from '@/liveops/stateDisplay'
import type { AbstractState } from '@/types'

/** Prominent abstract-state indicator — required at the top of any component
 * with robot context (docs/05-ui-ux.md §5.1, §18.1). Never renders a raw SDK
 * state string. Color is never the sole signal (§19) — label text is always present.
 *
 * `sdkState` is optional but should be passed whenever a full robot is in hand:
 * it distinguishes the three down states that share abstract PASSIVE, so a
 * sitting robot reads "Sitting" rather than "Passive" (see stateVisualFor). It
 * still renders a friendly label, never the raw SDK string. */
export function StatePill(
  { state, sdkState, size = 'md' }: { state: AbstractState; sdkState?: string; size?: 'sm' | 'md' },
) {
  const v = stateVisualFor(state, sdkState)
  const isPulsing = v.pulsing
  return (
    <div
      role="status"
      aria-label={`Robot state: ${v.label}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: space[1] + 2,
        padding: size === 'sm' ? '2px 8px' : '4px 10px',
        borderRadius: radius.xs,
        background: v.bg,
        border: `1px solid ${v.border}`,
        color: v.color,
        fontSize: size === 'sm' ? font.size.xs : font.size.sm,
        fontWeight: font.weight.bold,
        letterSpacing: '0.02em',
        animation: isPulsing ? 'rh-state-pulse 1.2s ease-in-out infinite' : undefined,
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: radius.full, background: v.color, flexShrink: 0,
        boxShadow: `0 0 6px ${v.color}`,
      }} />
      {v.icon === 'shield' && <ShieldCheck size={11} strokeWidth={2} />}
      {v.label}
    </div>
  )
}
