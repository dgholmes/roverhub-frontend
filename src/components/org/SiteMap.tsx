import i18n from '@/i18n'
import { color, font } from '@/design-system/tokens'
import type { AttentionSeverity } from '@/fleet/attention'

export interface SitePin {
  id: string
  name: string
  location: { lat: number; lng: number }
  robots: number
  worst: AttentionSeverity | null
}

/**
 * Sites on a plain projected grid. A stand-in until a real basemap is wired
 * in: it places each site by latitude and longitude (equirectangular, fitted
 * to the pins), so swapping in map tiles later changes the background, not
 * the data or the pins.
 */
export function SiteMap({ pins, onSelect }: { pins: SitePin[]; onSelect?: (id: string) => void }) {
  const W = 600, H = 300, pad = 48
  const lats = pins.map((p) => p.location.lat)
  const lngs = pins.map((p) => p.location.lng)
  // At least a few degrees of view, so one site or two close ones still sit
  // in a sensible frame instead of filling the box.
  const minSpan = 4
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2
  const spanLat = Math.max(Math.max(...lats) - Math.min(...lats), minSpan)
  const spanLng = Math.max(Math.max(...lngs) - Math.min(...lngs), minSpan * 2)
  const scale = Math.min((W - 2 * pad) / spanLng, (H - 2 * pad) / spanLat)
  const x = (lng: number) => W / 2 + (lng - midLng) * scale
  const y = (lat: number) => H / 2 - (lat - midLat) * scale
  const step = spanLng > 60 ? 20 : spanLng > 20 ? 10 : 2
  const gridLngs: number[] = []
  for (let g = Math.floor((midLng - (W / 2) / scale) / step) * step; g <= midLng + (W / 2) / scale; g += step) gridLngs.push(g)
  const gridLats: number[] = []
  for (let g = Math.floor((midLat - (H / 2) / scale) / step) * step; g <= midLat + (H / 2) / scale; g += step) gridLats.push(g)
  const pinColor = (w: AttentionSeverity | null) => (w === 'critical' ? color.red : w === 'warning' ? color.amber : color.green)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', background: color.mapBg, borderRadius: 8 }}
      role="img" aria-label={`Map of ${pins.length} sites`}>
      {gridLngs.map((g) => <line key={`x${g}`} x1={x(g)} x2={x(g)} y1={0} y2={H} stroke={color.mapGrid} strokeWidth={1} />)}
      {gridLats.map((g) => <line key={`y${g}`} y1={y(g)} y2={y(g)} x1={0} x2={W} stroke={color.mapGrid} strokeWidth={1} />)}
      {pins.map((p) => {
        const cx = x(p.location.lng), cy = y(p.location.lat)
        const anchorEnd = cx > W - 140
        return (
          <g key={p.id} style={{ cursor: onSelect ? 'pointer' : undefined }} onClick={() => onSelect?.(p.id)}>
            <circle cx={cx} cy={cy} r={14} fill={pinColor(p.worst)} opacity={0.18} />
            <circle cx={cx} cy={cy} r={6} fill={pinColor(p.worst)} />
            <text x={anchorEnd ? cx - 12 : cx + 12} y={cy - 2} textAnchor={anchorEnd ? 'end' : 'start'}
              fontSize={13} fontWeight={600} fill={color.t1} fontFamily={font.family}>{p.name}</text>
            <text x={anchorEnd ? cx - 12 : cx + 12} y={cy + 13} textAnchor={anchorEnd ? 'end' : 'start'}
              fontSize={11} fill={color.t2} fontFamily={font.family}>
              {p.robots === 0 ? i18n.t('common.noRobots') : i18n.t('common.robotCount', { count: p.robots })}
            </text>
            <title>{p.name}</title>
          </g>
        )
      })}
    </svg>
  )
}
