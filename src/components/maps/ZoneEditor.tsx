import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleMarker, MapContainer, Polyline, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Pencil, Trash2 } from 'lucide-react'
import { Button, IconButton, Segmented } from '@/components/kit'
import { Section } from '@/components/fleet/v2/parts'
import { FloorplanLayer } from '@/components/liveops/map/FloorplanLayer'
import { GeofenceLayer } from '@/components/liveops/map/GeofenceLayer'
import { NoGoZoneLayer } from '@/components/liveops/map/NoGoZoneLayer'
import { Field, inputStyle } from '@/components/missions/parts'
import { ReadOnlyOnTouchNotice } from '@/components/touch/ReadOnlyOnTouchNotice'
import { color, font, radius, space } from '@/design-system/tokens'
import { boundsForFloor } from '@/liveops/mapFloor'
import { toLatLng } from '@/liveops/mapCoords'
import { ApiError } from '@/lib/realtime/apiError'
import type { MapZone, Point2D, SiteMap, ZoneKind } from '@/types/maps'
import {
  addVertex, buildZone, latLngToMapMetres, zoneOutOfBounds, type PolygonProblem,
} from './zoneGeometry'

/** The colour a zone of this kind is drawn in on the map, so its row in the
 * list is the same colour (NoGoZoneLayer's red, GeofenceLayer's grey). */
const KIND_COLOR: Record<ZoneKind, string> = { no_go: color.red, geofence: color.t3, stairs: color.amber }

/** Clicks while drawing: one corner per click, and a double-click finishes. */
function DrawHandler({ onVertex, onFinish }: { onVertex: (p: Point2D) => void; onFinish: () => void }) {
  useMapEvents({
    click: (e) => onVertex(latLngToMapMetres(e.latlng)),
    dblclick: () => onFinish(),
  })
  return null
}

/** The shape being drawn: a line through the corners so far, and a dot on each.
 * Always mounted, empty when nothing is being drawn. */
const DraftShape = memo(function DraftShape({ points }: { points: readonly Point2D[] }) {
  const positions = useMemo(() => points.map(([x, y]) => toLatLng(x, y)), [points])
  return (
    <>
      <Polyline positions={positions} pathOptions={{ color: color.accent, weight: 2, dashArray: '4 4' }} interactive={false} />
      {positions.map((center, i) => (
        <CircleMarker
          key={i} center={center} radius={4} interactive={false}
          pathOptions={{ color: color.accent, fillColor: color.accent, fillOpacity: 1, weight: 0 }}
        />
      ))}
    </>
  )
})

const EMPTY: readonly Point2D[] = []

/** The zone editor's working state: the zones as edited (unsaved edits are
 * the difference from `map.zones`), the shape being drawn, and the controls.
 * Held by whoever draws the map, so the list and the drawing can sit apart --
 * the Map workspace draws on its centre map and lists in its Zones tab. */
export interface ZoneDraft {
  zones: MapZone[]
  dirty: boolean
  drawing: Point2D[] | null
  kind: ZoneKind
  setKind: (k: ZoneKind) => void
  label: string
  setLabel: (l: string) => void
  problem: PolygonProblem | null
  saving: boolean
  error: string | null
  startDrawing: () => void
  onVertex: (p: Point2D) => void
  undo: () => void
  stopDrawing: () => void
  finish: () => void
  remove: (zoneId: string) => void
  save: () => Promise<void>
}

