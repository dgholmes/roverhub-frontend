import { useSiteRobots } from '@/org/useSiteRobots'
import { ChevronDown, Dog } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { color, font, radius, space } from '@/design-system/tokens'
import { formatBatteryPercent } from '@/liveops/batteryDisplay'
import { stateVisualFor } from '@/liveops/stateDisplay'
import { useSessionStore } from '@/store/useSessionStore'
import { resolveShownRobot } from '@/liveops/shownRobot'
import { useTranslation } from 'react-i18next'

/** Scopes LiveOps/Fleet detail views to a robot; selection persists across
 * workspace navigation within a session (docs/05-ui-ux.md §2.2, §2.3). */
export function RobotSelector() {
  const robots = useSiteRobots()
  const selectedRobotId = useSessionStore((s) => s.selectedRobotId)
  const selectionPending = useSessionStore((s) => s.selectionPending)
  const setSelectedRobot = useSessionStore((s) => s.setSelectedRobot)
  const { t } = useTranslation()
  const { robot: selected, waitingFor } = resolveShownRobot(robots, selectedRobotId, selectionPending)

  if (!selected && !waitingFor) return null
  const v = selected ? stateVisualFor(selected.abstract_state, selected.sdk_state) : null

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
          <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold }}>
            {selected ? selected.name : t('sites.waitingForRobot', { robot: waitingFor ?? '' })}
          </span>
          {v && <span style={{ width: 5, height: 5, borderRadius: radius.full, background: v.color, flexShrink: 0 }} />}
          <ChevronDown size={11} color={color.t3} strokeWidth={2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1, minWidth: 220 }}
      >
        {robots.map((r) => {
          const rv = stateVisualFor(r.abstract_state, r.sdk_state)
          return (
            <DropdownMenuItem
              key={r.robot_id}
              onSelect={() => setSelectedRobot(r.robot_id)}
              style={{ fontSize: font.size.sm, display: 'flex', justifyContent: 'space-between', gap: space[3] }}
            >
              <span>{r.name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: rv.color, fontSize: font.size.xs }}>
                <span style={{ width: 5, height: 5, borderRadius: radius.full, background: rv.color, display: 'inline-block' }} />
                {rv.label} · {formatBatteryPercent(r.battery.percent)}
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
