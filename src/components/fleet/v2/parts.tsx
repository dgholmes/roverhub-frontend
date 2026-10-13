import { createContext, useContext } from 'react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, type Tone } from '@/components/kit'
import { PENDING_FROM_DOBOT, type PendingKey } from '@/fleet/pendingFromDobot'

/** How inspector sections draw: 'card' boxes each one (the Cards layout);
 * 'flat' sets them straight onto the page as headed groups in a grid (the
 * Sheet layout). Same content either way. */
export type SectionStyle = 'card' | 'flat'
export const SectionStyleContext = createContext<SectionStyle>('card')

/** A titled block in the inspector. Solid surface: these sit in normal flow,
 * not over the map, so there is nothing behind them to blur. */
export function Section({
  title, aside, children, span,
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
  /** Span the full grid width (for wide content such as the motor grid). */
  span?: boolean
}) {
  const flat = useContext(SectionStyleContext) === 'flat'
  return (
    <section
      className={flat ? undefined : 'rh-panel'}
      style={{ padding: flat ? 0 : space[4], minWidth: 0, gridColumn: span ? '1 / -1' : undefined }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[3] }}>
        <h3 style={{
          margin: 0, flex: 1, fontSize: font.size.md, fontWeight: font.weight.bold,
          color: color.t1, letterSpacing: font.tracking.tight,
        }}>
          {title}
        </h3>
        {aside}
      </header>
      {children}
    </section>
  )
}

/** Inspector grid: sections flow into as many columns as fit. */
export function SectionGrid({ children }: { children: React.ReactNode }) {
  const flat = useContext(SectionStyleContext) === 'flat'
  return (
    <div style={{
      display: 'grid',
      // Without card edges, whitespace has to do the separating.
      columnGap: flat ? space[10] : space[3], rowGap: flat ? space[8] : space[3],
      gridTemplateColumns: `repeat(auto-fill, minmax(min(${flat ? 280 : 300}px, 100%), 1fr))`,
      alignItems: 'start',
    }}>
      {children}
    </div>
  )
}

/** Marks a value the SDK does not give us yet. Kept visible on purpose, with
 * the number of the question we have put to Dobot. */
export function PendingBadge({ field }: { field: PendingKey }) {
  const f = PENDING_FROM_DOBOT[field]
  return (
    <Badge title={`Asked Dobot (Q${f.question}): ${f.asked}`}>
      Asking Dobot · Q{f.question}
    </Badge>
  )
}

/** Marks a value our own bridge could send but does not yet. */
export function BridgeUpdateBadge() {
  return <Badge title="Our edge bridge can report this once its registration carries it.">Needs bridge update</Badge>
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: color.t3, fontWeight: font.weight.regular, fontSize: font.size.md }}>{children}</span>
}

/** One plain line of explanation under a section's content. */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: `${space[3]}px 0 0`, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }}>
      {children}
    </p>
  )
}

/** Empty state: say what is missing and what would fill it. */
export function EmptyState({ title, children, icon: Icon }: {
  title: string
  children: React.ReactNode
  icon?: React.ElementType
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: space[2],
      padding: space[5], borderRadius: radius.md, border: `1px dashed ${color.borderLt}`,
    }}>
      {Icon && <Icon size={20} strokeWidth={1.5} color={color.t3} aria-hidden />}
      <div style={{ fontSize: font.size.lg, fontWeight: font.weight.semibold, color: color.t1 }}>{title}</div>
      <div style={{ fontSize: font.size.md, color: color.t2, lineHeight: 1.5, maxWidth: 560 }}>{children}</div>
    </div>
  )
}

export function LinkBadge({ ok, okLabel = 'Connected', badLabel = 'Down', unknown }: {
  ok: boolean
  okLabel?: string
  badLabel?: string
  unknown?: boolean
}) {
  const tone: Tone = unknown ? 'neutral' : ok ? 'green' : 'red'
  return <Badge tone={tone} dot>{unknown ? 'Unknown' : ok ? okLabel : badLabel}</Badge>
}
