import { useState } from 'react'
import { color, font, radius, space } from '@/design-system/tokens'
import type { FootTypeInfo } from '@/types'

export function FootTypeSection({ footType }: { footType: FootTypeInfo }) {
  const [current, setCurrent] = useState(footType.current)
  const [applying, setApplying] = useState(false)

  function selectOption(opt: string) {
    if (opt === current || applying) return
    setApplying(true)
    setTimeout(() => {
      setCurrent(opt)
      setApplying(false)
    }, 1200)
  }

  return (
    <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={{ fontSize: font.size.sm, color: color.t3 }}>Current foot type</div>
      <div style={{ display: 'flex', gap: space[2] }}>
        {footType.options.map((opt) => {
          const active = opt === current
          return (
            <button
              key={opt}
              onClick={() => selectOption(opt)}
              disabled={applying}
              style={{
                padding: '10px 18px', borderRadius: radius.md, fontSize: font.size.sm, fontFamily: font.family,
                background: active ? color.accentDim : color.card,
                border: `1px solid ${active ? color.accentBorder : color.border}`,
                color: active ? color.accent : color.t2, fontWeight: active ? font.weight.semibold : font.weight.regular,
                cursor: applying ? 'not-allowed' : 'pointer', opacity: applying && !active ? 0.5 : 1,
              }}
            >
              {opt}
            </button>
          )
        })}
      </div>
      {applying && <div style={{ fontSize: font.size.xs, color: color.amber }}>Applying foot type change…</div>}
    </div>
  )
}
