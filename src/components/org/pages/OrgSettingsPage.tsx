import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, KeyValue } from '@/components/kit'
import { API_BASE_URL, MQTT_WS_URL, SITE_FILTER, USE_REAL_BACKEND } from '@/lib/realtime/dataProvider'
import { GLOBAL_URL, PER_ROBOT_URLS } from '@/lib/edgeVideo'
import { EXPECTED_SCHEMA_VERSION } from '@/lib/schemaVersion'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { MissingBadge, OrgPage, type Missing } from '../parts'

type SectionId = 'organisation' | 'units' | 'notifications' | 'security' | 'retention' | 'connections'

const SECTIONS: { id: SectionId; missing?: Missing }[] = [
  { id: 'organisation', missing: 'database' },
  { id: 'units', missing: 'database' },
  { id: 'notifications', missing: 'database' },
  { id: 'security', missing: 'sign-in' },
  { id: 'retention', missing: 'database' },
  { id: 'connections' },
]

const LINK_LABEL = { connecting: 'Connecting', connected: 'Connected', reconnecting: 'Reconnecting', offline: 'Offline' } as const

function Planned({ intro, items }: { intro: string; items: string[] }) {
  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <p style={{ margin: 0, fontSize: font.size.md, color: color.t2, lineHeight: 1.5, maxWidth: 620 }}>{intro}</p>
      <ul style={{ margin: 0, paddingLeft: space[5], color: color.t2, fontSize: font.size.md, lineHeight: 1.8 }}>
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </div>
  )
}

function Connections() {
  const linkPhase = useLiveOpsStore((s) => s.linkPhase)
  const relays = Object.entries(PER_ROBOT_URLS)
  return (
    <div style={{ display: 'grid', gap: space[5] }}>
      <p style={{ margin: 0, fontSize: font.size.md, color: color.t2, lineHeight: 1.5, maxWidth: 620 }}>
        How this console reaches the robots. Read-only: these come from the build's environment file. Check here first
        when robots don't appear or the camera is black.
      </p>
      <section>
        <h3 style={h3}>Data</h3>
        <KeyValue rows={[
          { label: 'Source', value: USE_REAL_BACKEND ? 'Live robots (real backend)' : <Badge>Mock data</Badge> },
          { label: 'Backend', value: USE_REAL_BACKEND ? API_BASE_URL : <span style={{ color: color.t3 }}>Not used</span> },
          { label: 'Broker (WebSocket)', value: USE_REAL_BACKEND ? MQTT_WS_URL : <span style={{ color: color.t3 }}>Not used</span> },
          {
            label: 'Broker link',
            value: USE_REAL_BACKEND
              ? <Badge tone={linkPhase === 'connected' ? 'green' : linkPhase === 'offline' ? 'red' : 'amber'} dot>{LINK_LABEL[linkPhase]}</Badge>
              : <span style={{ color: color.t3 }}>Not used</span>,
          },
          { label: 'Site filter', value: USE_REAL_BACKEND ? (SITE_FILTER ?? 'All sites') : <span style={{ color: color.t3 }}>Not used</span> },
          { label: 'Wire contract', value: EXPECTED_SCHEMA_VERSION },
        ]} />
      </section>
      <section>
        <h3 style={h3}>Camera relays</h3>
        {relays.length === 0 && !GLOBAL_URL ? (
          <div style={{ fontSize: font.size.md, color: color.t3 }}>None configured. Set VITE_EDGE_VIDEO_BASE_URLS to show camera feeds.</div>
        ) : (
          <KeyValue rows={[
            ...relays.map(([robot, url]) => ({ label: robot, value: url })),
            ...(GLOBAL_URL ? [{ label: 'Every other robot', value: GLOBAL_URL }] : []),
          ]} />
        )}
        <div style={{ marginTop: space[2], fontSize: font.size.sm, color: color.t3 }}>
          Edge device addresses come from DHCP and can move. If a camera goes black, check the address here still matches the device.
        </div>
      </section>
    </div>
  )
}

const h3: React.CSSProperties = { margin: `0 0 ${space[2]}px`, fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1 }

/**
 * Organisation settings, in sections down the side. Only Connections works
 * today (read-only, from the build environment). The rest are laid out with
 * what they will hold and what they wait on: the PRD gives Settings no spec
 * beyond "policies, users, retention" (§17.1, §17.5).
 */
export function OrgSettingsPage() {
  const { t } = useTranslation()
  const [section, setSection] = useState<SectionId>('connections')
  const current = SECTIONS.find((s) => s.id === section)!

  return (
    <OrgPage title={t('settings.title')}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[5], alignItems: 'flex-start' }}>
        <nav aria-label="Settings sections" style={{ flex: '0 0 220px', display: 'grid', gap: 2 }}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              aria-current={s.id === section ? 'page' : undefined}
              style={{
                all: 'unset', boxSizing: 'border-box', cursor: 'pointer', width: '100%',
                padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.sm,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2],
                background: s.id === section ? color.selected : 'transparent',
                color: s.id === section ? color.t1 : color.t2,
                fontSize: font.size.md, fontWeight: s.id === section ? font.weight.semibold : font.weight.regular,
              }}
            >
              {t(`settings.${s.id}`)}
              {s.missing && <span style={{ fontSize: font.size.xs, color: color.t3 }}>{s.missing === 'sign-in' ? t('common.needsSignIn') : t('settings.later')}</span>}
            </button>
          ))}
        </nav>

        <section className="rh-panel" style={{ flex: '1 1 520px', minWidth: 0, padding: space[5], display: 'grid', gap: space[4] }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, flex: 1, fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.t1 }}>{t(`settings.${current.id}`)}</h2>
            {current.missing && <MissingBadge what={current.missing} />}
          </header>
          {section === 'connections' && <Connections />}
          {section === 'organisation' && (
            <Planned intro="The organisation's own details, shown across the console." items={['Name', 'Logo for the top bar and exported reports', 'Default site for new members']} />
          )}
          {section === 'units' && (
            <Planned intro="How numbers and times read for everyone in the organisation." items={['Metric or imperial', 'Default timezone for new sites', '24-hour or 12-hour clock']} />
          )}
          {section === 'notifications' && (
            <Planned intro="Which alerts reach whom, and how." items={['Robot fallen, E-Stop, fault: everyone at that site', 'Edge device silent, motor hot: Technicians and Engineers', 'Delivery by email or a chat webhook']} />
          )}
          {section === 'security' && (
            <Planned intro="How people sign in. Needs sign-in to exist first (decision OD-7)." items={['Single sign-on through the company identity provider', 'Multi-factor sign-in, required for Admins and Engineers (PRD §18.0)', 'Session length and sign-out of idle sessions']} />
          )}
          {section === 'retention' && (
            <Planned intro="How long recordings and history are kept. The PRD leaves the actual periods as a product and legal decision (§17.5)." items={['Snapshots and video clips', 'Telemetry history', 'Mission records and reports', 'Audit log (never shorter than the legal minimum)']} />
          )}
        </section>
      </div>
    </OrgPage>
  )
}
