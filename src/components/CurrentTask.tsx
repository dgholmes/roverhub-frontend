import { Play, Pause, Anchor, Camera, Mic2, OctagonX } from 'lucide-react'

const BTN_HEIGHT = 64

function ActionBtn({
  icon: Icon,
  label,
  variant = 'default',
}: {
  icon: React.ElementType
  label: string
  variant?: 'default' | 'primary' | 'danger'
}) {
  const bg =
    variant === 'primary' ? '#AAFF00' :
    variant === 'danger'  ? '#3D0A0A' :
    '#1C1C1F'
  const border =
    variant === 'primary' ? 'rgba(170,255,0,0.3)' :
    variant === 'danger'  ? '#7A1A1A' :
    '#252527'
  const color =
    variant === 'primary' ? '#0B0B0D' :
    variant === 'danger'  ? '#FF453A' :
    '#8B8B90'

  return (
    <button style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 4, height: BTN_HEIGHT, minWidth: 64, padding: '0 14px',
      background: bg, border: `1px solid ${border}`, borderRadius: 8,
      color, cursor: 'pointer', fontFamily: 'Outfit, system-ui',
      transition: 'background 0.15s, border-color 0.15s',
      position: 'relative', flexShrink: 0,
    }}>
      {variant === 'danger' && (
        <span style={{
          position: 'absolute', top: 6, right: 8,
          width: 7, height: 7, borderRadius: '50%',
          background: '#FF453A',
          boxShadow: '0 0 5px rgba(255,67,58,0.8)',
        }} className="rec-dot" />
      )}
      <Icon size={16} strokeWidth={variant === 'primary' ? 2.5 : 1.6} />
      <span style={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

export default function CurrentTask() {
  return (
    <div style={{
      height: 100, flexShrink: 0,
      background: '#111115',
      borderTop: '1px solid #252527',
      display: 'flex', alignItems: 'center',
      padding: '0 16px',
      gap: 20,
    }}>
      {/* Task Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#55555A', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
          Current Task
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
            Industrial Patrol — Sector 7B
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#AAFF00',
            background: 'rgba(170,255,0,0.1)', border: '1px solid rgba(170,255,0,0.25)',
            borderRadius: 4, padding: '1px 7px', letterSpacing: '0.04em',
          }}>
            Patrol
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#55555A', marginBottom: 6 }}>
          Waypoint 7 of 12 · Inspect Valve Cluster
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 4, background: '#252527', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: '58%', height: '100%', background: '#AAFF00', borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 10, color: '#55555A', flexShrink: 0 }}>58%</span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 60, background: '#252527', flexShrink: 0 }} />

      {/* ETA */}
      <div style={{ textAlign: 'center', minWidth: 60 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#55555A', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>ETA</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.1 }}>14</div>
        <div style={{ fontSize: 10, color: '#55555A' }}>min</div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 60, background: '#252527', flexShrink: 0 }} />

      {/* Next Waypoint */}
      <div style={{ minWidth: 80 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#55555A', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Next Waypoint</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF' }}>32 m</div>
        <div style={{ fontSize: 11, color: '#55555A' }}>215° SW</div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 60, background: '#252527', flexShrink: 0 }} />

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        <ActionBtn icon={Play}      label="Start"    variant="primary" />
        <ActionBtn icon={Pause}     label="Pause"                      />
        <ActionBtn icon={Anchor}    label="Dock"                       />
        <ActionBtn icon={Camera}    label="Snapshot"                   />
        <ActionBtn icon={Mic2}      label="Speak"                      />
        <ActionBtn icon={OctagonX}  label="E-Stop"   variant="danger"  />
      </div>
    </div>
  )
}
