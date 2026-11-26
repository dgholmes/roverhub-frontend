import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Section } from '@/components/fleet/v2/parts'
import { NameLink } from '@/components/common/NameLink'
import { color, font, radius, space } from '@/design-system/tokens'
import { hashForMissionEditor } from '@/app/routes'
import { useMissionStore } from '@/missions/useMissionStore'
import { errorText } from './mapPipeline'

/** The backend's longest map name (maps/store.py MAX_MAP_NAME_CHARS). */
export const MAX_MAP_NAME_CHARS = 80

/**
 * A name edited where it is shown (map ready spec 4.9; operator, 2026-11-26:
 * "the rename should be inline at the top"): the map's name or a floor's label
 * turns into an input in place. Enter or a click elsewhere saves; Escape puts
 * it back as it was. Names sit outside the content hash, so a rename makes no
 * new version and keeps an active map active.
 *
 * `required`: an empty value is refused (a map needs a name); otherwise empty
 * is saved as "no label" (the floor shows as "Floor N"). Unchanged saves
 * nothing. A refusal is shown beside the input, which stays open.
 */
export function InlineName({ value, label, placeholder, maxLength, required = false, hint, onSave, onDone, fontSize = font.size.md }: {
  value: string
  /** The input's accessible name. */
  label: string
  placeholder?: string
  maxLength: number
  required?: boolean
  /** Said on hover: what renaming does and does not change. */
  hint?: string
  onSave: (next: string) => Promise<void>
  /** Closes the input: after a save, a cancel, or nothing to save. */
  onDone: () => void
  fontSize?: number
}) {
  const { t } = useTranslation()
  const [text, setText] = useState(value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  // Set once the edit is over (saved, cancelled): the blur that follows an
  // Enter or an Escape, or the input's own removal, must not save again.
  const over = useRef(false)
  useEffect(() => { input.current?.focus(); input.current?.select() }, [])

  const commit = async (fromBlur: boolean) => {
    if (over.current || busy) return
    const next = text.trim()
    if (next === value.trim()) { over.current = true; onDone(); return }
    if (required && !next) {
      // A click elsewhere with no name keeps the old one; Enter says why not.
      if (fromBlur) { over.current = true; onDone() } else setError(t('missions.maps.rename.nameRequired'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave(next)
      over.current = true
      onDone()
    } catch (e) {
      setError(t('missions.maps.rename.failed', { error: errorText(e) }))
      setBusy(false)
    }
  }
  const cancel = () => { over.current = true; onDone() }

  return (
    <form
      data-inline-name="" onSubmit={(e) => { e.preventDefault(); void commit(false) }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', minWidth: 0 }}
    >
      <input
        ref={input} aria-label={label} title={hint} value={text} maxLength={maxLength} placeholder={placeholder}
        disabled={busy} aria-invalid={error ? true : undefined}
        onChange={(e) => { setText(e.target.value); setError(null) }}
        onBlur={() => void commit(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel() } }}
        style={{
          fontFamily: font.family, fontSize, fontWeight: font.weight.bold, color: color.t1,
          border: 'none', outline: 'none', borderRadius: radius.sm, background: color.hover,
          padding: `${space[1]}px ${space[2]}px`, minWidth: 0, width: `${Math.max(8, Math.min(40, text.length + 2))}ch`,
          boxShadow: `0 0 0 2px ${color.accent}`,
        }}
      />
      {busy && <span role="status" style={{ fontSize: font.size.sm, color: color.t3 }}>{t('missions.maps.rename.saving')}</span>}
      {error && <span role="alert" style={{ fontSize: font.size.sm, color: color.red }}>{error}</span>}
    </form>
  )
}

/**
 * The missions drawn on this map, each a chip linking to it in the editor, so
 * a map is not a dead end (2026-11-25: a mission named its map, but the map
 * named none of its missions). Programs have no map and never appear here.
 * Says nothing until the library has loaded for this site, rather than "none".
 */
export function MissionsOnMap({ siteId, mapId }: { siteId: string; mapId: string }) {
  const { t } = useTranslation()
  const missions = useMissionStore((s) => s.missions)
  const loaded = useMissionStore((s) => s.siteId === siteId && !s.loading)
  if (!loaded) return null
  const onMap = missions.filter((m) => m.kind === 'route' && m.map_id === mapId)
  return (
    <Section title={t('missions.maps.onThisMap.title')}>
      {onMap.length === 0 ? (
        <p data-testid="missions-on-map" style={{ margin: 0, fontSize: font.size.sm, color: color.t3 }}>{t('missions.maps.onThisMap.none')}</p>
      ) : (
        <ul data-testid="missions-on-map" aria-label={t('missions.maps.onThisMap.title')}
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: space[2] }}>
          {onMap.map((m) => (
            <li key={m.mission_id} style={{ minWidth: 0, maxWidth: '100%' }}>
              <NameLink
                title={m.name}
                style={{
                  display: 'inline-block', padding: `${space[1]}px ${space[3]}px`, borderRadius: radius.full,
                  background: color.accentDim, color: color.accent, fontSize: font.size.sm, fontWeight: font.weight.medium,
                }}
                onClick={() => { window.location.hash = hashForMissionEditor(siteId, m.mission_id) }}
              >
                {m.name}
              </NameLink>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
