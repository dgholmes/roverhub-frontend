import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check, Lock, Router } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button, KeyValue } from '@/components/kit'
import { edgeVideoBaseUrlFor } from '@/lib/edgeVideo'
import { EXPECTED_SCHEMA_VERSION } from '@/lib/schemaVersion'
import { robotTypeLabel } from '@/lib/robotCapabilities'
import {
  bridgeLiveness, deviceHostFromUrl, formatAge, HEARTBEAT_INTERVAL_S, schemaMatch,
  type BridgeLiveness,
} from '@/fleet/bridgeHealth'
import type { RobotState } from '@/types'
import type { EdgeHostInfo, EdgeHostMetrics } from '@/types/robotState'
import type { TFunction } from 'i18next'
import { useCan } from '@/org/useCan'
import { BridgeUpdateBadge, EmptyState, LinkBadge, Muted, Note, Section, SectionGrid } from './parts'

/** Edge devices log in as this user on every deployment so far (Jetson and
 * Pi both). Shown only as a starting point for the copied SSH command. */
const EDGE_SSH_USER = 'rover'

const LIVENESS: Record<BridgeLiveness, { tone: 'green' | 'amber' | 'red' | 'neutral'; key: 'live' | 'late' | 'silent' | 'noHeartbeat' }> = {
  live: { tone: 'green', key: 'live' },
  late: { tone: 'amber', key: 'late' },
  silent: { tone: 'red', key: 'silent' },
  unknown: { tone: 'neutral', key: 'noHeartbeat' },
}

/** Re-render every second so heartbeat ages count up between messages. */
function useNow(): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

