import { useState } from 'react'
import { color, font, radius, space } from '@/design-system/tokens'
import type { RobotDiagnostics, RobotState } from '@/types'
import { VersionInfoSection } from './VersionInfoSection'
import { JointDiagnosticsSection } from './JointDiagnosticsSection'
import { JointLimitsSection } from './JointLimitsSection'
import { CalibrationSection } from './CalibrationSection'
import { FootTypeSection } from './FootTypeSection'
import { TrafficSection } from './TrafficSection'
import { FirmwareUpdateSection } from './FirmwareUpdateSection'
import { MovementDiagnosticsSection } from './MovementDiagnosticsSection'
import { BalanceDiagnosticsSection } from './BalanceDiagnosticsSection'

type Tab = 'version' | 'joints' | 'limits' | 'calibration' | 'foot' | 'traffic' | 'firmware' | 'movement' | 'balance'

function tabsFor(robot: RobotState): { key: Tab; label: string }[] {
  const tabs: { key: Tab; label: string }[] = [
    { key: 'version', label: 'Version Info' },
    { key: 'joints', label: 'Joint Diagnostics' },
    { key: 'limits', label: 'Joint Limits' },
    { key: 'calibration', label: 'Calibration' },
    { key: 'foot', label: 'Foot Type' },
    { key: 'traffic', label: '4G Traffic' },
    { key: 'firmware', label: 'Firmware Update' },
    { key: 'movement', label: 'Movement' },
  ]
  // Balance/pose commands (BALANCE_AXIS/BALANCE_NEUTRAL/DYNAMIC_POSE/
  // STATIC_POSE) don't exist in the wheel-mode FSM (docs/03-sdk-integration.md
  // §7.2) -- hidden entirely for wheel robots, matching the hide-not-disable
  // precedent set by QuickActionsMenu.tsx for other quad-only controls.
  if (robot.robot_type !== 'wheel') tabs.push({ key: 'balance', label: 'Balance' })
  return tabs
}

/**
 * Deeper hardware-diagnostic drill-down for a device, mirroring the
 * reference app's "Rover Debugging" structure (Version Info / Joint Info /
 * Joint Limits / Calibration / Foot Type / 4G Traffic / Device Upgrade) —
 * lives inside Fleet's DeviceDetailDrawer, not a separate Systems workspace
 * (Fleet's charter is per-robot asset readiness/maintenance; Systems is
 * cloud/edge configuration and governance — see conversation decision).
 *
 * Movement/Balance tabs extend this same charter to fine-grained,
 * numeric-input-driven SDK motion/pose testing (as opposed to LiveOps'
 * one-tap Quick Actions) — engineering-tier diagnostics, not operator
 * controls, hence living here rather than in a Systems workspace.
 */
export function DiagnosticsPanel({ diagnostics, robot }: { diagnostics: RobotDiagnostics; robot: RobotState }) {
  const [tab, setTab] = useState<Tab>('version')
  const tabs = tabsFor(robot)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', borderBottom: `1px solid ${color.border}`, paddingBottom: space[2] }}>
        {tabs.map(({ key, label }) => {
          const active = key === tab
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '5px 12px', borderRadius: radius.sm, fontSize: font.size.sm, fontFamily: font.family,
                background: active ? color.cardHover : 'transparent',
                border: `1px solid ${active ? color.borderLt : 'transparent'}`,
                color: active ? color.t1 : color.t3, fontWeight: active ? font.weight.semibold : font.weight.regular,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {tab === 'version' && <VersionInfoSection version={diagnostics.version} />}
      {tab === 'joints' && <JointDiagnosticsSection joints={diagnostics.joints} />}
      {tab === 'limits' && <JointLimitsSection limits={diagnostics.jointLimits} />}
      {tab === 'calibration' && <CalibrationSection lastCalibratedAt={diagnostics.last_calibrated_at} />}
      {tab === 'foot' && <FootTypeSection footType={diagnostics.footType} />}
      {tab === 'traffic' && <TrafficSection traffic={diagnostics.traffic} />}
      {tab === 'firmware' && <FirmwareUpdateSection firmware={diagnostics.firmware} />}
      {tab === 'movement' && <MovementDiagnosticsSection robot={robot} />}
      {tab === 'balance' && robot.robot_type !== 'wheel' && <BalanceDiagnosticsSection robot={robot} />}
    </div>
  )
}
