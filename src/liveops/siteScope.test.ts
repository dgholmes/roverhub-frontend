import { describe, expect, it } from 'vitest'
import { isKnownSite, scopeToSite } from './siteScope'

const AT_SITE_A = { id: 'a1', site_id: 'site-a' }
const AT_SITE_B = { id: 'b1', site_id: 'site-b' }
const SITES = [{ id: 'site-a' }, { id: 'site-b' }]

describe('scopeToSite', () => {
  it('keeps only records belonging to the active site', () => {
    expect(scopeToSite([AT_SITE_A, AT_SITE_B], 'site-a')).toEqual([AT_SITE_A])
  })

  it('returns nothing for a site with no records', () => {
    expect(scopeToSite([AT_SITE_A, AT_SITE_B], 'site-c')).toEqual([])
  })

  // The bug this exists to prevent: `#/site/atlantis/fleet` rendered the full
  // North Yard fleet, so a route naming a nonexistent site presented another
  // site's robots as though they were that site's.
  it('returns nothing for a site that does not exist rather than everything', () => {
    expect(scopeToSite([AT_SITE_A, AT_SITE_B], 'atlantis')).toEqual([])
  })

  /** An absent site filter means "span every site", which is what a
   * single-site deployment wants — matching VITE_SITE_ID's existing semantics.
   * It must be an explicit `undefined`, never a missing/typo'd id. */
  it('spans every site when no site is specified', () => {
    expect(scopeToSite([AT_SITE_A, AT_SITE_B], undefined)).toEqual([AT_SITE_A, AT_SITE_B])
  })

  it('does not mutate or reorder the input', () => {
    const input = [AT_SITE_A, AT_SITE_B]
    scopeToSite(input, 'site-a')
    expect(input).toEqual([AT_SITE_A, AT_SITE_B])
  })
})

describe('isKnownSite', () => {
  it('recognises a configured site', () => {
    expect(isKnownSite(SITES, 'site-a')).toBe(true)
  })

  it('rejects a site absent from the configured list', () => {
    expect(isKnownSite(SITES, 'atlantis')).toBe(false)
  })

  // Treating "no filter" as an unknown site would make the single-site
  // deployment case render a not-found screen.
  it('treats an absent site id as known, not unknown', () => {
    expect(isKnownSite(SITES, undefined)).toBe(true)
  })
})
