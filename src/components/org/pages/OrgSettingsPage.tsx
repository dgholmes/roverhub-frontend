import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, KeyValue } from '@/components/kit'
import { API_BASE_URL, MQTT_WS_URL, SITE_FILTER, USE_REAL_BACKEND } from '@/lib/realtime/dataProvider'
import { GLOBAL_URL, PER_ROBOT_URLS } from '@/lib/edgeVideo'
import { EXPECTED_SCHEMA_VERSION } from '@/lib/schemaVersion'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { MissingBadge, OrgPage, type Missing } from '../parts'
import { Segmented } from '@/components/kit'
import { useThemeStore, type Accent, type Theme } from '@/lib/theme'
import { LANGUAGES, setLanguage, type LanguageCode } from '@/i18n'
import { SITE_ROLES, type SiteRole } from '@/org/roles'
import { useSessionStore } from '@/store/useSessionStore'
import { useAuthStore } from '@/lib/auth/authStore'
import { takeRequestedSettingsSection } from '../settingsSection'
import { AccountSettings } from '@/components/auth/AccountSettings'

type SectionId = 'account' | 'appearance' | 'language' | 'rolePreview' | 'organisation' | 'units' | 'notifications' | 'security' | 'retention' | 'connections'

/** Two groups: what each person sets for themselves, and what applies to the
 * whole organisation. */
const GROUPS: { id: 'groupYou' | 'groupOrg'; sections: SectionId[] }[] = [
  { id: 'groupYou', sections: ['account', 'appearance', 'language', 'rolePreview'] },
  { id: 'groupOrg', sections: ['organisation', 'units', 'notifications', 'security', 'retention', 'connections'] },
]

const SECTIONS: { id: SectionId; missing?: Missing }[] = [
  { id: 'account' },
  { id: 'appearance' },
  { id: 'language' },
  { id: 'rolePreview', missing: 'sign-in' },
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

/**
 * Personal preferences: theme, accent and language. Saved in this browser
 * (localStorage, per viewer) because there is no sign-in yet. When accounts
 * exist, these move to the user's profile and are applied at sign-in; the
 * controls stay the same, only where the value is stored changes.
 */
function PrefNote() {
  const { t } = useTranslation()
  return <div style={{ fontSize: font.size.sm, color: color.t3, lineHeight: 1.5, maxWidth: 560 }}>{t('settings.savedHere')}</div>
}

function PrefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[4], flexWrap: 'wrap' }}>
      <div style={{ width: 160, fontSize: font.size.md, color: color.t2 }}>{label}</div>
      {children}
    </div>
  )
}

function Appearance() {
  const { t } = useTranslation()
  const theme = useThemeStore((s) => s.theme)
  const accent = useThemeStore((s) => s.accent)
  const setTheme = useThemeStore((s) => s.setTheme)
  const setAccent = useThemeStore((s) => s.setAccent)
  const swatch = (c: Accent) => (
    <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, display: 'inline-block', marginRight: 6, background: c === 'blue' ? '#0a84ff' : '#a3e635' }} />
  )
  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <PrefRow label={t('settings.theme')}>
        <Segmented<Theme>
          label={t('settings.theme')}
          value={theme}
          onChange={setTheme}
          options={[{ value: 'dark', label: t('settings.dark') }, { value: 'light', label: t('settings.light') }]}
        />
      </PrefRow>
      <PrefRow label={t('settings.accent')}>
        <Segmented<Accent>
          label={t('settings.accent')}
          value={accent}
          onChange={setAccent}
          options={[
            { value: 'blue', label: <>{swatch('blue')}{t('settings.blue')}</> },
            { value: 'lime', label: <>{swatch('lime')}{t('settings.lime')}</> },
          ]}
        />
      </PrefRow>
      <PrefNote />
    </div>
  )
}

function LanguagePrefs() {
  const { t, i18n } = useTranslation()
  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <p style={{ margin: 0, fontSize: font.size.md, color: color.t2 }}>{t('settings.languageIntro')}</p>
      <PrefRow label={t('settings.language')}>
        {/* Each language in its own name, so it can be found from any language. */}
        <Segmented<LanguageCode>
          label={t('settings.language')}
          value={(LANGUAGES.find((l) => l.code === i18n.language)?.code ?? 'en')}
          onChange={setLanguage}
          options={LANGUAGES.map((l) => ({ value: l.code, label: <span lang={l.code}>{l.label}</span> }))}
        />
      </PrefRow>
      <PrefNote />
    </div>
  )
}

function RolePreview() {
  const { t } = useTranslation()
  const role = useSessionStore((s) => s.role)
  const setRole = useSessionStore((s) => s.setRole)
  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <p style={{ margin: 0, fontSize: font.size.md, color: color.t2, lineHeight: 1.5, maxWidth: 560 }}>{t('settings.rolePreviewIntro')}</p>
      <PrefRow label={t('settings.role')}>
        <Segmented<SiteRole>
          label={t('settings.role')}
          value={role}
          onChange={setRole}
          options={SITE_ROLES.map((r) => ({ value: r.id, label: r.label }))}
        />
      </PrefRow>
      <div style={{ fontSize: font.size.sm, color: color.t3, lineHeight: 1.5, maxWidth: 560 }}>
        {SITE_ROLES.find((r) => r.id === role)?.summary}
      </div>
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
  // Signed in, the role comes from the account, so there is nothing to
  // preview; with sign-in off there is no account (and no password) to manage.
  const signedIn = useAuthStore((s) => s.status === 'signedIn')
  const sections = SECTIONS.filter((s) => (signedIn ? s.id !== 'rolePreview' : s.id !== 'account'))
  const [picked, setSection] = useState<SectionId>(() => {
    const requested = takeRequestedSettingsSection()
    return SECTIONS.some((s) => s.id === requested) ? requested as SectionId : 'appearance'
  })
  const current = sections.find((s) => s.id === picked) ?? sections.find((s) => s.id === 'appearance')!
  const section = current.id

  return (
    <OrgPage title={t('settings.title')}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[5], alignItems: 'flex-start' }}>
        <nav aria-label={t('fleetDetail.settings.sectionsAria')} style={{ flex: '0 0 220px', display: 'grid', gap: 2 }}>
          {GROUPS.map((g) => (
            <div key={g.id} style={{ display: 'grid', gap: 2, marginBottom: space[3] }}>
              <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t3, padding: `${space[1]}px ${space[3]}px` }}>
                {t(`settings.${g.id}`)}
              </div>
          {sections.filter((s) => g.sections.includes(s.id)).map((s) => (
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
            </div>
          ))}
        </nav>

        <section className="rh-panel" style={{ flex: '1 1 520px', minWidth: 0, padding: space[5], display: 'grid', gap: space[4] }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, flex: 1, fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.t1 }}>{t(`settings.${current.id}`)}</h2>
            {current.missing && <MissingBadge what={current.missing} />}
          </header>
          {section === 'account' && <AccountSettings />}
          {section === 'appearance' && <Appearance />}
          {section === 'language' && <LanguagePrefs />}
          {section === 'rolePreview' && <RolePreview />}
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
