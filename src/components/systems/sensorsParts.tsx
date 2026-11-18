import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, type Tone } from '@/components/kit'

/**
 * The pieces Systems › Sensors' three steps are built from. They use the
 * page's own vocabulary -- a tinted block like its Note and Confirm (no
 * outline), the kit's Badge with a dot for status -- so the steps read as the
 * same page, not a new kind of card. The right column's blocks (all values,
 * measuring, history) are the same Step, without a number.
 */

/** Text inside a step lines up with its title, past the number. */
export const STEP_INDENT = 24

/** One step: a tinted block, amber while it is the one that needs something. */
export function Step({ num, title, chip, now, children, testId }: {
  num?: number
  title: string
  chip?: { tone: Tone; text: string }
  now?: boolean
  children?: React.ReactNode
  testId?: string
}) {
  return (
    <section aria-label={title} data-step={testId} data-now={now || undefined} style={{
      display: 'grid', gap: space[2], padding: space[3], borderRadius: radius.md,
      background: now ? color.amberBg : color.hover, minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        {num !== undefined && (
          <span aria-hidden style={{ width: STEP_INDENT - space[2], fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.t3 }}>{num}</span>
        )}
        <h4 style={{ margin: 0, fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>{title}</h4>
        {chip && <span data-chip style={{ marginLeft: 'auto' }}><Badge tone={chip.tone} dot>{chip.text}</Badge></span>}
      </div>
      {children}
    </section>
  )
}

/** A line of a step's body, indented under its title. */
export function StepText({ children, muted, testId }: { children: React.ReactNode; muted?: boolean; testId?: string }) {
  return (
    <p data-testid={testId} style={{
      margin: 0, paddingLeft: STEP_INDENT, fontSize: font.size.sm, lineHeight: 1.5, color: muted ? color.t3 : color.t2,
      wordBreak: 'keep-all', overflowWrap: 'anywhere',
    }}>
      {children}
    </p>
  )
}

/** A row of a step's buttons, with an optional caption beside them. */
export function StepActions({ children, caption }: { children: React.ReactNode; caption?: string | null }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2], alignItems: 'center', paddingLeft: STEP_INDENT }}>
      {children}
      {caption && <span style={{ fontSize: font.size.xs, color: color.t3, wordBreak: 'keep-all' }}>{caption}</span>}
    </div>
  )
}

/** "Left 2/3" with a bar that fills to the target. */
export function CountBar({ label, fraction }: { label: string; fraction: number }) {
  const pct = Math.round(fraction * 100)
  return (
    <div style={{ flex: 1, minWidth: 120, display: 'grid', gap: 4, fontSize: font.size.xs, color: color.t2 }}>
      <span>{label}</span>
      <span role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
        style={{ display: 'block', height: 6, borderRadius: radius.full, background: color.gaugeTrack, overflow: 'hidden' }}>
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', borderRadius: radius.full, background: pct >= 100 ? color.green : color.amber }} />
      </span>
    </div>
  )
}

/** A one-line outcome inside a step, led by a coloured dot. */
export function StepNote({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'neutral'; children: React.ReactNode }) {
  const dot = tone === 'green' ? color.green : tone === 'amber' ? color.amber : tone === 'red' ? color.red : color.t3
  return (
    <p role="status" data-tone={tone} style={{
      margin: 0, paddingLeft: STEP_INDENT, display: 'flex', gap: space[2], alignItems: 'baseline',
      fontSize: font.size.sm, lineHeight: 1.5, color: color.t1, wordBreak: 'keep-all', overflowWrap: 'anywhere',
    }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: radius.full, background: dot, flexShrink: 0, transform: 'translateY(-1px)' }} />
      <span>{children}</span>
    </p>
  )
}
