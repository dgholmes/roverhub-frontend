import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { Button, InlineAlertDialog } from '@/components/kit'
import { mapChoices } from '@/missions/missionMaps'
import type { RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'

/**
 * New mission, on a site with more than one map: which map is it drawn on?
 * One row per site map, with the robots set up for it; drafts and archived
 * maps are listed but cannot be chosen, with the reason, because a route runs
 * only on an active map. Asked in place under the toolbar (InlineAlertDialog:
 * focus moves to the ticked map, Escape cancels, focus goes back to New mission).
 */
export function NewMissionMapChooser({ maps, robots, defaultMapId, onStart, onCancel, returnFocus }: {
  maps: readonly SiteMap[]
  robots: readonly RobotState[]
  /** Ticked to begin with (missionMaps.newMissionStart); null for none. */
  defaultMapId: string | null
  onStart: (mapId: string) => void
  onCancel: () => void
  returnFocus?: React.RefObject<HTMLElement | null>
}) {
  const { t } = useTranslation()
  const name = useId()
  const rows = useMemo(() => mapChoices(maps, robots), [maps, robots])
  const [picked, setPicked] = useState<string | null>(defaultMapId)
  const chosen = rows.find((r) => r.map.map_id === picked && r.choosable) ? picked : null
  const noActive = !rows.some((r) => r.choosable)

  const sub = (r: (typeof rows)[number]) => r.reason
    ? t(`missions.library.chooser.${r.reason}`)
    : r.robots.length > 0 ? t('missions.library.chooser.robotsOn', { count: r.robots.length, names: r.robots.join(', ') }) : null

  return (
    <InlineAlertDialog
      as="form" label={t('missions.library.chooser.title')} onClose={onCancel} returnFocus={returnFocus}
      onSubmit={(e) => { e.preventDefault(); if (chosen) onStart(chosen) }}
      style={{
        display: 'grid', gap: space[2], padding: space[3], borderRadius: radius.md, background: color.card,
        width: '100%', maxWidth: 420, boxSizing: 'border-box', fontFamily: font.family,
      }}
    >
      <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>
        {t('missions.library.chooser.title')}
      </span>
      <div role="radiogroup" aria-label={t('missions.library.chooser.title')} style={{ display: 'grid', gap: space[1] }}>
        {rows.map((r) => {
          const on = r.map.map_id === chosen
          const line = sub(r)
          return (
            <label
              key={r.map.map_id}
              style={{
                display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[2]}px ${space[3]}px`,
                borderRadius: radius.sm, background: on ? color.accentDim : color.surface,
                cursor: r.choosable ? 'pointer' : 'default', opacity: r.choosable ? 1 : 0.55,
                fontSize: font.size.md, color: color.t1,
              }}
            >
              <input
                type="radio" name={name} value={r.map.map_id} checked={on} disabled={!r.choosable}
                onChange={() => setPicked(r.map.map_id)} data-autofocus={on || undefined}
                style={{ accentColor: color.accent, margin: 0 }}
              />
              <span style={{ minWidth: 0 }}>
                {r.map.name}
                {line && <span style={{ color: color.t3, fontSize: font.size.sm }}> · {line}</span>}
              </span>
            </label>
          )
        })}
      </div>
      {noActive && <p style={{ margin: 0, fontSize: font.size.sm, color: color.amber }}>{t('missions.library.chooser.noActive')}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2], flexWrap: 'wrap' }}>
        <Button size="sm" onClick={onCancel} data-autofocus={!chosen || undefined}>{t('missions.library.chooser.cancel')}</Button>
        <Button size="sm" variant="primary" type="submit" disabled={!chosen}>{t('missions.library.chooser.start')}</Button>
      </div>
    </InlineAlertDialog>
  )
}
