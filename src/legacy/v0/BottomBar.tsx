import { ScrollText, Bell, Settings } from 'lucide-react'

function StatusItem({
  label, value, ok = true
}: {
  label: string
  value: string
  ok?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#55555A', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{
          width: 5, height: 5, borderRadius: '50%', display: 'inline-block',
          background: ok ? '#AAFF00' : '#FF453A',
        }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: ok ? '#8B8B90' : '#FF453A' }}>
          {value}
        </span>
      </div>
    </div>
  )
}

export default function BottomBar() {
  return (
    <footer style={{
      height: 48, flexShrink: 0,
      background: '#111115',
      borderTop: '1px solid #252527',
      display: 'flex', alignItems: 'center',
      padding: '0 20px',
      gap: 0,
    }}>
      {/* System Health */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
          background: '#AAFF00', boxShadow: '0 0 6px rgba(170,255,0,0.5)',
        }} />
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#FFFFFF' }}>System Health</div>
          <div style={{ fontSize: 10, color: '#AAFF00', fontWeight: 500 }}>All Systems Nominal</div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 28, background: '#252527', marginRight: 24 }} />

      {/* Status items */}
      <div style={{ display: 'flex', gap: 28, flex: 1 }}>
        <StatusItem label="Motors" value="OK" ok />
        <StatusItem label="Sensors" value="OK" ok />
        <StatusItem label="Cameras" value="OK" ok />
        <StatusItem label="LiDAR" value="Active" ok />
        <StatusItem label="Thermal" value="Active" ok />
      </div>

      {/* Right buttons */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {/* Logs */}
        <button style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', borderRadius: 6,
          background: 'transparent', border: '1px solid #252527',
          color: '#8B8B90', fontSize: 11, fontWeight: 500,
          cursor: 'pointer', fontFamily: 'Outfit, system-ui',
        }}>
          <ScrollText size={12} strokeWidth={1.5} />
          Logs
        </button>

        {/* Alerts */}
        <button style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', borderRadius: 6,
          background: 'transparent', border: '1px solid #252527',
          color: '#8B8B90', fontSize: 11, fontWeight: 500,
          cursor: 'pointer', fontFamily: 'Outfit, system-ui',
          position: 'relative',
        }}>
          <Bell size={12} strokeWidth={1.5} />
          Alerts
          <span style={{
            width: 16, height: 16, borderRadius: '50%',
            background: '#AAFF00', color: '#0B0B0D',
            fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>1</span>
        </button>

        {/* Settings */}
        <button style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', borderRadius: 6,
          background: 'transparent', border: '1px solid #252527',
          color: '#8B8B90', fontSize: 11, fontWeight: 500,
          cursor: 'pointer', fontFamily: 'Outfit, system-ui',
        }}>
          <Settings size={12} strokeWidth={1.5} />
          Settings
        </button>
      </div>
    </footer>
  )
}
