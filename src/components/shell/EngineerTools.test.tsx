// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { useAuthStore } from '@/lib/auth/authStore'
import { useAccountMenu } from '@/lib/auth/accountMenu'
import { DEV_USER, type AuthUser } from '@/lib/auth/types'
import { EngineerToolsChip } from './EngineerToolsChip'
import { OperatorProfile } from './OperatorProfile'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Radix's popper measures its anchor; jsdom has no ResizeObserver. */
class NoResize { observe() {} unobserve() {} disconnect() {} }

const owner: AuthUser = {
  user_id: 'u-own', username: 'owner', display_name: 'Owner', org_role: 'owner',
  site_roles: { '*': 'supervisor' }, audit_access: true, disabled: false,
  engineer_tools: false, can_use_engineer_tools: true,
}
/** What a backend from before the switch returns: neither field. */
const { engineer_tools: _e, can_use_engineer_tools: _c, ...olderOwner } = owner
const member: AuthUser = { ...owner, user_id: 'u-mem', username: 'mem', org_role: 'member', can_use_engineer_tools: false }

let host: HTMLDivElement
let root: Root

function signIn(user: AuthUser, token = 'plain') {
  useAuthStore.setState({
    status: 'signedIn', authEnabled: true, user, token, expiresAt: Math.floor(Date.now() / 1000) + 3600, notice: null,
  })
}
const render = () => act(() => root.render(<><EngineerToolsChip /><OperatorProfile /></>))
const openMenu = () => act(() => useAccountMenu.getState().setOpen(true))
const chip = () => document.querySelector<HTMLButtonElement>('[data-testid="engineer-tools-chip"]')
const toggle = () => document.querySelector<HTMLElement>('[data-testid="engineer-tools-switch"]')
const menuText = () => document.querySelector('[role="menu"]')?.textContent ?? ''
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve() })

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response
}

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoResize)
  useAccountMenu.setState({ open: false })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  // Clears the session's timers along with it.
  useAuthStore.getState().endSession()
  useAuthStore.setState({ status: 'off', authEnabled: false, user: DEV_USER, token: null, expiresAt: null, notice: null })
  try { localStorage.clear() } catch { /* none */ }
  vi.unstubAllGlobals()
})

describe('Engineer tools in the account menu', () => {
  it('offers the switch, off, with its note, to an owner', () => {
    signIn(owner)
    render()
    openMenu()
    expect(toggle()).not.toBeNull()
    expect(toggle()!.getAttribute('role')).toBe('menuitemcheckbox')
    expect(toggle()!.getAttribute('aria-checked')).toBe('false')
    expect(menuText()).toContain('Adds the engineer’s tools to your role until you sign out.')
    expect(chip()).toBeNull()
  })

  it('is not there for someone who cannot use it', () => {
    signIn(member)
    render()
    openMenu()
    expect(menuText()).toContain('Sign out')
    expect(toggle()).toBeNull()
  })

  it('shows nothing against an older backend whose user has neither field', () => {
    signIn(olderOwner as AuthUser)
    render()
    openMenu()
    expect(menuText()).toContain('Sign out')
    expect(toggle()).toBeNull()
    expect(chip()).toBeNull()
  })

  it('shows nothing with sign-in off', () => {
    useAuthStore.setState({ status: 'off', authEnabled: false, user: { ...DEV_USER, engineer_tools: true, can_use_engineer_tools: true } })
    render()
    expect(chip()).toBeNull()
    expect(toggle()).toBeNull()
  })

  it('turns on through the API, swaps in the new token and user, and shows the chip', async () => {
    let answer!: (r: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { answer = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    signIn(owner)
    render()
    openMenu()
    act(() => toggle()!.click())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/auth\/engineer-tools$/)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer plain')
    expect(JSON.parse(init.body as string)).toEqual({ on: true })
    // Disabled while the request runs.
    expect(toggle()!.hasAttribute('data-disabled')).toBe(true)

    const on = { ...owner, engineer_tools: true }
    answer(respond(200, { access_token: 'eng', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3000, user: on }))
    await settle()

    expect(useAuthStore.getState()).toMatchObject({ token: 'eng', user: on })
    expect(toggle()!.hasAttribute('data-disabled')).toBe(false)
    expect(toggle()!.getAttribute('aria-checked')).toBe('true')
    expect(menuText()).toContain('On until you sign out. Calibration, surveys and edge tools are open to you.')
    expect(chip()?.textContent).toBe('Engineer tools on')
  })

  it('shows the server\'s refusal in the menu and stays off', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(403, { detail: 'only an organisation owner or admin can use engineer tools' })))
    signIn(owner)
    render()
    openMenu()
    act(() => toggle()!.click())
    await settle()
    expect(document.querySelector('[role="menu"] [role="alert"]')?.textContent)
      .toBe('only an organisation owner or admin can use engineer tools')
    expect(toggle()!.getAttribute('aria-checked')).toBe('false')
    expect(useAuthStore.getState().token).toBe('plain')
    expect(chip()).toBeNull()
  })

  it('turns off through the API, and the chip goes', async () => {
    const fetchMock = vi.fn(async () => respond(200, {
      access_token: 'plain-2', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3000, user: owner,
    }))
    vi.stubGlobal('fetch', fetchMock)
    signIn({ ...owner, engineer_tools: true }, 'eng')
    render()
    expect(chip()).not.toBeNull()
    openMenu()
    act(() => toggle()!.click())
    await settle()
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ on: false })
    expect(useAuthStore.getState().token).toBe('plain-2')
    expect(chip()).toBeNull()
  })
})

describe('The "Engineer tools on" chip', () => {
  it('shows only while on, and opens the account menu', () => {
    signIn({ ...owner, engineer_tools: true })
    render()
    expect(chip()?.textContent).toBe('Engineer tools on')
    expect(document.querySelector('[role="menu"]')).toBeNull()
    act(() => chip()!.click())
    expect(useAccountMenu.getState().open).toBe(true)
    expect(toggle()?.getAttribute('aria-checked')).toBe('true')
  })

  it('does not count a claim the user can no longer use', () => {
    signIn({ ...owner, engineer_tools: true, can_use_engineer_tools: false })
    render()
    expect(chip()).toBeNull()
  })
})
