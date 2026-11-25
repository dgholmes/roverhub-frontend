import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { ChevronDown, ChevronRight, Signal, SignalMedium, SignalZero } from 'lucide-react'
import { hashForSiteWorkspace } from '@/app/routes'
import { useSessionStore } from '@/store/useSessionStore'
import { color, font, radius, shadow, space } from '@/design-system/tokens'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { LinkPhase, TelemetryFreshness } from '@/lib/realtime/linkHealth'
import type { RobotState } from '@/types'

/** `neutral` exists because not every "not OK" is a fault — rendering every
 * off-nominal value in red trains people to ignore red.
 * docs/audit/2026-08-12-ui-ux-audit.md A-52. */
export type Tone = 'ok' | 'neutral' | 'warn' | 'bad'

const TONE_COLOR: Record<Tone, string> = {
  ok: color.green, neutral: color.t3, warn: color.amber, bad: color.red,
}

/** The browser's own link to the live data service — the one connection no
 * per-robot indicator can report, because when it drops there is no robot data
 * arriving to report anything with. */
export function cloudLink(phase: LinkPhase, freshness: TelemetryFreshness): { value: string; tone: Tone } {
  if (phase === 'offline') return { value: i18n.t('liveops.connection.disconnected'), tone: 'bad' }
  if (phase === 'reconnecting') return { value: i18n.t('liveops.connection.reconnecting'), tone: 'warn' }
  if (phase === 'connecting') return { value: i18n.t('liveops.connection.connecting'), tone: 'warn' }
  // Amber, not red: with the socket up, absent data is almost always caused by
  // something downstream that has its own indicator — a bridge that has stopped
  // publishing already shows "Bridge offline" in red. Two reds for one fault is
  // how a status display stops being read.
  if (freshness === 'lost') return { value: i18n.t('liveops.connection.noData'), tone: 'warn' }
  if (freshness === 'delayed') return { value: i18n.t('liveops.connection.delayed'), tone: 'warn' }
  return { value: i18n.t('liveops.connection.ok'), tone: 'ok' }
}

interface LinkRow { label: string; value: string; tone: Tone }

export function connectionRows(robot: RobotState, phase: LinkPhase, freshness: TelemetryFreshness): LinkRow[] {
  const c = robot.connectivity
  const link = cloudLink(phase, freshness)
  const t = i18n.t.bind(i18n)
  return [
    { label: t('liveops.connection.cloudLink'), value: link.value, tone: link.tone },
    { label: t('liveops.connection.edgeBridge'), value: c.bridge_state === 'connected' ? t('liveops.connection.online') : t('liveops.connection.offline'), tone: c.bridge_state === 'connected' ? 'ok' : 'bad' },
    { label: t('liveops.connection.robotControl'), value: c.grpc === 'connected' ? t('liveops.connection.connected') : c.grpc === 'degraded' ? t('liveops.connection.degraded') : t('liveops.connection.unavailable'), tone: c.grpc === 'connected' ? 'ok' : c.grpc === 'degraded' ? 'warn' : 'bad' },
    { label: t('liveops.connection.camerasSensors'), value: c.dds === 'connected' ? t('liveops.connection.connected') : c.dds === 'reconnecting' ? t('liveops.connection.reconnecting') : t('liveops.connection.unavailable'), tone: c.dds === 'connected' ? 'ok' : c.dds === 'reconnecting' ? 'warn' : 'bad' },
  ]
}

/** One word for the whole chain: the worst link wins. */
export function overallConnection(rows: LinkRow[]): { label: string; tone: Tone } {
  if (rows.some((r) => r.tone === 'bad')) return { label: i18n.t('liveops.connection.linkDown'), tone: 'bad' }
  if (rows.some((r) => r.tone === 'warn')) return { label: i18n.t('liveops.connection.degraded'), tone: 'warn' }
  return { label: i18n.t('liveops.connection.connected'), tone: 'ok' }
}

/** Which bars the trigger draws in `icon` form. A signal meter is the one
 * symbol every operator already reads as "how good is the link", which is the
 * question this control answers. */
const TONE_ICON = { ok: Signal, neutral: SignalMedium, warn: SignalMedium, bad: SignalZero } as const

/** The panel's width, and the margin it keeps off the edge of the screen. */
const PANEL_WIDTH = 280
const PANEL_MARGIN = 8

