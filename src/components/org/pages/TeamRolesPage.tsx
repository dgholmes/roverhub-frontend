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

const orgLabel = Object.fromEntries(ORG_ROLES.map((r) => [r.id, r.label]))
const siteLabel = Object.fromEntries(SITE_ROLES.map((r) => [r.id, r.label]))

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
  const sites = useOrgSites()

  return (
    <OrgPage
      title="Team"
      subtitle="Who can do what, at which site"
      actions={<Button icon={UserPlus} disabled title="Inviting people needs sign-in, which isn't built yet.">Invite</Button>}
    >
      <div className="rh-panel" style={{ padding: `${space[3]}px ${space[4]}px`, borderColor: color.amberBorder, background: color.amberBg, fontSize: font.size.md, color: color.t1, lineHeight: 1.5 }}>
        <b>Preview.</b> RoverHub has no sign-in yet, so roles here aren't enforced and nothing can be changed.
        The role model below is a proposal for review (decision OD-7).
      </div>

      <Block title="Members" aside={orgMembers ? <SampleBadge /> : <MissingBadge what="sign-in" />}>
        {orgMembers ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>Member</th>
                  <th style={th}>Org role</th>
                  {sites.map((s) => <th key={s.id} style={th}>{s.name}</th>)}
                  <th style={th}>Sign-in</th>
                  <th style={th}>Last active</th>
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
                      {orgLabel[m.orgRole]}
                      {m.auditAccess && <Badge style={{ marginLeft: 6 }} title="Can read the audit log and evidence records">Audit</Badge>}
                    </td>
                    {sites.map((s) => (
                      <td key={s.id} style={{ ...td, color: m.siteRoles[s.id] ? color.t1 : color.t3 }}>
                        {m.siteRoles[s.id] ? siteLabel[m.siteRoles[s.id]] : 'No access'}
                      </td>
                    ))}
                    <td style={td}>{m.mfa ? <Badge tone="green">MFA</Badge> : <span style={{ color: color.t3 }}>Password</span>}</td>
                    <td style={{ ...td, color: color.t2 }}>{formatAge(m.lastActive)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Placeholder title="No members to show">
            Members, their roles at each site and their sign-in method appear here once RoverHub has sign-in.
          </Placeholder>
        )}
        <div style={{ fontSize: font.size.sm, color: color.t3 }}>
          Every role change will be recorded with who made it and the old and new role (PRD SEC-004). That needs the database.
        </div>
      </Block>

      <div style={{ display: 'grid', gap: space[4], gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', alignItems: 'start' }}>
        <Block title="Proposed roles">
          <div style={{ fontSize: font.size.md, color: color.t2, lineHeight: 1.5 }}>
            Two levels. An org role says who runs the organisation; a site role, one per site, says what someone may
            do there. Built from the PRD's eight roles: Mission Planner folds into Supervisor, Administrator becomes the
            org Admin, and Auditor becomes an audit-access flag any member can hold.
          </div>
          {[{ title: 'Organisation', roles: ORG_ROLES }, { title: 'Site', roles: SITE_ROLES }].map((g) => (
            <div key={g.title}>
              <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t3, margin: `${space[2]}px 0` }}>{g.title} roles</div>
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

        <Block title="What each site role can do">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>Can…</th>
                  {SITE_ROLES.map((r) => <th key={r.id} style={{ ...th, textAlign: 'center' }}>{r.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {CAPABILITIES.map((g) => (
                  <Fragment key={g.group}>
                    <tr>
                      <td colSpan={SITE_ROLES.length + 1} style={{ ...td, fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t3, paddingTop: space[3] }}>{g.group}</td>
                    </tr>
                    {g.items.map((c) => (
                      <tr key={c.label}>
                        <td style={{ ...td, whiteSpace: 'normal' }}>{c.label}</td>
                        {SITE_ROLES.map((r) => (
                          <td key={r.id} style={{ ...td, textAlign: 'center' }}>
                            {c.roles.includes(r.id)
                              ? <Check size={15} color={color.green} aria-label="Yes" />
                              : <span aria-label="No" style={{ color: color.t3 }}>—</span>}
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
