import { useEffect, useRef, useState } from 'react'
import { Bell, Check } from 'lucide-react'
import { color, font, radius, space, shadow } from '@/design-system/tokens'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { EventSeverity } from '@/types'

const SEVERITY_COLOR: Record<EventSeverity, string> = {
  info: color.t2,
  warning: color.amber,
  fault: color.red,
  critical: color.red,
}

/** Badge counts unacknowledged alerts; opens a slide-over-style panel
 * (docs/05-ui-ux.md §2.2, §16). Available from every workspace. */
export function AlertCenterButton() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const events = useLiveOpsStore((s) => s.events)
  const acknowledgeEvent = useLiveOpsStore((s) => s.acknowledgeEvent)

  const unacked = events.filter((e) => !e.acknowledged && e.severity !== 'info')

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
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Alert center — ${unacked.length} unacknowledged`}
        style={{
          position: 'relative', background: 'transparent', border: 'none',
          color: color.t2, cursor: 'pointer', padding: 4, borderRadius: radius.sm,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Bell size={16} strokeWidth={1.5} color={color.t2} />
        {unacked.length > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderRadius: radius.full,
            background: color.accent, color: color.accentText, fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {unacked.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 320,
          background: color.elevated, border: `1px solid ${color.border}`, borderRadius: radius.lg,
          boxShadow: shadow.lg, zIndex: 50, overflow: 'hidden',
        }}>
          <div style={{
            padding: `${space[2] + 2}px ${space[3]}px`, borderBottom: `1px solid ${color.border}`,
            fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.t1,
          }}>
            Alerts {unacked.length > 0 && `(${unacked.length} unacknowledged)`}
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {events.filter((e) => e.severity !== 'info').length === 0 && (
              <div style={{ padding: space[4], fontSize: font.size.sm, color: color.t3, textAlign: 'center' }}>
                No alerts yet.
              </div>
            )}
            {events.filter((e) => e.severity !== 'info').map((e) => (
              <div key={e.event_id} style={{
                padding: `${space[2]}px ${space[3]}px`, borderBottom: `1px solid ${color.border}`,
                display: 'flex', gap: space[2], alignItems: 'flex-start',
                opacity: e.acknowledged ? 0.5 : 1,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: radius.full, marginTop: 5, flexShrink: 0,
                  background: SEVERITY_COLOR[e.severity],
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: font.size.sm, color: color.t1 }}>{e.message}</div>
                  <div style={{ fontSize: font.size.xs, color: color.t3 }}>
                    {new Date(e.ts).toLocaleTimeString()}
                  </div>
                </div>
                {!e.acknowledged && (
                  <button
                    onClick={() => acknowledgeEvent(e.event_id)}
                    title="Acknowledge"
                    style={{
                      background: 'transparent', border: `1px solid ${color.border}`, borderRadius: radius.sm,
                      color: color.t2, cursor: 'pointer', padding: 3, flexShrink: 0,
                    }}
                  >
                    <Check size={11} strokeWidth={2} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
