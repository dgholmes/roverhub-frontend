import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { color, font, radius, space } from '@/design-system/tokens'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { mockDataProvider } from '@/mocks/mockDataProvider'
import { stateVisualFor } from '@/liveops/stateDisplay'
import type { RobotState, RobotType } from '@/types'
import { Badge, Button } from '@/components/kit'
import { robotTypeLabel } from '@/lib/robotCapabilities'
import { EXPECTED_SCHEMA_VERSION } from '@/lib/schemaVersion'
import { bridgeLiveness, formatAge, schemaMatch } from '@/fleet/bridgeHealth'
import { openRobot } from '@/org/navigation'
import { PendingBadge } from '@/components/fleet/v2/parts'
import { MissingBadge, OrgPage, Placeholder } from '../parts'

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t3,
  padding: `${space[2]}px ${space[3]}px`, borderBottom: `1px solid ${color.border}`, whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  fontSize: font.size.md, color: color.t1, padding: `${space[2]}px ${space[3]}px`,
  borderBottom: `1px solid ${color.border}`, whiteSpace: 'nowrap',
}

const USE_REAL_BACKEND = import.meta.env.VITE_USE_REAL_BACKEND === 'true'

const inputStyle: React.CSSProperties = {
  background: color.card, border: `1px solid ${color.border}`, borderRadius: radius.sm,
  color: color.t1, fontSize: font.size.sm, padding: '6px 10px', fontFamily: font.family, width: '100%',
}

