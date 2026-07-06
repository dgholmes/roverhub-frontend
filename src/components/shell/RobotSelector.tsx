import { ChevronDown, Dog } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { color, font, radius, space } from '@/design-system/tokens'
import { STATE_DISPLAY } from '@/liveops/stateDisplay'
import { useSessionStore } from '@/store/useSessionStore'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'

/** Scopes LiveOps/Fleet detail views to a robot; selection persists across
 * workspace navigation within a session (docs/05-ui-ux.md §2.2, §2.3). */
export function RobotSelector() {
  const robots = useLiveOpsStore((s) => s.robots)
  const selectedRobotId = useSessionStore((s) => s.selectedRobotId)
  const setSelectedRobot = useSessionStore((s) => s.setSelectedRobot)
  const selected = robots.find((r) => r.robot_id === selectedRobotId) ?? robots[0]

  if (!selected) return null
  const v = STATE_DISPLAY[selected.abstract_state]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          style={{
            display: 'flex', alignItems: 'center', gap: space[2],
            padding: '6px 10px', borderRadius: radius.md,
            background: color.card, border: `1px solid ${color.border}`,
            color: color.t1, fontFamily: font.family, cursor: 'pointer',
          }}
        >
          <Dog size={13} color={color.t2} strokeWidth={1.8} />
          <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold }}>{selected.name}</span>
          <span style={{ width: 5, height: 5, borderRadius: radius.full, background: v.color, flexShrink: 0 }} />
          <ChevronDown size={11} color={color.t3} strokeWidth={2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1, minWidth: 220 }}
      >
        {robots.map((r) => {
          const rv = STATE_DISPLAY[r.abstract_state]
          return (
            <DropdownMenuItem
              key={r.robot_id}
              onSelect={() => setSelectedRobot(r.robot_id)}
              style={{ fontSize: font.size.sm, display: 'flex', justifyContent: 'space-between', gap: space[3] }}
            >
              <span>{r.name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: rv.color, fontSize: font.size.xs }}>
                <span style={{ width: 5, height: 5, borderRadius: radius.full, background: rv.color, display: 'inline-block' }} />
                {rv.label} · {r.battery.percent}%
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
