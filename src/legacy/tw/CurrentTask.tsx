import { Play, Pause, Anchor, Camera, Mic2, OctagonX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'

const BTN_H = 'h-16'

function ActionBtn({
  icon: Icon, label, variant = 'default',
}: {
  icon: React.ElementType
  label: string
  variant?: 'default' | 'primary' | 'danger'
}) {
  return (
    <button className={cn(
      BTN_H,
      'relative flex min-w-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-rh-sm border px-3.5 font-sans transition-colors',
      variant === 'primary' && 'border-rh-accent/30 bg-rh-accent text-rh-accent-text',
      variant === 'danger'  && 'border-rh-estop-border bg-rh-estop text-rh-red',
      variant === 'default' && 'border-rh-border bg-rh-card text-rh-t2 hover:bg-rh-card-hover',
    )}>
      {variant === 'danger' && (
        <span className="rec-dot absolute right-2 top-1.5 h-[7px] w-[7px] rounded-full bg-rh-red glow-red" />
      )}
      <Icon size={16} strokeWidth={variant === 'primary' ? 2.5 : 1.6} />
      <span className="whitespace-nowrap text-[10px] font-bold">{label}</span>
    </button>
  )
}

export default function CurrentTask() {
  return (
    <div className="flex h-[100px] shrink-0 items-center gap-5 border-t border-rh-border bg-rh-surface px-4">

      {/* Task info */}
      <div className="min-w-0 flex-1">
        <p className="label-section mb-1">Current Task</p>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[14px] font-bold tracking-tight text-rh-t1">
            Industrial Patrol — Sector 7B
          </span>
          <span className="rounded-rh-xs border border-rh-accent/25 bg-rh-accent/10 px-[7px] py-px text-[10px] font-bold tracking-[0.04em] text-rh-accent">
            Patrol
          </span>
        </div>
        <p className="mb-1.5 text-[11px] text-rh-t3">Waypoint 7 of 12 · Inspect Valve Cluster</p>
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-[2px] bg-rh-border">
            <div className="h-full w-[58%] rounded-[2px] bg-rh-accent" />
          </div>
          <span className="shrink-0 text-[10px] text-rh-t3">58%</span>
        </div>
      </div>

      <Separator orientation="vertical" className="h-[60px] bg-rh-border" />

      {/* ETA */}
      <div className="min-w-[60px] text-center">
        <p className="label-section mb-1">ETA</p>
        <p className="text-[22px] font-bold leading-none text-rh-t1">14</p>
        <p className="text-[10px] text-rh-t3">min</p>
      </div>

      <Separator orientation="vertical" className="h-[60px] bg-rh-border" />

      {/* Next Waypoint */}
      <div className="min-w-[80px]">
        <p className="label-section mb-1">Next Waypoint</p>
        <p className="text-[16px] font-bold text-rh-t1">32 m</p>
        <p className="text-[11px] text-rh-t3">215° SW</p>
      </div>

      <Separator orientation="vertical" className="h-[60px] bg-rh-border" />

      {/* Action buttons */}
      <div className="flex shrink-0 items-center gap-1.5">
        <ActionBtn icon={Play}     label="Start"    variant="primary" />
        <ActionBtn icon={Pause}    label="Pause"                      />
        <ActionBtn icon={Anchor}   label="Dock"                       />
        <ActionBtn icon={Camera}   label="Snapshot"                   />
        <ActionBtn icon={Mic2}     label="Speak"                      />
        <ActionBtn icon={OctagonX} label="E-Stop"   variant="danger"  />
      </div>
    </div>
  )
}
