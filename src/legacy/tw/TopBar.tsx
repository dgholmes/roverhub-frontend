import { ChevronDown, Diamond } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = ['Dashboard', 'Robots', 'Missions', 'Data', 'System'] as const
type NavItem = typeof NAV_ITEMS[number]

interface Props {
  active: NavItem
}

export default function TopBar({ active }: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-0 border-b border-rh-border bg-rh-surface px-5 z-10">

      {/* Logo */}
      <div className="flex min-w-[200px] items-center gap-2.5">
        <img src="/rover.png" alt="RoverHub" className="h-[34px] w-[34px] object-contain" />
        <div>
          <div className="text-[15px] font-bold leading-tight tracking-tight text-rh-t1">
            RoverHub
          </div>
          <div className="text-[10px] font-normal tracking-wide text-rh-t3">
            Quadruped Control System
          </div>
        </div>
      </div>

      {/* Center Nav */}
      <nav className="flex flex-1 justify-center gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item === active
          return (
            <button
              key={item}
              className={cn(
                'rounded-[8px] px-4 py-1.5 text-[13px] font-normal transition-colors duration-150 cursor-pointer',
                isActive
                  ? 'border border-white/10 bg-white/[0.07] font-semibold text-rh-t1'
                  : 'border border-transparent text-rh-t3 hover:text-rh-t2'
              )}
            >
              {item}
            </button>
          )
        })}
      </nav>

      {/* Right cluster */}
      <div className="flex min-w-[280px] items-center justify-end gap-4">

        {/* Edge Bridge status */}
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-rh-accent glow-accent" />
          <div>
            <div className="text-[12px] font-semibold leading-tight text-rh-t1">Edge Bridge</div>
            <div className="text-[10px] leading-tight text-rh-t3">Online</div>
          </div>
        </div>

        <div className="h-7 w-px bg-rh-border" />

        {/* Bell */}
        <button className="relative flex cursor-pointer items-center justify-center rounded-md border-none bg-transparent p-1 text-rh-t3 hover:text-rh-t2">
          <Diamond size={16} strokeWidth={1.5} />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rh-accent text-[9px] font-bold text-rh-accent-text">
            2
          </span>
        </button>

        <div className="h-7 w-px bg-rh-border" />

        {/* User */}
        <div className="flex cursor-pointer items-center gap-2">
          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-rh-border-lt bg-rh-card font-sans text-[11px] font-bold tracking-[-0.02em] text-rh-t2">
            MJ
          </div>
          <div>
            <div className="text-[12px] font-semibold leading-tight text-rh-t1">MinJae Joo</div>
            <div className="text-[10px] leading-tight text-rh-t3">Operator</div>
          </div>
          <ChevronDown size={12} strokeWidth={2} className="text-rh-t3" />
        </div>

      </div>
    </header>
  )
}
