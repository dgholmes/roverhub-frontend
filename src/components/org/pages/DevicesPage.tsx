import { useState } from 'react'
import { Plus, Radio } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { color, font, radius, space } from '@/design-system/tokens'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { mockDataProvider } from '@/mocks/mockDataProvider'
import { STATE_DISPLAY } from '@/liveops/stateDisplay'
import type { RobotState, RobotType } from '@/types'

const USE_REAL_BACKEND = import.meta.env.VITE_USE_REAL_BACKEND === 'true'

const inputStyle: React.CSSProperties = {
  background: color.card, border: `1px solid ${color.border}`, borderRadius: radius.sm,
  color: color.t1, fontSize: font.size.sm, padding: '6px 10px', fontFamily: font.family, width: '100%',
}

const labelStyle: React.CSSProperties = {
  fontSize: font.size.xs, color: color.t3, marginBottom: 4, display: 'block',
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: radius.md, background: color.accentDim,
  border: `1px solid ${color.accentBorder}`, color: color.accent,
  fontSize: font.size.sm, fontWeight: font.weight.semibold, fontFamily: font.family,
  cursor: 'pointer',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

/** Builds a freshly-registered, not-yet-connected robot record — all
 * connectivity/telemetry fields start at their "unknown/offline" values
 * since this is a paper registration, not a real edge-bridge handshake. */
function buildNewRobot(robotId: string, name: string, robotType: RobotType, siteId: string): RobotState {
  const now = new Date().toISOString()
  return {
    robot_id: robotId,
    name,
    site_id: siteId,
    robot_type: robotType,
    abstract_state: 'PASSIVE',
    sdk_state: 'stand_down',
    battery: { percent: 0, est_runtime_min: 0, charging: false },
    position: { x_m: 0, y_m: 0, heading_deg: 0, provider: 'dead_reckoning', freshness: 'missing', updated_at: now },
    speed_mps: 0,
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
 */
export function DevicesPage() {
  const robots = useLiveOpsStore((s) => s.robots)
  const sites = useSessionStore((s) => s.sites)
  const [open, setOpen] = useState(false)
  const [robotId, setRobotId] = useState('')
  const [name, setName] = useState('')
  const [robotType, setRobotType] = useState<RobotType>('quad')
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setRobotId('')
    setName('')
    setRobotType('quad')
    setSiteId(sites[0]?.id ?? '')
    setError(null)
  }

  function handleSubmit() {
    const trimmedId = robotId.trim()
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
    mockDataProvider.addRobot(buildNewRobot(trimmedId, name.trim() || trimmedId, robotType, siteId))
    setOpen(false)
    resetForm()
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: space[5] }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[4] }}>
        <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.t1 }}>Devices</div>
        <button
          onClick={() => { resetForm(); setOpen(true) }}
          disabled={USE_REAL_BACKEND}
          title={USE_REAL_BACKEND ? 'Not available while connected to the real backend — robots register themselves via the edge bridge' : undefined}
          style={{
            ...primaryButtonStyle,
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: USE_REAL_BACKEND ? 0.5 : 1,
            cursor: USE_REAL_BACKEND ? 'not-allowed' : 'pointer',
          }}
        >
          <Plus size={14} strokeWidth={2.2} /> Add Robot
        </button>
      </div>

      {robots.length === 0 ? (
        <div style={{ color: color.t3, fontSize: font.size.sm, textAlign: 'center', padding: space[5] }}>
          No robots registered yet.
        </div>
      ) : (
        <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.8fr 1fr 1fr', padding: `${space[2]}px ${space[3]}px`,
            background: color.surface, borderBottom: `1px solid ${color.border}`,
            fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.t3, textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            <div>Robot ID</div><div>Name</div><div>Type</div><div>Site</div><div>State</div>
          </div>
          {robots.map((r) => {
            const site = sites.find((s) => s.id === r.site_id)
            const stateVisual = STATE_DISPLAY[r.abstract_state]
            return (
              <div key={r.robot_id} style={{
                display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.8fr 1fr 1fr', padding: `${space[2] + 2}px ${space[3]}px`,
                borderBottom: `1px solid ${color.border}`, alignItems: 'center', fontSize: font.size.sm, color: color.t1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Radio size={13} color={color.t3} strokeWidth={1.8} />
                  {r.robot_id}
                </div>
                <div style={{ color: color.t2 }}>{r.name}</div>
                <div style={{ color: color.t2, textTransform: 'capitalize' }}>{r.robot_type}</div>
                <div style={{ color: color.t2 }}>{site?.name ?? r.site_id}</div>
                <div style={{ color: stateVisual.color, fontWeight: font.weight.semibold }}>{stateVisual.label}</div>
              </div>
            )
          })}
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
            {error && <div style={{ color: color.red, fontSize: font.size.sm }}>{error}</div>}
          </div>

          <DialogFooter>
            <button onClick={handleSubmit} style={primaryButtonStyle}>Add Robot</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