export function useZoneDraft(map: SiteMap, onSave: (zones: MapZone[]) => void | Promise<void>): ZoneDraft {
  const [zones, setZones] = useState<MapZone[]>(map.zones)
  // What the server holds is what is shown, so a save that comes back (or a
  // re-survey) replaces the working copy. Unsaved edits are the difference
  // between the two.
  useEffect(() => { setZones(map.zones) }, [map.zones])
  const dirty = zones !== map.zones

  const [drawing, setDrawing] = useState<Point2D[] | null>(null)
  const [kind, setKind] = useState<ZoneKind>('no_go')
  const [label, setLabel] = useState('')
  const [problem, setProblem] = useState<PolygonProblem | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onVertex = useCallback((p: Point2D) => {
    setProblem(null)
    setDrawing((d) => (d ? addVertex(d, p) : d))
  }, [])
  const undo = () => setDrawing((d) => (d ? d.slice(0, -1) : d))
  const stopDrawing = useCallback(() => { setDrawing(null); setProblem(null) }, [])

  const finish = () => {
    if (!drawing) return
    const built = buildZone({ mapId: map.map_id, kind, label, points: drawing, existing: zones })
    if ('problem' in built) {
      // Stay in drawing mode: the operator can add or undo corners and try again.
      setProblem(built.problem)
      return
    }
    setZones((zs) => [...zs, built.zone])
    setDrawing(null)
    setLabel('')
    setProblem(null)
  }

  const remove = (zoneId: string) => setZones((zs) => zs.filter((z) => z.zone_id !== zoneId))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(zones)
    } catch (e) {
      setError(e instanceof ApiError && e.detail ? e.detail : e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return {
    zones, dirty, drawing, kind, setKind, label, setLabel, problem, saving, error,
    startDrawing: () => setDrawing([]), onVertex, undo, stopDrawing, finish, remove, save,
  }
}

/** The zones on a Leaflet map, and the shape being drawn with its click
 * handler while one is. Rendered inside a MapContainer. */
export function ZoneDrawLayers({ draft }: { draft: Pick<ZoneDraft, 'zones' | 'drawing' | 'onVertex' | 'finish'> }) {
  return (
    <>
      <GeofenceLayer zones={draft.zones} />
      <NoGoZoneLayer zones={draft.zones} />
      <DraftShape points={draft.drawing ?? EMPTY} />
      {draft.drawing && <DrawHandler onVertex={draft.onVertex} onFinish={draft.finish} />}
    </>
  )
}

/**
 * Draw no-go zones and geofences on a surveyed floor.
 *
 * Click "Draw a zone", click corners on the floorplan, double-click (or Finish)
 * to close the shape; delete from the list; Save sends the whole list to
 * `onSave`. A zone is in the map frame, not on a floor -- the floor shown is
 * only the plan it is drawn over.
 *
 * Saved zones use the live map's own layers, so a zone looks here as it will on
 * the canvas. One that lies outside the survey's extent -- drawn on an earlier
 * survey, then the map was re-surveyed -- is flagged in the list and kept:
 * silently dropping someone's polygon is worse than showing it out of bounds.
 *
 * `onSave` may be async; a rejection is shown under the Save button, with the
 * server's sentence when it sent one.
 *
 * The Map workspace uses the parts (`useZoneDraft`, `ZoneDrawLayers`,
 * `ZonePanel`) so that drawing happens on its centre map; this is them
 * together, with a map of its own.
 */
export function ZoneEditor({ map, floorIndex, onSave, readOnly = false, readOnlyReason = 'role' }: {
  map: SiteMap
  floorIndex: number
  onSave: (zones: MapZone[]) => void | Promise<void>
  /** A viewer sees the zones and cannot draw, delete or save. */
  readOnly?: boolean
  /** Why, because the two reasons are not the same sentence: a role that may
   * not change zones, or a touch screen, on which tracing an outline vertex
   * by vertex is not something a thumb can do (M4 §7.6.3). */
  readOnlyReason?: 'role' | 'touch'
}) {
  const draft = useZoneDraft(map, onSave)
  const floor = map.floors.find((f) => f.index === floorIndex)
  const bounds = useMemo(() => (floor ? boundsForFloor(floor) : undefined), [floor])

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[6], alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 420px', minWidth: 0, height: 520, borderRadius: radius.md, overflow: 'hidden' }}>
        <MapContainer
          crs={L.CRS.Simple}
          bounds={bounds ?? [[-40, -20], [40, 80]]}
          style={{ height: '100%', width: '100%', background: color.mapBg }}
          zoomControl={false}
          attributionControl={false}
          // A double-click finishes a shape; it must not also zoom.
          doubleClickZoom={false}
          minZoom={1}
          maxZoom={7}
          zoomSnap={0.25}
          zoomDelta={0.5}
        >
          {floor && <FloorplanLayer map={map} floorIndex={floor.index} />}
          <ZoneDrawLayers draft={draft} />
        </MapContainer>
      </div>

      <div style={{ flex: '0 0 300px', maxWidth: '100%' }}>
        <ZonePanel map={map} draft={draft} readOnly={readOnly} readOnlyReason={readOnlyReason} />
      </div>
    </div>
  )
}

/** The zone list, the drawing controls and Save: everything of the editor but
 * its map. The map it draws on is the caller's (`ZoneDrawLayers`). */
