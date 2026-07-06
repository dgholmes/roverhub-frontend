import { OctagonAlert } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'

/**
 * Non-dismissible while state is E_STOP (docs/05-ui-ux.md §5.3). Exact
 * required copy — do not paraphrase.
 */
export function EStopBanner() {
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
      <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, lineHeight: 1.4 }}>
        <strong>E-Stop Active</strong> — Soft stop (stand_down) engaged. Hard recovery requires an engineer
        on-site. Do not attempt to re-enable remotely.
      </span>
    </div>
  )
}
