// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { remember, VIEW_MEMORY_PREFIX } from '@/lib/viewMemory'
import {
  cameraChoiceKey, DEFAULT_CAMERA_CHOICE, isCameraChoice, shownCameraMode, useCameraChoice,
  type CameraChoiceState,
} from './cameraChoice'

/**
 * The main camera is remembered per site and robot and shared by every LiveOps
 * layout: switching from Stacked to Cockpit, or reloading, keeps the camera the
 * operator was looking through. These tests pin the storage key, what counts
 * as a valid remembered choice, and how a choice the robot cannot show right
 * now is displayed without being forgotten.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => { localStorage.clear() })

describe('cameraChoiceKey', () => {
  it('is per site and robot', () => {
    expect(cameraChoiceKey('site-dev', 'rover-jetson')).toBe(`${VIEW_MEMORY_PREFIX}camera.site-dev.rover-jetson`)
    expect(cameraChoiceKey('site-dev', 'rover-pi')).not.toBe(cameraChoiceKey('site-dev', 'rover-jetson'))
  })

  it('is null without a site or a robot, so nothing is written under "undefined"', () => {
    expect(cameraChoiceKey(undefined, 'rover-pi')).toBeNull()
    expect(cameraChoiceKey('site-dev', undefined)).toBeNull()
    expect(cameraChoiceKey('', 'rover-pi')).toBeNull()
  })
})

describe('isCameraChoice', () => {
  it('accepts every facing with the modes the camera bar offers', () => {
    for (const facing of ['front', 'back']) {
      for (const mode of ['rgb', 'depth']) {
        expect(isCameraChoice({ facing, mode }), `${facing}/${mode}`).toBe(true)
      }
    }
  })

  it('rejects thermal, which no robot has and the bar does not offer', () => {
    expect(isCameraChoice({ facing: 'front', mode: 'thermal' })).toBe(false)
  })

  it('rejects anything else', () => {
    for (const v of [null, 'front', 42, {}, { facing: 'front' }, { mode: 'rgb' },
      { facing: 'left', mode: 'rgb' }, { facing: 'rear', mode: 'rgb' }, { facing: 'front', mode: 'RGB' }]) {
      expect(isCameraChoice(v), JSON.stringify(v)).toBe(false)
    }
  })
})

describe('shownCameraMode', () => {
  it('shows depth only while DDS is connected, without forgetting it', () => {
    expect(shownCameraMode('depth', true)).toBe('depth')
    expect(shownCameraMode('depth', false)).toBe('rgb')
    expect(shownCameraMode('rgb', false)).toBe('rgb')
    expect(shownCameraMode('rgb', true)).toBe('rgb')
  })
})

describe('useCameraChoice', () => {
  let host: HTMLDivElement
  let root: Root
  let latest: CameraChoiceState
  function Probe({ siteId, robotId }: { siteId?: string; robotId?: string }) {
    latest = useCameraChoice(siteId, robotId)
    return null
  }
  const mount = (siteId?: string, robotId?: string) => act(() => root.render(<Probe siteId={siteId} robotId={robotId} />))
  const remount = (siteId?: string, robotId?: string) => {
    act(() => root.unmount())
    root = createRoot(host)
    mount(siteId, robotId)
  }

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('starts on the front RGB camera', () => {
    mount('site-dev', 'rover-jetson')
    expect([latest.facing, latest.mode]).toEqual([DEFAULT_CAMERA_CHOICE.facing, DEFAULT_CAMERA_CHOICE.mode])
    expect(DEFAULT_CAMERA_CHOICE).toEqual({ facing: 'front', mode: 'rgb' })
  })

  it('brings the chosen camera back in the next view, as a layout switch or a reload mounts one', () => {
    mount('site-dev', 'rover-jetson')
    act(() => latest.setFacing('back'))
    act(() => latest.setMode('depth'))
    expect([latest.facing, latest.mode]).toEqual(['back', 'depth'])
    remount('site-dev', 'rover-jetson')
    expect([latest.facing, latest.mode]).toEqual(['back', 'depth'])
  })

  it('changing one half keeps the other', () => {
    mount('site-dev', 'rover-jetson')
    act(() => latest.setMode('depth'))
    act(() => latest.setFacing('back'))
    act(() => latest.setFacing('front'))
    expect(latest.mode).toBe('depth')
  })

  it('is per robot: switching robot shows that robot\'s camera', () => {
    remember(cameraChoiceKey('site-dev', 'rover-pi')!, { facing: 'back', mode: 'rgb' })
    mount('site-dev', 'rover-jetson')
    expect(latest.facing).toBe('front')
    mount('site-dev', 'rover-pi')
    expect(latest.facing).toBe('back')
    mount('site-dev', 'rover-jetson')
    expect(latest.facing).toBe('front')
  })

  it('is per site', () => {
    remember(cameraChoiceKey('site-a', 'rover-pi')!, { facing: 'back', mode: 'rgb' })
    mount('site-b', 'rover-pi')
    expect(latest.facing).toBe('front')
  })

  it('a stored value it does not recognise reads as the default, without throwing', () => {
    localStorage.setItem(cameraChoiceKey('site-dev', 'rover-pi')!, JSON.stringify({ facing: 'left', mode: 'thermal' }))
    mount('site-dev', 'rover-pi')
    expect([latest.facing, latest.mode]).toEqual(['front', 'rgb'])
  })

  it('without a site, holds the choice in memory only', () => {
    mount(undefined, 'rover-pi')
    act(() => latest.setFacing('back'))
    expect(latest.facing).toBe('back')
    expect(localStorage.length).toBe(0)
  })
})
