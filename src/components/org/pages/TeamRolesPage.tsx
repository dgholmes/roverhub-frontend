import { useTranslation } from 'react-i18next'
import { Fragment } from 'react'
import { Check, UserPlus } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'
import { Badge, Button } from '@/components/kit'
import { formatAge } from '@/fleet/bridgeHealth'
import { orgMembers } from '@/org/orgData'
import { CAPABILITIES, ORG_ROLES, SITE_ROLES } from '@/org/roles'
import { useOrgSites } from '@/org/useOrgSites'
import { Block, MissingBadge, OrgPage, Placeholder, SampleBadge } from '../parts'

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t3,
  padding: `${space[2]}px ${space[3]}px`, borderBottom: `1px solid ${color.border}`, whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  fontSize: font.size.md, color: color.t1, padding: `${space[2]}px ${space[3]}px`,
  borderBottom: `1px solid ${color.border}`, whiteSpace: 'nowrap',
}

// Looked up at render, not module load, so labels follow the language.
const orgLabel = (id: string) => ORG_ROLES.find((r) => r.id === id)?.label ?? id
const siteLabel = (id: string) => SITE_ROLES.find((r) => r.id === id)?.label ?? id

/**
 * Team: members, their org role and their role at each site (FlightHub 2's
 * organisation plus project roles), and the proposed role model itself.
 *
 * Nothing here is enforced: there is no sign-in, and OD-7 (which role model)
 * is still open. The role model shown is the proposal in org/roles.ts. Against
 * mock data the members are examples; against a real backend there are none
 * to show.
 */
export function TeamRolesPage() {
  const { t } = useTranslation()
  const sites = useOrgSites()

  return (
    <OrgPage
      title={t('team.title')}
      subtitle={t('team.subtitle')}
      actions={<Button icon={UserPlus} disabled title={t('team.inviteTitle')}>{t('team.invite')}</Button>}
    >
      <div className="rh-panel" style={{ padding: `${space[3]}px ${space[4]}px`, borderColor: color.amberBorder, background: color.amberBg, fontSize: font.size.md, color: color.t1, lineHeight: 1.5 }}>
        <b>{t('team.previewLead')}</b> {t('team.previewBody')}
      </div>

      <Block title={t('team.members')} aside={orgMembers ? <SampleBadge /> : <MissingBadge what="sign-in" />}>
        {orgMembers ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>{t('team.member')}</th>
                  <th style={th}>{t('team.orgRole')}</th>
                  {sites.map((s) => <th key={s.id} style={th}>{s.name}</th>)}
                  <th style={th}>{t('team.signIn')}</th>
                  <th style={th}>{t('team.lastActive')}</th>
                </tr>
              </thead>
              <tbody>
                {orgMembers.map((m) => (
                  <tr key={m.id}>
                    <td style={td}>
                      <div style={{ fontWeight: font.weight.semibold }}>{m.name}</div>
                      <div style={{ fontSize: font.size.sm, color: color.t3 }}>{m.email}</div>
                    </td>
                    <td style={td}>
                      {orgLabel(m.orgRole)}
                      {m.auditAccess && <Badge style={{ marginLeft: 6 }} title={t('fleetDetail.team.auditTitle')}>{t('team.audit')}</Badge>}
                    </td>
                    {sites.map((s) => (
                      <td key={s.id} style={{ ...td, color: m.siteRoles[s.id] ? color.t1 : color.t3 }}>
                        {m.siteRoles[s.id] ? siteLabel(m.siteRoles[s.id]) : t('team.noAccess')}
                      </td>
                    ))}
                    <td style={td}>{m.mfa ? <Badge tone="green">MFA</Badge> : <span style={{ color: color.t3 }}>{t('team.password')}</span>}</td>
                    <td style={{ ...td, color: color.t2 }}>{formatAge(m.lastActive)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Placeholder title={t('fleetDetail.team.noMembersTitle')}>{t('fleetDetail.team.noMembersBody')}</Placeholder>
        )}
        <div style={{ fontSize: font.size.sm, color: color.t3 }}>
          {t('fleetDetail.team.roleChangeNote')}
        </div>
      </Block>

      <div style={{ display: 'grid', gap: space[4], gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', alignItems: 'start' }}>
        <Block title={t('team.proposedRoles')}>
          <div style={{ fontSize: font.size.md, color: color.t2, lineHeight: 1.5 }}>
            {t('fleetDetail.team.rolesIntro')}
          </div>
          {[{ id: 'org', title: t('fleetDetail.team.orgRoles'), roles: ORG_ROLES }, { id: 'site', title: t('fleetDetail.team.siteRoles'), roles: SITE_ROLES }].map((g) => (
            <div key={g.id}>
              <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t3, margin: `${space[2]}px 0` }}>{g.title}</div>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: space[4], rowGap: space[2] }}>
                {g.roles.map((r) => (
                  <div key={r.id} style={{ display: 'contents' }}>
                    <dt style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>{r.label}</dt>
                    <dd style={{ margin: 0, fontSize: font.size.md, color: color.t2 }}>{r.summary}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </Block>

        <Block title={t('team.whatRolesCanDo')}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>{t('team.can')}</th>
                  {SITE_ROLES.map((r) => <th key={r.id} style={{ ...th, textAlign: 'center' }}>{r.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {CAPABILITIES.map((g) => (
                  <Fragment key={g.id}>
                    <tr>
                      <td colSpan={SITE_ROLES.length + 1} style={{ ...td, fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t3, paddingTop: space[3] }}>{g.group}</td>
                    </tr>
                    {g.items.map((c) => (
                      <tr key={c.id}>
                        <td style={{ ...td, whiteSpace: 'normal' }}>{c.label}</td>
                        {SITE_ROLES.map((r) => (
                          <td key={r.id} style={{ ...td, textAlign: 'center' }}>
                            {c.roles.includes(r.id)
                              ? <Check size={15} color={color.green} aria-label={t('common.yes')} />
                              : <span aria-label={t('common.no')} style={{ color: color.t3 }}>—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      </div>
    </OrgPage>
  )
}
