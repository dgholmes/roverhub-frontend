/**
 * PROPOSED role model — for review, not yet decided (OD-7). Nothing enforces
 * it: there is no sign-in, and the bridge's control-owner check is not an
 * authorization mechanism. It exists so the Team page can show the proposal
 * concretely.
 *
 * Built from PRD §5.2's eight roles, reshaped for what RoverHub is used for:
 * small teams running robot patrols and inspections at a few sites. Two
 * levels, as FlightHub 2 does with organisation and project roles:
 *
 * - An org role says who runs the organisation itself.
 * - A site role, one per site, says what someone may do there. A person can
 *   be a Supervisor at one site and have no access to another.
 *
 * Folded from the PRD's eight: Mission Planner into Supervisor (one person
 * plans and dispatches at this team size); Administrator into the org Admin
 * role; Auditor into an "audit access" flag that any member can hold, since
 * reviewing evidence is read-only and orthogonal to operating. PRD §5.2 says
 * the baseline is "a product default, not a hard-coded policy", so this is a
 * default that per-org configuration can change later.
 */

export type OrgRole = 'owner' | 'admin' | 'member'
export type SiteRole = 'viewer' | 'operator' | 'supervisor' | 'technician' | 'engineer'

export interface RoleInfo<T extends string> {
  id: T
  label: string
  /** One plain sentence. */
  summary: string
}

export const ORG_ROLES: RoleInfo<OrgRole>[] = [
  { id: 'owner', label: 'Owner', summary: 'Everything an Admin can do, plus billing and deleting the organisation. One or two people.' },
  { id: 'admin', label: 'Admin', summary: 'Manages members, sites, devices, safety policies and settings across the organisation.' },
  { id: 'member', label: 'Member', summary: 'Works at the sites they have a role in. No organisation-wide settings.' },
]

export const SITE_ROLES: RoleInfo<SiteRole>[] = [
  { id: 'viewer', label: 'Viewer', summary: 'Watches live robots and reads media, records and reports. Changes nothing.' },
  { id: 'operator', label: 'Operator', summary: 'Drives robots, uses E-Stop, takes snapshots and speaks through the robot.' },
  { id: 'supervisor', label: 'Supervisor', summary: 'Plans and dispatches patrols, approves overrides, edits zones, assigns operators.' },
  { id: 'technician', label: 'Technician', summary: 'Services robots in Fleet: diagnostics, motion tests, maintenance records.' },
  { id: 'engineer', label: 'Engineer', summary: 'Technician access plus edge-device tools and robot configuration in Systems.' },
]

export interface Capability {
  label: string
  /** The site roles that hold it. */
  roles: SiteRole[]
}

/** What each site role can do, as the Team page's matrix. Grouped by the
 * workspace the action lives in. */
export const CAPABILITIES: { group: string; items: Capability[] }[] = [
  {
    group: 'LiveOps',
    items: [
      { label: 'Watch live video and telemetry', roles: ['viewer', 'operator', 'supervisor', 'technician', 'engineer'] },
      { label: 'E-Stop', roles: ['operator', 'supervisor', 'technician', 'engineer'] },
      { label: 'Drive, take snapshots, speak', roles: ['operator', 'supervisor', 'engineer'] },
      { label: 'Get a fallen robot up', roles: ['operator', 'supervisor', 'technician', 'engineer'] },
      { label: 'Override a running patrol', roles: ['supervisor'] },
    ],
  },
  {
    group: 'Missions',
    items: [
      { label: 'Plan and edit patrols', roles: ['supervisor'] },
      { label: 'Dispatch and schedule patrols', roles: ['supervisor'] },
    ],
  },
  {
    group: 'Fleet',
    items: [
      { label: 'See robot health', roles: ['viewer', 'operator', 'supervisor', 'technician', 'engineer'] },
      { label: 'Run motion tests', roles: ['technician', 'engineer'] },
      { label: 'Edge device developer tools', roles: ['engineer'] },
    ],
  },
  {
    group: 'Site',
    items: [
      { label: 'Edit geofence and no-go zones', roles: ['supervisor'] },
      { label: 'Robot and SDK configuration (Systems)', roles: ['engineer'] },
    ],
  },
]
