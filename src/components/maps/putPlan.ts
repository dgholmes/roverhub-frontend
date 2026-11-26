import type { TFunction } from 'i18next'
import {
  navMapSwitchBlock, robotMapMatch, SYNC_MAP_SCHEMA, syncBlock, USE_NAV_MAP_SCHEMA, type RobotMapMatch, type SyncBlock,
} from './robotMaps'

/**
 * "Put on robots…" (2026-11-26, many robots): what putting one floor of a map
 * on each robot at the site would do, worked out the way the Robot maps rows
 * did when they carried their own Send / Use buttons, so the chooser offers
 * exactly what a row used to:
 *   - a robot on this map whose files differ is sent the floor (SYNC_MAP, Send
 *     to robot), unless `syncBlock` stands in the way;
 *   - a robot on another map, or none, switches to it (USE_NAV_MAP, Use this
 *     map), unless `navMapSwitchBlock` does (it also needs a 0.0.29 bridge);
 *   - a robot with this version has nothing to do, and one on this map that
 *     reports no version is offered nothing, as before.
 * The bridge decides; this only says what the console can see coming.
 */

/** A robot row's match, or `noMap` for a robot set up for no map at all. */
export type RowState = RobotMapMatch | 'noMap'

/** Send to robot (`send`, SYNC_MAP) or Use this map (`use`, USE_NAV_MAP). */
export type Act = 'send' | 'use'

/** What the chooser says about a robot. */
export type PutState = 'upToDate' | 'update' | 'switch' | 'offline' | 'busy' | 'cannot' | 'unknown'

export interface PutPlan {
  row: RowState
  /** What it would be sent, or null when nothing is offered. */
  act: Act | null
  /** What stands in the way of `act`, or null. */
  block: SyncBlock | null
  state: PutState
}

type PlanRobot = Parameters<typeof syncBlock>[0]

export function rowStateOf(robot: PlanRobot, mapId: string, floorHash: string | null): RowState {
  const match = robotMapMatch(robot, mapId, floorHash)
  return (robot.bridge?.nav_map_id ?? null) === null && match === 'unknown' ? 'noMap' : match
}

export function putPlan(robot: PlanRobot, mapId: string, floorHash: string | null, now = Date.now()): PutPlan {
  const row = rowStateOf(robot, mapId, floorHash)
  if (row === 'same') return { row, act: null, block: null, state: 'upToDate' }
  // A floor with no version cannot be sent or compared.
  const act: Act | null = !floorHash ? null : row === 'differs' ? 'send' : row === 'otherMap' || row === 'noMap' ? 'use' : null
  if (act === null) return { row, act, block: null, state: 'unknown' }
  const block = act === 'send' ? syncBlock(robot, now) : navMapSwitchBlock(robot, now)
  const state: PutState = block === null ? (act === 'send' ? 'update' : 'switch')
    : block === 'offline' ? 'offline'
      : block === 'oldBridge' ? 'cannot'
        : 'busy'
  return { row, act, block, state }
}

/** The reason a block gives, in the words the rows always used. */
export function blockText(t: TFunction, block: SyncBlock, act: Act | null): string {
  return t(`missions.maps.robots.block.${block}`,
    block === 'oldBridge' ? { version: act === 'use' ? USE_NAV_MAP_SCHEMA : SYNC_MAP_SCHEMA } : undefined)
}

/** Whether the chooser may tick this robot: something to send, nothing in the way. */
export const actionable = (plan: PutPlan): boolean => plan.act !== null && plan.block === null
