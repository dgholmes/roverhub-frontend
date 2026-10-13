import { useState } from 'react'
import { MonitorPlay } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'
import { Badge, Button, Tabs } from '@/components/kit'
import { EStopButton } from '@/components/liveops/command/EStopButton'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { stateVisualFor } from '@/liveops/stateDisplay'
import { robotTypeLabel } from '@/lib/robotCapabilities'
import { reachabilityOf } from '@/lib/connectivityHealth'
import { hashForSiteWorkspace } from '@/app/routes'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import type { RobotState } from '@/types'
import { StatusTab } from './StatusTab'
import { MotorsTab } from './MotorsTab'
import { TestsTab } from './TestsTab'
import { ServiceTab } from './ServiceTab'
import { LinksTab } from './LinksTab'
import { MaintenanceTab } from './MaintenanceTab'
import { OverviewTab } from './OverviewTab'
import { SectionStyleContext } from './parts'

export type InspectorTab = 'overview' | 'status' | 'motors' | 'tests' | 'service' | 'links' | 'maintenance'
export type InspectorVariant = 'cards' | 'sheet'

/** Sheet folds status, links and maintenance into one Overview page. */
const SHEET_TABS: { value: InspectorTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'motors', label: 'Motors' },
  { value: 'tests', label: 'Motion tests' },
  { value: 'service', label: 'Service' },
]

const CARD_TABS: { value: InspectorTab; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'motors', label: 'Motors' },
  { value: 'tests', label: 'Motion tests' },
  { value: 'service', label: 'Service' },
  { value: 'links', label: 'Links' },
  { value: 'maintenance', label: 'Maintenance' },
]

/**
 * Full-height detail for one robot (layout A). The header never scrolls, so
 * the E-Stop stays in reach from every tab — including Motion tests, which
 * move the real robot.
 */
export function RobotInspector({
  robot, onOpenBridge, variant = 'cards',
}: {
  robot: RobotState
  onOpenBridge: () => void
  variant?: InspectorVariant
}) {
  const tabs = variant === 'sheet' ? SHEET_TABS : CARD_TABS
  const [selectedTab, setTab] = useState<InspectorTab>(tabs[0].value)
  const tab = tabs.some((t) => t.value === selectedTab) ? selectedTab : tabs[0].value
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const latestEstop = useLiveOpsStore((s) =>
    s.activeCommands.find((c) => c.type === 'ESTOP' && c.robot_id === robot.robot_id))
  const setSelectedRobot = useSessionStore((s) => s.setSelectedRobot)
  const v = stateVisualFor(robot.abstract_state, robot.sdk_state)
  const online = reachabilityOf(robot) === 'online'

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <header style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: space[4], flexWrap: 'wrap',
        padding: `${space[4]}px ${space[5]}px ${space[3]}px`,
      }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{
            margin: 0, fontSize: 20, fontWeight: font.weight.bold, color: color.t1, letterSpacing: font.tracking.tight,
          }}>
            {robot.name}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginTop: space[1], flexWrap: 'wrap' }}>
            <Badge dot style={{ color: v.color }}>{v.label}</Badge>
            {robot.posture === 'fallen' && <Badge tone="red" dot>Fallen</Badge>}
            {!online && <Badge tone="amber" dot>Unreachable</Badge>}
            <span style={{ fontSize: font.size.sm, color: color.t3 }}>
              {robotTypeLabel(robot.robot_type)} · {robot.robot_id}
            </span>
          </div>
        </div>
        <Button
          icon={MonitorPlay}
          onClick={() => {
            setSelectedRobot(robot.robot_id)
            window.location.hash = hashForSiteWorkspace(robot.site_id, 'LiveOps')
          }}
        >
          Open in LiveOps
        </Button>
        <EStopButton
          state={robot.abstract_state}
          engageCommand={latestEstop}
          estopAvailability={getCommandAvailability(robot, 'ESTOP')}
          resetAvailability={getCommandAvailability(robot, 'RESET_ESTOP')}
          onEngage={() => dispatchCommand(robot.robot_id, 'ESTOP', 'Emergency Stop')}
          onRelease={() => dispatchCommand(robot.robot_id, 'RESET_ESTOP', 'Release E-Stop')}
        />
      </header>
      <div style={{ flexShrink: 0, padding: `0 ${space[5]}px` }}>
        <Tabs options={tabs} value={tab} onChange={setTab} label="Robot detail" />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: `${variant === 'sheet' ? space[5] : space[4]}px ${space[5]}px ${space[6]}px` }}>
        <SectionStyleContext.Provider value={variant === 'sheet' ? 'flat' : 'card'}>
        {tab === 'overview' && <OverviewTab robot={robot} />}
        {tab === 'status' && <StatusTab robot={robot} />}
        {tab === 'motors' && <MotorsTab robot={robot} />}
        {tab === 'tests' && <TestsTab robot={robot} />}
        {tab === 'service' && <ServiceTab robot={robot} />}
        {tab === 'links' && <LinksTab robot={robot} onOpenBridge={onOpenBridge} />}
        {tab === 'maintenance' && <MaintenanceTab />}
        </SectionStyleContext.Provider>
      </div>
    </div>
  )
}
