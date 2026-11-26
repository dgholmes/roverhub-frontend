import { describe, expect, it } from 'vitest'
import { edgeVideoBaseUrlFor, edgeVideoFor, parseEdgeVideoMap } from './edgeVideo'

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
    expect(edgeVideoBaseUrlFor('robot-dev-01', null, { perRobot: map, global: undefined })).toBe('http://jetson:8090')
    expect(edgeVideoBaseUrlFor('robot-dev-02', null, { perRobot: map, global: undefined })).toBe('http://pi:8090')
  })

  it('returns undefined when nothing is configured, so the placeholder shows', () => {
    expect(edgeVideoBaseUrlFor('robot-dev-01', null, { perRobot: {}, global: undefined })).toBeUndefined()
  })

  it('prefers the per-robot entry over the single global URL', () => {
    // The global must never override a robot's own device -- that is how an
    // operator ends up looking at the wrong robot's camera.
    expect(edgeVideoBaseUrlFor('robot-dev-02', null, { perRobot, global: 'http://only-one:8090' }))
      .toBe('http://10.0.12.22:8090')
  })

  it('falls back to the single global URL for unmapped robots', () => {
    expect(edgeVideoBaseUrlFor('robot-dev-99', null, { perRobot, global: 'http://only-one:8090' }))
      .toBe('http://only-one:8090')
  })

  it('returns the url edgeVideoFor resolves, advertised included', () => {
    expect(edgeVideoBaseUrlFor('rover-pi', 'http://10.0.12.101:8090', { perRobot: {} })).toBe('http://10.0.12.101:8090')
    expect(edgeVideoBaseUrlFor('rover-pi', 'http://10.0.12.101:8090', { perRobot: { 'rover-pi': 'http://o:1' } }))
      .toBe('http://o:1')
  })
})

describe('edgeVideoFor', () => {
  it('prefers the env override over an advertised url', () => {
    expect(edgeVideoFor('rover-pi', 'http://10.0.12.101:8090',
      { perRobot: { 'rover-pi': 'http://10.0.12.4:8090' } }))
      .toEqual({ url: 'http://10.0.12.4:8090', source: 'override' })
  })

  it('uses the advertised url when no override names this robot', () => {
    expect(edgeVideoFor('rover-pi', 'http://10.0.12.101:8090',
      { perRobot: { 'rover-jetson': 'http://10.0.12.116:8090' } }))
      .toEqual({ url: 'http://10.0.12.101:8090', source: 'advertised' })
  })

  it("never lends one robot's override to a robot that has none", () => {
    // The bug this module exists to prevent: an operator looking at the wrong
    // robot's camera. rover-jetson's override must not reach rover-pi, with or
    // without an advertised url of its own.
    const perRobot = { 'rover-jetson': 'http://10.0.12.116:8090' }
    expect(edgeVideoFor('rover-pi', null, { perRobot }).url).toBeUndefined()
    expect(edgeVideoFor('rover-pi', 'http://10.0.12.101:8090', { perRobot }).url).toBe('http://10.0.12.101:8090')
  })

  it('prefers an advertised url over the single global url', () => {
    expect(edgeVideoFor('rover-pi', 'https://pi.local:8090', { perRobot: {}, global: 'http://g:8090' }))
      .toEqual({ url: 'https://pi.local:8090', source: 'advertised' })
  })

  it('falls back to the global url, then to none', () => {
    expect(edgeVideoFor('rover-pi', null, { perRobot: {}, global: 'http://g:8090' }).source).toBe('global')
    expect(edgeVideoFor('rover-pi', null, { perRobot: {} })).toEqual({ url: undefined, source: 'none' })
    expect(edgeVideoFor('rover-pi', undefined, { perRobot: {} })).toEqual({ url: undefined, source: 'none' })
  })

  it('ignores an advertised value that is not an http(s) url', () => {
    const bad: unknown[] = [
      '', 'javascript:alert(1)', '10.0.12.101:8090', 'http://', 'https://', 'ftp://x', 'not a url',
      42, {}, ['http://10.0.12.101:8090'],
    ]
    for (const value of bad) {
      expect(edgeVideoFor('rover-pi', value as string, { perRobot: {} }).source).toBe('none')
      // ...and falls through to the global rather than stopping there.
      expect(edgeVideoFor('rover-pi', value as string, { perRobot: {}, global: 'http://g:8090' }))
        .toEqual({ url: 'http://g:8090', source: 'global' })
    }
  })

  it('strips trailing slashes from an advertised url so callers can append /video/front', () => {
    expect(edgeVideoFor('rover-pi', 'http://10.0.12.101:8090///', { perRobot: {} }).url).toBe('http://10.0.12.101:8090')
    expect(edgeVideoFor('rover-pi', 'http://10.0.12.101:8090/relay/', { perRobot: {} }).url)
      .toBe('http://10.0.12.101:8090/relay')
  })
})
