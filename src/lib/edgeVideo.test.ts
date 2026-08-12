import { describe, expect, it } from 'vitest'
import { edgeVideoBaseUrlFor, parseEdgeVideoMap } from './edgeVideo'

describe('parseEdgeVideoMap', () => {
  it('parses a two-device map', () => {
    expect(parseEdgeVideoMap('robot-dev-01=http://10.0.12.116:8090,robot-dev-02=http://10.0.12.22:8090'))
      .toEqual({
        'robot-dev-01': 'http://10.0.12.116:8090',
        'robot-dev-02': 'http://10.0.12.22:8090',
      })
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseEdgeVideoMap(' robot-a = http://host:1 , robot-b = http://host:2 '))
      .toEqual({ 'robot-a': 'http://host:1', 'robot-b': 'http://host:2' })
  })

  it('strips trailing slashes so callers can append /video/front', () => {
    expect(parseEdgeVideoMap('robot-a=http://host:8090///')['robot-a']).toBe('http://host:8090')
  })

  it('keeps a path but drops its trailing slash', () => {
    expect(parseEdgeVideoMap('robot-a=http://host:8090/relay/')['robot-a']).toBe('http://host:8090/relay')
  })

  it('splits on the first = only, so URLs may contain =', () => {
    expect(parseEdgeVideoMap('robot-a=http://host:8090/s?token=abc')['robot-a'])
      .toBe('http://host:8090/s?token=abc')
  })

  it('returns an empty map for undefined or empty input', () => {
    expect(parseEdgeVideoMap(undefined)).toEqual({})
    expect(parseEdgeVideoMap('')).toEqual({})
    expect(parseEdgeVideoMap('   ')).toEqual({})
  })

  it('skips malformed entries instead of throwing', () => {
    // Runs at module scope -- one typo must not take the whole console down.
    expect(parseEdgeVideoMap('garbage,robot-a=http://host:1,=http://nope,robot-b=')).toEqual({
      'robot-a': 'http://host:1',
    })
  })

  it('ignores trailing commas', () => {
    expect(parseEdgeVideoMap('robot-a=http://host:1,')).toEqual({ 'robot-a': 'http://host:1' })
  })
})

describe('edgeVideoBaseUrlFor', () => {
  const perRobot = { 'robot-dev-02': 'http://10.0.12.22:8090' }

  it('resolves each robot to its own edge device', () => {
    const map = { 'robot-dev-01': 'http://jetson:8090', 'robot-dev-02': 'http://pi:8090' }
    expect(edgeVideoBaseUrlFor('robot-dev-01', { perRobot: map, global: undefined })).toBe('http://jetson:8090')
    expect(edgeVideoBaseUrlFor('robot-dev-02', { perRobot: map, global: undefined })).toBe('http://pi:8090')
  })

  it('returns undefined when nothing is configured, so the placeholder shows', () => {
    expect(edgeVideoBaseUrlFor('robot-dev-01', { perRobot: {}, global: undefined })).toBeUndefined()
  })

  it('prefers the per-robot entry over the single global URL', () => {
    // The global must never override a robot's own device -- that is how an
    // operator ends up looking at the wrong robot's camera.
    expect(edgeVideoBaseUrlFor('robot-dev-02', { perRobot, global: 'http://only-one:8090' }))
      .toBe('http://10.0.12.22:8090')
  })

  it('falls back to the single global URL for unmapped robots', () => {
    expect(edgeVideoBaseUrlFor('robot-dev-99', { perRobot, global: 'http://only-one:8090' }))
      .toBe('http://only-one:8090')
  })
})
