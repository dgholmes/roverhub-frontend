import { Sun, Eye, Scan, Flame, Maximize2, Camera, Video, Mic, Volume2, MoreHorizontal, ArrowLeftRight } from 'lucide-react'

/* Shared glassmorphism token — applied to every overlay that floats above the live image */
const glass: React.CSSProperties = {
  background: 'rgba(8, 8, 10, 0.48)',
  backdropFilter: 'blur(18px) saturate(160%)',
  WebkitBackdropFilter: 'blur(18px) saturate(160%)',
  border: '1px solid rgba(255, 255, 255, 0.09)',
}

/* Consistent inset from each edge of the video canvas */
const INSET = 12

/* ─── Telemetry pill ─── */
function TelPill({
  label, value, dot
}: {
  label: string
  value: string
  dot?: 'green' | 'amber' | 'red' | 'lime'
}) {
  const dotColor =
    dot === 'lime'  ? '#AAFF00' :
    dot === 'green' ? '#30D158' :
    dot === 'amber' ? '#FF9F0A' :
    dot === 'red'   ? '#FF453A' : undefined

  return (
    <div style={{
      ...glass,
      display: 'flex', flexDirection: 'column',
      borderRadius: 6, padding: '5px 10px', gap: 2,
    }}>
      <span style={{
        fontSize: 9, color: 'rgba(255,255,255,0.38)', fontWeight: 500,
        letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {dotColor && (
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: dotColor, flexShrink: 0, display: 'inline-block',
          }} />
        )}
        <span style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF' }}>{value}</span>
      </div>
    </div>
  )
}

/* ─── Camera Mode Tab ─── */
function CamTab({
  icon: Icon, label, active
}: {
  icon: React.ElementType
  label: string
  active?: boolean
}) {
  return (
    <button style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '4px 12px', borderRadius: 6,
      background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
      border: active ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
      color: active ? '#FFFFFF' : '#55555A',
      fontSize: 12, fontWeight: active ? 600 : 400,
      cursor: 'pointer', fontFamily: 'Outfit, system-ui',
      transition: 'background 0.15s, color 0.15s',
    }}>
      <Icon size={12} strokeWidth={1.8} />
      {label}
    </button>
  )
}

/* ─── Map Inset ─── */
function MapInset() {
  return (
    <div style={{
      ...glass,
      position: 'absolute',
      bottom: INSET,
      left: INSET,
      width: 176,
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '5px 10px',
        background: 'rgba(8, 8, 10, 0.30)',
        backdropFilter: 'blur(4px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#FFFFFF' }}>Map</span>
        <ArrowLeftRight size={11} color="rgba(255,255,255,0.35)" strokeWidth={1.5} style={{ cursor: 'pointer' }} />
      </div>

      {/* Map SVG */}
      <svg width="176" height="106" viewBox="0 0 176 106" style={{ display: 'block' }}>
        <rect width="176" height="106" fill="#0A0D12" />
        {/* Subtle grid */}
        {[20, 40, 60, 80, 100].map(y => (
          <line key={y} x1="0" y1={y} x2="176" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        ))}
        {[30, 60, 90, 120, 150].map(x => (
          <line key={x} x1={x} y1="0" x2={x} y2="106" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        ))}
        {/* Route path */}
        <polyline
          points="22,80 55,62 90,74 118,50 152,52"
          fill="none" stroke="rgba(170,255,0,0.55)" strokeWidth="1.5"
        />
        {/* Waypoint dots */}
        {([[22,80],[55,62],[90,74],[118,50],[152,52]] as [number,number][]).map(([x,y], i) => (
          <circle key={i} cx={x} cy={y}
            r={i === 2 ? 5 : 3}
            fill={i === 2 ? '#AAFF00' : 'rgba(170,255,0,0.45)'}
            stroke={i === 2 ? 'rgba(170,255,0,0.25)' : 'none'}
            strokeWidth={i === 2 ? 4 : 0}
          />
        ))}
        {/* Direction arrow */}
        <polygon points="152,52 144,47 144,57" fill="rgba(170,255,0,0.75)" />
        {/* Origin pulse */}
        <circle cx="22" cy="80" r="4" fill="#AAFF00" stroke="rgba(170,255,0,0.3)" strokeWidth="5" />
      </svg>
    </div>
  )
}

