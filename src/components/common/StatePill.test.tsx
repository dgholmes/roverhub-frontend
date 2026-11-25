import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '@/i18n'
import { stateVisualFor } from '@/liveops/stateDisplay'
import { StatePill } from './StatePill'

/**
 * The two variants, and the one rule neither may break.
 *
 * `plain` exists for the touch readings, where every other value is a bare
 * figure and a filled box around this one made the robot's state look like
 * a control rather than a reading. What it drops is the surface. What it
 * may never drop is the WORD: colour is never the only signal
 * (docs/05-ui-ux.md 19), and a state an operator can only infer from a
 * colour is the failure that rule exists for.
 */

const markup = (variant?: 'pill' | 'plain') =>
  renderToStaticMarkup(<StatePill state="STAND" sdkState="balance_stand" variant={variant} />)

describe('StatePill', () => {
  it('says the state in words in both variants', () => {
    const label = stateVisualFor('STAND', 'balance_stand').label
    for (const variant of [undefined, 'plain'] as const) {
      const html = markup(variant)
      expect(html, `${variant ?? 'pill'} lost the label`).toContain(label)
      expect(html, `${variant ?? 'pill'} lost its accessible name`).toContain('Robot state:')
    }
  })

  it('plain drops the surface and keeps the colour', () => {
    const v = stateVisualFor('STAND', 'balance_stand')
    const plain = markup('plain')
    expect(plain).not.toContain('border:1px solid')
    expect(plain).not.toContain(`background:${v.bg}`)
    // The dot and the text still carry the tone.
    expect(plain).toContain(`color:${v.color}`)
  })

  it('the default keeps its filled box, for every other caller', () => {
    const v = stateVisualFor('STAND', 'balance_stand')
    const pill = markup()
    expect(pill).toContain(`background:${v.bg}`)
    expect(pill).toContain('border:1px solid')
  })
})
