import { Edit2, Navigation, Users, ScanSearch, RotateCcw } from 'lucide-react'

/* ─── Gauge helpers ────────────────────────────────────────────────────────
   Coordinate system: 0° = 12 o'clock, angles increase clockwise.
   Uses explicit SVG <path> arcs — no pathLength/strokeDasharray/transform.
   ─────────────────────────────────────────────────────────────────────── */
function ptOnCircle(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}
function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const a = ptOnCircle(cx, cy, r, fromDeg)
  const b = ptOnCircle(cx, cy, r, toDeg)
  let span = toDeg - fromDeg
  if (span <= 0) span += 360
  const large = span > 180 ? 1 : 0
  return `M ${a.x.toFixed(3)} ${a.y.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(3)} ${b.y.toFixed(3)}`
}

/* ─── Battery Gauge ─── */
function BatteryGauge({ percent }: { percent: number }) {
  const CX = 48, CY = 48, R = 36, SW = 8
  // 60° gap centred at 6 o'clock (180°). START/END in our coord system (0°=top, CW).
  const START = 0, END = 360, TOTAL = 360
  const progressEnd = START + (percent / 100) * TOTAL

  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      {/* Track — tinted lime so it reads as "empty battery", not just grey */}
      <path d={arcPath(CX, CY, R, START, END)}
        fill="none" stroke="rgba(170,255,0,0.15)" strokeWidth={SW} strokeLinecap="round" />
      {/* Progress */}
      <path d={arcPath(CX, CY, R, START, progressEnd)}
        fill="none" stroke="#AAFF00" strokeWidth={SW} strokeLinecap="round"
        style={{ filter: 'drop-shadow(0 0 8px rgba(170,255,0,0.65))' }} />
      <text x={CX} y={CY - 2} textAnchor="middle" fill="#FFFFFF"
        fontSize="22" fontWeight="700" fontFamily="Outfit, system-ui, sans-serif">{percent}%</text>
      <text x={CX} y={CY + 15} textAnchor="middle" fill="#AEAEB2"
        fontSize="11" fontFamily="Outfit, system-ui, sans-serif" fontWeight="400">Battery</text>
    </svg>
  )
}

/* ─── Section Label ─── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: '#55555A',
      letterSpacing: '0.08em', textTransform: 'uppercase',
      marginBottom: 12,
    }}>
      {children}
    </div>
  )
}

/* ─── Geofence SVG Map ─── */
function GeofenceMap() {
  return (
    <div style={{
      position: 'relative', borderRadius: 8, overflow: 'hidden',
      background: '#0D1015', height: 120,
      border: '1px solid #252527',
    }}>
      {/* Fake satellite tiles via CSS grid */}
      <svg width="100%" height="100%" viewBox="0 0 240 120" preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0 }}>
        {/* Dark map background blocks to simulate satellite imagery */}
        <rect width="240" height="120" fill="#0D1015" />
        <rect x="0" y="0" width="50" height="30" fill="#121418" />
        <rect x="50" y="0" width="60" height="25" fill="#0F1216" />
        <rect x="110" y="0" width="70" height="35" fill="#111518" />
        <rect x="180" y="0" width="60" height="28" fill="#0E1214" />
        <rect x="0" y="30" width="40" height="40" fill="#111518" />
        <rect x="40" y="25" width="55" height="38" fill="#0D1015" />
        <rect x="95" y="20" width="65" height="45" fill="#121619" />
        <rect x="160" y="28" width="80" height="40" fill="#0F1316" />
        <rect x="0" y="70" width="60" height="50" fill="#0E1215" />
        <rect x="60" y="63" width="70" height="57" fill="#121619" />
        <rect x="130" y="68" width="55" height="52" fill="#0D1014" />
        <rect x="185" y="68" width="55" height="52" fill="#111518" />
        {/* Road-like lines */}
        <line x1="0" y1="60" x2="240" y2="60" stroke="#1A1E24" strokeWidth="3" />
        <line x1="120" y1="0" x2="120" y2="120" stroke="#1A1E24" strokeWidth="2" />
        <line x1="0" y1="90" x2="240" y2="85" stroke="#161A20" strokeWidth="2" />
        {/* Geofence polygon */}
        <polygon
          points="80,30 145,25 170,55 155,85 100,90 65,70 60,45"
          fill="rgba(170,255,0,0.08)"
          stroke="#AAFF00"
          strokeWidth="1.5"
          strokeDasharray="0"
        />
        {/* Robot position dot */}
        <circle cx="110" cy="58" r="5" fill="#AAFF00" style={{ filter: 'drop-shadow(0 0 4px rgba(170,255,0,0.8))' }} />
        <circle cx="110" cy="58" r="9" fill="none" stroke="rgba(170,255,0,0.3)" strokeWidth="1" />
        {/* Geofence corner dots */}
        {[[80,30],[145,25],[170,55],[155,85],[100,90],[65,70],[60,45]].map(([x,y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill="#AAFF00" />
        ))}
      </svg>
    </div>
  )
}

