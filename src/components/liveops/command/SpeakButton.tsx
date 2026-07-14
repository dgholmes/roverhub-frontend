import { useEffect, useRef, useState } from 'react'
import { Mic2, Play as PlayIcon } from 'lucide-react'
import { color, font, layout, radius, space } from '@/design-system/tokens'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import type { CommandAvailability } from '@/types'

type Tab = 'play' | 'shout'

const CLIPS = [
  { id: 'stand-clear', label: 'Stand Clear' },
  { id: 'patrol-greeting', label: 'Patrol Greeting' },
]

/**
 * Speak, upgraded from a plain fire-and-forget command to a small popover
 * matching the reference app's Play (preset clip) / Shout (hold-to-talk)
 * split (LIVEOPS_AUDIT_TRACKER.md 4.1) — SDK-confirmed as a real distinction,
 * not just reference-app UX: the vendored SDK's VoiceCmd has a genuine
 * `type: "file"` (play a path) vs. `type: "streaming"` (live mic capture)
 * mode. Both still dispatch through the existing SPEAK command lifecycle —
 * this only changes what the operator picks before it fires.
 */
export function SpeakButton({
  availability, onPlay, onShout,
}: {
  availability: CommandAvailability
  onPlay: (clip: string) => void
  onShout: () => void
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('play')
  const [shouting, setShouting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <DisabledReasonButton
        enabled={availability.enabled}
        reason={availability.reason}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 4, height: layout.actionBtnHeight, minWidth: 64, padding: '0 14px',
          background: open ? color.cardHover : color.card, border: `1px solid ${open ? color.borderLt : color.border}`,
          borderRadius: radius.md, color: color.t2, fontFamily: font.family, flexShrink: 0,
        }}
      >
        <Mic2 size={16} strokeWidth={1.6} />
        <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, whiteSpace: 'nowrap' }}>Speak</span>
      </DisabledReasonButton>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, width: 220,
          background: color.elevated, border: `1px solid ${color.border}`, borderRadius: radius.lg,
          padding: space[2], zIndex: 50,
        }}>
          <div style={{ display: 'flex', gap: 2, marginBottom: space[2] }}>
            {(['play', 'shout'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: '5px 0', borderRadius: radius.sm, fontSize: font.size.sm, fontFamily: font.family,
                  background: tab === t ? color.cardHover : 'transparent',
                  border: `1px solid ${tab === t ? color.borderLt : 'transparent'}`,
                  color: tab === t ? color.t1 : color.t3, fontWeight: tab === t ? font.weight.semibold : font.weight.regular,
                  cursor: 'pointer', textTransform: 'capitalize',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'play' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {CLIPS.map((clip) => (
                <button
                  key={clip.id}
                  onClick={() => { onPlay(clip.label); setOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: radius.sm,
                    background: 'transparent', border: 'none', color: color.t1, fontSize: font.size.sm,
                    fontFamily: font.family, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <PlayIcon size={11} strokeWidth={2} color={color.accent} />
                  {clip.label}
                </button>
              ))}
            </div>
          ) : (
            <button
              onMouseDown={() => setShouting(true)}
              onMouseUp={() => { setShouting(false); onShout(); setOpen(false) }}
              onMouseLeave={() => setShouting(false)}
              style={{
                width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '12px 8px', borderRadius: radius.sm, fontFamily: font.family,
                background: shouting ? color.redBg : 'rgba(255,255,255,0.05)',
                border: `1px solid ${shouting ? color.redBorder : color.border}`,
                color: shouting ? color.red : color.t1, cursor: 'pointer',
              }}
            >
              <Mic2 size={18} strokeWidth={1.8} />
              <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold }}>
                {shouting ? 'Speaking…' : 'Hold to talk'}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
