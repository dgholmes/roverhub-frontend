import { color } from '@/design-system/tokens'

/** A track-and-thumb switch for AI detection, drawn like Data › Surveys' ShowSwitch. */
export function DetectionSwitch({ on, enabled, reason, label, onChange }: {
  on: boolean; enabled: boolean; reason?: string; label: string; onChange: (on: boolean) => void
}) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label}
      title={enabled ? label : reason}
      disabled={!enabled}
      onClick={() => onChange(!on)}
      style={{
        width: 36, height: 20, borderRadius: 10, flexShrink: 0, position: 'relative', border: 'none', padding: 0,
        cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.5,
        background: on ? color.green : color.t4, transition: 'background 0.15s',
      }}
    >
      <span aria-hidden style={{
        position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.3)', transition: 'left 0.15s',
      }} />
    </button>
  )
}
