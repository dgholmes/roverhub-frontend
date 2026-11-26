import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { RotateCcw, X } from 'lucide-react'
import { Badge, Button, IconButton } from '@/components/kit'
import { Section } from '@/components/fleet/v2/parts'
import { color, font, radius, shadow, space, zIndex } from '@/design-system/tokens'
import type { MapVersion } from '@/types/mapPipeline'
import { useSeenOnce } from '@/components/org/floorThumbnail'
import { errorText } from './mapPipeline'
import { whenText } from './MapQualitySection'
import { MapVersionThumbnail } from './MapVersionThumbnail'

/**
 * A map's versions (tracker 1-5-06): every upload, survey and restore keeps
 * the bundle it replaced, so a bad survey is one click from undone. Restoring
 * makes an old version live again as a NEW version, back to draft, with the
 * zones as they are now -- nothing is thrown away, including what was live.
 *
 * Each version shows its first floor small, so the one to go back to can be
 * picked by eye; pressing it opens it larger. A row's grid is fetched only once
 * the row is on screen (a grid is a few MB, and a map may keep many versions).
 */
/** How each version arrived (the backend's `source`: maps/store.py,
 *  cloud_edit.py, survey.py), as locale keys. */
const SOURCE_KEYS: Record<string, 'upload' | 'survey' | 'planning' | 'cloudEdit' | 'moved'> = {
  upload: 'upload', survey: 'survey', planning: 'planning', cloud_edit: 'cloudEdit', cloud_edits: 'cloudEdit', moved: 'moved',
}

/** The thumbnail's size in a row: three lines of text tall. */
const THUMB_W = 88
const THUMB_H = 64

export function MapVersionsSection({ versions, error, canRestore, onRestore }: {
  versions: MapVersion[] | null
  error: string | null
  canRestore: boolean
  onRestore: (version: number) => Promise<void>
}) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [enlarged, setEnlarged] = useState<{ version: MapVersion; opener: HTMLElement | null } | null>(null)
  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }

  const restore = async (version: number) => {
    setBusy(true)
    setRestoreError(null)
    try {
      await onRestore(version)
      setConfirming(null)
    } catch (e) {
      setRestoreError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const sourceText = (v: MapVersion) => {
    if (v.source === 'restore') return t('missions.maps.versions.source.restore', { from: v.restored_from ?? '?' })
    const key = SOURCE_KEYS[v.source]
    // A source a newer backend adds is shown as it comes rather than hidden.
    return key ? t(`missions.maps.versions.source.${key}`) : v.source
  }

  return (
    <Section title={t('missions.maps.versions.title')} span>
      {error && <p role="alert" style={{ ...note, color: color.red }}>{t('missions.maps.versions.loadFailed', { error })}</p>}
      {!error && versions === null && <p style={note}>{t('missions.maps.versions.loading')}</p>}
      {versions && (
        <ol aria-label={t('missions.maps.versions.title')} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: space[1] }}>
          {versions.map((v) => (
            <VersionRow key={v.version} version={v} background={v.current ? color.selected : confirming === v.version ? color.amberBg : color.hover}
              onOpen={(opener) => setEnlarged({ version: v, opener })}>
              <div style={{ display: 'grid', gap: 2, minWidth: 0, alignContent: 'start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                  <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1 }}>
                    {t('missions.maps.versions.versionN', { version: v.version })}
                  </span>
                  {v.current && <Badge tone="accent" dot>{t('missions.maps.versions.live')}</Badge>}
                  <span style={{ flex: 1 }} />
                  {canRestore && !v.current && confirming !== v.version && (
                    <Button size="sm" icon={RotateCcw} disabled={busy}
                      onClick={() => { setConfirming(v.version); setRestoreError(null) }}>
                      {t('missions.maps.versions.restore')}
                    </Button>
                  )}
                </div>
                <span style={{ fontSize: font.size.sm, color: color.t2, overflowWrap: 'anywhere' }}>{sourceText(v)}</span>
                <div style={{ display: 'flex', alignItems: 'center', columnGap: space[2], rowGap: 2, flexWrap: 'wrap' }}>
                  <span style={note}>{whenText(v.created_at)}</span>
                  <span style={note}>{t('missions.maps.versions.zones', { count: v.zones })}</span>
                  {v.quality
                    ? <Badge tone={v.quality.passed ? 'green' : 'red'}>{v.quality.passed ? t('missions.maps.versions.qualityPassed') : t('missions.maps.versions.qualityFailed')}</Badge>
                    : <Badge>{t('missions.maps.versions.qualityNone')}</Badge>}
                </div>
              </div>
              {confirming === v.version && (
                <div role="alert" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                  <span style={{ fontSize: font.size.sm, color: color.t1, flex: '1 1 240px', lineHeight: 1.5 }}>
                    {t('missions.maps.versions.confirm', { version: v.version })}
                  </span>
                  <Button size="sm" variant="primary" disabled={busy} onClick={() => void restore(v.version)}>
                    {busy ? t('missions.maps.versions.restoring') : t('missions.maps.versions.confirmRestore', { version: v.version })}
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => { setConfirming(null); setRestoreError(null) }}>
                    {t('missions.maps.versions.cancel')}
                  </Button>
                </div>
              )}
              {confirming === v.version && restoreError && (
                <p role="alert" style={{ ...note, gridColumn: '1 / -1', color: color.red }}>{t('missions.maps.versions.restoreFailed', { error: restoreError })}</p>
              )}
            </VersionRow>
          ))}
        </ol>
      )}
      {enlarged && (
        <VersionPreview version={enlarged.version} opener={enlarged.opener} onClose={() => setEnlarged(null)} />
      )}
    </Section>
  )
}