/* ─── Mission Preset Button ─── */
function PresetBtn({
  icon: Icon, label
}: {
  icon: React.ElementType
  label: string
}) {
  return (
    <button style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 6, padding: '10px 8px',
      background: '#1C1C1F', border: '1px solid #252527', borderRadius: 8,
      color: '#8B8B90', cursor: 'pointer', flex: 1,
      transition: 'background 0.15s, border-color 0.15s',
      fontFamily: 'Outfit, system-ui',
    }}>
      <Icon size={18} strokeWidth={1.5} />
      <span style={{ fontSize: 11, color: '#8B8B90', fontWeight: 500 }}>{label}</span>
    </button>
  )
}

export default function LeftSidebar() {
  return (
    <aside style={{
      width: 280,
      flexShrink: 0,
      background: '#111115',
      borderRight: '1px solid #252527',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>

      {/* ── Robot Header Card ── */}
      <div style={{
        padding: '14px 16px 14px',
        borderBottom: '1px solid #252527',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: '#1C1C1F', border: '1px solid #2E2E32',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <img src="/rover.png" alt="robot" style={{ width: 30, height: 30, objectFit: 'contain' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
              RVR-01 "Atlas"
            </span>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 600, color: '#AAFF00',
              background: 'rgba(170,255,0,0.1)', borderRadius: 5,
              padding: '2px 7px', border: '1px solid rgba(170,255,0,0.2)',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#AAFF00', display: 'inline-block' }} />
              Active
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 11, color: '#55555A' }}>Unit ID: RVR-01-A7C9</span>
            <Edit2 size={10} color="#55555A" strokeWidth={1.5} style={{ cursor: 'pointer' }} />
          </div>
        </div>
      </div>

      {/* ── Power & Connection ── */}
      <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid #1E1E21' }}>
        <SectionLabel>Power &amp; Connection</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <BatteryGauge percent={78} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2 }}>2h 48m</div>
            <div style={{ fontSize: 11, color: '#55555A', marginBottom: 12 }}>Est. Runtime</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#55555A' }}>Edge Bridge</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#FF8B3E' }}>Strong</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#55555A' }}>5G Link</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#AAFF00' }}>Excellent</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Control Mode ── */}
      <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid #1E1E21' }}>
        <SectionLabel>Control Mode</SectionLabel>
        <div style={{
          display: 'flex', gap: 2,
          background: '#1C1C1F', borderRadius: 8, padding: 3,
          border: '1px solid #252527', marginBottom: 10,
        }}>
          {(['Manual', 'Assisted', 'Auto'] as const).map((mode) => {
            const isActive = mode === 'Manual'
            return (
              <button key={mode} style={{
                flex: 1, padding: '6px 0', borderRadius: 6,
                border: 'none',
                background: isActive ? '#AAFF00' : 'transparent',
                color: isActive ? '#0B0B0D' : '#6A6A70',
                fontSize: 12, fontWeight: isActive ? 700 : 500,
                cursor: 'pointer', fontFamily: 'Outfit, system-ui',
                transition: 'background 0.15s, color 0.15s',
              }}>
                {mode}
              </button>
            )
          })}
        </div>
        <p style={{ fontSize: 11, color: '#55555A', lineHeight: 1.5 }}>
          You have full control of movement and actions.
        </p>
      </div>

      {/* ── Mission Presets ── */}
      <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid #1E1E21' }}>
        <SectionLabel>Mission Presets</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <PresetBtn icon={Navigation} label="Patrol" />
          <PresetBtn icon={Users} label="Escort" />
          <PresetBtn icon={ScanSearch} label="Inspect" />
          <PresetBtn icon={RotateCcw} label="Return" />
        </div>
      </div>

      {/* ── Geofence & Map ── */}
      <div style={{ padding: '16px 16px 14px', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <SectionLabel>Geofence &amp; Map</SectionLabel>
          <button style={{
            fontSize: 11, color: '#AAFF00', fontWeight: 600,
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'Outfit, system-ui', marginTop: -12,
          }}>Edit</button>
        </div>
        <GeofenceMap />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <div style={{
            flex: 1, padding: '6px 10px', borderRadius: 6,
            background: '#1C1C1F', border: '1px solid #252527',
          }}>
            <div style={{ fontSize: 10, color: '#55555A', marginBottom: 2 }}>Geofence</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#AAFF00', display: 'inline-block' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#AAFF00' }}>Active</span>
            </div>
          </div>
          <div style={{
            flex: 1, padding: '6px 10px', borderRadius: 6,
            background: '#1C1C1F', border: '1px solid #252527',
          }}>
            <div style={{ fontSize: 10, color: '#55555A', marginBottom: 2 }}>No Go Zone</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>2</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
