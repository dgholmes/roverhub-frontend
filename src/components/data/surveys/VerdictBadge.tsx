import { useTranslation } from 'react-i18next'
import { Badge, type Tone } from '@/components/kit'
import { mmss } from './format'

/** A take's drift verdict against the legs: drift needs legs to be judged at all. */
export function VerdictBadge({ hasLegs, firstBadS }: { hasLegs: boolean; firstBadS: number | null }) {
  const { t } = useTranslation()
  const [tone, label, title]: [Tone, string, string] = !hasLegs
    ? ['neutral', t('surveyReplay.verdict.noLegs'), t('surveyReplay.verdict.noLegsTitle')]
    : firstBadS === null
      ? ['green', t('surveyReplay.verdict.noDrift'), t('surveyReplay.verdict.noDriftTitle')]
      : ['red', t('surveyReplay.verdict.driftFrom', { at: mmss(firstBadS) }), t('surveyReplay.verdict.driftFromTitle', { at: mmss(firstBadS) })]
  return <Badge tone={tone} title={title}>{label}</Badge>
}
