import { OrgComingSoon } from '../OrgComingSoon'

/** Gated on OD-7 (RBAC role model reconciliation) — see docs/01-prd.md §25.4
 * and docs/06-wbs-timeline.md. Building this UI against any one of the three
 * currently-unreconciled role models risks a second migration later. */
export function TeamRolesPage() {
  return (
    <OrgComingSoon
      title="Team & Roles"
      description="Invite members and assign org-wide roles. Gated on reconciling the role model (OD-7) before this UI is designed."
    />
  )
}
