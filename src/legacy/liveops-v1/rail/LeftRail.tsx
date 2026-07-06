import { color, font, layout, space } from '@/design-system/tokens'
import { useLiveOpsStore } from '@/legacy/liveops-v1/store/useLiveOpsStore'
import { useSessionStore } from '@/legacy/liveops-v1/store/useSessionStore'
import { RobotList } from './RobotList'
import { RobotStatusMini } from './RobotStatusMini'
import { BatteryStatus } from './BatteryStatus'
import { NetworkStatus } from './NetworkStatus'
import { BridgeStatus } from './BridgeStatus'
import { SdkStatus } from './SdkStatus'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.t3,
      letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: space[2] + 2,
    }}>
      {children}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: `${space[3] + 2}px ${space[4]}px`, borderBottom: `1px solid ${color.border}` }}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  )
}

/** LiveOps left rail (docs/05-ui-ux.md §3) — always visible, never collapsed
 * except in Cockpit view mode. */
export function LeftRail() {
  const robots = useLiveOpsStore((s) => s.robots)
  const selectedRobotId = useSessionStore((s) => s.selectedRobotId)
  const robot = robots.find((r) => r.robot_id === selectedRobotId) ?? robots[0]

  return (
    <aside style={{
      width: layout.liveOpsRailWidth, flexShrink: 0,
      background: color.surface, borderRight: `1px solid ${color.border}`,
      display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden',
    }}>
      <Section label="Fleet">
        <RobotList />
      </Section>

      {robot && (
        <>
          <Section label="Robot Status"><RobotStatusMini robot={robot} /></Section>
          <Section label="Battery"><BatteryStatus battery={robot.battery} /></Section>
          <Section label="Network"><NetworkStatus connectivity={robot.connectivity} /></Section>
          <Section label="Bridge"><BridgeStatus connectivity={robot.connectivity} /></Section>
          <div style={{ padding: `${space[3] + 2}px ${space[4]}px` }}>
            <SectionLabel>SDK</SectionLabel>
            <SdkStatus connectivity={robot.connectivity} />
          </div>
        </>
      )}
    </aside>
  )
}
