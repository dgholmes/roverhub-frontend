import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw } from 'lucide-react'
import { Badge, Button } from '@/components/kit'
import { Section } from '@/components/fleet/v2/parts'
import { color, font, radius, space } from '@/design-system/tokens'
import type { MapVersion } from '@/types/mapPipeline'
import { errorText } from './mapPipeline'
import { whenText } from './MapQualitySection'

/**
 * A map's versions (tracker 1-5-06): every upload, survey and restore keeps
 * the bundle it replaced, so a bad survey is one click from undone. Restoring
 * makes an old version live again as a NEW version, back to draft, with the
 * zones as they are now -- nothing is thrown away, including what was live.
 */
/** How each version arrived (the backend's `source`: maps/store.py,
 *  cloud_edit.py, survey.py), as locale keys. */
const SOURCE_KEYS: Record<string, 'upload' | 'survey' | 'planning' | 'cloudEdit' | 'moved'> = {
  upload: 'upload', survey: 'survey', planning: 'planning', cloud_edit: 'cloudEdit', cloud_edits: 'cloudEdit', moved: 'moved',
}

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
            <li key={v.version} data-version={v.version} style={{
              display: 'grid', gap: space[2], padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.sm,
              background: v.current ? color.selected : confirming === v.version ? color.amberBg : color.hover,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1 }}>
                  {t('missions.maps.versions.versionN', { version: v.version })}
                </span>
                {v.current && <Badge tone="accent" dot>{t('missions.maps.versions.live')}</Badge>}
                <span style={{ fontSize: font.size.sm, color: color.t2 }}>{sourceText(v)}</span>
                <span style={note}>{whenText(v.created_at)}</span>
                <span style={note}>{t('missions.maps.versions.zones', { count: v.zones })}</span>
                {v.quality
                  ? <Badge tone={v.quality.passed ? 'green' : 'red'}>{v.quality.passed ? t('missions.maps.versions.qualityPassed') : t('missions.maps.versions.qualityFailed')}</Badge>
                  : <Badge>{t('missions.maps.versions.qualityNone')}</Badge>}
                <span style={{ flex: 1 }} />
                {canRestore && !v.current && confirming !== v.version && (
                  <Button size="sm" icon={RotateCcw} disabled={busy}
                    onClick={() => { setConfirming(v.version); setRestoreError(null) }}>
                    {t('missions.maps.versions.restore')}
                  </Button>
                )}
              </div>
              {confirming === v.version && (
                <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
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
                <p role="alert" style={{ ...note, color: color.red }}>{t('missions.maps.versions.restoreFailed', { error: restoreError })}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </Section>
  )
}
