import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Segmented, type Tone } from '@/components/kit'
import { inputStyle } from '@/components/missions/parts'
import { color, font, radius, space } from '@/design-system/tokens'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { ApiError } from '@/lib/realtime/apiError'
import { useCan } from '@/org/useCan'
import { pickSiteMap, useSiteMapStore } from '@/store/useSiteMapStore'
import type { MapStatus, MapZone, SiteMap } from '@/types/maps'
import { ZoneEditor } from './ZoneEditor'
import { activationProblem } from './zoneGeometry'

const STATUS_TONE: Record<MapStatus, Tone> = { draft: 'neutral', active: 'green', archived: 'neutral' }

const errorText = (e: unknown) =>
  e instanceof ApiError && e.detail ? e.detail : e instanceof Error ? e.message : String(e)

/**
 * Freezing a map: saying a person has looked at it. A draft can be re-surveyed
 * and replaced; an active one is what missions plan against. A map with no
 * floors has nothing to plan on and cannot be frozen.
 */
export function FreezeControl({ map, busy, onFreeze, error }: {
  map: SiteMap
  busy: boolean
  onFreeze: () => void
  error?: string | null
}) {
  const { t } = useTranslation()
  const problem = activationProblem(map)
  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5, maxWidth: 520 }

  if (problem === 'alreadyActive') {
    return (
      <p role="status" style={{ ...note, display: 'flex', alignItems: 'center', gap: space[2], color: color.t2 }}>
        <span style={{ width: 8, height: 8, borderRadius: radius.full, background: color.green, flexShrink: 0 }} />
        {t('missions.maps.frozen')}
      </p>
    )
  }
  return (
    <div style={{ display: 'grid', gap: space[2], justifyItems: 'start' }}>
      <Button variant="primary" onClick={onFreeze} disabled={busy || problem !== null}>
        {busy ? t('missions.maps.freezing') : t('missions.maps.freeze')}
      </Button>
      <p style={note}>{problem === 'noFloors' ? t('missions.maps.freezeNoFloors') : t('missions.maps.freezeHint')}</p>
      {error && <p role="alert" style={{ ...note, color: color.red }}>{t('missions.maps.freezeFailed', { error })}</p>}
    </div>
  )
}

/**
 * The Maps page: a site's surveyed maps, with their zones and freeze. Reads the
 * site's maps itself (the LiveOps canvas shows only the one it picks), and tells
 * the shared site-map store after every write so LiveOps shows what was saved.
 */
export function MapCurationPanel({ siteId }: { siteId: string }) {
  const { t } = useTranslation()
  const canEdit = useCan('editZones')
  const [maps, setMaps] = useState<SiteMap[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mapId, setMapId] = useState<string | null>(null)
  const [floorIndex, setFloorIndex] = useState(0)
  const [freezing, setFreezing] = useState(false)
  const [freezeError, setFreezeError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setMaps(null)
    setLoadError(null)
    dataProvider.listMaps(siteId)
      .then((list) => { if (!cancelled) setMaps(list) })
      .catch((e: unknown) => { if (!cancelled) setLoadError(errorText(e)) })
    // A map uploaded since LiveOps last asked would otherwise stay invisible
    // there for the rest of the session.
    void useSiteMapStore.getState().reload()
    return () => { cancelled = true }
  }, [siteId])

  const selected = maps ? maps.find((m) => m.map_id === mapId) ?? pickSiteMap(maps) : null

  const replace = useCallback((updated: SiteMap) => {
    setMaps((list) => list && list.map((m) => (m.map_id === updated.map_id ? updated : m)))
  }, [])

  const saveZones = useCallback(async (zones: MapZone[]) => {
    if (!selected) return
    replace(await dataProvider.saveMapZones(selected.map_id, zones))
    await useSiteMapStore.getState().reload()
  }, [selected, replace])

  const freeze = async () => {
    if (!selected) return
    setFreezing(true)
    setFreezeError(null)
    try {
      replace(await dataProvider.setMapStatus(selected.map_id, 'active'))
      await useSiteMapStore.getState().reload()
    } catch (e) {
      setFreezeError(errorText(e))
    } finally {
      setFreezing(false)
    }
  }

  const note: React.CSSProperties = { margin: 0, fontSize: font.size.md, color: color.t3 }
  let body: React.ReactNode
  if (loadError) body = <p role="alert" style={{ ...note, color: color.red }}>{t('missions.maps.loadFailed', { error: loadError })}</p>
  else if (maps === null) body = <p style={note}>{t('missions.maps.loading')}</p>
  else if (!selected) {
    body = (
      <div style={{ display: 'grid', gap: space[1] }}>
        <p style={{ ...note, color: color.t1 }}>{t('missions.maps.noMaps')}</p>
        <p style={{ ...note, fontSize: font.size.sm }}>{t('missions.maps.noMapsHint')}</p>
      </div>
    )
  } else {
    const floor = selected.floors.some((f) => f.index === floorIndex) ? floorIndex : (selected.floors[0]?.index ?? 0)
    body = (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{selected.name}</h2>
          <Badge tone={STATUS_TONE[selected.status]} dot>{t(`missions.maps.status.${selected.status}`)}</Badge>
          <span style={{ flex: 1 }} />
          {maps.length > 1 && (
            <select
              aria-label={t('missions.maps.pick')} value={selected.map_id}
              onChange={(e) => { setMapId(e.target.value); setFloorIndex(0); setFreezeError(null) }}
              style={{ ...inputStyle, border: 'none', background: color.hover }}
            >
              {maps.map((m) => <option key={m.map_id} value={m.map_id}>{m.name}</option>)}
            </select>
          )}
          {selected.floors.length > 1 && (
            <Segmented<string>
              label={t('missions.maps.floorsAria')} value={String(floor)} onChange={(v) => setFloorIndex(Number(v))}
              options={selected.floors.map((f) => ({
                value: String(f.index), label: f.label ?? t('liveops.map.floorN', { index: f.index }),
              }))}
            />
          )}
        </div>
        {canEdit && <FreezeControl map={selected} busy={freezing} onFreeze={() => void freeze()} error={freezeError} />}
        <ZoneEditor key={selected.map_id} map={selected} floorIndex={floor} onSave={saveZones} readOnly={!canEdit} />
      </>
    )
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: space[6], display: 'grid', gap: space[5], alignContent: 'start' }}>
      {body}
    </div>
  )
}
