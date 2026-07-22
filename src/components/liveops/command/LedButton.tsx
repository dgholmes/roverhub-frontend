import { useEffect, useRef, useState } from 'react'
import { Flashlight } from 'lucide-react'
import { color, font, layout, radius, space } from '@/design-system/tokens'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import type { CommandAvailability } from '@/types'

export interface LedPreset {
  id: string
  label: string
  r: number
  g: number
  b: number
  brightness: number
  swatch: string
}

/** Fixed LED target — matches the vendored SDK's e3_led_control_pub.py
 * example names (leg_light1-4, fill_light1/3). A future iteration could let
 * the operator pick the target light; one fixed name is enough to prove the
 * real params contract end to end. */
const LED_NAME = 'leg_light1'

const PRESETS: LedPreset[] = [
  { id: 'red', label: 'Red', r: 255, g: 0, b: 0, brightness: 255, swatch: '#ef4444' },
  { id: 'green', label: 'Green', r: 0, g: 255, b: 0, brightness: 255, swatch: '#22c55e' },
  { id: 'blue', label: 'Blue', r: 0, g: 0, b: 255, brightness: 255, swatch: '#3b82f6' },
  { id: 'off', label: 'Off', r: 0, g: 0, b: 0, brightness: 0, swatch: 'transparent' },
]

/**
 * LED signal picker — replaces the old fire-and-forget LED_SIGNAL button
 * (which dispatched with no params at all) with a small popover, following
 * the exact pattern established by SpeakButton.tsx. The real edge-side
 * set_led (dobot_adapter.py, wired via command_sender.py) expects
 * `params: {name, r, g, b, brightness, priority}` — each preset here
 * dispatches the full shape so the command actually does something against
 * the real bridge instead of silently no-op'ing.
 */
export function LedButton({
  availability, onSelect,
}: {
  availability: CommandAvailability
  onSelect: (params: { name: string; r: number; g: number; b: number; brightness: number; priority: number }, label: string) => void
}) {
  const [open, setOpen] = useState(false)
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
        <Flashlight size={16} strokeWidth={1.6} />
        <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, whiteSpace: 'nowrap' }}>LED</span>
      </DisabledReasonButton>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, width: 160,
          background: color.elevated, border: `1px solid ${color.border}`, borderRadius: radius.lg,
          padding: space[2], zIndex: 50, display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onSelect({ name: LED_NAME, r: p.r, g: p.g, b: p.b, brightness: p.brightness, priority: 0 }, `LED ${p.label}`)
                setOpen(false)
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: radius.sm,
                background: 'transparent', border: 'none', color: color.t1, fontSize: font.size.sm,
                fontFamily: font.family, cursor: 'pointer', textAlign: 'left', width: '100%',
              }}
            >
              <span style={{
                width: 11, height: 11, borderRadius: radius.full, background: p.swatch,
                border: `1px solid ${p.id === 'off' ? color.border : 'rgba(0,0,0,0.15)'}`, flexShrink: 0,
              }} />
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
