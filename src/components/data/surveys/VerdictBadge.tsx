import { useTranslation } from 'react-i18next'
import { Badge, type Tone } from '@/components/kit'
import { formatClock } from '@/survey/replay/replayModel'

/**
 * A take's drift verdict against the legs. Never green unless something was
 * judged (spec §2's anti-goal): a take FAST-LIO2 fell behind on (`keptUp`
 * false), or with legs but no segment judged (`judged` false), is "Not judged".
 * `judged` left out (the survey list, which has no segments) trusts the take's
 * own has_legs and first_bad_s.
 */
export function VerdictBadge({ hasLegs, firstBadS, judged, keptUp }: {
  hasLegs: boolean
  firstBadS: number | null
  judged?: boolean
  keptUp?: boolean | null
}) {
  const { t } = useTranslation()
  const [tone, label, title]: [Tone, string, string] = keptUp === false
    ? ['neutral', t('surveyReplay.verdict.notJudged'), t('surveyReplay.verdict.fellBehindTitle')]
    : !hasLegs
      ? ['neutral', t('surveyReplay.verdict.noLegs'), t('surveyReplay.verdict.noLegsTitle')]
      : judged === false
        ? ['neutral', t('surveyReplay.verdict.notJudged'), t('surveyReplay.verdict.notJudgedTitle')]
        : firstBadS === null
          ? ['green', t('surveyReplay.verdict.noDrift'), t('surveyReplay.verdict.noDriftTitle')]
          : ['red', t('surveyReplay.verdict.driftFrom', { at: formatClock(firstBadS) }),
            t('surveyReplay.verdict.driftFromTitle', { at: formatClock(firstBadS) })]
  return <Badge tone={tone} title={title}>{label}</Badge>
}
