import { describe, expect, it } from 'vitest'

import { currentPageHostname, isLoopbackHostname, resolveServiceUrl } from './serviceHost'

describe('isLoopbackHostname', () => {
  it.each(['localhost', 'LOCALHOST', '127.0.0.1', '::1', '[::1]', ''])(
    'treats %s as loopback',
    (hostname) => {
      expect(isLoopbackHostname(hostname)).toBe(true)
    },
  )

  it.each(['10.0.10.117', 'roverhub.local', '192.168.1.20'])(
    'treats %s as a real host',
    (hostname) => {
      expect(isLoopbackHostname(hostname)).toBe(false)
    },
  )
})

describe('resolveServiceUrl', () => {
  it('rewrites a loopback service host to the page host', () => {
    expect(resolveServiceUrl('ws://localhost:9001', '10.0.10.117')).toBe('ws://10.0.10.117:9001')
    expect(resolveServiceUrl('http://localhost:8000', '10.0.10.117')).toBe(
      'http://10.0.10.117:8000',
    )
  })

  it('preserves the port, protocol and path', () => {
    expect(resolveServiceUrl('https://127.0.0.1:8443/api', '10.0.10.117')).toBe(
      'https://10.0.10.117:8443/api',
    )
  })

  it('leaves everything alone when the page is served from localhost', () => {
    // Ordinary local development must not change behaviour.
    expect(resolveServiceUrl('ws://localhost:9001', 'localhost')).toBe('ws://localhost:9001')
    expect(resolveServiceUrl('ws://localhost:9001', '127.0.0.1')).toBe('ws://localhost:9001')
  })

  it('never overrides a URL that already names a real host', () => {
    // Someone pointed this somewhere on purpose; guessing over it would be wrong.
    expect(resolveServiceUrl('http://10.0.12.116:8090', '10.0.10.117')).toBe(
      'http://10.0.12.116:8090',
    )
  })

  it('does not introduce a trailing slash', () => {
    // apiBaseUrl is concatenated with paths; a stray slash yields `//robots`.
    expect(resolveServiceUrl('http://localhost:8000', '10.0.10.117')).not.toMatch(/\/$/)
  })

  it('keeps an explicitly configured trailing slash', () => {
    expect(resolveServiceUrl('http://localhost:8000/', '10.0.10.117')).toBe(
      'http://10.0.10.117:8000/',
    )
  })

  it('passes through values it cannot parse', () => {
    expect(resolveServiceUrl('/relative/path', '10.0.10.117')).toBe('/relative/path')
    expect(resolveServiceUrl('', '10.0.10.117')).toBe('')
  })
})

describe('currentPageHostname', () => {
  it('returns the window hostname under jsdom', () => {
    expect(typeof currentPageHostname()).toBe('string')
    expect(currentPageHostname().length).toBeGreaterThan(0)
  })
})
