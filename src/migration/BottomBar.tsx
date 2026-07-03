import { ScrollText, Bell, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'

function StatusItem({ label, value, ok = true }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex flex-col gap-px">
      <span className="label-section">{label}</span>
      <div className="flex items-center gap-1">
        <span className={cn('h-[5px] w-[5px] rounded-full', ok ? 'bg-rh-accent' : 'bg-rh-red')} />
        <span className={cn('text-[11px] font-semibold', ok ? 'text-rh-t2' : 'text-rh-red')}>
          {value}
        </span>
      </div>
    </div>
  )
}

function BarBtn({ icon: Icon, label, badge }: { icon: React.ElementType; label: string; badge?: number }) {
  return (
    <button className="flex cursor-pointer items-center gap-1.5 rounded-rh-sm border border-rh-border bg-transparent px-3 py-[5px] font-sans text-[11px] font-medium text-rh-t2 transition-colors hover:text-rh-t1">
      <Icon size={12} strokeWidth={1.5} />
      {label}
      {badge != null && (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rh-accent text-[9px] font-bold text-rh-accent-text">
          {badge}
        </span>
      )}
    </button>
  )
}

export default function BottomBar() {
  return (
    <footer className="flex h-12 shrink-0 items-center border-t border-rh-border bg-rh-surface px-5">
      {/* System Health */}
      <div className="flex min-w-[180px] items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-rh-accent glow-accent" />
        <div>
          <div className="text-[11px] font-semibold text-rh-t1">System Health</div>
          <div className="text-[10px] font-medium text-rh-accent">All Systems Nominal</div>
        </div>
      </div>

      <Separator orientation="vertical" className="mx-6 h-7 bg-rh-border" />

      {/* Status items */}
      <div className="flex flex-1 items-center gap-7">
        <StatusItem label="Motors"  value="OK"     ok />
        <StatusItem label="Sensors" value="OK"     ok />
        <StatusItem label="Cameras" value="OK"     ok />
        <StatusItem label="LiDAR"   value="Active" ok />
        <StatusItem label="Thermal" value="Active" ok />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <BarBtn icon={ScrollText} label="Logs"   />
        <BarBtn icon={Bell}       label="Alerts" badge={1} />
        <BarBtn icon={Settings}   label="Settings" />
      </div>
    </footer>
  )
}
