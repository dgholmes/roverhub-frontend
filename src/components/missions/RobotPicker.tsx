import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ChevronDown } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { robotTypeLabel } from '@/lib/robotCapabilities'
import { formatBatteryPercent } from '@/liveops/batteryDisplay'
import { AVAILABILITY_ORDER, robotAvailability, type AvailabilityStatus, type RobotAvailability } from '@/missions/robotAvailability'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { attentionText } from '@/i18n/attentionText'
import type { RobotState } from '@/types'
import { inputStyle } from './parts'

export const AVAILABILITY_DOT: Record<AvailabilityStatus, string> = {
  available: color.green,
  onMission: color.accent,
  inUse: color.accent,
  attention: color.amber,
  offline: color.red,
}

/** "On a mission · Perimeter Patrol", "Fallen", "Offline" … in the current language. */
export function availabilityText(a: RobotAvailability, t: TFunction): string {
  if (a.status === 'onMission') return a.mission ? t('missions.robot.onMissionNamed', { name: a.mission.name }) : t('missions.robot.onMission')
  if (a.status === 'attention' && a.attention) {
    const what = attentionText(t, a.attention)
    return what.charAt(0).toUpperCase() + what.slice(1)
  }
  return t(`missions.robot.${a.status}`)
}

/** A status dot for a robot, with its reason as the tooltip. */
export function AvailabilityDot({ availability }: { availability: RobotAvailability }) {
  const { t } = useTranslation()
  return (
    <span
      role="img" aria-label={availabilityText(availability, t)} title={availabilityText(availability, t)}
      style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, display: 'inline-block', background: AVAILABILITY_DOT[availability.status] }}
    />
  )
}

/** Live availability for each of these robots, from LiveOps' state. */
export function useRobotAvailability(robots: RobotState[]): Map<string, RobotAvailability> {
  const missions = useLiveOpsStore((s) => s.missions)
  return useMemo(() => new Map(robots.map((r) => [r.robot_id, robotAvailability(r, missions[r.robot_id])])), [robots, missions])
}

const GROUP_OF: Record<AvailabilityStatus, 'available' | 'busy' | 'attention' | 'offline'> = {
  available: 'available', onMission: 'busy', inUse: 'busy', attention: 'attention', offline: 'offline',
}

/**
 * A robot, chosen from a list that says which robots are free
 * now (Missions robot picker, option A). Grouped Available / Busy / Needs
 * attention / Offline, each with its reason and battery. Every robot stays
 * selectable: the mission may run later.
 */
export function RobotPicker({ robots, value, onChange, noneLabel, noneHint, openUp = false }: {
  robots: RobotState[]
  value: string | undefined
  onChange: (robotId: string | undefined) => void
  /** What the "no robot" option is called, and what it means. Required, because
   * there is no honest default: a task with none set is skipped by the scheduler,
   * and a program run with none cannot start. Neither means "any robot". */
  noneLabel: string
  noneHint: string
  /** Open the list above the button, for a picker in a bar at the foot of the screen. */
  openUp?: boolean
}) {
  const { t } = useTranslation()
  const availability = useRobotAvailability(robots)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  // Flat option list in display order: "Any robot", then robots by group.
  const options = useMemo(() => {
    const sorted = [...robots].sort((a, b) =>
      AVAILABILITY_ORDER.indexOf(availability.get(a.robot_id)!.status) - AVAILABILITY_ORDER.indexOf(availability.get(b.robot_id)!.status))
    return [undefined, ...sorted] as (RobotState | undefined)[]
  }, [robots, availability])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const chosen = robots.find((r) => r.robot_id === value)
  const chosenAvailability = chosen ? availability.get(chosen.robot_id)! : null

  function pick(r: RobotState | undefined) {
    onChange(r?.robot_id)
    setOpen(false)
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      setActive(Math.max(0, options.findIndex((o) => o?.robot_id === value)))
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(options[active]) }
  }

  let lastGroup: string | null = null
  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 0 }}>
      <button
        type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} onKeyDown={onKey}
        style={{ ...inputStyle, width: '100%', maxWidth: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: space[2], cursor: 'pointer', textAlign: 'left' }}
      >
        {chosenAvailability && <AvailabilityDot availability={chosenAvailability} />}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {chosen ? `${chosen.name} · ${availabilityText(chosenAvailability!, t)}` : noneLabel}
        </span>
        <ChevronDown size={14} aria-hidden style={{ flexShrink: 0, color: color.t3 }} />
      </button>
      {open && (
        <div
          role="listbox" aria-label={t('missions.rules.robot')}
          style={{
            position: 'absolute', ...(openUp ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }),
            left: 0, right: 0, zIndex: 50, maxHeight: 360, overflowY: 'auto',
            background: color.surface, borderRadius: radius.md, padding: space[1], boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          {options.map((r, i) => {
            const a = r ? availability.get(r.robot_id)! : null
            const group = a ? GROUP_OF[a.status] : null
            const header = group && group !== lastGroup ? group : null
            lastGroup = group ?? lastGroup
            const selected = (r?.robot_id ?? undefined) === value
            return (
              <div key={r?.robot_id ?? 'any'}>
                {header && (
                  <div style={{ padding: `${space[2]}px ${space[2]}px ${space[1]}px`, fontSize: font.size.xs, color: color.t3 }}>
                    {t(`missions.robot.group.${header}`)}
                  </div>
                )}
                <div
                  role="option" aria-selected={selected}
                  onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(r) }}
                  style={{
                    display: 'grid', gridTemplateColumns: '10px 1fr auto', gap: space[2], alignItems: 'center',
                    padding: `${space[2]}px`, borderRadius: radius.sm, cursor: 'pointer',
                    background: i === active ? color.selected : selected ? color.accentDim : 'transparent',
                    opacity: a?.status === 'offline' ? 0.6 : 1,
                  }}
                >
                  {a ? <AvailabilityDot availability={a} /> : <span />}
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>
                      {r ? r.name : noneLabel}
                    </span>
                    <span style={{ display: 'block', fontSize: font.size.sm, color: color.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r ? `${robotTypeLabel(r.robot_type)} · ${availabilityText(a!, t)}` : noneHint}
                    </span>
                  </span>
                  <span style={{ fontSize: font.size.sm, color: color.t3, fontVariantNumeric: 'tabular-nums' }}>
                    {r ? formatBatteryPercent(r.battery.percent) : ''}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
