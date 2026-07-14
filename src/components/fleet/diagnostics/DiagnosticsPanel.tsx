import { useState } from 'react'
import { color, font, radius, space } from '@/design-system/tokens'
import type { RobotDiagnostics } from '@/types'
import { VersionInfoSection } from './VersionInfoSection'
import { JointDiagnosticsSection } from './JointDiagnosticsSection'
import { JointLimitsSection } from './JointLimitsSection'
import { CalibrationSection } from './CalibrationSection'
import { FootTypeSection } from './FootTypeSection'
import { TrafficSection } from './TrafficSection'
import { FirmwareUpdateSection } from './FirmwareUpdateSection'

type Tab = 'version' | 'joints' | 'limits' | 'calibration' | 'foot' | 'traffic' | 'firmware'

const TABS: { key: Tab; label: string }[] = [
  { key: 'version', label: 'Version Info' },
  { key: 'joints', label: 'Joint Diagnostics' },
  { key: 'limits', label: 'Joint Limits' },
  { key: 'calibration', label: 'Calibration' },
  { key: 'foot', label: 'Foot Type' },
  { key: 'traffic', label: '4G Traffic' },
  { key: 'firmware', label: 'Firmware Update' },
]

/**
 * Deeper hardware-diagnostic drill-down for a device, mirroring the
 * reference app's "Rover Debugging" structure (Version Info / Joint Info /
 * Joint Limits / Calibration / Foot Type / 4G Traffic / Device Upgrade) —
 * lives inside Fleet's DeviceDetailDrawer, not a separate Systems workspace
 * (Fleet's charter is per-robot asset readiness/maintenance; Systems is
 * cloud/edge configuration and governance — see conversation decision).
 */
export function DiagnosticsPanel({ diagnostics }: { diagnostics: RobotDiagnostics }) {
  const [tab, setTab] = useState<Tab>('version')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', borderBottom: `1px solid ${color.border}`, paddingBottom: space[2] }}>
        {TABS.map(({ key, label }) => {
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
    </div>
  )
}
