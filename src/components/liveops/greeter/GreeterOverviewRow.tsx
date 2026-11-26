import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/kit'
import { color, font, space } from '@/design-system/tokens'
import type { RobotState } from '@/types'
import { GreeterDialog } from './GreeterPanel'
import { GreeterStatusChip } from './GreeterStatusChip'

/** "10:32" today, "26 Nov 10:32" before: when the robot last greeted. */
export function formatLastGreeted(iso: string, now: Date = new Date(), locale?: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  const time = at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  return at.toDateString() === now.toDateString()
    ? time
    : `${at.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} ${time}`
}

/**
 * Greeter mode on a robot's Fleet overview (schema 0.0.36): the status chip
 * (with the reason when blocked), when it last greeted and how many today, and
 * Settings, which opens the same panel as LiveOps' More › Greeter mode. A
 * bridge older than 0.0.36 reports no greeter: the row says to update it.
 */
export function GreeterOverviewRow({ robot }: { robot: RobotState }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const g = robot.greeter
  return (
    <div data-greeter-row="" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: space[1], minWidth: 0, textAlign: 'right' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: space[2], flexWrap: 'wrap' }}>
        {g ? <GreeterStatusChip status={g} /> : (
          <span style={{ color: color.t3 }}>{t('greeter.mode.updateRobot')}</span>
        )}
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>{t('greeter.mode.settings')}</Button>
      </div>
      {g && (
        <span style={{ fontSize: font.size.sm, color: color.t3, fontVariantNumeric: 'tabular-nums' }}>
          {t('greeter.mode.lastGreeted')}: {g.last_greeted_at ? formatLastGreeted(g.last_greeted_at, undefined, i18n.language) : t('greeter.mode.never')}
          {' · '}
          {t('greeter.mode.today')}: {g.greetings_today}
        </span>
      )}
      <GreeterDialog robot={robot} open={open} onOpenChange={setOpen} />
    </div>
  )
}
