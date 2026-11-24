import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RecordCard } from './RecordCard'
import { color } from '@/design-system/tokens'
import { BATTERY_UNKNOWN_LABEL, formatBatteryPercent } from '@/liveops/batteryDisplay'

describe('RecordCard', () => {
  it('shows the title and the scanned badge', () => {
    const html = renderToStaticMarkup(
      <RecordCard title="Ward 3 evening patrol" badge={{ text: 'Completed', tone: 'green' }} fields={[]} />)
    expect(html).toContain('Ward 3 evening patrol')
    expect(html).toContain('Completed')
  })

  it('lines the figures up between cards', () => {
    const html = renderToStaticMarkup(
      <RecordCard title="x" fields={[{ label: 'Duration', value: '7 m 02 s' }]} />)
    expect(html).toContain('tabular-nums')
  })

  it('carries no hairline border and is marked for counting', () => {
    const html = renderToStaticMarkup(<RecordCard title="x" fields={[]} />)
    expect(html).not.toMatch(/border:\s*1px/)
    expect(html).not.toMatch(/outline:\s*1px/)
    expect(html).toContain('data-record-card')
  })

  // Review Focus 3
  it('renders an unknown battery as unknown, never as 0% and never green', () => {
    const html = renderToStaticMarkup(
      <RecordCard title="rover-spare" fields={[{ label: 'Battery', value: formatBatteryPercent(null) }]} />)
    expect(html).toContain(BATTERY_UNKNOWN_LABEL)
    expect(html).not.toMatch(/(?<![0-9.])0%/) // a bare 0%, not the 0 inside width:100%
    expect(html).not.toContain(color.green)
  })

  it('is one button when it opens, and never nests buttons', () => {
    const open = renderToStaticMarkup(<RecordCard title="x" fields={[]} onOpen={() => {}} />)
    expect(open.match(/<button/g)).toHaveLength(1)
  })

  it('gives an opening card a touch-sized target', () => {
    expect(renderToStaticMarkup(<RecordCard title="x" fields={[]} onOpen={() => {}} />)).toContain('min-height:44px')
  })

  it('renders actions in a row when it does not open', () => {
    const html = renderToStaticMarkup(
      <RecordCard title="x" fields={[]} actions={<button>Run now</button>} />)
    expect(html).toContain('Run now')
    expect(html).toContain('min-height:36px')
    expect(html.startsWith('<div')).toBe(true)
  })

  it('throws in development when asked to be a button and hold actions', () => {
    expect(() => renderToStaticMarkup(
      <RecordCard title="x" fields={[]} onOpen={() => {}} actions={<button>Run</button>} />,
    )).toThrow(/button inside a button/)
  })
})