/** One version: its thumbnail, fetched once the row is on screen, beside the
 *  text and Restore. The current version is `aria-current`. */
function VersionRow({ version: v, background, onOpen, children }: {
  version: MapVersion
  background: string
  onOpen: (opener: HTMLElement) => void
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLLIElement>(null)
  const seen = useSeenOnce(ref)
  return (
    <li ref={ref} data-version={v.version} data-seen={String(seen)} aria-current={v.current ? 'true' : undefined} style={{
      display: 'grid', gridTemplateColumns: `${THUMB_W}px minmax(0, 1fr)`, columnGap: space[3], rowGap: space[2],
      padding: `${space[2]}px ${space[3]}px ${space[2]}px ${space[2]}px`, borderRadius: radius.sm, background,
    }}>
      <button
        type="button" aria-label={t('missions.maps.versions.thumbOpen', { version: v.version })}
        onClick={(e) => onOpen(e.currentTarget)}
        style={{ padding: 0, border: 0, background: 'none', cursor: 'zoom-in', borderRadius: radius.sm, alignSelf: 'start', display: 'block' }}
      >
        <MapVersionThumbnail version={v} load={seen} width={THUMB_W} height={THUMB_H} />
      </button>
      {children}
    </li>
  )
}

/** A version's floor, large, over the page. Escape, the close button or a
 *  press on the scrim closes it, and focus goes back to the thumbnail. */
function VersionPreview({ version, opener, onClose }: { version: MapVersion; opener: HTMLElement | null; onClose: () => void }) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDivElement>(null)
  const done = useRef(onClose)
  useEffect(() => { done.current = onClose })
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') done.current() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (opener?.isConnected) opener.focus()
    }
  }, [opener])
  const title = t('missions.maps.versions.thumb', { version: version.version })
  return createPortal(
    <div data-version-preview={version.version} onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: zIndex.modal, background: color.scrim,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space[4],
    }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} style={{
        display: 'grid', gap: space[3], padding: space[3], borderRadius: radius.lg, background: color.elevated,
        boxShadow: shadow.lg, width: 'min(960px, 100%)', maxHeight: '100%', boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1 }}>
            {t('missions.maps.versions.versionN', { version: version.version })}
          </span>
          {version.current && <Badge tone="accent" dot>{t('missions.maps.versions.live')}</Badge>}
          <span style={{ flex: 1 }} />
          <IconButton icon={X} label={t('missions.maps.versions.thumbClose')} onClick={onClose} />
        </div>
        <MapVersionThumbnail version={version} load height="min(70vh, 640px)" />
      </div>
    </div>,
    document.body,
  )
}
