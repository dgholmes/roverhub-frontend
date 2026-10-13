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
  const { t } = useTranslation()
  const linkPhase = useLiveOpsStore((s) => s.linkPhase)
  const relays = Object.entries(PER_ROBOT_URLS)
  return (
    <div style={{ display: 'grid', gap: space[5] }}>
      <p style={{ margin: 0, fontSize: font.size.md, color: color.t2, lineHeight: 1.5, maxWidth: 620 }}>
        {t('fleetDetail.settings.connectionsIntro')}
      </p>
      <section>
        <h3 style={h3}>{t('fleetDetail.settings.data')}</h3>
        <KeyValue rows={[
          { label: t('fleetDetail.settings.source'), value: USE_REAL_BACKEND ? t('fleetDetail.settings.liveRobots') : <Badge>{t('fleetDetail.settings.mockData')}</Badge> },
          { label: t('fleetDetail.settings.backend'), value: USE_REAL_BACKEND ? API_BASE_URL : <span style={{ color: color.t3 }}>{t('fleetDetail.settings.notUsed')}</span> },
          { label: t('fleetDetail.settings.broker'), value: USE_REAL_BACKEND ? MQTT_WS_URL : <span style={{ color: color.t3 }}>{t('fleetDetail.settings.notUsed')}</span> },
          {
            label: t('fleetDetail.settings.brokerLink'),
            value: USE_REAL_BACKEND
              ? <Badge tone={linkPhase === 'connected' ? 'green' : linkPhase === 'offline' ? 'red' : 'amber'} dot>{t(`fleetDetail.settings.link.${linkPhase}`)}</Badge>
              : <span style={{ color: color.t3 }}>{t('fleetDetail.settings.notUsed')}</span>,
          },
          { label: t('fleetDetail.settings.siteFilter'), value: USE_REAL_BACKEND ? (SITE_FILTER ?? t('fleetDetail.settings.allSites')) : <span style={{ color: color.t3 }}>{t('fleetDetail.settings.notUsed')}</span> },
          { label: t('fleetDetail.settings.wireContract'), value: EXPECTED_SCHEMA_VERSION },
        ]} />
      </section>
      <section>
        <h3 style={h3}>{t('fleetDetail.settings.cameraRelays')}</h3>
        {relays.length === 0 && !GLOBAL_URL ? (
          <div style={{ fontSize: font.size.md, color: color.t3 }}>{t('fleetDetail.settings.noRelays')}</div>
        ) : (
          <KeyValue rows={[
            ...relays.map(([robot, url]) => ({ label: robot, value: url })),
            ...(GLOBAL_URL ? [{ label: t('fleetDetail.settings.everyOtherRobot'), value: GLOBAL_URL }] : []),
          ]} />
        )}
        <div style={{ marginTop: space[2], fontSize: font.size.sm, color: color.t3 }}>
          {t('fleetDetail.settings.dhcpNote')}
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
        <nav aria-label={t('fleetDetail.settings.sectionsAria')} style={{ flex: '0 0 220px', display: 'grid', gap: 2 }}>
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
            <Planned intro={t('fleetDetail.settings.orgIntro')} items={[t('fleetDetail.settings.orgItems.name'), t('fleetDetail.settings.orgItems.logo'), t('fleetDetail.settings.orgItems.defaultSite')]} />
          )}
          {section === 'units' && (
            <Planned intro={t('fleetDetail.settings.unitsIntro')} items={[t('fleetDetail.settings.unitsItems.system'), t('fleetDetail.settings.unitsItems.timezone'), t('fleetDetail.settings.unitsItems.clock')]} />
          )}
          {section === 'notifications' && (
            <Planned intro={t('fleetDetail.settings.notificationsIntro')} items={[t('fleetDetail.settings.notificationsItems.critical'), t('fleetDetail.settings.notificationsItems.maintenance'), t('fleetDetail.settings.notificationsItems.delivery')]} />
          )}
          {section === 'security' && (
            <Planned intro={t('fleetDetail.settings.securityIntro')} items={[t('fleetDetail.settings.securityItems.sso'), t('fleetDetail.settings.securityItems.mfa'), t('fleetDetail.settings.securityItems.session')]} />
          )}
          {section === 'retention' && (
            <Planned intro={t('fleetDetail.settings.retentionIntro')} items={[t('fleetDetail.settings.retentionItems.media'), t('fleetDetail.settings.retentionItems.telemetry'), t('fleetDetail.settings.retentionItems.missions'), t('fleetDetail.settings.retentionItems.audit')]} />
          )}
        </section>
      </div>
    </OrgPage>
  )
}
