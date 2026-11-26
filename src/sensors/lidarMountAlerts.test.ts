import { describe, expect, it } from 'vitest'
import { fleetRobotFromHash } from '@/app/routes'
import { hashForRobotSensors } from './lidarMountAlerts'

describe("the lidar alert's link", () => {
  it("opens the robot's Sensors tab in Fleet", () => {
    expect(hashForRobotSensors('s', 'rover-pi')).toBe('#/site/s/fleet/rover-pi/sensors')
  })

  it('names the robot and the tab, however the ids are spelled', () => {
    expect(fleetRobotFromHash(hashForRobotSensors('site a', 'rover/1'))).toEqual({ robotId: 'rover/1', tab: 'sensors' })
  })
})
