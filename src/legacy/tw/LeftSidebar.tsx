import { Edit2, Navigation, Users, ScanSearch, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BatteryGauge } from '@/shared/BatteryGauge'

/* ─── Geofence SVG Map ─── */
function GeofenceMap() {
  return (
    <div className="relative h-[120px] overflow-hidden rounded-rh-md border border-rh-border bg-[#0D1015]">
      <svg width="100%" height="100%" viewBox="0 0 240 120" preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0">
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
        <polygon points="80,30 145,25 170,55 155,85 100,90 65,70 60,45"
          fill="rgba(170,255,0,0.08)" stroke="#AAFF00" strokeWidth="1.5" />
        <circle cx="110" cy="58" r="5" fill="#AAFF00"
          style={{ filter: 'drop-shadow(0 0 4px rgba(170,255,0,0.8))' }} />
        <circle cx="110" cy="58" r="9" fill="none" stroke="rgba(170,255,0,0.3)" strokeWidth="1" />
        {([[80,30],[145,25],[170,55],[155,85],[100,90],[65,70],[60,45]] as [number,number][]).map(([x,y],i) => (
          <circle key={i} cx={x} cy={y} r="3" fill="#AAFF00" />
        ))}
      </svg>
    </div>
  )
}

/* ─── Mission Preset Button ─── */
function PresetBtn({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <button className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-rh-md border border-rh-border bg-rh-card px-2 py-2.5 font-sans text-rh-t2 transition-colors hover:bg-rh-card-hover hover:text-rh-t1">
      <Icon size={18} strokeWidth={1.5} />
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  )
}

export default function LeftSidebar() {
  return (
    <aside className="flex w-[280px] shrink-0 flex-col overflow-hidden overflow-y-auto border-r border-rh-border bg-rh-surface">

      {/* Robot Header */}
      <div className="flex items-center gap-3 border-b border-rh-border px-4 py-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-rh-md border border-rh-border-lt bg-rh-card">
          <img src="/rover.png" alt="robot" className="h-[30px] w-[30px] object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center justify-between">
            <span className="text-[14px] font-bold tracking-tight text-rh-t1">RVR-01 "Atlas"</span>
            <span className="flex items-center gap-1 rounded-rh-xs border border-rh-accent/20 bg-rh-accent/10 px-[7px] py-px text-[11px] font-bold text-rh-accent">
              <span className="h-[5px] w-[5px] rounded-full bg-rh-accent" />
              Active
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-rh-t3">Unit ID: RVR-01-A7C9</span>
            <Edit2 size={10} className="cursor-pointer text-rh-t3" strokeWidth={1.5} />
          </div>
        </div>
      </div>

      {/* Power & Connection */}
      <div className="border-b border-[#1E1E21] px-4 pb-3.5 pt-4">
        <p className="label-section mb-3">Power &amp; Connection</p>
        <div className="flex items-center gap-4">
          <BatteryGauge percent={78} />
          <div className="flex-1">
            <p className="text-[22px] font-bold leading-tight text-rh-t1">2h 48m</p>
            <p className="mb-3 text-[11px] text-rh-t3">Est. Runtime</p>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between">
                <span className="text-[11px] text-rh-t3">Edge Bridge</span>
                <span className="text-[11px] font-semibold text-rh-orange">Strong</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[11px] text-rh-t3">5G Link</span>
                <span className="text-[11px] font-semibold text-rh-accent">Excellent</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Mode */}
      <div className="border-b border-[#1E1E21] px-4 pb-3.5 pt-4">
        <p className="label-section mb-3">Control Mode</p>
        <div className="mb-2.5 flex gap-0.5 rounded-[10px] border border-rh-border bg-rh-card p-[3px]">
          {(['Manual', 'Assisted', 'Auto'] as const).map((mode) => {
            const isActive = mode === 'Manual'
            return (
              <button key={mode} className={cn(
                'flex-1 cursor-pointer rounded-rh-sm py-1.5 font-sans text-[12px] transition-colors',
                isActive
                  ? 'bg-rh-accent font-bold text-rh-accent-text'
                  : 'bg-transparent font-medium text-rh-t3 hover:text-rh-t2'
              )}>
                {mode}
              </button>
            )
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-rh-t3">
          You have full control of movement and actions.
        </p>
      </div>

      {/* Mission Presets */}
      <div className="border-b border-[#1E1E21] px-4 pb-3.5 pt-4">
        <p className="label-section mb-3">Mission Presets</p>
        <div className="grid grid-cols-2 gap-2">
          <PresetBtn icon={Navigation} label="Patrol"  />
          <PresetBtn icon={Users}      label="Escort"  />
          <PresetBtn icon={ScanSearch} label="Inspect" />
          <PresetBtn icon={RotateCcw}  label="Return"  />
        </div>
      </div>

      {/* Geofence & Map */}
      <div className="flex-1 px-4 pb-4 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="label-section">Geofence &amp; Map</p>
          <button className="cursor-pointer bg-transparent font-sans text-[11px] font-semibold text-rh-accent">
            Edit
          </button>
        </div>
        <GeofenceMap />
        <div className="mt-2 flex gap-2">
          <div className="flex-1 rounded-rh-sm border border-rh-border bg-rh-card px-2.5 py-1.5">
            <p className="mb-0.5 text-[10px] text-rh-t3">Geofence</p>
            <div className="flex items-center gap-1">
              <span className="h-[5px] w-[5px] rounded-full bg-rh-accent" />
              <span className="text-[11px] font-semibold text-rh-accent">Active</span>
            </div>
          </div>
          <div className="flex-1 rounded-rh-sm border border-rh-border bg-rh-card px-2.5 py-1.5">
            <p className="mb-0.5 text-[10px] text-rh-t3">No Go Zone</p>
            <p className="text-[13px] font-bold text-rh-t1">2</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
