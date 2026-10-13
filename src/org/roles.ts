import i18n from '@/i18n'

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

/** Label and summary read from the fleetDetail.roles dictionary on access,
 * so they follow the current language. */
function role<T extends OrgRole | SiteRole>(level: 'org' | 'site', id: T): RoleInfo<T> {
  return {
    id,
    get label() { return i18n.t(`fleetDetail.roles.${level}.${id}.label` as 'fleetDetail.roles.org.owner.label') },
    get summary() { return i18n.t(`fleetDetail.roles.${level}.${id}.summary` as 'fleetDetail.roles.org.owner.summary') },
  }
}

export const ORG_ROLES: RoleInfo<OrgRole>[] = (['owner', 'admin', 'member'] as const).map((id) => role('org', id))

export const SITE_ROLES: RoleInfo<SiteRole>[] =
  (['viewer', 'operator', 'supervisor', 'technician', 'engineer'] as const).map((id) => role('site', id))

type CapabilityId =
  | 'watchLive' | 'estop' | 'drive' | 'getUp' | 'override' | 'planPatrols' | 'dispatchPatrols'
  | 'seeHealth' | 'runTests' | 'edgeTools' | 'editZones' | 'configure'
type GroupId = 'LiveOps' | 'Missions' | 'Fleet' | 'Site'

export interface Capability {
  id: CapabilityId
  label: string
  /** The site roles that hold it. */
  roles: SiteRole[]
}

function cap(id: CapabilityId, roles: SiteRole[]): Capability {
  return { id, get label() { return i18n.t(`fleetDetail.roles.cap.${id}`) }, roles }
}

function group(id: GroupId, items: Capability[]): { id: GroupId; group: string; items: Capability[] } {
  return { id, get group() { return i18n.t(`fleetDetail.roles.group.${id}`) }, items }
}

/** What each site role can do, as the Team page's matrix. Grouped by the
 * workspace the action lives in. */
export const CAPABILITIES: { id: GroupId; group: string; items: Capability[] }[] = [
  group('LiveOps', [
    cap('watchLive', ['viewer', 'operator', 'supervisor', 'technician', 'engineer']),
    cap('estop', ['operator', 'supervisor', 'technician', 'engineer']),
    cap('drive', ['operator', 'supervisor', 'engineer']),
    cap('getUp', ['operator', 'supervisor', 'technician', 'engineer']),
    cap('override', ['supervisor']),
  ]),
  group('Missions', [
    cap('planPatrols', ['supervisor']),
    cap('dispatchPatrols', ['supervisor']),
  ]),
  group('Fleet', [
    cap('seeHealth', ['viewer', 'operator', 'supervisor', 'technician', 'engineer']),
    cap('runTests', ['technician', 'engineer']),
    cap('edgeTools', ['engineer']),
  ]),
  group('Site', [
    cap('editZones', ['supervisor']),
    cap('configure', ['engineer']),
  ]),
]
