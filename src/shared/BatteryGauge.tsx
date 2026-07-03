/**
 * BatteryGauge — shared across all dashboard versions.
 * Single source: change this file, every page updates.
 * All visual values come from tokens.ts — never hardcode here.
 */
import { color, font } from '@/design-system/tokens'

// ─── Arc geometry helpers ──────────────────────────────────────────────────
// Coordinate system: 0° = 12 o'clock, angles increase clockwise.
// Using explicit SVG <path> arcs — no pathLength/strokeDasharray/transform quirks.

function ptOnCircle(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

export function arcPath(
  cx: number, cy: number, r: number,
  fromDeg: number, toDeg: number,
): string {
  const a = ptOnCircle(cx, cy, r, fromDeg)
  const b = ptOnCircle(cx, cy, r, toDeg)
  let span = toDeg - fromDeg
  if (span <= 0) span += 360
  const large = span > 180 ? 1 : 0
  return `M ${a.x.toFixed(3)} ${a.y.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(3)} ${b.y.toFixed(3)}`
}

// ─── Gauge constants ────────────────────────────────────────────────────────
const CX = 48, CY = 48, R = 36, SW = 8
// 60° gap centred at 6 o'clock (180° in our coord system).
const START = 0   // gap right edge + 1°
const END   = 360   // gap left edge  - 1°
const TOTAL = 360   // usable arc in degrees

// ─── Component ─────────────────────────────────────────────────────────────

interface Props {
  percent: number
  label?: string
}

export function BatteryGauge({ percent, label = 'Battery' }: Props) {
  const progressEnd = START + (percent / 100) * TOTAL

  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      {/* Track — colour.gaugeTrack: tinted lime reads as "depleted capacity" */}
      <path
        d={arcPath(CX, CY, R, START, END)}
        fill="none"
        stroke={color.gaugeTrack}
        strokeWidth={SW}
        strokeLinecap="round"
      />

      {/* Progress — color.accent with glow */}
      <path
        d={arcPath(CX, CY, R, START, progressEnd)}
        fill="none"
        stroke={color.accent}
        strokeWidth={SW}
        strokeLinecap="round"
        style={{ filter: 'drop-shadow(0 0 8px rgba(170,255,0,0.65))' }}
      />

      {/* Value — color.t1 */}
      <text
        x={CX} y={CY - 2}
        textAnchor="middle"
        fill={color.t1}
        fontSize={font.size['3xl']}
        fontWeight={font.weight.bold}
        fontFamily={font.family}
      >
        {percent}%
      </text>

      {/* Label — color.svgLabel (brighter than t2 for SVG rendering) */}
      <text
        x={CX} y={CY + 15}
        textAnchor="middle"
        fill={color.svgLabel}
        fontSize={font.size.sm}
        fontWeight={font.weight.regular}
        fontFamily={font.family}
      >
        {label}
      </text>
    </svg>
  )
}
