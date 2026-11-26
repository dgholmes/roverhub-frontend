import { describe, expect, it } from 'vitest'
import { fleetRouteFromHash } from '@/app/routes'
import { hashForRobotSensors } from './lidarMountAlerts'

describe("the lidar alert's link", () => {
  it("opens the robot's Sensors tab in Fleet", () => {
    expect(hashForRobotSensors('s', 'rover-pi')).toBe('#/site/s/fleet/robots/rover-pi/sensors')
  })

  it('names the robot and the tab, however the ids are spelled', () => {
    expect(fleetRouteFromHash(hashForRobotSensors('site a', 'rover/1'))).toEqual({ robotId: 'rover/1', inspectorTab: 'sensors' })
  })
})
