import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Megaphone } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button, Segmented } from '@/components/kit'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import { ClipMaker } from '@/components/missions/ClipMaker'
import { useSessionStore } from '@/store/useSessionStore'
import type { CommandAvailability, RobotState } from '@/types'
import { CommandFace, commandButtonStyle } from '../mission/ActionButton'

type When = 'now' | 'at_time' | 'next_stop'

/**
 * Announce during a run (run-records spec §7.3). "Play now" sends SPEAK, which
 * works today. "At a time" and "At next stop" are queued on the edge by the
 * mission executor (ANNOUNCE), which doesn't exist yet, so they're shown and
 * explained but disabled. Live mic stays with Speak's Shout tab, which is
 * itself still mock-only.
 */
export function AnnounceButton({ robot, hasMission, availability, onPlayNow }: {
  robot: RobotState
  hasMission: boolean
  availability: CommandAvailability
  onPlayNow: (clip: { clip_id: string; label: string; volume: number }) => void
}) {
  const { t } = useTranslation()
  const siteId = useSessionStore((s) => s.activeSiteId)
  const volume = useSessionStore((s) => s.speakVolume)
  const [open, setOpen] = useState(false)
  const [when, setWhen] = useState<When>('now')
  const [clip, setClip] = useState<{ clip_id: string; label: string } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const queueReason = hasMission ? t('command.announce.needsExecutor') : t('command.announce.needsRun')
  const title = t('command.announce.title', { name: robot.name })

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <DisabledReasonButton
        enabled={availability.enabled}
        reason={availability.reason}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ ...commandButtonStyle(), background: open ? color.cardHover : color.card }}
      >
        <CommandFace icon={Megaphone} label={t('command.announce.button')} />
      </DisabledReasonButton>
      {open && (
        <div role="dialog" aria-label={title} className="rh-panel rh-panel--float"
          style={{ position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, width: 360, maxWidth: '90vw', zIndex: 50, padding: space[4], display: 'grid', gap: space[3], borderRadius: radius.lg }}>
          <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>{title}</div>
          <ClipMaker siteId={siteId} ownerId={robot.robot_id} value={{ clip_id: clip?.clip_id ?? null, text: clip?.label ?? null }}
            onChange={(v) => setClip({ clip_id: v.clip_id, label: v.label })} />
          <Segmented<When> label={t('command.announce.when')} value={when} onChange={setWhen}
            options={[
              { value: 'now', label: t('command.announce.now') },
              { value: 'at_time', label: t('command.announce.atTime'), disabled: true, title: queueReason },
              { value: 'next_stop', label: t('command.announce.nextStop'), disabled: true, title: queueReason },
            ]} />
          <span style={{ fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }}>{queueReason}</span>
          <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end', alignItems: 'center' }}>
            {!hasMission && <Badge>{t('command.announce.noRun')}</Badge>}
            <Button size="sm" onClick={() => setOpen(false)}>{t('command.announce.close')}</Button>
            <Button size="sm" variant="primary" disabled={!clip} onClick={() => { if (clip) { onPlayNow({ ...clip, volume }); setOpen(false); setClip(null) } }}>
              {t('command.announce.send')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
