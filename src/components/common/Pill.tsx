import { color, font, glass } from '@/design-system/tokens'

/** Small glass-panel telemetry readout — shared by TelemetryOverlay (Default/
 * Split modes) and CockpitStatusOverlay (Cockpit mode). */
export function Pill({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <div style={{ ...glass.overlay, display: 'flex', flexDirection: 'column', borderRadius: 6, padding: '5px 10px', gap: 2 }}>
      <span style={{ fontSize: font.size.xs, color: color.t3, fontWeight: font.weight.medium }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot, flexShrink: 0, display: 'inline-block' }} />}
        <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      </div>
    </div>
  )
}
