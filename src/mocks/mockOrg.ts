import type { Site as SiteRecord } from '@/types/sites'
import type { DailyCount, Member, OrgHistory } from '@/org/orgTypes'

/**
 * Sample organisation content for the mock provider: the sites, team members,
 * and history for the Dashboard's charts. None of it is used against a real
 * backend, which stores sites itself (GET /sites) and has no database to hold
 * history.
 */

const SEEDED_AT = '2026-11-01T00:00:00Z'

/** The mock provider's sites, as GET /sites would answer. North Yard holds
 * the sample robots and maps; Harbour Depot has one robot (RVR-05 in
 * mockRobots.ts); Plant 3 has none and no location, to show an empty site and
 * one the Dashboard's site map leaves out. */
export const mockSites: SiteRecord[] = [
  {
    site_id: 'site-north-yard', name: 'North Yard — Site 1', timezone: 'Asia/Seoul',
    address: '12 Harbour-ro, Incheon', location: { lat: 37.456, lng: 126.705 },
    created_at: SEEDED_AT, updated_at: SEEDED_AT,
  },
  {
    site_id: 'site-harbour-depot', name: 'Harbour Depot', timezone: 'Asia/Seoul',
    address: null, location: { lat: 35.104, lng: 129.042 },
    created_at: SEEDED_AT, updated_at: SEEDED_AT,
  },
  {
    site_id: 'site-plant-3', name: 'Plant 3', timezone: 'Asia/Seoul',
    address: null, location: null,
    created_at: SEEDED_AT, updated_at: SEEDED_AT,
  },
]

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

export const mockMembers: Member[] = [
  { id: 'u1', name: 'MinJae Joo', email: 'minjae@example.com', orgRole: 'owner', siteRoles: { 'site-north-yard': 'supervisor', 'site-harbour-depot': 'supervisor' }, mfa: true, auditAccess: true, lastActive: ago(2) },
  { id: 'u2', name: 'Ana Lee', email: 'ana@example.com', orgRole: 'member', siteRoles: { 'site-north-yard': 'operator' }, mfa: false, auditAccess: false, lastActive: ago(60 * 20) },
  { id: 'u3', name: 'Tomas Berg', email: 'tomas@example.com', orgRole: 'member', siteRoles: { 'site-plant-3': 'engineer', 'site-north-yard': 'engineer' }, mfa: true, auditAccess: false, lastActive: ago(60 * 72) },
  { id: 'u4', name: 'Seo-yeon Park', email: 'seoyeon@example.com', orgRole: 'admin', siteRoles: { 'site-north-yard': 'viewer', 'site-harbour-depot': 'viewer', 'site-plant-3': 'viewer' }, mfa: true, auditAccess: true, lastActive: ago(60 * 5) },
  { id: 'u5', name: 'Daniel Kim', email: 'daniel@example.com', orgRole: 'member', siteRoles: { 'site-harbour-depot': 'technician' }, mfa: false, auditAccess: false, lastActive: ago(60 * 24 * 6) },
]

function series(values: number[]): DailyCount[] {
  return values.map((value, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (values.length - 1 - i))
    return { day: d.toISOString().slice(0, 10), value }
  })
}

export const mockHistory: OrgHistory = {
  uptimePct: series([94.1, 96.8, 95.2, 97.9, 93.4, 98.2, 96.5, 97.1, 95.8, 98.6, 97.4, 96.0, 98.9, 97.7]),
  patrols: series([4, 6, 5, 7, 3, 6, 8, 7, 5, 6, 9, 7, 8, 6]),
  alerts: series([3, 5, 2, 6, 4, 1, 3, 2, 4, 3, 1, 2, 5, 2]),
  distanceKm: series([3.1, 4.8, 4.0, 5.6, 2.2, 4.9, 6.3, 5.4, 4.1, 4.7, 7.0, 5.5, 6.1, 4.6]),
  falls: series([0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]),
}
