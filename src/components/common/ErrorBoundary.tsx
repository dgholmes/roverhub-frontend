import { Component, Fragment, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, RotateCcw } from 'lucide-react'
import { Button, IconButton } from '@/components/kit'
import { color, font, radius, space } from '@/design-system/tokens'

/**
 * How much room the fallback takes, which follows what it stands in for:
 * - `page`: a whole workspace or org page. Fills the content area, centred.
 * - `pane`: one LiveOps pane (the map, a camera). Fills its parent, which is
 *   sized by the view, so the layout around it does not move.
 * - `strip`: a slim bar (the telemetry strip, the activity log). One row.
 */
export type ErrorBoundaryVariant = 'page' | 'pane' | 'strip'

interface Props {
  /** Names the area in the console log, so a report says where it broke. */
  area: string
  variant?: ErrorBoundaryVariant
  /** When any of these change, a fallback resets and tries the children again:
   * a new robot or a new workspace is a fresh start, not the same fault. */
  resetKeys?: readonly unknown[]
  /** Any change of address (Back, Forward, a link, a deeper page of the same
   * workspace) also resets a fallback. On by default. */
  resetOnNavigate?: boolean
  /** Merged onto the fallback's root, for a child that positions itself (a
   * card floated over the map keeps its place when it fails). */
  fallbackStyle?: React.CSSProperties
  /** Drawn after the fallback, for a stand-in control the operator must keep
   * while the real one is down (the plain Take/Release toggle in the task bar). */
  fallbackExtra?: ReactNode
  children: ReactNode
}

interface State {
  error: Error | null
  componentStack: string | null
  /** Bumped by every reset, so the children come back as a fresh mount. */
  attempt: number
}

const sameKeys = (a: readonly unknown[] = [], b: readonly unknown[] = []) =>
  a.length === b.length && a.every((v, i) => Object.is(v, b[i]))

const LOG_PREFIX = '[RoverHub]'

/**
 * Keeps one render fault from taking the rest of the console with it.
 *
 * React unmounts the whole tree on an uncaught render error. With no boundary
 * anywhere, a bad telemetry value in one panel blanked the console, the E-Stop
 * included (docs/audit/2026-11-10-system-direction-audit.md §5.5). The app has
 * one at the root (main.tsx) and one in AppShell; each workspace and org page
 * has one, and so does each LiveOps pane, so a fault stays where it happened.
 * Inside the LiveOps command bar, the task slot and the button groups have
 * their own; the E-Stop sits outside all of them, because it has to survive.
 *
 * It catches render, lifecycle and hook errors in its children only -- not
 * event handlers or async code, which never unmount anything.
 *
 * Each boundary logs a fault once. The same fault again (after Reload this
 * view, a robot switch, a navigation) stays out of the console, so a pane
 * that keeps failing on every telemetry frame cannot flood it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null, attempt: 0 }
  private lastLogged: string | null = null

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const componentStack = info.componentStack ?? null
    this.setState({ componentStack })
    const err = error instanceof Error ? error : new Error(String(error))
    const key = `${err.name}: ${err.message}\n${componentStack ?? ''}`
    if (key === this.lastLogged) return
    this.lastLogged = key
    console.error(`${LOG_PREFIX} ${this.props.area} stopped rendering:`, error, componentStack)
  }

  componentDidMount(): void {
    if (this.props.resetOnNavigate !== false && typeof window !== 'undefined') {
      window.addEventListener('hashchange', this.onNavigate)
      window.addEventListener('popstate', this.onNavigate)
    }
  }

  componentWillUnmount(): void {
    if (typeof window === 'undefined') return
    window.removeEventListener('hashchange', this.onNavigate)
    window.removeEventListener('popstate', this.onNavigate)
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && !sameKeys(prev.resetKeys, this.props.resetKeys)) this.reset()
  }

  private onNavigate = (): void => {
    if (this.state.error) this.reset()
  }

  reset = (): void => this.setState((s) => ({ error: null, componentStack: null, attempt: s.attempt + 1 }))

  render(): ReactNode {
    const { error, componentStack, attempt } = this.state
    if (!error) return <Fragment key={attempt}>{this.props.children}</Fragment>
    return (
      <>
        <ErrorFallback
          area={this.props.area} error={error} componentStack={componentStack}
          variant={this.props.variant ?? 'page'} style={this.props.fallbackStyle} onReset={this.reset}
        />
        {this.props.fallbackExtra}
      </>
    )
  }
}

/**
 * For `createRoot`'s `onCaughtError`. React 19 logs every caught error itself,
 * on top of the boundary's own line; that second copy is dropped for our
 * boundaries (they log once, with the area). Any other boundary -- one inside
 * a library -- is still logged, so nothing is silenced by accident.
 */
export function onCaughtError(error: unknown, info: { componentStack?: string; errorBoundary?: unknown }): void {
  if (info.errorBoundary instanceof ErrorBoundary) return
  console.error(`${LOG_PREFIX} caught render error:`, error, info.componentStack)
}

