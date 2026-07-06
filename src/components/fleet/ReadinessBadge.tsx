import { color, font, radius } from '@/design-system/tokens'
import type { ReadinessResult } from '@/liveops/fleetReadiness'

/** "Not ready" always carries its failing conditions in the tooltip — readiness
 * must be explainable, not just a red/green dot (docs/05-ui-ux.md §10.5, §18.2). */
export function ReadinessBadge({ readiness }: { readiness: ReadinessResult }) {
  const { ready, failing } = readiness
  return (
    <span
      title={ready ? undefined : failing.join('; ')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 8px', borderRadius: radius.xs,
        background: ready ? color.greenBg : color.redBg,
        border: `1px solid ${ready ? color.greenBorder : color.redBorder}`,
        color: ready ? color.green : color.red,
        fontSize: font.size.xs, fontWeight: font.weight.bold, whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: ready ? color.green : color.red, flexShrink: 0 }} />
      {ready ? 'Ready' : 'Not ready'}
    </span>
  )
}
