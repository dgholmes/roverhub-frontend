import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
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
  if (phase === 'offline') return { value: 'Disconnected', tone: 'bad' }
  if (phase === 'reconnecting') return { value: 'Reconnecting', tone: 'warn' }
  if (phase === 'connecting') return { value: 'Connecting', tone: 'warn' }
  // Amber, not red: with the socket up, absent data is almost always caused by
  // something downstream that has its own indicator — a bridge that has stopped
  // publishing already shows "Bridge offline" in red. Two reds for one fault is
  // how a status display stops being read.
  if (freshness === 'lost') return { value: 'No data', tone: 'warn' }
  if (freshness === 'delayed') return { value: 'Delayed', tone: 'warn' }
  return { value: 'OK', tone: 'ok' }
}

interface LinkRow { label: string; value: string; tone: Tone }

export function connectionRows(robot: RobotState, phase: LinkPhase, freshness: TelemetryFreshness): LinkRow[] {
  const c = robot.connectivity
  const link = cloudLink(phase, freshness)
  return [
    { label: 'Cloud link', value: link.value, tone: link.tone },
    { label: 'Edge bridge', value: c.bridge_state === 'connected' ? 'Online' : 'Offline', tone: c.bridge_state === 'connected' ? 'ok' : 'bad' },
    { label: 'Robot control (gRPC)', value: c.grpc === 'connected' ? 'Connected' : c.grpc === 'degraded' ? 'Degraded' : 'Unavailable', tone: c.grpc === 'connected' ? 'ok' : c.grpc === 'degraded' ? 'warn' : 'bad' },
    { label: 'Cameras & sensors (DDS)', value: c.dds === 'connected' ? 'Connected' : c.dds === 'reconnecting' ? 'Reconnecting' : 'Unavailable', tone: c.dds === 'connected' ? 'ok' : c.dds === 'reconnecting' ? 'warn' : 'bad' },
  ]
}

/** One word for the whole chain: the worst link wins. */
export function overallConnection(rows: LinkRow[]): { label: string; tone: Tone } {
  if (rows.some((r) => r.tone === 'bad')) return { label: 'Link down', tone: 'bad' }
  if (rows.some((r) => r.tone === 'warn')) return { label: 'Degraded', tone: 'warn' }
  return { label: 'Connected', tone: 'ok' }
}

/**
 * Connection health as one chip in the site bar — a dot and a word — with the
 * per-link breakdown a click away. It replaces the 36px status bar that ran
 * along the bottom of LiveOps: that bar restated "OK" four times on a healthy
 * system, and the one thing it existed for (noticing a link go down) works as
 * well from a coloured chip at the top of the screen.
 */
export function ConnectionStatus({ robot }: { robot: RobotState }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const phase = useLiveOpsStore((s) => s.linkPhase)
  const freshness = useLiveOpsStore((s) => s.telemetryFreshness)
  const rows = connectionRows(robot, phase, freshness)
  const overall = overallConnection(rows)
  const c = TONE_COLOR[overall.tone]

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
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Connection: ${overall.label}. Show details.`}
        className="rh-btn rh-btn--ghost rh-btn--sm"
        style={{ color: overall.tone === 'ok' ? color.t2 : c }}
      >
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
        {overall.label}
        <ChevronDown size={13} strokeWidth={1.75} aria-hidden />
      </button>

      {open && (
        <div role="dialog" aria-label="Connection details" style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 280, zIndex: 1100,
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
              Bridge latency {robot.connectivity.bridge_latency_ms} ms
            </div>
          )}
        </div>
      )}
    </div>
  )
}
