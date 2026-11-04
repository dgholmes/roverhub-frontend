import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '@/i18n'
import { SignInForm } from './SignInPage'

const base = { busy: false, needsFirstOwner: false, notice: null, onSubmit: () => {} }

describe('SignInForm', () => {
  it('shows the server\'s error message', () => {
    const html = renderToStaticMarkup(<SignInForm {...base} error="too many attempts; try again in 42 s" />)
    expect(html).toContain('too many attempts; try again in 42 s')
    expect(html).toContain('role="alert"')
  })

  it('explains how to create the first owner when there are no users', () => {
    const html = renderToStaticMarkup(<SignInForm {...base} error={null} needsFirstOwner />)
    expect(html).toContain('python -m auth.manage create-owner')
  })

  it('shows a working state while signing in', () => {
    const html = renderToStaticMarkup(<SignInForm {...base} error={null} busy />)
    expect(html).toContain('Signing in…')
    expect(html).toMatch(/<input[^>]*disabled/)
  })
})
