import { describe, expect, it } from 'vitest'
import { resolveShownRobot } from './shownRobot'

const pi = { robot_id: 'rover-pi' }
const jetson = { robot_id: 'rover-jetson' }

/** While an explicit choice waits for its robot to be discovered, LiveOps used
 * to show robots[0] instead -- so the cockpit and its E-Stop targeted another
 * robot than the one selected, and switched underneath the operator when the
 * selected one arrived. */
describe('resolveShownRobot', () => {
  it('shows the selected robot when it is known', () => {
    expect(resolveShownRobot([pi, jetson], 'rover-jetson', false)).toEqual({ robot: jetson, waitingFor: null })
  })

  it('waits for a pending selection rather than showing another robot', () => {
    expect(resolveShownRobot([pi], 'rover-jetson', true)).toEqual({ robot: null, waitingFor: 'rover-jetson' })
    expect(resolveShownRobot([], 'rover-jetson', true)).toEqual({ robot: null, waitingFor: 'rover-jetson' })
  })

  it('falls back to the first robot when nothing is pending', () => {
    expect(resolveShownRobot([pi, jetson], null, false)).toEqual({ robot: pi, waitingFor: null })
    expect(resolveShownRobot([pi], 'gone', false)).toEqual({ robot: pi, waitingFor: null })
  })

  it('is empty with no robots and nothing pending', () => {
    expect(resolveShownRobot([], null, false)).toEqual({ robot: null, waitingFor: null })
  })
})
