import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/kit'
import { color, font, radius, space } from '@/design-system/tokens'
import { formatClock } from '@/liveops/taskBar'
import { DRIFT_TONE, formatArea, lidarTone } from '@/survey/surveyModel'
import type { SurveyStatus } from '@/types/survey'

/**
 * The survey's numbers while recording: covered area and time large, then the
 * drift check and the lidar rate (the two that say whether the map can be
 * trusted), then walked distance, recording size and cameras. A tinted panel,
 * no outline.
 */
export function SurveyStats({ status }: { status: SurveyStatus }) {
  const { t } = useTranslation()
  const lidarHz = status.lidar_hz
  const tone = lidarTone(lidarHz)
  const row = (label: string, value: React.ReactNode, title?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2], minHeight: 24 }} title={title}>
      <span style={{ color: color.t2, fontSize: font.size.sm }}>{label}</span>
      <span style={{ color: color.t1, fontSize: font.size.sm, fontWeight: font.weight.semibold, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
  return (
    <section
      aria-label={t('survey.title')}
      style={{ background: color.card, borderRadius: radius.lg, padding: space[4], display: 'grid', gap: space[3] }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3] }}>
        <Big label={t('survey.live.covered')} value={t('survey.live.area', { area: formatArea(status.covered_m2) })} />
        <Big label={t('survey.live.time')} value={formatClock(status.elapsed_s)} />
      </div>
      <div style={{ display: 'grid', gap: space[1] }}>
        {row(
          t('survey.live.drift'),
          <Badge tone={DRIFT_TONE[status.drift]} dot>{t(`survey.live.driftWord.${status.drift}`)}</Badge>,
          t(`survey.live.driftHint.${status.drift}`),
        )}
        {row(
          t('survey.live.lidar'),
          lidarHz == null
            ? <span style={{ color: color.t3, fontWeight: font.weight.regular }}>{t('survey.live.noReading')}</span>
            : <Badge tone={tone} dot>{t('survey.live.hz', { hz: lidarHz.toFixed(1) })}</Badge>,
        )}
        {row(t('survey.live.walked'), t('survey.live.metres', { m: Math.round(status.path_length_m) }))}
        {status.bag_mb != null && row(t('survey.live.recordingSize'), t('survey.live.megabytes', { mb: Math.round(status.bag_mb) }))}
        {row(t('survey.live.cameras'), t(`survey.start.camerasOption.${status.cameras}`))}
      </div>
      {status.drift !== 'good' && status.drift !== 'unknown' && (
        <p role="status" style={{ margin: 0, fontSize: font.size.sm, lineHeight: 1.5, color: status.drift === 'bad' ? color.red : color.amber }}>
          {t(`survey.live.driftHint.${status.drift}`)}
        </p>
      )}
    </section>
  )
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <span style={{ fontSize: font.size.xs, color: color.t3, fontWeight: font.weight.semibold, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span style={{ fontSize: 24, fontWeight: font.weight.bold, color: color.t1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
        {value}
      </span>
    </div>
  )
}
