import type { CSSProperties, ReactNode } from 'react'
import { Badge, type Tone } from '@/components/kit'
import { color, font, radius, space } from '@/design-system/tokens'

export interface RecordField { label: string; value: ReactNode }

interface RecordCardProps {
  title: string
  /** The one fact scanned alongside the title: a state, a result, an outcome. */
  badge?: { text: string; tone: Tone }
  /** Label/value pairs, wrapped two to a row at phone width. */
  fields: RecordField[]
  /** One muted line under the fields. */
  note?: ReactNode
  /** Rendered as a row under the note; each at least 36 px tall. */
  actions?: ReactNode
  /** Makes the whole card a button. Omit for a card whose actions are the only targets. */
  onOpen?: () => void
}

// A tint, not an outline: no border, outline or side stripe.
const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
  width: '100%',
  boxSizing: 'border-box',
  padding: space[3],
  background: color.card,
  borderRadius: radius.lg,
  fontFamily: font.family,
  color: color.t1,
}

/** One card for every table the touch console turns into cards. */
export function RecordCard({ title, badge, fields, note, actions, onOpen }: RecordCardProps) {
  if (import.meta.env.DEV && onOpen && actions) {
    throw new Error('RecordCard: onOpen makes the card a button, so actions would be a button inside a button')
  }

  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
        <span style={{
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: font.size.md, fontWeight: font.weight.semibold, textAlign: 'left',
        }}>{title}</span>
        {badge && <Badge tone={badge.tone}>{badge.text}</Badge>}
      </div>
      {fields.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${space[1]}px ${space[4]}px`, textAlign: 'left' }}>
          {fields.map(f => (
            <span key={f.label} style={{ display: 'inline-flex', gap: space[1], fontSize: font.size.sm }}>
              <span style={{ color: color.t3 }}>{f.label}</span>
              <span style={{ color: color.t1, fontWeight: font.weight.medium, fontVariantNumeric: 'tabular-nums' }}>{f.value}</span>
            </span>
          ))}
        </div>
      )}
      {note && <div style={{ fontSize: font.size.sm, color: color.t2, textAlign: 'left' }}>{note}</div>}
      {actions && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space[2], minHeight: 36 }}>
          {actions}
        </div>
      )}
    </>
  )

  if (onOpen) {
    return (
      <button
        type="button"
        data-record-card
        onClick={onOpen}
        style={{ ...cardStyle, minHeight: 44, border: 'none', outline: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
      >
        {body}
      </button>
    )
  }
  return <div data-record-card style={cardStyle}>{body}</div>
}
