import { Clock } from 'lucide-react'
import { color, font, radius } from '@/design-system/tokens'
import type { TelemetryFreshness } from '@/types'

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (sec < 60) return `${sec}s ago`
  return `${Math.round(sec / 60)}m ago`
}

/** Clock-icon + timestamp shown when telemetry freshness is stale/missing
 * (docs/05-ui-ux.md §7.2). Never a bare color signal (§19). */
export function StaleBadge({ freshness, updatedAt }: { freshness: TelemetryFreshness; updatedAt: string }) {
  if (freshness === 'live') return null
  const label = freshness === 'missing' ? 'No position fix' : `Stale · ${timeAgo(updatedAt)}`
  return (
    <span
      title={`Position last updated ${new Date(updatedAt).toLocaleTimeString()}. Dead-reckoning may have accumulated significant error.`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        padding: '1px 6px', borderRadius: radius.xs,
        background: color.redBg, border: `1px solid ${color.redBorder}`,
        color: color.red, fontSize: font.size.sm, fontWeight: font.weight.bold,
        whiteSpace: 'nowrap',
      }}
    >
      <Clock size={9} strokeWidth={2} />
      {label}
    </span>
  )
}
