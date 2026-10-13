import i18n from '@/i18n'
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
 * (docs/05-ui-ux.md §2.2, §16). Reachable from the Organization Console,
 * LiveOps, and (LIVEOPS_AUDIT_TRACKER.md H.3) the site-level
 * WorkspaceSidebar — the one persistent element Fleet/Missions/Data/Systems
 * all share, since there is no site-level TopBar.
 *
 * `direction` controls which way the panel opens relative to the trigger:
 * 'down' (top bar), 'up' (footer/bottom bar), 'right' (left-edge sidebar).
 * `variant` controls the trigger's own look — 'icon' (bare, default),
 * 'pill' (labeled, matching sibling footer buttons), or 'sidebar' (matches
 * IconSidebar's own item styling exactly, for the WorkspaceSidebar case). */
export function AlertCenterButton({
  direction = 'down', variant = 'icon', label,
}: {
  direction?: 'up' | 'down' | 'right'
  variant?: 'icon' | 'pill' | 'sidebar'
  label?: string
}) {
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

  const triggerStyle: React.CSSProperties =
    variant === 'sidebar' ? {
      width: 56, height: 52, borderRadius: radius.md, fontFamily: font.family,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
      background: open ? color.accentDim : 'transparent', border: 'none',
      color: open ? color.accent : color.t2, cursor: 'pointer', position: 'relative',
    } : variant === 'pill' ? {
      display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: radius.sm,
      background: open ? color.cardHover : 'transparent',
      border: `1px solid ${open ? color.borderLt : color.border}`,
      color: open ? color.t1 : color.t2, fontSize: font.size.sm, fontWeight: font.weight.medium,
      cursor: 'pointer', fontFamily: font.family, position: 'relative',
    } : {
      position: 'relative', background: 'transparent', border: 'none',
      color: color.t2, cursor: 'pointer', padding: 4, borderRadius: radius.sm,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Alert center — ${unacked.length} unacknowledged`}
        title={variant === 'sidebar' ? i18n.t('misc.alerts') : undefined}
        style={triggerStyle}
      >
        <Bell size={variant === 'sidebar' ? 20 : variant === 'icon' ? 18 : 14} strokeWidth={1.75} />
        {variant === 'pill' && label}
        {variant === 'sidebar' && <span style={{ fontSize: font.size.xs, fontWeight: font.weight.medium }}>{i18n.t('misc.alerts')}</span>}
        {unacked.length > 0 && (
          <span style={{
            position: variant === 'pill' ? 'static' : 'absolute',
            top: variant === 'pill' ? undefined : variant === 'sidebar' ? 2 : -2,
            right: variant === 'pill' ? undefined : variant === 'sidebar' ? 6 : -2,
            width: variant === 'sidebar' ? 14 : 16, height: variant === 'sidebar' ? 14 : 16,
            borderRadius: radius.full,
            background: color.red, color: '#ffffff', fontSize: font.size['2xs'], fontWeight: 700, padding: '0 3px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {unacked.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          ...(direction === 'up' ? { bottom: 'calc(100% + 8px)', right: 0 }
            : direction === 'right' ? { left: 'calc(100% + 8px)', bottom: 0 }
            : { top: 'calc(100% + 8px)', right: 0 }),
          width: 320,
          background: color.elevated, border: `1px solid ${color.border}`, borderRadius: radius.lg,
          boxShadow: shadow.lg, zIndex: 50, overflow: 'hidden',
        }}>
          <div style={{
            padding: `${space[2] + 2}px ${space[3]}px`, borderBottom: `1px solid ${color.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2],
          }}>
            <span style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.t1 }}>
              {unacked.length > 0 ? i18n.t('misc.alertsUnacked', { count: unacked.length }) : i18n.t('misc.alerts')}
            </span>
            {unacked.length > 0 && (
              <button
                onClick={() => unacked.forEach((e) => acknowledgeEvent(e.event_id))}
                style={{
                  background: 'transparent', border: 'none', color: color.t3, cursor: 'pointer',
                  fontSize: font.size.xs, fontFamily: font.family, fontWeight: font.weight.medium,
                  padding: '2px 4px', flexShrink: 0,
                }}
              >
                Dismiss all
              </button>
            )}
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
