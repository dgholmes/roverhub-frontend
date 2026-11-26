import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, InlineAlertDialog } from '@/components/kit'
import { inputStyle } from '@/components/missions/parts'
import { color, font, radius, space } from '@/design-system/tokens'
import type { MapQualityReport } from '@/types/mapPipeline'
import type { SiteMap } from '@/types/maps'
import { activationProblem } from './zoneGeometry'
import type { FreezeRefusal, FreezeRefusalCode } from './mapPipeline'
import { useCheckName } from './MapQualitySection'

/** What the quality report says about freezing a draft before anyone tries:
 *  the same reasons the backend gives, or null when nothing stands in the way. */
export function qualityObstacle(report: MapQualityReport | null | undefined): FreezeRefusalCode | null {
  if (report === undefined) return null  // still loading: say nothing yet
  if (report === null) return 'quality_missing'
  if (!report.current) return 'quality_stale'
  return report.passed ? null : 'quality_failed'
}

/**
 * Freezing a map: saying a person has looked at it. A draft can be re-surveyed
 * and replaced; an active one is what missions plan against. A map with no
 * floors has nothing to plan on and cannot be frozen.
 *
 * The backend also refuses a draft whose quality report is missing, out of
 * date or failed (409). The page says so before the click, from the report it
 * holds, and shows the backend's own reason after one. A failed report can be
 * overridden by a role holding `override` (supervisor), with a reason that goes
 * to the audit log; a missing or stale one cannot -- it has to be checked.
 */
export function FreezeControl({
  map, busy, onFreeze, error, quality, refusal, canOverride = false, onOverride, canRecheck = false, onRecheck,
  askZones = false, onDrawZones, onActivateAnyway, onDismissZones,
}: {
  map: SiteMap
  busy: boolean
  onFreeze: () => void
  error?: string | null
  /** The map's quality report as the page holds it (undefined: not loaded). */
  quality?: MapQualityReport | null
  /** The backend's refusal of the last freeze. */
  refusal?: FreezeRefusal | null
  canOverride?: boolean
  onOverride?: (reason: string) => void
  canRecheck?: boolean
  onRecheck?: () => void
  /** The zones question (map ready spec 4.8): activating a map with no zones
   *  asks first whether any are needed. */
  askZones?: boolean
  onDrawZones?: () => void
  onActivateAnyway?: () => void
  /** Escape on the zones question: put it away, activating nothing. */
  onDismissZones?: () => void
}) {
  const { t } = useTranslation()
  const name = useCheckName()
  const zonesTextId = useId()
  const [overriding, setOverriding] = useState(false)
  const [reason, setReason] = useState('')
  const problem = activationProblem(map)
  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5, maxWidth: 560 }

  if (problem === 'alreadyActive') {
    return (
      <p role="status" style={{ ...note, display: 'flex', alignItems: 'center', gap: space[2], color: color.t2 }}>
        <span style={{ width: 8, height: 8, borderRadius: radius.full, background: color.green, flexShrink: 0 }} />
        {t('missions.maps.frozen')}
      </p>
    )
  }

  // The backend's refusal wins over what the page inferred: it is the one that
  // decides. Its zones refusal is answered by the zones question, not a line.
  const refusedFor = refusal?.code === 'zones_unreviewed' ? null : refusal?.code
  const obstacle = problem === null ? (refusedFor ?? qualityObstacle(quality)) : null
  const zonesQuestion = problem === null && (askZones || refusal?.code === 'zones_unreviewed')
  const failed = refusal?.failed.length ? refusal.failed : quality?.failed ?? []
  const obstacleText = obstacle
    ? t(`missions.maps.freezeRefused.${obstacle}`, { checks: failed.map(name).join(', ') })
    : null
  const mayOverride = obstacle === 'quality_failed' && canOverride && onOverride !== undefined
  const mayRecheck = (obstacle === 'quality_missing' || obstacle === 'quality_stale') && canRecheck && onRecheck !== undefined

  return (
    <div style={{ display: 'grid', gap: space[2], justifyItems: 'start' }}>
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={onFreeze} disabled={busy || problem !== null}>
          {busy ? t('missions.maps.freezing') : t('missions.maps.freeze')}
        </Button>
        {mayOverride && !overriding && (
          <Button disabled={busy} onClick={() => setOverriding(true)}>{t('missions.maps.override.open')}</Button>
        )}
        {mayRecheck && <Button disabled={busy} onClick={onRecheck}>{t('missions.maps.recheckNow')}</Button>}
      </div>
      <p style={note}>{problem === 'noFloors' ? t('missions.maps.freezeNoFloors') : t('missions.maps.freezeHint')}</p>
      {obstacleText && (
        <p role={refusal ? 'alert' : undefined} data-obstacle={obstacle} style={{ ...note, color: refusal ? color.red : color.amber }}>
          {obstacleText}
        </p>
      )}
      {zonesQuestion && (
        // Draw zones is the safe answer, so it takes the focus.
        <InlineAlertDialog label={t('missions.maps.zonesQuestion.title')} describedBy={zonesTextId}
          onClose={() => onDismissZones?.()} style={{
            display: 'grid', gap: space[2], padding: space[3], borderRadius: radius.md, background: color.amberBg, width: '100%', maxWidth: 560,
          }}>
          <p id={zonesTextId} style={{ ...note, color: color.t1 }}>{t('missions.maps.zonesQuestion.text')}</p>
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            {onDrawZones && <Button data-autofocus disabled={busy} onClick={onDrawZones}>{t('missions.maps.zonesQuestion.draw')}</Button>}
            {onActivateAnyway && (
              <Button variant="primary" disabled={busy} onClick={onActivateAnyway}>{t('missions.maps.zonesQuestion.anyway')}</Button>
            )}
          </div>
        </InlineAlertDialog>
      )}
      {refusal?.message && refusal.code !== 'zones_unreviewed' && (
        <p style={{ ...note, fontSize: font.size.xs }}>{t('missions.maps.freezeServer', { message: refusal.message })}</p>
      )}
      {error && <p role="alert" style={{ ...note, color: color.red }}>{t('missions.maps.freezeFailed', { error })}</p>}
      {mayOverride && overriding && (
        <form
          aria-label={t('missions.maps.override.confirm')}
          onSubmit={(e) => { e.preventDefault(); if (reason.trim()) onOverride!(reason.trim()) }}
          style={{ display: 'grid', gap: space[2], padding: space[3], borderRadius: radius.md, background: color.amberBg, width: '100%', maxWidth: 560 }}
        >
          <label style={{ display: 'grid', gap: space[1] }}>
            <span style={{ fontSize: font.size.sm, color: color.t1 }}>{t('missions.maps.override.reason')}</span>
            <textarea
              name="reason" value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)}
              placeholder={t('missions.maps.override.reasonPlaceholder')}
              style={{ ...inputStyle, border: 'none', height: 'auto', padding: '8px 10px', resize: 'vertical', lineHeight: 1.4 }}
            />
          </label>
          <p style={{ ...note, fontSize: font.size.xs }}>{t('missions.maps.override.hint')}</p>
          <div style={{ display: 'flex', gap: space[2] }}>
            <Button type="submit" variant="danger" disabled={busy || !reason.trim()}>{t('missions.maps.override.confirm')}</Button>
            <Button disabled={busy} onClick={() => { setOverriding(false); setReason('') }}>{t('missions.maps.override.cancel')}</Button>
          </div>
        </form>
      )}
    </div>
  )
}