/** Everything a developer needs from a fault report, as plain text. */
export function errorDetailsText(area: string, error: Error, componentStack: string | null): string {
  const lines = [
    'RoverHub console error',
    `Area: ${area}`,
    `When: ${new Date().toISOString()}`,
  ]
  if (typeof window !== 'undefined') lines.push(`Address: ${window.location.hash || '#/'}`)
  if (typeof navigator !== 'undefined') lines.push(`Browser: ${navigator.userAgent}`)
  lines.push('', `${error.name}: ${error.message}`)
  if (error.stack) lines.push('', 'Stack:', error.stack)
  if (componentStack) lines.push('', 'Component stack:', componentStack.replace(/^\n+/, ''))
  return lines.join('\n')
}

/** The clipboard API needs a secure context; plain http on a LAN address has
 * none, so the old copy command stands in there. */
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch { /* not a secure context, or refused: try the old way */ }
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand?.('copy')
  area.remove()
  if (!ok) throw new Error('copy refused')
}

type CopyState = 'idle' | 'copied' | 'failed'

function useCopy(text: () => string): [CopyState, () => void] {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const copy = () => {
    const settle = (s: CopyState) => {
      setState(s)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setState('idle'), 2000)
    }
    copyText(text()).then(() => settle('copied'), () => settle('failed'))
  }
  return [state, copy]
}

function reloadPage(e: React.MouseEvent) {
  e.preventDefault()
  window.location.reload()
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

function ErrorFallback({ area, error, componentStack, variant, style, onReset }: {
  area: string
  error: Error
  componentStack: string | null
  variant: ErrorBoundaryVariant
  style?: React.CSSProperties
  onReset: () => void
}) {
  const { t } = useTranslation()
  const message = error.message || t('common.errorBoundary.noMessage')
  const [copyState, copy] = useCopy(() => errorDetailsText(area, error, componentStack))
  const copyLabel = copyState === 'copied' ? t('common.errorBoundary.copied')
    : copyState === 'failed' ? t('common.errorBoundary.copyFailed')
    : t('common.errorBoundary.copy')
  const dot = <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: color.red, flexShrink: 0 }} />
  const retry = (
    <Button size="sm" icon={RotateCcw} onClick={onReset}>{t('common.errorBoundary.retry')}</Button>
  )
  const reload = (
    <a href="" onClick={reloadPage} style={{ fontSize: font.size.sm, color: color.t2, flexShrink: 0 }}>
      {t('common.errorBoundary.reloadPage')}
    </a>
  )

  if (variant === 'strip') {
    return (
      <div role="alert" style={{
        display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0,
        padding: `${space[2]}px ${space[3]}px`, background: color.redBg, fontFamily: font.family,
        ...style,
      }}>
        {dot}
        <span style={{ fontSize: font.size.sm, color: color.t1, flexShrink: 0 }}>{t('common.errorBoundary.pane')}</span>
        <span title={message} style={{
          fontSize: font.size.xs, color: color.t3, minWidth: 0, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {message}
        </span>
        {retry}
        <IconButton size="sm" icon={copyState === 'copied' ? Check : Copy} label={copyLabel} onClick={copy} />
        {reload}
      </div>
    )
  }

  const isPage = variant === 'page'
  return (
    <div role="alert" style={{
      ...(isPage ? { flex: 1 } : { width: '100%', height: '100%' }),
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: space[2], padding: space[4], minHeight: 0, boxSizing: 'border-box', overflow: 'auto',
      background: isPage ? color.bg : color.redBg, fontFamily: font.family, textAlign: 'center',
      ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
        {dot}
        <span style={{ fontSize: isPage ? font.size.lg : font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>
          {t(isPage ? 'common.errorBoundary.view' : 'common.errorBoundary.pane')}
        </span>
      </div>
      <div style={{ fontSize: font.size.sm, color: color.t2, maxWidth: 420 }}>{t('common.errorBoundary.rest')}</div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: space[3], marginTop: space[1] }}>
        {retry}
        <Button size="sm" variant="ghost" icon={copyState === 'copied' ? Check : Copy} onClick={copy}>{copyLabel}</Button>
        {reload}
      </div>
      <details style={{ width: '100%', maxWidth: 520, textAlign: 'left' }}>
        <summary style={{ cursor: 'pointer', fontSize: font.size.sm, color: color.t2, textAlign: 'center' }}>
          {t('common.errorBoundary.details')}
        </summary>
        <div style={{
          marginTop: space[2], padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.md,
          background: color.card, maxHeight: 180, overflow: 'auto',
        }}>
          <div style={{ fontSize: font.size.sm, color: color.t1, overflowWrap: 'anywhere' }}>{message}</div>
          {componentStack && (
            <pre style={{
              margin: `${space[2]}px 0 0`, fontFamily: MONO, fontSize: font.size.xs, color: color.t3,
              whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
            }}>
              {componentStack.replace(/^\n+/, '')}
            </pre>
          )}
        </div>
      </details>
    </div>
  )
}
