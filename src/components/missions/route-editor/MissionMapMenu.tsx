import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import type { SiteMap } from '@/types/maps'

/** What the route editor's map control shows:
 * - `menu`: a choice of map, while the route has no points. The options are
 *   the site's active maps, plus the current map when it is not one of them
 *   (so the select can show it), plus "no map" (`mapId: ''`, `name: null`)
 *   only for a mission that has none;
 * - `locked`: the map's name, fixed: points are placed in a map's own frame,
 *   so on another map they would stand somewhere else entirely;
 * - `name`: the map's name, when there is nothing else to choose. */
export type MapMenu =
  | { kind: 'menu'; value: string; options: { mapId: string; name: string | null }[] }
  | { kind: 'locked'; name: string | null }
  | { kind: 'name'; name: string | null }

export function mapMenu(current: SiteMap | undefined, maps: readonly SiteMap[] | null | undefined, waypointCount: number): MapMenu | null {
  // A mission on the plain grid of a site with no maps: the "no site map"
  // badge already says all there is to say.
  if (!current && !maps?.length) return null
  const name = current?.name ?? null
  if (waypointCount > 0) return { kind: 'locked', name }
  const active = (maps ?? []).filter((m) => m.status === 'active' || m.map_id === current?.map_id)
  const byName = [...active].sort((a, b) => a.name.localeCompare(b.name) || a.map_id.localeCompare(b.map_id))
  const options = [
    ...(current ? [] : [{ mapId: '', name: null }]),
    ...byName.map((m) => ({ mapId: m.map_id, name: m.name })),
  ]
  if (current && !options.some((o) => o.mapId === current.map_id)) options.push({ mapId: current.map_id, name: current.name })
  return options.length > 1 ? { kind: 'menu', value: current?.map_id ?? '', options } : { kind: 'name', name }
}

/**
 * The mission's map, on the route editor's canvas: a menu to move the mission
 * to another of the site's maps while the route is empty, and locked, with the
 * reason, from its first point. Laid in the canvas's own overlay slot, where a
 * click never places a waypoint (MissionMapEditor `mapControl`).
 */
export function MissionMapMenu({ current, maps, waypointCount, onChange }: {
  /** The mission's map; undefined for one that names none. */
  current: SiteMap | undefined
  /** The site's maps (useSiteMapStore.maps). */
  maps: readonly SiteMap[] | null | undefined
  waypointCount: number
  /** The map chosen: its id, or '' for none. */
  onChange: (mapId: string) => void
}) {
  const { t } = useTranslation()
  const menu = mapMenu(current, maps, waypointCount)
  if (!menu) return null
  const label = (name: string | null) => name ?? t('missions.library.mapChip.none')
  const box: React.CSSProperties = {
    ...glass.overlay, border: 'none', boxShadow: 'var(--rh-shadow-sm)',
    display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap',
    padding: `${space[1]}px ${space[2]}px`, borderRadius: radius.md,
    fontFamily: font.family, fontSize: font.size.sm, color: color.t2,
  }

  if (menu.kind === 'menu') {
    return (
      <div style={box}>
        <span aria-hidden>{t('missions.editor.mapMenu')}</span>
        <select
          aria-label={t('missions.editor.mapMenu')} value={menu.value} onChange={(e) => onChange(e.target.value)}
          style={{
            height: 28, padding: '0 6px', borderRadius: radius.sm, border: 'none', background: color.card,
            color: color.t1, fontFamily: font.family, fontSize: font.size.sm, fontWeight: font.weight.semibold,
          }}
        >
          {menu.options.map((o) => <option key={o.mapId} value={o.mapId}>{label(o.name)}</option>)}
        </select>
      </div>
    )
  }
  return (
    <div style={box} title={menu.kind === 'locked' ? t('missions.editor.mapLockedWhy') : undefined}>
      <span>{t('missions.editor.mapMenu')}</span>
      <span style={{ color: color.t1, fontWeight: font.weight.semibold }}>{label(menu.name)}</span>
      {menu.kind === 'locked' && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: radius.full,
          background: color.amberBg, color: color.t1, fontSize: font.size.xs,
        }}>
          <Lock size={12} aria-hidden color={color.amber} />
          {t('missions.editor.mapLocked')}
        </span>
      )}
    </div>
  )
}
