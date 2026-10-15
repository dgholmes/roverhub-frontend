import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { IconButton } from '@/components/kit'
import { distanceAlong } from '@/missions/estimates'
import type { MissionWaypoint, ValidationIssue } from '@/types'
import { formatLength } from './parts'

/**
 * The mission in order: each waypoint, how far along the route it is, and
 * what happens there. Readable without the map, which matters while the map
 * is a blank grid.
 */
export function StepList({ waypoints, issues, selectedId, onSelect, onMove }: {
  waypoints: MissionWaypoint[]
  issues: ValidationIssue[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onMove: (id: string, by: -1 | 1) => void
}) {
  const { t } = useTranslation()
  const along = distanceAlong(waypoints)
  const worst = (id: string) => {
    const mine = issues.filter((i) => i.waypoint_id === id)
    return mine.some((i) => i.severity === 'error') ? color.red : mine.some((i) => i.severity === 'warning') ? color.amber : null
  }
  return (
    <div style={{
      width: 280, flexShrink: 0, borderRight: `1px solid ${color.border}`, background: color.surface,
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <div style={{ padding: `${space[3]}px ${space[4]}px`, display: 'flex', alignItems: 'baseline', gap: space[2] }}>
        <h3 style={{ margin: 0, fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1 }}>{t('missions.editor.steps')}</h3>
        <span style={{ fontSize: font.size.sm, color: color.t3 }}>{waypoints.length}</span>
        <span style={{ flex: 1 }} />
        {selectedId && (
          <button type="button" onClick={() => onSelect(null)} style={{ background: 'none', border: 'none', color: color.accent, fontSize: font.size.sm, fontFamily: font.family, cursor: 'pointer' }}>
            {t('missions.editor.missionChecks')}
          </button>
        )}
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: `0 ${space[2]}px ${space[3]}px`, overflowY: 'auto', flex: 1 }}>
        {waypoints.map((wp, i) => {
          const on = wp.waypoint_id === selectedId
          const flag = worst(wp.waypoint_id)
          return (
            <li key={wp.waypoint_id}>
              <div
                role="button" tabIndex={0} aria-current={on || undefined}
                onClick={() => onSelect(wp.waypoint_id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(wp.waypoint_id) } }}
                style={{
                  display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: space[2], alignItems: 'center',
                  padding: `${space[2]}px`, borderRadius: radius.md, cursor: 'pointer',
                  background: on ? color.selected : 'transparent',
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: font.size.xs, fontWeight: font.weight.bold, fontVariantNumeric: 'tabular-nums',
                  border: `1.5px solid ${flag ?? color.accent}`, color: flag ?? color.accent,
                }}>{i + 1}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wp.label}</span>
                  {wp.actions.length > 0 && (
                    <span style={{ display: 'block', fontSize: font.size.sm, color: color.t2 }}>
                      {wp.actions.map((a) => t(`missions.actions.${a.type}`)).join(' · ')}
                    </span>
                  )}
                </span>
                {on ? (
                  <span style={{ display: 'flex' }}>
                    <IconButton icon={ArrowUp} size="sm" label={t('missions.editor.moveUp')} disabled={i === 0} onClick={(e) => { e.stopPropagation(); onMove(wp.waypoint_id, -1) }} />
                    <IconButton icon={ArrowDown} size="sm" label={t('missions.editor.moveDown')} disabled={i === waypoints.length - 1} onClick={(e) => { e.stopPropagation(); onMove(wp.waypoint_id, 1) }} />
                  </span>
                ) : (
                  <span style={{ fontSize: font.size.sm, color: color.t3, fontVariantNumeric: 'tabular-nums' }}>{formatLength(along[i])}</span>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <p style={{ margin: 0, padding: `${space[3]}px ${space[4]}px`, borderTop: `1px solid ${color.border}`, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }}>
        {t('missions.editor.addHint')}
      </p>
    </div>
  )
}