function CopyLine({ text }: { text: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[1]}px ${space[1]}px ${space[1]}px ${space[3]}px`,
      borderRadius: radius.sm, background: color.card, border: `1px solid ${color.border}`,
    }}>
      <code style={{ flex: 1, minWidth: 0, fontSize: font.size.sm, color: color.t1, overflowX: 'auto', whiteSpace: 'nowrap' }}>{text}</code>
      <Button
        size="sm" variant="ghost" icon={copied ? Check : Copy}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }).catch(() => {})
        }}
      >
        {copied ? t('fleetDetail.edge.copied') : t('fleetDetail.edge.copy')}
      </Button>
    </div>
  )
}

/**
 * The edge device (bridge) that links this robot to the cloud. Each robot has
 * exactly one, so it lives in the robot's inspector rather than a separate
 * Fleet tab. Built only from what the bridge actually reports — its retained
 * registration and 5 s heartbeat; host facts it does not send yet are listed
 * as such rather than filled in.
 */
/**
 * The browser terminal, as it will look. Locked: a shell on the device must
 * not open for anyone who can load the page, and there is no sign-in yet.
 * When it opens, the edge device dials out to the cloud (as for MQTT), so no
 * inbound port is needed on site.
 */
function EdgeTerminal({ host }: { host: string | null }) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
        <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>{t('fleetDetail.edge.terminal')}</span>
        <Badge tone="amber"><Lock size={11} strokeWidth={2} aria-hidden style={{ marginRight: 4 }} />{t('fleetDetail.edge.terminalLocked')}</Badge>
      </div>
      <div aria-hidden style={{
        height: 120, borderRadius: radius.sm, background: '#0b0d10', border: `1px solid ${color.border}`,
        padding: space[3], fontFamily: "ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace", fontSize: font.size.sm, color: '#5b6470', overflow: 'hidden',
      }}>
        {`${EDGE_SSH_USER}@${host ?? 'edge'}:~$ `}<span style={{ display: 'inline-block', width: 8, height: 14, verticalAlign: 'middle', background: '#5b6470' }} />
      </div>
      <p style={{ margin: 0, fontSize: font.size.sm, color: color.t2, lineHeight: 1.5 }}>{t('fleetDetail.edge.terminalBody')}</p>
      <p style={{ margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }}>{t('fleetDetail.edge.terminalHow')}</p>
    </div>
  )
}

function gb(bytes: number): string {
  return `${(bytes / 1e9).toFixed(1)} GB`
}

/** The edge device's own identity and health, from a 0.0.9 bridge's
 * registration (host) and heartbeats (host_metrics). Each value the device
 * couldn't read stays "Not reported", never zero. */
function hostRows(host: EdgeHostInfo | null, m: EdgeHostMetrics | null, now: number, t: TFunction): { label: string; value: React.ReactNode }[] {
  const none = <Muted>{t('fleetDetail.edge.notReported')}</Muted>
  const parts = [
    m?.cpu_percent != null ? t('fleetDetail.edge.cpu', { n: Math.round(m.cpu_percent) }) : null,
    m?.memory_percent != null ? t('fleetDetail.edge.mem', { n: Math.round(m.memory_percent), total: m.memory_total_bytes != null ? gb(m.memory_total_bytes) : '?' }) : null,
    m?.soc_temp_c != null ? `${m.soc_temp_c.toFixed(0)} °C` : null,
  ].filter(Boolean)
  return [
    { label: t('fleetDetail.edge.hostname'), value: host?.hostname ?? none },
    { label: t('fleetDetail.edge.model'), value: host?.device_model ?? none },
    { label: t('fleetDetail.edge.os'), value: host?.os ? `${host.os}${host.arch ? ` · ${host.arch}` : ''}` : none },
    { label: t('fleetDetail.edge.bridgeVersion'), value: host?.bridge_version ?? none },
    { label: t('fleetDetail.edge.upSince'), value: host?.booted_at ? t('fleetDetail.edge.upFor', { age: formatAge(host.booted_at, now) }) : none },
    { label: t('fleetDetail.edge.cpuMemTemp'), value: parts.length ? parts.join(' · ') : none },
    {
      label: t('fleetDetail.edge.diskFree'),
      value: m?.disk_free_bytes != null
        ? `${gb(m.disk_free_bytes)}${m.disk_total_bytes != null ? ` / ${gb(m.disk_total_bytes)}` : ''}`
        : none,
    },
  ]
}

export function EdgeDeviceTab({ robot }: { robot: RobotState }) {
  const { t } = useTranslation()
  const now = useNow()
  const showDev = useCan('edgeTools')
  const b = robot.bridge
  if (!b) {
    return (
      <EmptyState title={t('fleetDetail.edge.notCheckedInTitle')} icon={Router}>
        {t('fleetDetail.edge.notCheckedInBody')}
      </EmptyState>
    )
  }
  const liveness = bridgeLiveness(b.last_heartbeat_at, now)
  const lv = { tone: LIVENESS[liveness].tone, label: t(`fleetDetail.edge.${LIVENESS[liveness].key}`) }
  const schema = schemaMatch(b.schema_version)
  const videoUrl = edgeVideoBaseUrlFor(robot.robot_id)
  const host = deviceHostFromUrl(videoUrl)
  const c = robot.connectivity
  // Links are only as current as the last heartbeat; once it goes silent they
  // are history, not state.
  const stale = liveness === 'silent' || liveness === 'unknown'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{b.bridge_id}</span>
        <Badge tone={lv.tone} dot>{lv.label}</Badge>
        <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('fleetDetail.edge.lastHeard', { age: formatAge(b.last_heartbeat_at, now) })}</span>
      </div>
    <SectionGrid>
      <Section title={t('fleetDetail.edge.health')} aside={stale && <Badge tone="amber">{t('fleetDetail.edge.lastKnown')}</Badge>}>
        <KeyValue rows={[
          { label: t('fleetDetail.edge.heartbeat'), value: <Badge tone={lv.tone} dot>{lv.label}</Badge> },
          { label: t('fleetDetail.edge.lastHeardLabel'), value: formatAge(b.last_heartbeat_at, now) },
          { label: t('fleetDetail.edge.expectedEvery'), value: t('fleetDetail.edge.seconds', { n: HEARTBEAT_INTERVAL_S }) },
          { label: t('fleetDetail.edge.cloudMqtt'), value: <LinkBadge ok={c.edge_to_cloud === 'connected'} /> },
          { label: t('fleetDetail.edge.robotControl'), value: <LinkBadge ok={c.grpc === 'connected'} badLabel={c.grpc === 'degraded' ? t('common.slow') : t('common.down')} /> },
          { label: t('fleetDetail.edge.robotTelemetry'), value: <LinkBadge ok={c.dds === 'connected'} badLabel={t('common.off')} /> },
          { label: t('fleetDetail.edge.roundTrip'), value: c.bridge_latency_ms === null ? <Muted>{t('fleetDetail.edge.notMeasured')}</Muted> : `${c.bridge_latency_ms} ms` },
          { label: t('fleetDetail.edge.missionRunning'), value: b.mission_active ? t('common.yes') : t('common.no') },
        ]} />
        <Note>{t('fleetDetail.edge.ddsNote')}</Note>
      </Section>

      <Section title={t('fleetDetail.edge.identity')}>
        <KeyValue rows={[
          { label: t('fleetDetail.edge.bridgeId'), value: b.bridge_id },
          { label: t('fleetDetail.edge.robot'), value: `${robot.name}` },
          { label: t('fleetDetail.edge.robotId'), value: robot.robot_id },
          { label: t('fleetDetail.edge.robotType'), value: robotTypeLabel(robot.robot_type) },
          { label: t('fleetDetail.edge.site'), value: robot.site_id },
          {
            label: t('fleetDetail.edge.wireContract'),
            value: schema === 'match'
              ? <Badge tone="green">{b.schema_version}</Badge>
              : schema === 'mismatch'
                ? <Badge tone="amber" title={t('fleetDetail.edge.consoleExpectsTitle', { version: EXPECTED_SCHEMA_VERSION })}>{t('fleetDetail.edge.consoleExpects', { actual: b.schema_version ?? '', version: EXPECTED_SCHEMA_VERSION })}</Badge>
                : <Muted>{t('fleetDetail.edge.notAnnounced')}</Muted>,
          },
        ]} />
        {schema === 'mismatch' && (
          <Note>{t('fleetDetail.edge.skewNote')}</Note>
        )}
      </Section>

      <Section title={t('fleetDetail.edge.provides')}>
        <KeyValue rows={[
          { label: t('fleetDetail.edge.lowLevel'), value: c.dds === 'connected' ? t('fleetDetail.edge.on') : <Muted>{t('fleetDetail.edge.off')}</Muted> },
          { label: t('fleetDetail.edge.batteryReading'), value: robot.battery.percent === null ? <Muted>{t('fleetDetail.edge.none')}</Muted> : t('fleetDetail.edge.yesDds') },
          { label: t('fleetDetail.edge.cameraRelay'), value: videoUrl ? t('fleetDetail.edge.configured') : <Muted>{t('fleetDetail.edge.notConfigured')}</Muted> },
          { label: t('fleetDetail.edge.motionsReported'), value: robot.available_motions.length || <Muted>{t('fleetDetail.edge.none')}</Muted> },
        ]} />
        {robot.available_motions.length > 0 && (
          <details style={{ marginTop: space[3] }}>
            <summary style={{ cursor: 'pointer', fontSize: font.size.sm, color: color.t2 }}>{t('fleetDetail.edge.showMotions')}</summary>
            <p style={{ margin: `${space[2]}px 0 0`, fontSize: font.size.sm, color: color.t2, lineHeight: 1.6 }}>
              {robot.available_motions.join(', ')}
            </p>
          </details>
        )}
      </Section>

      <Section title={t('fleetDetail.edge.device')} aside={!b.host && <BridgeUpdateBadge />}>
        <KeyValue rows={hostRows(b.host ?? null, b.host_metrics ?? null, now, t)} />
        {!b.host && <Note>{t('fleetDetail.edge.deviceNote')}</Note>}
      </Section>

      {/* Engineers only (OD-7: edgeTools). Hidden, not disabled, for everyone
          else; nothing enforces it until sign-in exists. */}
      {showDev && (
      <Section title={t('fleetDetail.edge.developers')} span aside={<Badge>{t('fleetDetail.edge.engineersOnly')}</Badge>}>
        <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            <KeyValue rows={[
              { label: t('fleetDetail.edge.deviceAddress'), value: host ?? <Muted>{t('fleetDetail.edge.unknown')}</Muted> },
              { label: t('fleetDetail.edge.cameraRelay'), value: videoUrl ?? <Muted>{t('fleetDetail.edge.notConfigured')}</Muted> },
            ]} />
            {host ? (
              <>
                <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('fleetDetail.edge.sshHint')}</span>
                <CopyLine text={`ssh ${EDGE_SSH_USER}@${host}`} />
                <CopyLine text={`ssh ${EDGE_SSH_USER}@${host} 'journalctl -u roverhub-bridge -n 200 --no-pager'`} />
              </>
            ) : (
              <Note>{t('fleetDetail.edge.addressNote')}</Note>
            )}
          </div>
          <EdgeTerminal host={host} />
        </div>
        <details style={{ marginTop: space[3] }}>
          <summary style={{ cursor: 'pointer', fontSize: font.size.sm, color: color.t2 }}>{t('fleetDetail.edge.latestMessages')}</summary>
          <pre style={{
            margin: `${space[2]}px 0 0`, padding: space[3], borderRadius: radius.sm, background: color.card,
            border: `1px solid ${color.border}`, fontSize: font.size.xs, color: color.t2, overflowX: 'auto',
          }}>
            {JSON.stringify({ register: b.raw_registration ?? null, heartbeat: b.raw_heartbeat ?? null }, null, 2)}
          </pre>
        </details>
      </Section>
      )}
    </SectionGrid>
    </div>
  )
}