/* ─── Media Controls ─── */
function MediaControls() {
  return (
    <div style={{
      ...glass,
      position: 'absolute',
      bottom: INSET,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 4,
      borderRadius: 10, padding: '6px 10px',
    }}>
      {[
        { icon: Camera,          label: 'Snapshot' },
        { icon: Video,           label: 'Record'   },
        { icon: Mic,             label: 'Mic'      },
        { icon: Volume2,         label: 'Audio'    },
        { icon: MoreHorizontal,  label: 'More'     },
      ].map(({ icon: Icon, label }) => (
        <button key={label} title={label} style={{
          width: 36, height: 36, borderRadius: 7,
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.55)', cursor: 'pointer',
          transition: 'background 0.15s, color 0.15s',
        }}>
          <Icon size={15} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  )
}

export default function LiveView() {
  return (
    <div style={{
      flex: 1,
      display: 'flex', flexDirection: 'column',
      background: '#0D0D0F',
      borderBottom: '1px solid #252527',
      overflow: 'hidden',
      minHeight: 0,
    }}>

      {/* ── Live View Header ── */}
      <div style={{
        height: 44, flexShrink: 0,
        background: '#111115',
        borderBottom: '1px solid #252527',
        display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#AAFF00', display: 'inline-block',
            boxShadow: '0 0 5px rgba(170,255,0,0.7)',
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
            Live View — RVR-01 "Atlas"
          </span>
        </div>

        <div style={{ display: 'flex', gap: 2 }}>
          <CamTab icon={Sun}   label="Day"     active />
          <CamTab icon={Eye}   label="IR"             />
          <CamTab icon={Scan}  label="LiDAR"          />
          <CamTab icon={Flame} label="Thermal"        />
        </div>

        <button style={{
          width: 28, height: 28, borderRadius: 6,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#55555A', cursor: 'pointer', marginLeft: 4,
        }}>
          <Maximize2 size={13} strokeWidth={1.5} />
        </button>
      </div>

      {/* ── Video Feed ── */}
      <div style={{
        flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0,
        background: '#0B0E12',
      }}>
        {/* Background image */}
        <img
          src="/live_view.png"
          alt="Live feed"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center',
            display: 'block',
          }}
        />

        {/* Subtle scanline overlay */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none',
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.6) 2px, rgba(255,255,255,0.6) 3px)',
        }} />

        {/* ── Telemetry pills — top-left ── */}
        <div style={{
          position: 'absolute', top: INSET, left: INSET,
          display: 'flex', gap: 6, flexWrap: 'wrap',
        }}>
          <TelPill label="Speed"       value="1.2 m/s"     />
          <TelPill label="Stability"   value="Good"         dot="lime"  />
          <TelPill label="Terrain"     value="Gravel"       dot="amber" />
          <TelPill label="Obstacles"   value="3 Detected"   dot="amber" />
          <TelPill label="Temperature" value="42 °C"        dot="amber" />
          <TelPill label="CPU/Edge"    value="63%"          dot="lime"  />
        </div>

        {/* ── REC indicator — top-right ── */}
        <div style={{
          ...glass,
          position: 'absolute', top: INSET, right: INSET,
          display: 'flex', alignItems: 'center', gap: 6,
          borderRadius: 6, padding: '5px 10px',
        }}>
          <span className="rec-dot" style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#FF453A', display: 'inline-block',
            boxShadow: '0 0 6px rgba(255,67,58,0.9)',
          }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.05em' }}>REC</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.03em' }}>00:09:46</span>
        </div>

        {/* ── Map inset — bottom-left ── */}
        <MapInset />

        {/* ── Media controls — bottom-center ── */}
        <MediaControls />
      </div>
    </div>
  )
}
