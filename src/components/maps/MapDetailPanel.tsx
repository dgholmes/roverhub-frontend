import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Section } from '@/components/fleet/v2/parts'
import { color, font, radius, space } from '@/design-system/tokens'
import { dataProvider } from '@/lib/realtime/dataProvider'
import type { SiteMap } from '@/types/maps'
import { CloudEmptyState } from './CloudEmptyState'

// three.js is most of a megabyte. It stays out of the entry bundle: nothing
// imports CloudViewer3D except through this boundary, and nothing crosses it
// until the 3D view is opened.
const CloudViewer3D = lazy(() => import('./CloudViewer3D').then((m) => ({ default: m.CloudViewer3D })))

/**
 * The detail of one surveyed floor. The 3D view is a panel you open, not a
 * permanent half of the canvas -- it is for diagnosis, when localisation looks
 * wrong or the robot stops somewhere odd, and a view that is always open is one
 * people stop reading.
 */
export function MapDetailPanel({ map, floorIndex, defaultOpen = false }: {
  map: SiteMap
  floorIndex: number
  /** Start with the 3D view already open, for a caller that has itself been asked to. */
  defaultOpen?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(defaultOpen)
  const floor = map.floors.find((f) => f.index === floorIndex)
  if (!floor) return null

  // '' in mock mode: no cloud to fetch, so no toggle and no chunk to load.
  const url = dataProvider.mapArtifactUrl(map.map_id, floor.index, 'cloud')
  const floorName = floor.label ?? t('liveops.map.floorN', { index: floor.index })

  return (
    <Section
      title={`${map.name} · ${floorName}`}
      aside={url ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: space[2], border: 'none', cursor: 'pointer',
            padding: '6px 10px', borderRadius: radius.sm, fontFamily: font.family, fontSize: font.size.sm,
            background: open ? color.selected : color.hover, color: open ? color.t1 : color.t2,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: radius.full, flexShrink: 0, background: open ? color.accent : color.t3 }} />
          {open ? t('liveops.map.hideCloud') : t('liveops.map.showCloud')}
        </button>
      ) : undefined}
    >
      {!url && <CloudEmptyState message={t('liveops.map.noCloud')} />}
      {url && open && (
        <Suspense fallback={<CloudEmptyState message={t('liveops.map.cloudLoading')} />}>
          <CloudViewer3D url={url} />
        </Suspense>
      )}
    </Section>
  )
}
