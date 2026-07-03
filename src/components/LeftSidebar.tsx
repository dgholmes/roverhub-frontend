import { Edit2, Navigation, Users, ScanSearch, RotateCcw } from 'lucide-react'
import { color, font, space, radius, motion } from '@/design-system/tokens'
import { BatteryGauge } from '@/shared/BatteryGauge'

/* ─── Section Label ─── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: font.size.xs,
      fontWeight: font.weight.bold,
      color: color.t3,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      marginBottom: space[3],
    }}>
      {children}
    </div>
  )
}

/* ─── Geofence SVG Map ─── */
function GeofenceMap() {
  return (
    <div style={{
      position: 'relative', borderRadius: radius.md, overflow: 'hidden',
      background: '#0D1015', height: 120,
      border: `1px solid ${color.border}`,
    }}>
      <svg width="100%" height="100%" viewBox="0 0 240 120"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0 }}>
        <rect width="240" height="120" fill="#0D1015" />
        <rect x="0"   y="0"  width="50"  height="30" fill="#121418" />
        <rect x="50"  y="0"  width="60"  height="25" fill="#0F1216" />
        <rect x="110" y="0"  width="70"  height="35" fill="#111518" />
        <rect x="180" y="0"  width="60"  height="28" fill="#0E1214" />
        <rect x="0"   y="30" width="40"  height="40" fill="#111518" />
        <rect x="40"  y="25" width="55"  height="38" fill="#0D1015" />
        <rect x="95"  y="20" width="65"  height="45" fill="#121619" />
        <rect x="160" y="28" width="80"  height="40" fill="#0F1316" />
        <rect x="0"   y="70" width="60"  height="50" fill="#0E1215" />
        <rect x="60"  y="63" width="70"  height="57" fill="#121619" />
        <rect x="130" y="68" width="55"  height="52" fill="#0D1014" />
        <rect x="185" y="68" width="55"  height="52" fill="#111518" />
        <line x1="0" y1="60" x2="240" y2="60"  stroke="#1A1E24" strokeWidth="3" />
        <line x1="120" y1="0" x2="120" y2="120" stroke="#1A1E24" strokeWidth="2" />
        <line x1="0" y1="90" x2="240" y2="85"  stroke="#161A20" strokeWidth="2" />
        <polygon points="80,30 145,25 170,55 155,85 100,90 65,70 60,45"
          fill={color.accentDim} stroke={color.accent} strokeWidth="1.5" />
        <circle cx="110" cy="58" r="5" fill={color.accent}
          style={{ filter: 'drop-shadow(0 0 4px rgba(170,255,0,0.8))' }} />
        <circle cx="110" cy="58" r="9" fill="none"
          stroke={color.accentBorder} strokeWidth="1" />
        {([[80,30],[145,25],[170,55],[155,85],[100,90],[65,70],[60,45]] as [number,number][]).map(([x,y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill={color.accent} />
        ))}
      </svg>
    </div>
  )
}

/* ─── Mission Preset Button ─── */
function PresetBtn({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <button style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 6, padding: `${space[2]+2}px ${space[2]}px`,
      background: color.card, border: `1px solid ${color.border}`, borderRadius: radius.md,
      color: color.t2, cursor: 'pointer', flex: 1,
      transition: `background ${motion.default}, border-color ${motion.default}`,
      fontFamily: font.family,
    }}>
      <Icon size={18} strokeWidth={1.5} />
      <span style={{ fontSize: font.size.sm, color: color.t2, fontWeight: font.weight.medium }}>
        {label}
      </span>
    </button>
  )
}

