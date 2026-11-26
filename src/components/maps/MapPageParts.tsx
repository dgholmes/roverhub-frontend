import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/kit'
import { NameLink } from '@/components/common/NameLink'
import { inputStyle } from '@/components/missions/parts'
import { color, font, radius, space } from '@/design-system/tokens'
import { hashForMissionEditor } from '@/app/routes'
import { useMissionStore } from '@/missions/useMissionStore'
import { MAX_FLOOR_LABEL_CHARS, type MapRename, type SiteMap } from '@/types/maps'
import { errorText } from './mapPipeline'

/** The backend's longest map name (maps/store.py MAX_MAP_NAME_CHARS). */
const MAX_MAP_NAME_CHARS = 80

/**
 * Rename (map ready spec 4.9): the map's name and its floors' labels, edited in
 * place and sent as one PATCH of only what changed. Names sit outside the
 * content hash, so a rename makes no new version and keeps an active map
 * active. An empty label clears it (the floor shows as "Floor N").
 */
export function RenameForm({ map, onSave, onCancel }: {
  map: SiteMap
  onSave: (change: MapRename) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(map.name)
  const [labels, setLabels] = useState<Record<number, string>>(
    () => Object.fromEntries(map.floors.map((f) => [f.index, f.label ?? ''])),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmedName = name.trim()
  const floors = map.floors
    .map((f) => ({ index: f.index, label: (labels[f.index] ?? '').trim() || null }))
    .filter((f) => f.label !== (map.floors.find((x) => x.index === f.index)?.label ?? null))
  const change: MapRename = {
    ...(trimmedName !== map.name ? { name: trimmedName } : {}),
    ...(floors.length ? { floors } : {}),
  }
  const changed = change.name !== undefined || change.floors !== undefined
  const field: React.CSSProperties = { ...inputStyle, border: 'none', background: color.hover }

  const submit = async () => {
    if (!trimmedName || !changed) return
    setBusy(true)
    setError(null)
    try {
      await onSave(change)
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <form
      aria-label={t('missions.maps.rename.title')}
      onSubmit={(e) => { e.preventDefault(); void submit() }}
      style={{ display: 'grid', gap: space[3], padding: space[3], borderRadius: radius.md, background: color.card, maxWidth: 560 }}
    >
      <label style={{ display: 'grid', gap: space[1] }}>
        <span style={{ fontSize: font.size.sm, color: color.t2 }}>{t('missions.maps.rename.name')}</span>
        <input name="map-name" value={name} maxLength={MAX_MAP_NAME_CHARS} onChange={(e) => setName(e.target.value)} style={field} />
      </label>
      {map.floors.map((f) => (
        <label key={f.index} style={{ display: 'grid', gap: space[1] }}>
          <span style={{ fontSize: font.size.sm, color: color.t2 }}>{t('missions.maps.rename.floor', { index: f.index })}</span>
          <input
            name={`floor-${f.index}`} value={labels[f.index] ?? ''} maxLength={MAX_FLOOR_LABEL_CHARS}
            placeholder={t('liveops.map.floorN', { index: f.index })}
            onChange={(e) => setLabels((l) => ({ ...l, [f.index]: e.target.value }))} style={field}
          />
        </label>
      ))}
      <p style={{ margin: 0, fontSize: font.size.xs, color: color.t3, lineHeight: 1.5 }}>{t('missions.maps.rename.hint')}</p>
      {!trimmedName && <p style={{ margin: 0, fontSize: font.size.sm, color: color.amber }}>{t('missions.maps.rename.nameRequired')}</p>}
      {error && <p role="alert" style={{ margin: 0, fontSize: font.size.sm, color: color.red }}>{t('missions.maps.rename.failed', { error })}</p>}
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
        <Button type="submit" variant="primary" disabled={busy || !trimmedName || !changed}>
          {busy ? t('missions.maps.rename.saving') : t('missions.maps.rename.save')}
        </Button>
        <Button disabled={busy} onClick={onCancel}>{t('missions.maps.rename.cancel')}</Button>
      </div>
    </form>
  )
}

/**
 * The missions drawn on this map, each a link to it in the editor, so a map
 * is not a dead end (2026-11-25: a mission named its map, but the map named
 * none of its missions). Programs have no map and never appear here. Says
 * nothing until the library has loaded for this site, rather than "none".
 */
export function MissionsOnMap({ siteId, mapId }: { siteId: string; mapId: string }) {
  const { t } = useTranslation()
  const missions = useMissionStore((s) => s.missions)
  const loaded = useMissionStore((s) => s.siteId === siteId && !s.loading)
  if (!loaded) return null
  const onMap = missions.filter((m) => m.kind === 'route' && m.map_id === mapId)
  return (
    <p data-testid="missions-on-map" style={{ margin: 0, fontSize: font.size.sm, color: color.t2, lineHeight: 1.5 }}>
      {onMap.length === 0 ? t('missions.maps.onThisMap.none') : <>
        {t('missions.maps.onThisMap.label')}{' '}
        {onMap.map((m, i) => (
          <span key={m.mission_id}>
            {i > 0 && ', '}
            <NameLink style={{ color: color.accent, fontWeight: font.weight.medium }} onClick={() => { window.location.hash = hashForMissionEditor(siteId, m.mission_id) }}>{m.name}</NameLink>
          </span>
        ))}
      </>}
    </p>
  )
}
