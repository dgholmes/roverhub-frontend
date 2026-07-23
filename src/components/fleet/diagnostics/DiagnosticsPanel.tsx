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
import { LiveTelemetrySection } from './LiveTelemetrySection'

type Tab = 'version' | 'joints' | 'limits' | 'calibration' | 'foot' | 'traffic' | 'firmware' | 'movement' | 'balance' | 'telemetry'

function tabsFor(robot: RobotState, hasDiagnostics: boolean): { key: Tab; label: string }[] {
  // The read-only hardware-diagnostic tabs (version/joints/limits/
  // calibration/foot/traffic/firmware) are backed entirely by mock data
  // (mockDiagnostics) -- no real edge/backend telemetry for per-joint
  // motor state, firmware, etc. exists yet (see types/diagnostics.ts's
  // header comment). Real robots (e.g. robot-dev-01) have no entry in
  // mockDiagnostics, so these tabs are omitted rather than shown with
  // fabricated data. Movement/Balance dispatch real commands against
  // `robot` alone and never depended on mockDiagnostics -- they must
  // always be available regardless of whether mock hardware-diagnostic
  // data exists for this robot_id.
  const tabs: { key: Tab; label: string }[] = hasDiagnostics ? [
    { key: 'version', label: 'Version Info' },
    { key: 'joints', label: 'Joint Diagnostics' },
    { key: 'limits', label: 'Joint Limits' },
    { key: 'calibration', label: 'Calibration' },
    { key: 'foot', label: 'Foot Type' },
    { key: 'traffic', label: '4G Traffic' },
    { key: 'firmware', label: 'Firmware Update' },
  ] : []
  tabs.push({ key: 'movement', label: 'Movement' })
  // Balance/pose commands (BALANCE_AXIS/BALANCE_NEUTRAL/DYNAMIC_POSE/
  // STATIC_POSE) don't exist in the wheel-mode FSM (docs/03-sdk-integration.md
  // §7.2) -- hidden entirely for wheel robots, matching the hide-not-disable
  // precedent set by QuickActionsMenu.tsx for other quad-only controls.
  if (robot.robot_type !== 'wheel') tabs.push({ key: 'balance', label: 'Balance' })
  // Telemetry reads robot.physics directly (real telemetry frames only, see
  // RobotPhysicsTelemetry) -- like Movement/Balance, never depended on
  // mockDiagnostics, so it's always available with its own empty state.
  tabs.push({ key: 'telemetry', label: 'Telemetry' })
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
export function DiagnosticsPanel({ diagnostics, robot }: { diagnostics?: RobotDiagnostics; robot: RobotState }) {
  const tabs = tabsFor(robot, diagnostics != null)
  const [tab, setTab] = useState<Tab>(tabs[0].key)
  const activeTab = tabs.some((t) => t.key === tab) ? tab : tabs[0].key

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', borderBottom: `1px solid ${color.border}`, paddingBottom: space[2] }}>
        {tabs.map(({ key, label }) => {
          const active = key === activeTab
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

      {diagnostics && activeTab === 'version' && <VersionInfoSection version={diagnostics.version} />}
      {diagnostics && activeTab === 'joints' && <JointDiagnosticsSection joints={diagnostics.joints} />}
      {diagnostics && activeTab === 'limits' && <JointLimitsSection limits={diagnostics.jointLimits} />}
      {diagnostics && activeTab === 'calibration' && <CalibrationSection lastCalibratedAt={diagnostics.last_calibrated_at} />}
      {diagnostics && activeTab === 'foot' && <FootTypeSection footType={diagnostics.footType} />}
      {diagnostics && activeTab === 'traffic' && <TrafficSection traffic={diagnostics.traffic} />}
      {diagnostics && activeTab === 'firmware' && <FirmwareUpdateSection firmware={diagnostics.firmware} />}
      {activeTab === 'movement' && <MovementDiagnosticsSection robot={robot} />}
      {activeTab === 'balance' && robot.robot_type !== 'wheel' && <BalanceDiagnosticsSection robot={robot} />}
      {activeTab === 'telemetry' && <LiveTelemetrySection robot={robot} />}
    </div>
  )
}