export default function LeftSidebar() {
  return (
    <aside style={{
      width: 280, flexShrink: 0,
      background: color.surface,
      borderRight: `1px solid ${color.border}`,
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto', overflowX: 'hidden',
    }}>

      {/* ── Robot Header Card ── */}
      <div style={{
        padding: `14px ${space[4]}px`,
        borderBottom: `1px solid ${color.border}`,
        display: 'flex', alignItems: 'center', gap: space[3],
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: radius.lg,
          background: color.card, border: `1px solid ${color.borderLt}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <img src="/rover.png" alt="robot" style={{ width: 30, height: 30, objectFit: 'contain' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.t1, letterSpacing: '-0.01em' }}>
              RVR-01 "Atlas"
            </span>
            <span style={{
              display: 'flex', alignItems: 'center', gap: space[1],
              fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.accent,
              background: color.accentDim, borderRadius: radius.xs,
              padding: `2px ${space[2] - 1}px`, border: `1px solid ${color.accentBorder}`,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: radius.full, background: color.accent, display: 'inline-block' }} />
              Active
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: font.size.sm, color: color.t3 }}>Unit ID: RVR-01-A7C9</span>
            <Edit2 size={10} color={color.t3} strokeWidth={1.5} style={{ cursor: 'pointer' }} />
          </div>
        </div>
      </div>

      {/* ── Power & Connection ── */}
      <div style={{ padding: `${space[4]}px ${space[4]}px 14px`, borderBottom: `1px solid #1E1E21` }}>
        <SectionLabel>Power &amp; Connection</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[4] }}>
          <BatteryGauge percent={78} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: font.size['3xl'], fontWeight: font.weight.bold, color: color.t1, lineHeight: 1.2 }}>
              2h 48m
            </div>
            <div style={{ fontSize: font.size.sm, color: color.t3, marginBottom: space[3] }}>
              Est. Runtime
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: font.size.sm, color: color.t3 }}>Edge Bridge</span>
                <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.orange }}>Strong</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: font.size.sm, color: color.t3 }}>5G Link</span>
                <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.accent }}>Excellent</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Control Mode ── */}
      <div style={{ padding: `${space[4]}px ${space[4]}px 14px`, borderBottom: `1px solid #1E1E21` }}>
        <SectionLabel>Control Mode</SectionLabel>
        <div style={{
          display: 'flex', gap: 2,
          background: color.card, borderRadius: radius.md, padding: 3,
          border: `1px solid ${color.border}`, marginBottom: space[2]+2,
        }}>
          {(['Manual', 'Assisted', 'Auto'] as const).map((mode) => {
            const isActive = mode === 'Manual'
            return (
              <button key={mode} style={{
                flex: 1, padding: `${space[1]+2}px 0`, borderRadius: radius.sm,
                border: 'none',
                background: isActive ? color.accent : 'transparent',
                color: isActive ? color.accentText : color.t3,
                fontSize: font.size.md, fontWeight: isActive ? font.weight.bold : font.weight.medium,
                cursor: 'pointer', fontFamily: font.family,
                transition: `background ${motion.default}, color ${motion.default}`,
              }}>
                {mode}
              </button>
            )
          })}
        </div>
        <p style={{ fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }}>
          You have full control of movement and actions.
        </p>
      </div>

      {/* ── Mission Presets ── */}
      <div style={{ padding: `${space[4]}px ${space[4]}px 14px`, borderBottom: `1px solid #1E1E21` }}>
        <SectionLabel>Mission Presets</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2] }}>
          <PresetBtn icon={Navigation} label="Patrol"  />
          <PresetBtn icon={Users}      label="Escort"  />
          <PresetBtn icon={ScanSearch} label="Inspect" />
          <PresetBtn icon={RotateCcw}  label="Return"  />
        </div>
      </div>

      {/* ── Geofence & Map ── */}
      <div style={{ padding: `${space[4]}px ${space[4]}px`, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[3] }}>
          <SectionLabel>Geofence &amp; Map</SectionLabel>
          <button style={{
            fontSize: font.size.sm, color: color.accent, fontWeight: font.weight.semibold,
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: font.family,
            marginTop: -space[3],
          }}>
            Edit
          </button>
        </div>
        <GeofenceMap />
        <div style={{ display: 'flex', gap: space[2], marginTop: space[2] }}>
          <div style={{
            flex: 1, padding: `${space[1]+2}px ${space[2]+2}px`, borderRadius: radius.sm,
            background: color.card, border: `1px solid ${color.border}`,
          }}>
            <div style={{ fontSize: font.size.xs, color: color.t3, marginBottom: 2 }}>Geofence</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[1] }}>
              <span style={{ width: 5, height: 5, borderRadius: radius.full, background: color.accent, display: 'inline-block' }} />
              <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.accent }}>Active</span>
            </div>
          </div>
          <div style={{
            flex: 1, padding: `${space[1]+2}px ${space[2]+2}px`, borderRadius: radius.sm,
            background: color.card, border: `1px solid ${color.border}`,
          }}>
            <div style={{ fontSize: font.size.xs, color: color.t3, marginBottom: 2 }}>No Go Zone</div>
            <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>2</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
