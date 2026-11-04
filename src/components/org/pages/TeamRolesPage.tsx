import { useTranslation } from 'react-i18next'
import { Fragment, useState } from 'react'
import { Check, UserPlus } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'
import { Badge, Button } from '@/components/kit'
import { formatAge } from '@/fleet/bridgeHealth'
import { useTeam } from '@/org/useTeam'
import { useAuthStore } from '@/lib/auth/authStore'
import { ALL_SITES, displayNameOf, type AuthUser } from '@/lib/auth/types'
import { AddUserDialog, EditUserDialog } from './UserDialogs'
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
 * With sign-in on and an org owner or admin signed in, the members are the
 * backend's users (/users) and can be added and edited here; a member is told
 * that only admins can list them. With sign-in off, mock data shows example
 * members and a real backend has none (useTeam). The role tables are
 * org/roles.ts, which the backend's auth/policy.py mirrors.
 */
export function TeamRolesPage() {
  const { t } = useTranslation()
  const sites = useOrgSites()
  const team = useTeam()
  const me = useAuthStore((s) => s.user)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<AuthUser | null>(null)
  const live = team.kind === 'live' ? team : null
  const actorIsOwner = me?.org_role === 'owner'
  const siteOptions = sites.map((s) => ({ id: s.id, name: s.name }))

  // A change to your own account takes effect in this console straight away.
  function changed(u: AuthUser) {
    live?.replace(u)
    if (u.user_id === me?.user_id) useAuthStore.setState({ user: u })
  }

  return (
    <OrgPage
      title={t('team.title')}
      subtitle={t('team.subtitle')}
      actions={live
        ? <Button icon={UserPlus} variant="primary" onClick={() => setAdding(true)}>{t('auth.users.add')}</Button>
        : <Button icon={UserPlus} disabled title={t('team.inviteTitle')}>{t('team.invite')}</Button>}
    >
      {(team.kind === 'sample' || team.kind === 'missing') && (
        <div className="rh-panel" style={{ padding: `${space[3]}px ${space[4]}px`, borderColor: color.amberBorder, background: color.amberBg, fontSize: font.size.md, color: color.t1, lineHeight: 1.5 }}>
          <b>{t('team.previewLead')}</b> {t('team.previewBody')}
        </div>
      )}

      <Block title={t('team.members')} aside={team.kind === 'sample' ? <SampleBadge /> : team.kind === 'missing' ? <MissingBadge what="sign-in" /> : undefined}>
        {team.kind === 'sample' ? (
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
                {team.members.map((m) => (
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
        ) : live ? (
          live.users === null ? (
            live.error
              ? <Placeholder title={t('auth.users.loadFailed')}>{live.error}</Placeholder>
              : <div style={{ fontSize: font.size.md, color: color.t3 }}>{t('auth.checking')}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={th}>{t('team.member')}</th>
                    <th style={th}>{t('team.orgRole')}</th>
                    <th style={th}>{t('auth.everySite')}</th>
                    {sites.map((s) => <th key={s.id} style={th}>{s.name}</th>)}
                    <th style={th}>{t('team.signIn')}</th>
                    <th style={th}>{t('team.lastActive')}</th>
                    <th style={th} aria-label={t('auth.users.edit')} />
                  </tr>
                </thead>
                <tbody>
                  {live.users.map((u) => {
                    // An admin cannot change an owner; the server would refuse.
                    const locked = u.org_role === 'owner' && !actorIsOwner
                    const everywhere = u.site_roles[ALL_SITES]
                    return (
                      <tr key={u.user_id} style={{ opacity: u.disabled ? 0.6 : 1 }}>
                        <td style={td}>
                          <div style={{ fontWeight: font.weight.semibold }}>
                            {displayNameOf(u)}
                            {u.user_id === me?.user_id && <Badge tone="accent" style={{ marginLeft: 6 }}>{t('auth.users.you')}</Badge>}
                          </div>
                          <div style={{ fontSize: font.size.sm, color: color.t3 }}>{u.username}</div>
                        </td>
                        <td style={td}>
                          {orgLabel(u.org_role)}
                          {u.audit_access && <Badge style={{ marginLeft: 6 }} title={t('fleetDetail.team.auditTitle')}>{t('team.audit')}</Badge>}
                        </td>
                        <td style={{ ...td, color: everywhere ? color.t1 : color.t3 }}>{everywhere ? siteLabel(everywhere) : '—'}</td>
                        {sites.map((s) => {
                          const own = u.site_roles[s.id]
                          const role = own ?? everywhere
                          return (
                            <td key={s.id} style={{ ...td, color: own ? color.t1 : role ? color.t2 : color.t3 }}>
                              {role ? siteLabel(role) : t('team.noAccess')}
                            </td>
                          )
                        })}
                        <td style={td}>{u.disabled ? <Badge tone="red">{t('auth.users.disabled')}</Badge> : <span style={{ color: color.t3 }}>{t('team.password')}</span>}</td>
                        <td style={{ ...td, color: color.t2 }}>{u.last_login_at ? formatAge(u.last_login_at) : t('auth.users.never')}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <Button size="sm" variant="ghost" disabled={locked} title={locked ? t('auth.users.roleNote') : undefined} onClick={() => setEditing(u)}>
                            {t('auth.users.edit')}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : team.kind === 'adminsOnly' ? (
          <Placeholder title={t('team.members')}>{t('auth.users.adminsOnly')}</Placeholder>
        ) : (
          <Placeholder title={t('fleetDetail.team.noMembersTitle')}>{t('fleetDetail.team.noMembersBody')}</Placeholder>
        )}
        <div style={{ fontSize: font.size.sm, color: color.t3 }}>
          {live ? t('auth.users.roleNote') : t('fleetDetail.team.roleChangeNote')}
        </div>
      </Block>

      {live && (
        <AddUserDialog open={adding} onOpenChange={setAdding} sites={siteOptions} actorIsOwner={actorIsOwner} onAdded={changed} />
      )}
      {live && editing && (
        <EditUserDialog
          key={editing.user_id}
          user={editing}
          onClose={() => setEditing(null)}
          sites={siteOptions}
          actorIsOwner={actorIsOwner}
          isSelf={editing.user_id === me?.user_id}
          onChanged={(u) => { changed(u); setEditing(u) }}
        />
      )}

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
