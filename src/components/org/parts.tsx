import { useTranslation } from 'react-i18next'
import i18n, { formatLocale } from '@/i18n'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge } from '@/components/kit'
import type { DailyCount } from '@/mocks/mockOrg'

/** Page frame for org pages: a title row, then content. Scrolls as one. */
export function OrgPage({ title, subtitle, actions, children }: {
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: `${space[5]}px ${space[6]}px ${space[10]}px`, display: 'flex', flexDirection: 'column', gap: space[5] }}>
        <header style={{ display: 'flex', alignItems: 'flex-end', gap: space[4], flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: font.weight.bold, color: color.t1, letterSpacing: font.tracking.tight }}>{title}</h1>
            {subtitle && <div style={{ marginTop: space[1], fontSize: font.size.md, color: color.t3 }}>{subtitle}</div>}
          </div>
          {actions}
        </header>
        {children}
      </div>
    </div>
  )
}

/** Why something can't be shown yet. Same idea as Fleet's "Asking Dobot". */
export type Missing = 'database' | 'sign-in' | 'backend' | 'site map'
const MISSING_KEY = {
  database: 'common.needsDatabase',
  'sign-in': 'common.needsSignIn',
  backend: 'common.needsBackend',
  'site map': 'common.needsSiteMap',
} as const
export function MissingBadge({ what }: { what: Missing }) {
  const { t } = useTranslation()
  return <Badge tone="amber">{t(MISSING_KEY[what])}</Badge>
}

/** Marks figures that are examples, not readings. */
export function SampleBadge() {
  const { t } = useTranslation()
  return <Badge title={t('common.sampleDataTitle')}>{t('common.sampleData')}</Badge>
}

/** One live count. */
export function Stat({ label, value, tone, hint }: {
  label: string
  value: React.ReactNode
  tone?: 'warn' | 'crit'
  hint?: React.ReactNode
}) {
  const c = tone === 'crit' ? color.red : tone === 'warn' ? color.amber : color.t1
  return (
    <div className="rh-panel" style={{ padding: `${space[3]}px ${space[4]}px`, minWidth: 0 }}>
      <div style={{ fontSize: 26, fontWeight: font.weight.bold, color: c, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: font.size.sm, color: color.t2, marginTop: 2 }}>{label}</div>
      {hint && <div style={{ fontSize: font.size.xs, color: color.t3, marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

/** A headed block on a page. */
export function Block({ title, aside, children, style }: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <section className="rh-panel" style={{ padding: space[4], minWidth: 0, display: 'flex', flexDirection: 'column', gap: space[3], ...style }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, flex: 1, fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  )
}

/** Daily bars with a faint grid, the top value on the axis and the first and
 * last day under it. Drawn to scale: the axis label is the real maximum. */
export function DailyBars({ data, unit = '', decimals = 0, floor = 0 }: {
  data: DailyCount[]
  unit?: string
  decimals?: number
  /** Lowest value on the axis; uptime reads better from 90 than from 0. */
  floor?: number
}) {
  const W = 320, H = 110, left = 34, bottom = 18, top = 6
  const max = Math.max(...data.map((d) => d.value), floor + 1)
  const span = max - floor
  const bw = (W - left) / data.length
  const fmt = (v: number) => `${v.toFixed(decimals)}${unit}`
  const shortDay = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString(formatLocale(), { month: 'short', day: 'numeric' })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img"
      aria-label={i18n.t('fleetDetail.org.dailyBarsAria', { from: shortDay(data[0].day), to: shortDay(data[data.length - 1].day), max: fmt(max) })}>
      {[0, 0.5, 1].map((f) => {
        const y = top + (H - bottom - top) * (1 - f)
        return <line key={f} x1={left} x2={W} y1={y} y2={y} stroke={color.border} strokeWidth={1} />
      })}
      <text x={left - 4} y={top + 4} textAnchor="end" fontSize={9} fill={color.t3} fontFamily={font.family}>{fmt(max)}</text>
      <text x={left - 4} y={H - bottom} textAnchor="end" fontSize={9} fill={color.t3} fontFamily={font.family}>{fmt(floor)}</text>
      {data.map((d, i) => {
        const h = ((Math.max(d.value, floor) - floor) / span) * (H - bottom - top)
        const last = i === data.length - 1
        return (
          <rect key={d.day} x={left + i * bw + 2} y={H - bottom - h} width={bw - 4} height={Math.max(h, 1)} rx={2}
            fill={last ? color.accent : color.accentDim}>
            <title>{`${shortDay(d.day)}: ${fmt(d.value)}`}</title>
          </rect>
        )
      })}
      <text x={left} y={H - 4} fontSize={9} fill={color.t3} fontFamily={font.family}>{shortDay(data[0].day)}</text>
      <text x={W} y={H - 4} textAnchor="end" fontSize={9} fill={color.t3} fontFamily={font.family}>{shortDay(data[data.length - 1].day)}</text>
    </svg>
  )
}

/** Dashed placeholder: says what is missing and what will appear. */
export function Placeholder({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: space[4], borderRadius: radius.md, border: `1px dashed ${color.borderLt}`, display: 'grid', gap: space[1] }}>
      <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>{title}</div>
      <div style={{ fontSize: font.size.sm, color: color.t2, lineHeight: 1.5, maxWidth: 560 }}>{children}</div>
    </div>
  )
}