const labelStyle: React.CSSProperties = {
  fontSize: font.size.xs, color: color.t3, marginBottom: 4, display: 'block',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

/** Loose "host:port" check — matches the ROBOT_IP=<host>:<port> format used
 * by the edge bridge's .env (e.g. "10.0.12.65:50051"). Not a full IP/DNS
 * validator; just enough to catch missing-port or empty-host typos. */
const HOST_PORT_RE = /^[^\s:]+:\d{1,5}$/

/** Builds a freshly-registered, not-yet-connected robot record — all
 * connectivity/telemetry fields start at their "unknown/offline" values
 * since this is a paper registration, not a real edge-bridge handshake. */
function buildNewRobot(robotId: string, name: string, robotType: RobotType, siteId: string, ipAddress: string): RobotState {
  const now = new Date().toISOString()
  return {
    robot_id: robotId,
    name,
    site_id: siteId,
    robot_type: robotType,
    ip_address: ipAddress,
    abstract_state: 'PASSIVE',
    posture: 'unknown',
    sdk_state: 'stand_down',
    battery: { percent: 0, est_runtime_min: 0, charging: false },
    position: {
      x_m: 0, y_m: 0, z_m: 0, heading_deg: 0,
      // 'lost', not 'estimated': freshness is 'missing' (paper registration,
      // no edge-bridge handshake yet), so this origin is fabricated rather
      // than a real estimate. Mirrors position_provider.py's no-frame branch.
      provider: 'dead_reckoning', quality: 'lost', accuracy_m: null,
      freshness: 'missing', updated_at: now,
    },
    speed_mps: 0,
    speed_ratio: 0,
    gait: robotType === 'wheel' ? 'wheel_loco' : 'walk',
    obstacle_avoidance: true,
    connectivity: {
      robot_to_edge: 'unavailable', edge_to_cloud: 'offline', bridge_state: 'offline',
      bridge_latency_ms: null, dds: 'unavailable', grpc: 'unavailable',
    },
    maintenance_flagged: false,
    control_owner: null,
    available_motions: [],
    updated_at: now,
  }
}

/**
 * Org Console > Devices — register a new Dobot robot with the organization
 * and assign it to a site. Mock-only by design: the backend has no
 * robot-registry write API at all (RobotRegistry only ever gains an entry
 * via a real edge bridge's MQTT registration message — see
 * roverhub-backend/robots/registry.py), and real Site/Org CRUD (OD-8) is
 * explicitly unscheduled future scope per docs/06-wbs-timeline.md /
 * docs/07-tracker.md. This intentionally matches the rest of Org Console's
 * current maturity level (Sites is the only other non-placeholder page, and
 * it's mock-data-backed too).
 *
 * When VITE_USE_REAL_BACKEND is on, the page still shows whatever robot(s)
 * the real pipeline reports (read-only, same useLiveOpsStore data every
 * other workspace uses), but "Add Robot" is disabled with an explanation
 * rather than silently doing nothing or writing into a mock array nobody's
 * reading in that mode.
 *
 * Manual entry, not network discovery: the Dobot SDK has no discovery RPC
 * (RobotClient always connects to a known address; grpc_service.proto
 * exposes only 5 RPCs, none for finding robots on the LAN), so there's no
 * "robot appears on the network, click to add" flow to build against. The
 * IP address field below matches ROBOT_IP=<host>:<port> from the edge
 * bridge's .env — the same address dobot_adapter.py's RobotClient(robot_ip)
 * connects to.
 */
export function DevicesPage() {
  const robots = useLiveOpsStore((s) => s.robots)
  const sites = useSessionStore((s) => s.sites)
  const [open, setOpen] = useState(false)
  const [robotId, setRobotId] = useState('')
  const [name, setName] = useState('')
  const [robotType, setRobotType] = useState<RobotType>('quad')
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '')
  const [ipAddress, setIpAddress] = useState('')
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setRobotId('')
    setName('')
    setRobotType('quad')
    setSiteId(sites[0]?.id ?? '')
    setIpAddress('')
    setError(null)
  }

  function handleSubmit() {
    const trimmedId = robotId.trim()
    const trimmedIp = ipAddress.trim()
    if (!trimmedId) {
      setError('Robot ID is required.')
      return
    }
    if (robots.some((r) => r.robot_id === trimmedId)) {
      setError(`A robot with ID "${trimmedId}" already exists.`)
      return
    }
    if (!siteId) {
      setError('Select a site to assign this robot to.')
      return
    }
    if (!trimmedIp) {
      setError('IP address is required — this is how the edge bridge reaches the robot.')
      return
    }
    if (!HOST_PORT_RE.test(trimmedIp)) {
      setError('Enter the address as host:port, e.g. 10.0.12.65:50051.')
      return
    }
    mockDataProvider.addRobot(buildNewRobot(trimmedId, name.trim() || trimmedId, robotType, siteId, trimmedIp))
    setOpen(false)
    resetForm()
  }

  return (
    <OrgPage
      title="Devices"
      subtitle={`${robots.length} ${robots.length === 1 ? 'robot' : 'robots'} across ${new Set(robots.map((r) => r.site_id)).size} ${new Set(robots.map((r) => r.site_id)).size === 1 ? 'site' : 'sites'} · each with its edge device`}
      actions={
        <Button
          icon={Plus}
          onClick={() => { resetForm(); setOpen(true) }}
          disabled={USE_REAL_BACKEND}
          title={USE_REAL_BACKEND ? 'Robots add themselves when their edge device registers. Adding one by hand only works on mock data.' : undefined}
        >
          Add robot
        </Button>
      }
    >
      <div className="rh-panel" style={{ padding: `${space[3]}px ${space[4]}px`, display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 260, fontSize: font.size.md, color: color.t2, lineHeight: 1.5 }}>
          Robots register themselves through their edge device and appear here straight away. Holding a new device until
          someone accepts it into a site needs a backend change.
        </span>
        <MissingBadge what="backend" />
      </div>

      {robots.length === 0 ? (
        <Placeholder title="No robots yet">A robot appears here as soon as its edge device registers with the cloud.</Placeholder>
      ) : (
        <div className="rh-panel" style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                {['Robot', 'Type', 'Site', 'State', 'Edge device', 'Contract', 'Firmware', 'Robot address'].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {robots.map((r) => {
                const site = sites.find((s) => s.id === r.site_id)
                const v = stateVisualFor(r.abstract_state, r.sdk_state)
                const live = bridgeLiveness(r.bridge?.last_heartbeat_at)
                const schema = schemaMatch(r.bridge?.schema_version)
                return (
                  <tr key={r.robot_id}>
                    <td style={td}>
                      <button onClick={() => openRobot(r.site_id, r.robot_id)} style={{ all: 'unset', cursor: 'pointer' }}>
                        <div style={{ fontWeight: font.weight.semibold }}>{r.name}</div>
                        <div style={{ fontSize: font.size.sm, color: color.t3 }}>{r.robot_id}</div>
                      </button>
                    </td>
                    <td style={td}>{robotTypeLabel(r.robot_type)}</td>
                    <td style={td}>{site?.name ?? r.site_id}</td>
                    <td style={{ ...td, color: v.color }}>{v.label}</td>
                    <td style={td}>
                      {r.bridge ? (
                        <span>
                          {r.bridge.bridge_id}{' '}
                          <Badge tone={live === 'live' ? 'green' : live === 'late' ? 'amber' : live === 'silent' ? 'red' : 'neutral'} dot>
                            {live === 'live' ? 'Live' : live === 'late' ? 'Late' : live === 'silent' ? `Silent ${formatAge(r.bridge.last_heartbeat_at)}` : 'No heartbeat'}
                          </Badge>
                        </span>
                      ) : <span style={{ color: color.t3 }}>Not registered</span>}
                    </td>
                    <td style={td}>
                      {schema === 'mismatch'
                        ? <Badge tone="amber" title={`This console expects ${EXPECTED_SCHEMA_VERSION}`}>{r.bridge?.schema_version}</Badge>
                        : r.bridge?.schema_version ?? <span style={{ color: color.t3 }}>—</span>}
                    </td>
                    <td style={td}><PendingBadge field="firmware" /></td>
                    <td style={{ ...td, color: r.ip_address ? color.t2 : color.t3 }}>{r.ip_address ?? 'Not recorded'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1 }}>
          <DialogHeader>
            <DialogTitle style={{ color: color.t1 }}>Add Robot</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>
              Register a robot with the organization and assign it to a site.
            </DialogDescription>
          </DialogHeader>

          <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
            <Field label="Robot ID">
              <input style={inputStyle} value={robotId} onChange={(e) => setRobotId(e.target.value)} placeholder="e.g. rvr-01-atlas" />
            </Field>
            <Field label="Display Name">
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. RVR-01 "Atlas"' />
            </Field>
            <Field label="Robot Type">
              <select style={inputStyle} value={robotType} onChange={(e) => setRobotType(e.target.value as RobotType)}>
                <option value="quad">Quad (ZaeZae X1)</option>
                <option value="wheel">Wheel</option>
              </select>
            </Field>
            <Field label="Site">
              <select style={inputStyle} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                {sites.length === 0 && <option value="">No sites yet — create one first</option>}
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="IP Address">
              <input
                style={{ ...inputStyle, fontFamily: 'monospace' }}
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                placeholder="10.0.12.65:50051"
              />
            </Field>
            {error && <div style={{ color: color.red, fontSize: font.size.sm }}>{error}</div>}
          </div>

          <DialogFooter style={{ gap: 8 }}>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSubmit}>Add robot</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OrgPage>
  )
}
