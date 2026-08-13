import { CircleAlert, TriangleAlert, Wifi } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { linkBanner } from '@/lib/realtime/linkHealth'
import type { BannerSeverity } from '@/lib/realtime/linkHealth'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'

const TONE: Record<BannerSeverity, { fg: string; bg: string; border: string; Icon: React.ElementType }> = {
  info: { fg: color.t1, bg: 'rgba(64,156,255,0.16)', border: color.blueBorder, Icon: Wifi },
  warning: { fg: color.t1, bg: 'rgba(255,159,10,0.18)', border: color.amberBorder, Icon: TriangleAlert },
  error: { fg: color.t1, bg: 'rgba(255,67,58,0.22)', border: color.redBorder, Icon: CircleAlert },
}

/**
 * The console's one statement about whether what it is showing can be trusted.
 *
 * A design-system `AlertBanner` with almost exactly this copy already existed —
 * and was used only on the design-system showcase page, never in the product.
 * Meanwhile a broker outage surfaced as "No robots assigned to this site yet."
 * and a dead socket surfaced as nothing at all.
 *
 * Full width and above the hero deliberately: this outranks anything in the
 * viewport, because everything else in the viewport may be a lie while it is
 * showing. docs/audit/2026-08-12-ui-ux-audit.md A-06/A-07.
 */
export function LinkBanner() {
  const linkPhase = useLiveOpsStore((s) => s.linkPhase)
  const freshness = useLiveOpsStore((s) => s.telemetryFreshness)
  const banner = linkBanner(linkPhase, freshness)
  if (!banner) return null

  const tone = TONE[banner.severity]
  return (
    <div
      // Assertive for an error: losing trust in the displayed data is an
      // interruption, not a status note.
      role={banner.severity === 'error' ? 'alert' : 'status'}
      style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: space[2],
        background: tone.bg, borderBottom: `1px solid ${tone.border}`,
        color: tone.fg, padding: `${space[2]}px ${space[4]}px`,
        fontFamily: font.family, fontSize: font.size.lg, fontWeight: font.weight.medium,
        borderRadius: 0,
      }}
    >
      <tone.Icon size={16} strokeWidth={2} style={{ flexShrink: 0 }} />
      <span>{banner.message}</span>
    </div>
  )
}

/** Standalone variant for surfaces that are not the LiveOps column (e.g. an
 * empty state that needs to explain *why* it is empty). */
export function LinkBannerInline({ style }: { style?: React.CSSProperties }) {
  const linkPhase = useLiveOpsStore((s) => s.linkPhase)
  const freshness = useLiveOpsStore((s) => s.telemetryFreshness)
  const banner = linkBanner(linkPhase, freshness)
  if (!banner) return null

  const tone = TONE[banner.severity]
  return (
    <div
      role={banner.severity === 'error' ? 'alert' : 'status'}
      style={{
        display: 'flex', alignItems: 'center', gap: space[2],
        background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: radius.md,
        color: tone.fg, padding: `${space[2]}px ${space[3]}px`,
        fontFamily: font.family, fontSize: font.size.lg, ...style,
      }}
    >
      <tone.Icon size={16} strokeWidth={2} style={{ flexShrink: 0 }} />
      <span>{banner.message}</span>
    </div>
  )
}
