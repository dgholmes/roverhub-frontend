import { LifeBuoy, MonitorPlay } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'
import { Badge, Button, Tabs } from '@/components/kit'
import { stateVisualFor } from '@/liveops/stateDisplay'
import { robotTypeLabel } from '@/lib/robotCapabilities'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { RECOVERY_ACTION, supportsRecovery } from '@/liveops/postureModel'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { reachabilityOf } from '@/lib/connectivityHealth'
import { hashForSiteWorkspace, type RobotTab } from '@/app/routes'
import { useSessionStore } from '@/store/useSessionStore'
import type { RobotState } from '@/types'
import { MotorsTab } from './MotorsTab'
import { SensorsTab } from './SensorsTab'
import { TestsTab } from './TestsTab'
import { LogsTab } from './LogsTab'
import { EdgeDeviceTab } from './EdgeDeviceTab'
import { OverviewTab } from './OverviewTab'
import { useTranslation } from 'react-i18next'

/** The robot tabs this inspector offers, in address order. Sensors and Logs
 * were Systems' two pages until 2026-11-26; Service's list of what waits on
 * Dobot moved into Overview's Hardware the same day. A tab the address names
 * that is not here reads as Overview rather than an empty panel. */
const OFFERED = ['overview', 'motors', 'sensors', 'tests', 'logs', 'edge'] as const satisfies readonly RobotTab[]
type OfferedTab = typeof OFFERED[number]
const offers = (tab: RobotTab): tab is OfferedTab => (OFFERED as readonly RobotTab[]).includes(tab)

/**
 * Full-height detail for one robot (layout A). The header never scrolls and
 * holds Get up; the E-Stop lives in the Motion tests tab's sticky bar, the
 * one tab that moves the real robot.
 */
export function RobotInspector({
  robot, tab, onTab,
}: {
  robot: RobotState
  /** The tab the address names; the address is the only place it is kept. */
  tab: RobotTab
  onTab: (tab: RobotTab) => void
}) {
  const { t } = useTranslation()
  const tabs = OFFERED.map((value) => ({ value, label: t(`fleet.inspector.${value}`) }))
  const shown: OfferedTab = offers(tab) ? tab : 'overview'
  const setSelectedRobot = useSessionStore((s) => s.setSelectedRobot)
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const setStateAvailability = getCommandAvailability(robot, 'SET_STATE')
  const fallen = robot.posture === 'fallen'
  const v = stateVisualFor(robot.abstract_state, robot.sdk_state)
  const online = reachabilityOf(robot) === 'online'

  return (
    <div data-robot-inspector style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
            {robot.posture === 'fallen' && <Badge tone="red" dot>{t('fleet.inspector.fallen')}</Badge>}
            {!online && <Badge tone="amber" dot>{t('fleet.inspector.unreachable')}</Badge>}
            <span style={{ fontSize: font.size.sm, color: color.t3 }}>
              {robotTypeLabel(robot.robot_type)} · {robot.robot_id}
            </span>
          </div>
        </div>
        {/* Get Up is permanent here, outside the motion-test lock: the fall
            recovery design (docs/superpowers/specs/2026-09-22-fall-recovery-
            and-fault-access-design.md) needs a route that works when fall
            detection does not — a gRPC-only bridge reports posture 'unknown'
            forever. It turns red when the robot is reported fallen. Hidden on
            wheel robots, whose FSM has no recovery state. */}
        {supportsRecovery(robot.robot_type) && (
          <Button
            icon={LifeBuoy}
            variant={fallen ? 'danger' : 'secondary'}
            disabled={!setStateAvailability.enabled}
            title={setStateAvailability.enabled
              ? (fallen ? t('fleet.inspector.getUpFallen') : t('fleet.inspector.getUpTitle'))
              : setStateAvailability.reason}
            onClick={() => dispatchCommand(robot.robot_id, 'SET_STATE', RECOVERY_ACTION.label, { state: RECOVERY_ACTION.state })}
          >
            {t('fleet.inspector.getUp')}
          </Button>
        )}
        <Button
          icon={MonitorPlay}
          onClick={() => {
            setSelectedRobot(robot.robot_id)
            window.location.hash = hashForSiteWorkspace(robot.site_id, 'LiveOps')
          }}
        >
          {t('fleet.inspector.openInLiveOps')}
        </Button>
      </header>
      <div style={{ flexShrink: 0, padding: `0 ${space[5]}px` }}>
        <Tabs options={tabs} value={shown} onChange={onTab} label={t('fleet.inspector.tabsAria')} />
      </div>
      {shown === 'logs' ? (
        // Logs scrolls its own list, so it follows live only if the list is
        // what scrolls: the tab gets the full height, unscrolled.
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: `${space[5]}px ${space[5]}px ${space[6]}px` }}>
          <LogsTab robot={robot} />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: `${space[5]}px ${space[5]}px ${space[6]}px` }}>
          {shown === 'overview' && <OverviewTab robot={robot} />}
          {shown === 'motors' && <MotorsTab robot={robot} />}
          {shown === 'sensors' && <SensorsTab robot={robot} />}
          {shown === 'tests' && <TestsTab robot={robot} />}
          {shown === 'edge' && <EdgeDeviceTab robot={robot} />}
        </div>
      )}
    </div>
  )
}