export function ZonePanel({ map, draft, readOnly = false, readOnlyReason = 'role' }: {
  map: SiteMap
  draft: ZoneDraft
  readOnly?: boolean
  readOnlyReason?: 'role' | 'touch'
}) {
  const { t } = useTranslation()
  const { zones, drawing, kind, setKind, label, setLabel, problem, dirty, saving, error } = draft
  const kindName = (k: ZoneKind) => t(k === 'no_go' ? 'missions.maps.kindNoGo' : 'missions.maps.kindGeofence')

  return (
    <div style={{ display: 'grid', gap: space[5] }}>
        <Section title={t('missions.maps.zones')}>
          {!readOnly && !drawing && (
            <Button size="sm" icon={Pencil} onClick={draft.startDrawing}>
              {t('missions.maps.draw')}
            </Button>
          )}

          {!readOnly && drawing && (
            <div style={{ display: 'grid', gap: space[3] }}>
              <Segmented<ZoneKind>
                label={t('missions.maps.kindAria')} value={kind} onChange={setKind}
                options={(['no_go', 'geofence'] as const).map((k) => ({ value: k, label: kindName(k) }))}
              />
              <Field label={t('missions.maps.label')}>
                <input
                  value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80}
                  placeholder={t('missions.maps.labelPlaceholder')}
                  style={{ ...inputStyle, border: 'none', background: color.hover }}
                />
              </Field>
              <p style={{ margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }}>
                {t('missions.maps.drawHint')} {t('missions.maps.corners', { count: drawing.length })}
              </p>
              {problem && (
                <p role="alert" style={{ margin: 0, fontSize: font.size.sm, color: color.red }}>
                  {t(`missions.maps.problem.${problem}`)}
                </p>
              )}
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                <Button size="sm" variant="primary" onClick={draft.finish}>{t('missions.maps.finish')}</Button>
                <Button size="sm" onClick={draft.undo} disabled={drawing.length === 0}>{t('missions.maps.undo')}</Button>
                <Button size="sm" variant="ghost" onClick={draft.stopDrawing}>{t('missions.maps.cancel')}</Button>
              </div>
            </div>
          )}
          {zones.length === 0 ? (
            <p style={{ margin: `${space[3]}px 0 0`, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }}>
              {t('missions.maps.noZones')}
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: `${space[3]}px 0 0`, padding: 0, display: 'grid', gap: 2 }}>
              {zones.map((zone) => {
                const outside = zoneOutOfBounds(zone, map)
                return (
                  <li
                    key={zone.zone_id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[1]}px ${space[2]}px`,
                      borderRadius: radius.sm, background: outside ? color.amberBg : 'transparent',
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: radius.full, flexShrink: 0, background: KIND_COLOR[zone.kind] }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: font.size.md, color: color.t1, overflowWrap: 'anywhere' }}>
                        {zone.label}
                      </span>
                      <span style={{ display: 'block', fontSize: font.size.sm, color: color.t3 }}>
                        {kindName(zone.kind)}
                      </span>
                      {outside && (
                        <span
                          title={t('missions.maps.outOfBoundsTitle')}
                          style={{ display: 'flex', alignItems: 'center', gap: space[1], fontSize: font.size.sm, color: color.t2 }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: radius.full, background: color.amber }} />
                          {t('missions.maps.outOfBounds')}
                        </span>
                      )}
                    </span>
                    {!readOnly && (
                      <IconButton
                        icon={Trash2} size="sm" label={t('missions.maps.deleteZone', { label: zone.label })}
                        onClick={() => draft.remove(zone.zone_id)}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {readOnly && (readOnlyReason === 'touch' ? (
            <div style={{ marginTop: space[3] }}><ReadOnlyOnTouchNotice what="zones" /></div>
          ) : (
            <p style={{ margin: `${space[3]}px 0 0`, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }}>
              {t('missions.maps.readOnly')}
            </p>
          ))}
        </Section>

        {!readOnly && (
          <div style={{ display: 'grid', gap: space[2] }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
              <Button variant="primary" onClick={() => void draft.save()} disabled={!dirty || saving}>
                {saving ? t('missions.maps.saving') : t('missions.maps.save')}
              </Button>
              {dirty && !saving && (
                <span style={{ fontSize: font.size.sm, color: color.t2 }}>{t('missions.maps.unsaved')}</span>
              )}
            </div>
            {error && (
              <p role="alert" style={{ margin: 0, fontSize: font.size.sm, color: color.red, overflowWrap: 'anywhere' }}>
                {t('missions.maps.saveFailed', { error })}
              </p>
            )}
          </div>
        )}
    </div>
  )
}
