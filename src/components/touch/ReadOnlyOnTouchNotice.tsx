import { useTranslation } from 'react-i18next'
import { Eye } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'

/**
 * Why a precision editor opens read-only on a touch screen (M4 §7.6.3).
 *
 * The mission editor and the map editor are drawn with a pointer: dragging a
 * waypoint, rearranging a block, tracing a zone outline. A thumb cannot hit
 * those targets honestly, so on touch both open readable and navigable rather
 * than offering controls that will miss. This says so plainly -- what can
 * still be done here, what cannot, and where editing lives -- rather than
 * apologising for it.
 *
 * A tint, never an outline (house rule), and no controls of its own: running
 * a mission is not editing it, so Run now and Schedule stay where they are.
 */
export function ReadOnlyOnTouchNotice({ what }: { what: 'mission' | 'zones' }) {
  const { t } = useTranslation()
  return (
    <div
      role="status" data-read-only-notice={what}
      style={{
        flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: space[3],
        margin: `${space[3]}px ${space[4]}px`, padding: space[3],
        borderRadius: radius.lg, background: color.accentDim,
      }}
    >
      <Eye size={20} strokeWidth={1.75} aria-hidden style={{ flexShrink: 0, color: color.accent, marginTop: 2 }} />
      <div style={{ minWidth: 0, display: 'grid', gap: space[1] }}>
        <strong style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>
          {t(`touch.readOnly.${what}Title`)}
        </strong>
        <span style={{ fontSize: font.size.sm, color: color.t2, lineHeight: 1.5 }}>
          {t(`touch.readOnly.${what}Body`)}
        </span>
      </div>
    </div>
  )
}
