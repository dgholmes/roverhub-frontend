import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { RobotTypeBadge } from '@/components/common/RobotTypeBadge'
import { StatePill } from '@/components/common/StatePill'
import { batteryLevelColor } from '@/components/liveops/rail/BatteryStatus'
import { getFleetReadiness } from '@/liveops/fleetReadiness'
import { useSessionStore } from '@/store/useSessionStore'
import type { AbstractState, RobotState } from '@/types'
import { ReadinessBadge } from './ReadinessBadge'

type SortKey = 'robot_id' | 'name' | 'abstract_state' | 'battery' | 'updated_at' | 'bridge' | 'site' | 'maintenance'
type SortDirection = 'asc' | 'desc'

/** Faults surface first by default (docs/05-ui-ux.md §10.1). */
const STATE_PRIORITY: Record<AbstractState, number> = {
  E_STOP: 0, FAULT: 1, RETURNING: 2, DOCKING: 3, AUTO_MISSION: 4,
  ASSISTED: 5, MANUAL: 6, STAND: 7, PASSIVE: 8,
}

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`
  return `${Math.round(sec / 3600)}h ago`
}

function SortHeader({
  label, sortKey, activeSort, direction, onSort,
}: {
  label: string
  sortKey: SortKey
  activeSort: SortKey
  direction: SortDirection
  onSort: (key: SortKey) => void
}) {
  const active = sortKey === activeSort
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        textAlign: 'left', padding: `${space[2]}px ${space[3]}px`, cursor: 'pointer', userSelect: 'none',
        fontSize: font.size.xs, fontWeight: font.weight.bold, color: active ? color.t1 : color.t3,
        letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {active && (direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
      </span>
    </th>
  )
}

/**
 * Fleet workspace's default view (docs/05-ui-ux.md §10.1) — sortable,
 * filterable list of every managed robot. Row click opens DeviceDetailDrawer.
 */
export function FleetTable({ robots, onSelectRobot }: { robots: RobotState[]; onSelectRobot: (robotId: string) => void }) {
  const sites = useSessionStore((s) => s.sites)
  const [sortKey, setSortKey] = useState<SortKey>('abstract_state')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [stateFilter, setStateFilter] = useState<AbstractState | 'all'>('all')
  const [maintenanceOnly, setMaintenanceOnly] = useState(false)

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDirection('asc') }
  }

  const siteName = (siteId: string) => sites.find((s) => s.id === siteId)?.name ?? siteId

  const filtered = useMemo(() => {
    return robots.filter((r) => {
      if (stateFilter !== 'all' && r.abstract_state !== stateFilter) return false
      if (maintenanceOnly && !r.maintenance_flagged) return false
      return true
    })
  }, [robots, stateFilter, maintenanceOnly])

  const sorted = useMemo(() => {
    const dir = sortDirection === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'robot_id': return dir * a.robot_id.localeCompare(b.robot_id)
        case 'name': return dir * a.name.localeCompare(b.name)
        case 'battery': return dir * (a.battery.percent - b.battery.percent)
        case 'updated_at': return dir * (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
        case 'bridge': return dir * a.connectivity.bridge_state.localeCompare(b.connectivity.bridge_state)
        case 'site': return dir * siteName(a.site_id).localeCompare(siteName(b.site_id))
        case 'maintenance': return dir * (Number(a.maintenance_flagged) - Number(b.maintenance_flagged))
        case 'abstract_state':
        default: {
          const byState = STATE_PRIORITY[a.abstract_state] - STATE_PRIORITY[b.abstract_state]
          return byState !== 0 ? dir * byState : dir * a.name.localeCompare(b.name)
        }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDirection, sites])

  const abstractStates = Array.from(new Set(robots.map((r) => r.abstract_state)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3], padding: space[5], overflow: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center' }}>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as AbstractState | 'all')}
          style={{
            background: color.card, border: `1px solid ${color.border}`, borderRadius: radius.sm,
            color: color.t1, fontSize: font.size.sm, padding: '6px 10px', fontFamily: font.family,
          }}
        >
          <option value="all">All states</option>
          {abstractStates.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: font.size.sm, color: color.t2, cursor: 'pointer' }}>
          <input type="checkbox" checked={maintenanceOnly} onChange={(e) => setMaintenanceOnly(e.target.checked)} />
          Maintenance-flagged only
        </label>

        <span style={{ fontSize: font.size.xs, color: color.t3, marginLeft: 'auto' }}>
          {sorted.length} of {robots.length} assets
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: color.surface, borderRadius: radius.md, overflow: 'hidden' }}>
        <thead style={{ borderBottom: `1px solid ${color.border}` }}>
          <tr>
            <SortHeader label="Robot ID" sortKey="robot_id" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
            <SortHeader label="Name" sortKey="name" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
            <th style={{ padding: `${space[2]}px ${space[3]}px`, fontSize: font.size.xs, color: color.t3, textTransform: 'uppercase' }}>Variant</th>
            <SortHeader label="State" sortKey="abstract_state" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
            <SortHeader label="Battery" sortKey="battery" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
            <SortHeader label="Last seen" sortKey="updated_at" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
            <SortHeader label="Bridge" sortKey="bridge" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
            <SortHeader label="Site" sortKey="site" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
            <SortHeader label="Maintenance" sortKey="maintenance" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
            <th style={{ padding: `${space[2]}px ${space[3]}px`, fontSize: font.size.xs, color: color.t3, textTransform: 'uppercase' }}>Readiness</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const readiness = getFleetReadiness(r)
            return (
              <tr
                key={r.robot_id}
                onClick={() => onSelectRobot(r.robot_id)}
                style={{ borderBottom: `1px solid ${color.border}`, cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = color.cardHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: `${space[2] + 2}px ${space[3]}px`, fontSize: font.size.sm, color: color.t3, fontFamily: 'monospace' }}>{r.robot_id}</td>
                <td style={{ padding: `${space[2] + 2}px ${space[3]}px`, fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>{r.name}</td>
                <td style={{ padding: `${space[2] + 2}px ${space[3]}px` }}><RobotTypeBadge robotType={r.robot_type} size="sm" /></td>
                <td style={{ padding: `${space[2] + 2}px ${space[3]}px` }}><StatePill state={r.abstract_state} size="sm" /></td>
                <td style={{ padding: `${space[2] + 2}px ${space[3]}px`, fontSize: font.size.sm, color: batteryLevelColor(r.battery.percent), fontWeight: font.weight.semibold }}>
                  {r.battery.percent}%
                </td>
                <td style={{ padding: `${space[2] + 2}px ${space[3]}px`, fontSize: font.size.sm, color: color.t3 }}>{timeAgo(r.updated_at)}</td>
                <td style={{ padding: `${space[2] + 2}px ${space[3]}px`, fontSize: font.size.sm, color: r.connectivity.bridge_state === 'connected' ? color.green : color.red }}>
                  {r.connectivity.bridge_state === 'connected' ? 'Online' : r.connectivity.bridge_state === 'reconnecting' ? 'Reconnecting' : 'Offline'}
                </td>
                <td style={{ padding: `${space[2] + 2}px ${space[3]}px`, fontSize: font.size.sm, color: color.t2 }}>{siteName(r.site_id)}</td>
                <td style={{ padding: `${space[2] + 2}px ${space[3]}px`, fontSize: font.size.sm, color: r.maintenance_flagged ? color.amber : color.t3 }}>
                  {r.maintenance_flagged ? 'Flagged' : '—'}
                </td>
                <td style={{ padding: `${space[2] + 2}px ${space[3]}px` }}><ReadinessBadge readiness={readiness} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
