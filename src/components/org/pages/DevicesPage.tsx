import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { color, font, radius, space } from '@/design-system/tokens'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { mockDataProvider } from '@/mocks/mockDataProvider'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { stateVisualFor } from '@/liveops/stateDisplay'
import type { RobotState, RobotType } from '@/types'
import { Badge, Button } from '@/components/kit'
import { robotTypeLabel } from '@/lib/robotCapabilities'
import { EXPECTED_SCHEMA_VERSION } from '@/lib/schemaVersion'
import { bridgeLiveness, formatAge, schemaMatch } from '@/fleet/bridgeHealth'
import { openRobot } from '@/org/navigation'
import { PendingBadge } from '@/components/fleet/v2/parts'
import { OrgPage, Placeholder } from '../parts'

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
    active_run: null,
    bridge_boot_id: null,
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
/**
 * Devices whose bridge has registered but that nobody has let in yet. Only
 * appears when the backend runs with DEVICE_ACCEPTANCE=manual; in the default
 * auto mode every device is accepted on arrival. Accepting is a record, not a
 * lock: without sign-in it can't stop anything, so it gates no command.
 */
function PendingDevices({ robots }: { robots: RobotState[] }) {
  const { t } = useTranslation()
  const sites = useSessionStore((s) => s.sites)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = robots.filter((r) => r.bridge?.acceptance === 'pending')
  if (pending.length === 0) return null
  async function decide(robotId: string, decision: 'accept' | 'reject') {
    setBusy(robotId)
    setError(null)
    try { await dataProvider.setDeviceAcceptance(robotId, decision) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
  }
  return (
    <div className="rh-panel" style={{ padding: `${space[3]}px ${space[4]}px`, display: 'grid', gap: space[3] }}>
      <div>
        <div style={{ fontSize: font.size.lg, fontWeight: font.weight.semibold, color: color.t1 }}>{t('fleetDetail.devices.pendingTitle', { count: pending.length })}</div>
        <div style={{ fontSize: font.size.sm, color: color.t3, marginTop: 2 }}>{t('fleetDetail.devices.pendingBody')}</div>
      </div>
      {pending.map((r) => (
        <div key={r.robot_id} style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          <span style={{ fontWeight: font.weight.semibold, color: color.t1 }}>{r.name}</span>
          <span style={{ fontSize: font.size.sm, color: color.t3 }}>
            {[r.robot_id, r.bridge?.bridge_id, sites.find((x) => x.id === r.site_id)?.name ?? r.site_id, r.bridge?.host?.device_model].filter(Boolean).join(' · ')}
          </span>
          <span style={{ flex: 1 }} />
          <Button size="sm" variant="primary" disabled={busy === r.robot_id} onClick={() => decide(r.robot_id, 'accept')}>{t('fleetDetail.devices.accept')}</Button>
          <Button size="sm" disabled={busy === r.robot_id} onClick={() => decide(r.robot_id, 'reject')}>{t('fleetDetail.devices.reject')}</Button>
        </div>
      ))}
      {error && <div style={{ fontSize: font.size.sm, color: color.red }}>{error}</div>}
    </div>
  )
}

export function DevicesPage() {
  const robots = useLiveOpsStore((s) => s.robots)
  const { t } = useTranslation()
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
      setError(t('fleetDetail.devices.errIdRequired'))
      return
    }
    if (robots.some((r) => r.robot_id === trimmedId)) {
      setError(t('fleetDetail.devices.errIdExists', { id: trimmedId }))
      return
    }
    if (!siteId) {
      setError(t('fleetDetail.devices.errSite'))
      return
    }
    if (!trimmedIp) {
      setError(t('fleetDetail.devices.errIpRequired'))
      return
    }
    if (!HOST_PORT_RE.test(trimmedIp)) {
      setError(t('fleetDetail.devices.errIpFormat'))
      return
    }
    mockDataProvider.addRobot(buildNewRobot(trimmedId, name.trim() || trimmedId, robotType, siteId, trimmedIp))
    setOpen(false)
    resetForm()
  }

  return (
    <OrgPage
      title={t('devices.title')}
      subtitle={t('fleetDetail.devices.subtitle', { robots: t('common.robotCount', { count: robots.length }), sites: t('common.siteCount', { count: new Set(robots.map((r) => r.site_id)).size }) })}
      actions={
        <Button
          icon={Plus}
          onClick={() => { resetForm(); setOpen(true) }}
          disabled={USE_REAL_BACKEND}
          title={USE_REAL_BACKEND ? t('fleetDetail.devices.addDisabledTitle') : undefined}
        >
          {t('devices.addRobot')}
        </Button>
      }
    >
      <div className="rh-panel" style={{ padding: `${space[3]}px ${space[4]}px`, display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 260, fontSize: font.size.md, color: color.t2, lineHeight: 1.5 }}>
          {t('fleetDetail.devices.banner')}
        </span>
      </div>

      <PendingDevices robots={robots} />

      {robots.length === 0 ? (
        <Placeholder title={t('fleetDetail.devices.noRobotsTitle')}>{t('fleetDetail.devices.noRobotsBody')}</Placeholder>
      ) : (
        <div className="rh-panel" style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                {(['robot', 'type', 'site', 'state', 'edge', 'contract', 'firmware', 'address'] as const).map((h) => (
                  <th key={h} style={th}>{t(`fleetDetail.devices.col.${h}`)}</th>
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
                          {r.bridge.acceptance === 'rejected' && <Badge tone="red">{t('fleetDetail.devices.rejected')}</Badge>}{' '}
                          <Badge tone={live === 'live' ? 'green' : live === 'late' ? 'amber' : live === 'silent' ? 'red' : 'neutral'} dot>
                            {live === 'live' ? t('fleetDetail.devices.live') : live === 'late' ? t('fleetDetail.devices.late') : live === 'silent' ? t('fleetDetail.devices.silentFor', { age: formatAge(r.bridge.last_heartbeat_at) }) : t('fleetDetail.devices.noHeartbeat')}
                          </Badge>
                        </span>
                      ) : <span style={{ color: color.t3 }}>{t('fleetDetail.devices.notRegistered')}</span>}
                    </td>
                    <td style={td}>
                      {schema === 'mismatch'
                        ? <Badge tone="amber" title={t('fleetDetail.devices.consoleExpects', { version: EXPECTED_SCHEMA_VERSION })}>{r.bridge?.schema_version}</Badge>
                        : r.bridge?.schema_version ?? <span style={{ color: color.t3 }}>—</span>}
                    </td>
                    <td style={td}><PendingBadge field="firmware" /></td>
                    <td style={{ ...td, color: r.ip_address ? color.t2 : color.t3 }}>{r.ip_address ?? t('fleetDetail.devices.notRecorded')}</td>
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
            <DialogTitle style={{ color: color.t1 }}>{t('fleetDetail.devices.dialogTitle')}</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>
              {t('fleetDetail.devices.dialogBody')}
            </DialogDescription>
          </DialogHeader>

          <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
            <Field label={t('fleetDetail.devices.robotId')}>
              <input style={inputStyle} value={robotId} onChange={(e) => setRobotId(e.target.value)} placeholder={t('fleetDetail.devices.robotIdPlaceholder')} />
            </Field>
            <Field label={t('fleetDetail.devices.displayName')}>
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('fleetDetail.devices.displayNamePlaceholder')} />
            </Field>
            <Field label={t('fleetDetail.devices.robotType')}>
              <select style={inputStyle} value={robotType} onChange={(e) => setRobotType(e.target.value as RobotType)}>
                <option value="quad">{t('fleetDetail.devices.quad')}</option>
                <option value="wheel">{t('fleetDetail.devices.wheel')}</option>
              </select>
            </Field>
            <Field label={t('fleetDetail.devices.site')}>
              <select style={inputStyle} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                {sites.length === 0 && <option value="">{t('fleetDetail.devices.noSites')}</option>}
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label={t('fleetDetail.devices.ipAddress')}>
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
            <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={handleSubmit}>{t('fleetDetail.devices.add')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OrgPage>
  )
}