/**
 * Connection health with the per-link breakdown a click away. It replaces the
 * 36px status bar that ran along the bottom of LiveOps: that bar restated "OK"
 * four times on a healthy system, and the one thing it existed for (noticing a
 * link go down) works as well from a coloured chip at the top of the screen.
 *
 * Two triggers. `chip` — a dot and a word — is the desktop site bar's. `icon`
 * is a signal meter alone, for the touch strip's pinned right end, where a
 * word costs width the readings need and a meter is what a handheld's own
 * status bar would show. Both open the same panel.
 *
 * ⚠️ **The panel is portalled to `<body>` and positioned `fixed`.** It used to
 * be an absolutely-positioned child, which worked in the desktop bar and was
 * invisible in the touch strip: that strip sets `overflow: hidden` (it is one
 * non-wrapping row), so the panel rendered, reported a sensible
 * `getBoundingClientRect`, and painted nothing — tapping the chip looked like
 * a dead control. Never put this panel back in the flow.
 */
export function ConnectionStatus({ robot, variant = 'chip' }: {
  robot: RobotState
  variant?: 'chip' | 'icon'
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const phase = useLiveOpsStore((s) => s.linkPhase)
  const freshness = useLiveOpsStore((s) => s.telemetryFreshness)
  const rows = connectionRows(robot, phase, freshness)
  const activeSiteId = useSessionStore((s) => s.activeSiteId)
  const overall = overallConnection(rows)
  const c = TONE_COLOR[overall.tone]
  const Icon = TONE_ICON[overall.tone]

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (ref.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onClickOutside)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onClickOutside)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Placed from the trigger's rect, re-read on resize and on any scroll, so
  // the panel follows a bar that moves under it.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => setAnchor(ref.current?.getBoundingClientRect() ?? null)
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  // Right-aligned to the trigger, then pulled back on screen: on a phone the
  // trigger is at the right edge and the panel would hang off it.
  const viewportW = typeof window === 'undefined' ? PANEL_WIDTH : window.innerWidth
  const left = anchor
    ? Math.max(PANEL_MARGIN, Math.min(anchor.right - PANEL_WIDTH, viewportW - PANEL_WIDTH - PANEL_MARGIN))
    : 0

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t('liveops.connection.triggerAria', { label: overall.label })}
        title={variant === 'icon' ? overall.label : undefined}
        className={variant === 'icon' ? 'rh-icon-btn rh-icon-btn--sm' : 'rh-btn rh-btn--ghost rh-btn--sm'}
        style={{ color: overall.tone === 'ok' ? color.t2 : c }}
      >
        {variant === 'icon' ? (
          <Icon size={18} strokeWidth={1.9} aria-hidden style={{ color: c }} />
        ) : (
          <>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
            {overall.label}
            <ChevronDown size={13} strokeWidth={1.75} aria-hidden />
          </>
        )}
      </button>

      {open && createPortal(
        <div ref={panelRef} role="dialog" aria-label={t('liveops.connection.dialogAria')} style={{
          position: 'fixed',
          top: anchor ? anchor.bottom + 6 : 0,
          left,
          visibility: anchor ? 'visible' : 'hidden',
          width: PANEL_WIDTH, zIndex: 1100,
          background: color.elevated, border: `1px solid ${color.border}`, borderRadius: radius.lg,
          boxShadow: shadow.lg, padding: space[3], display: 'flex', flexDirection: 'column', gap: space[2],
          fontFamily: font.family,
        }}>
          <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>
            {robot.name}
          </div>
          {rows.map((r) => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm }}>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: TONE_COLOR[r.tone], flexShrink: 0 }} />
              <span style={{ flex: 1, color: color.t2 }}>{r.label}</span>
              <span style={{ color: r.tone === 'ok' ? color.t1 : TONE_COLOR[r.tone], fontWeight: font.weight.medium }}>{r.value}</span>
            </div>
          ))}
          {robot.connectivity.bridge_latency_ms != null && (
            <div style={{ fontSize: font.size.xs, color: color.t3, fontVariantNumeric: 'tabular-nums' }}>
              {t('liveops.connection.bridgeLatency', { ms: robot.connectivity.bridge_latency_ms })}
            </div>
          )}
          <a
            href={hashForSiteWorkspace(activeSiteId, 'Fleet')}
            onClick={() => setOpen(false)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: space[1], fontSize: font.size.sm, color: color.t2, textDecoration: 'none',
            }}
          >
            {t('liveops.connection.viewDetails')}
            <ChevronRight size={13} strokeWidth={1.75} aria-hidden />
          </a>
        </div>,
        document.body,
      )}
    </div>
  )
}
