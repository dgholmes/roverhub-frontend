import { Sun, Eye, Scan, Flame, Maximize2, Camera, Video, Mic, Volume2, MoreHorizontal, ArrowLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const INSET = 'bottom-3 left-3'

/* ─── Telemetry pill ─── */
function TelPill({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <div className="glass flex flex-col gap-0.5 rounded-rh-sm px-2.5 py-[5px]">
      <span className="text-[9px] font-medium uppercase tracking-[0.06em] text-white/[0.38]">{label}</span>
      <div className="flex items-center gap-1">
        {dot && <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: dot }} />}
        <span className="text-[12px] font-semibold text-rh-t1">{value}</span>
      </div>
    </div>
  )
}

/* ─── Camera mode tab ─── */
function CamTab({ icon: Icon, label, active }: { icon: React.ElementType; label: string; active?: boolean }) {
  return (
    <button className={cn(
      'flex cursor-pointer items-center gap-1 rounded-rh-sm px-3 py-1 font-sans text-[12px] transition-colors',
      active
        ? 'border border-white/[0.12] bg-white/10 font-semibold text-rh-t1'
        : 'border border-transparent font-normal text-rh-t3 hover:text-rh-t2'
    )}>
      <Icon size={12} strokeWidth={1.8} />{label}
    </button>
  )
}

/* ─── Map inset ─── */
function MapInset() {
  return (
    <div className={cn('glass absolute w-[176px] overflow-hidden rounded-rh-md', INSET)}>
      <div className="flex items-center justify-between border-b border-white/[0.07] bg-black/30 px-2.5 py-[5px]">
        <span className="text-[11px] font-semibold text-rh-t1">Map</span>
        <ArrowLeftRight size={11} className="cursor-pointer text-white/35" strokeWidth={1.5} />
      </div>
      <svg width="176" height="106" viewBox="0 0 176 106" className="block">
        <rect width="176" height="106" fill="#0A0D12" />
        {[20,40,60,80,100].map(y => <line key={y} x1="0" y1={y} x2="176" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />)}
        {[30,60,90,120,150].map(x => <line key={x} x1={x} y1="0" x2={x} y2="106" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />)}
        <polyline points="22,80 55,62 90,74 118,50 152,52" fill="none" stroke="rgba(170,255,0,0.55)" strokeWidth="1.5" />
        {([[22,80],[55,62],[90,74],[118,50],[152,52]] as [number,number][]).map(([x,y],i) => (
          <circle key={i} cx={x} cy={y} r={i===2?5:3}
            fill={i===2?'#AAFF00':'rgba(170,255,0,0.45)'}
            stroke={i===2?'rgba(170,255,0,0.25)':'none'} strokeWidth={i===2?4:0} />
        ))}
        <polygon points="152,52 144,47 144,57" fill="rgba(170,255,0,0.75)" />
        <circle cx="22" cy="80" r="4" fill="#AAFF00" stroke="rgba(170,255,0,0.3)" strokeWidth="5" />
      </svg>
    </div>
  )
}

/* ─── Media controls ─── */
function MediaControls() {
  return (
    <div className="glass absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-[10px] px-2.5 py-1.5">
      {[
        { icon: Camera,         label: 'Snapshot' },
        { icon: Video,          label: 'Record'   },
        { icon: Mic,            label: 'Mic'      },
        { icon: Volume2,        label: 'Audio'    },
        { icon: MoreHorizontal, label: 'More'     },
      ].map(({ icon: Icon, label }) => (
        <button key={label} title={label}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[7px] border border-white/[0.07] bg-transparent text-white/55 transition-colors hover:text-rh-t1">
          <Icon size={15} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  )
}

export default function LiveView() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-rh-border bg-[#0D0D0F]">

      {/* Header */}
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-rh-border bg-rh-surface px-4">
        <div className="flex flex-1 items-center gap-2">
          <span className="h-[7px] w-[7px] rounded-full bg-rh-accent glow-accent" />
          <span className="text-[13px] font-semibold tracking-tight text-rh-t1">
            Live View — RVR-01 "Atlas"
          </span>
        </div>
        <div className="flex gap-0.5">
          <CamTab icon={Sun}   label="Day"     active />
          <CamTab icon={Eye}   label="IR"             />
          <CamTab icon={Scan}  label="LiDAR"          />
          <CamTab icon={Flame} label="Thermal"        />
        </div>
        <button className="ml-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-rh-sm border border-white/[0.08] bg-white/[0.05] text-rh-t3 transition-colors hover:text-rh-t1">
          <Maximize2 size={13} strokeWidth={1.5} />
        </button>
      </div>

      {/* Video canvas */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#0B0E12]">
        {/* Background image */}
        <img src="/live_view.png" alt="Live feed"
          className="absolute inset-0 h-full w-full object-cover object-center" />

        {/* Scanlines */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.6) 2px, rgba(255,255,255,0.6) 3px)' }} />

        {/* Telemetry pills — top-left */}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <TelPill label="Speed"       value="1.2 m/s"    />
          <TelPill label="Stability"   value="Good"        dot="#AAFF00" />
          <TelPill label="Terrain"     value="Gravel"      dot="#FF9F0A" />
          <TelPill label="Obstacles"   value="3 Detected"  dot="#FF9F0A" />
          <TelPill label="Temperature" value="42 °C"       dot="#FF9F0A" />
          <TelPill label="CPU/Edge"    value="63%"         dot="#AAFF00" />
        </div>

        {/* REC — top-right */}
        <div className="glass absolute right-3 top-3 flex items-center gap-1.5 rounded-rh-sm px-2.5 py-[5px]">
          <span className="rec-dot h-[7px] w-[7px] rounded-full bg-rh-red glow-red" />
          <span className="text-[11px] font-bold tracking-[0.05em] text-rh-t1">REC</span>
          <span className="text-[11px] tracking-[0.03em] text-white/40">00:09:46</span>
        </div>

        <MapInset />
        <MediaControls />
      </div>
    </div>
  )
}
