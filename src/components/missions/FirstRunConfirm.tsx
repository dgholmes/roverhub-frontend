import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/kit'
import { color, space } from '@/design-system/tokens'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useTouchShell } from '@/lib/useTouchShell'
import { gestureLabel } from '@/liveops/postureModel'
import { firstRunMovesToConfirm } from '@/missions/firstRunConfirm'
import type { MissionLibraryEntry, RunPage, RunQuery } from '@/types'

interface Ask { robot: string; moves: string[]; resolve: (start: boolean) => void }

const readRuns = (query: RunQuery): Promise<RunPage> => dataProvider.listRuns(query)

/**
 * The question asked before a route mission with a Jump, Backflip or Twirl
 * Jump first runs on a robot (missions/firstRunConfirm.ts decides when). One
 * hook for the three places a run starts by hand: the library's Run, Schedule's
 * Run now and the editor's test run. `confirm` resolves true to go ahead --
 * straight away when nothing needs asking -- and false on Cancel; render
 * `dialog` once beside the caller.
 */
export function useFirstRunConfirm(listRuns: (query: RunQuery) => Promise<RunPage> = readRuns) {
  const [ask, setAsk] = useState<Ask | null>(null)
  const confirm = useCallback(async (
    mission: Pick<MissionLibraryEntry, 'mission_id' | 'kind' | 'waypoints'>, robotId: string, robotName: string,
  ): Promise<boolean> => {
    const moves = await firstRunMovesToConfirm(mission, robotId, listRuns)
    if (moves.length === 0) return true
    return new Promise<boolean>((resolve) => setAsk({ robot: robotName, moves, resolve }))
  }, [listRuns])
  const answer = (start: boolean) => {
    ask?.resolve(start)
    setAsk(null)
  }
  return { confirm, dialog: <FirstRunConfirmDialog ask={ask} onAnswer={answer} /> }
}

function FirstRunConfirmDialog({ ask, onAnswer }: { ask: Ask | null; onAnswer: (start: boolean) => void }) {
  const { t, i18n } = useTranslation()
  const { narrow } = useTouchShell()
  const english = i18n.language.startsWith('en')
  // "makes Rex jump and backflip": English reads the moves as verbs.
  const labels = (ask?.moves ?? []).map((m) => (english ? gestureLabel(m).toLowerCase() : gestureLabel(m)))
  const moves = labels.length < 2 ? (labels[0] ?? '')
    : `${labels.slice(0, -1).join(', ')}${t('missions.firstRun.and')}${labels[labels.length - 1]}`
  // Narrow, a sheet along the bottom edge, full width; else the usual dialog.
  const sheet = narrow
    ? 'left-0 right-0 top-auto bottom-0 max-w-none translate-x-0 translate-y-0 rounded-t-xl rounded-b-none sm:rounded-b-none'
    : undefined
  return (
    <Dialog open={ask !== null} onOpenChange={(open) => { if (!open) onAnswer(false) }}>
      <DialogContent data-first-run-confirm="" className={sheet} style={{
        background: color.elevated, border: 'none', color: color.t1, display: 'grid', gap: space[3], padding: space[5],
      }}>
        <DialogHeader>
          <DialogTitle style={{ color: color.t1 }}>{t('missions.firstRun.title')}</DialogTitle>
          <DialogDescription style={{ color: color.t2 }}>
            {t('missions.firstRun.body', { robot: ask?.robot ?? '', moves })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter style={{ gap: space[2] }}>
          <Button onClick={() => onAnswer(false)}>{t('missions.firstRun.cancel')}</Button>
          <Button variant="primary" icon={Play} onClick={() => onAnswer(true)}>{t('missions.firstRun.start')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
