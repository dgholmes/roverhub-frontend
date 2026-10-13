import { useState } from 'react'
import { Search } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge } from '@/components/kit'
import { robotActivity } from '@/liveops/robotActivity'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { batteryLevelColor, formatBatteryPercent } from '@/liveops/batteryDisplay'
import { fleetSortPriority, getFleetReadiness } from '@/liveops/fleetReadiness'
import { stateVisualFor } from '@/liveops/stateDisplay'
import { reachabilityOf } from '@/lib/connectivityHealth'
import { robotAttention } from '@/fleet/attention'
import type { RobotState } from '@/types'
import { RobotInspector } from './RobotInspector'
import { EmptyState } from './parts'
import { attentionText } from '@/i18n/attentionText'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

/** The one line under a robot's name: its problem if it has one (from the
 * shared attention rules), otherwise what it is doing. */
function attentionLine(t: TFunction, r: RobotState, activity: string): { text: string; tone: string; attention: boolean } {
  const a = robotAttention(r)
  if (a) return { text: attentionText(t, a), tone: a.severity === 'critical' ? color.red : color.amber, attention: true }
  return { text: getFleetReadiness(r).ready ? `${activity} · ${t('fleet.roster.ready')}` : activity, tone: color.t3, attention: false }
}

/**
 * Layout A: an attention-sorted roster beside a full-height inspector, the
 * same shape as LiveOps' rail and stage. Robots that need a look sort first.
 */
export function FleetRobotsView({
  robots, selectedRobotId, onSelect,
}: {
  robots: RobotState[]
  selectedRobotId: string | null
  onSelect: (robotId: string) => void
}) {
  const missions = useLiveOpsStore((s) => s.missions)
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const lines = new Map(robots.map((r) => [r.robot_id, attentionLine(t, r, robotActivity(r, missions[r.robot_id]).text)]))
  const needAttention = robots.filter((r) => lines.get(r.robot_id)?.attention).length
  const sorted = [...robots].sort((a, b) => fleetSortPriority(a) - fleetSortPriority(b)
    || Number(lines.get(b.robot_id)?.attention) - Number(lines.get(a.robot_id)?.attention))
  const q = query.trim().toLowerCase()
  const shown = q ? sorted.filter((r) => `${r.name} ${r.robot_id}`.toLowerCase().includes(q)) : sorted
  const selected = robots.find((r) => r.robot_id === selectedRobotId) ?? sorted[0]

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
      <aside style={{
        width: 280, flexShrink: 0, borderRight: `1px solid ${color.border}`, background: color.surface,
        display: 'flex', flexDirection: 'column', minHeight: 0,
      }}>
        <div style={{ padding: `${space[4]}px ${space[4]}px ${space[2]}px`, display: 'flex', alignItems: 'center', gap: space[2] }}>
          <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{t('fleet.roster.title')}</span>
          <span style={{ fontSize: font.size.sm, color: color.t3 }}>{robots.length}</span>
          <span style={{ flex: 1 }} />
          {needAttention > 0 && <Badge tone="amber">{t('fleet.roster.needsAttention', { count: needAttention })}</Badge>}
        </div>
        <label style={{
          margin: `0 ${space[3]}px ${space[2]}px`, display: 'flex', alignItems: 'center', gap: space[2],
          height: 32, padding: `0 ${space[3]}px`, borderRadius: radius.sm,
          background: color.card, border: `1px solid ${color.border}`,
        }}>
          <Search size={14} strokeWidth={1.75} color={color.t3} aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('fleet.roster.search')}
            aria-label={t('fleet.roster.search')}
            style={{
              flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
              color: color.t1, fontFamily: font.family, fontSize: font.size.md,
            }}
          />
        </label>
        <div role="list" style={{ flex: 1, overflowY: 'auto', padding: `0 ${space[2]}px ${space[3]}px`, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {shown.length === 0 && (
            <div style={{ padding: space[3], fontSize: font.size.sm, color: color.t3 }}>{t('fleet.roster.noMatch', { query })}</div>
          )}
          {shown.map((r) => {
            const v = stateVisualFor(r.abstract_state, r.sdk_state)
            const online = reachabilityOf(r) === 'online'
            const line = lines.get(r.robot_id)!
            const isSelected = r.robot_id === selected?.robot_id
            return (
              <button
                key={r.robot_id}
                role="listitem"
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => onSelect(r.robot_id)}
                style={{
                  display: 'grid', gridTemplateColumns: '8px 1fr auto', columnGap: space[3], rowGap: 2,
                  alignItems: 'center', width: '100%', textAlign: 'left',
                  padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.sm + 1,
                  background: isSelected ? color.selected : 'transparent',
                  border: 'none', fontFamily: font.family, cursor: 'pointer',
                }}
              >
                <span aria-hidden title={v.label} style={{
                  width: 8, height: 8, borderRadius: radius.full,
                  background: online ? v.color : 'transparent',
                  border: online ? 'none' : `1.5px solid ${color.t3}`,
                }} />
                <span style={{
                  fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {r.name}
                </span>
                <span style={{
                  fontSize: font.size.sm, fontVariantNumeric: 'tabular-nums',
                  color: batteryLevelColor(r.battery.percent) === color.t1 ? color.t2 : batteryLevelColor(r.battery.percent),
                }}>
                  {formatBatteryPercent(r.battery.percent)}
                </span>
                <span style={{
                  gridColumn: '2 / 4', fontSize: font.size.sm, color: line.tone,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {line.attention ? `${v.label} · ${line.text}` : line.text}
                </span>
              </button>
            )
          })}
        </div>
      </aside>
      {selected
        ? <RobotInspector robot={selected} />
        : (
          <div style={{ flex: 1, padding: space[6] }}>
            <EmptyState title={t('fleet.roster.noRobotsTitle')}>{t('fleet.roster.noRobotsBody')}</EmptyState>
          </div>
        )}
    </div>
  )
}
