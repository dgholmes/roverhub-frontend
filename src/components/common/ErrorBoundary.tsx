import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/kit'
import { color, font, space } from '@/design-system/tokens'

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
  /** Merged onto the fallback's root, for a child that positions itself (a
   * card floated over the map keeps its place when it fails). */
  fallbackStyle?: React.CSSProperties
  children: ReactNode
}

interface State { error: Error | null }

const sameKeys = (a: readonly unknown[] = [], b: readonly unknown[] = []) =>
  a.length === b.length && a.every((v, i) => Object.is(v, b[i]))

/**
 * Keeps one render fault from taking the rest of the console with it.
 *
 * React unmounts the whole tree on an uncaught render error. With no boundary
 * anywhere, a bad telemetry value in one panel blanked the console, the E-Stop
 * included (docs/audit/2026-11-10-system-direction-audit.md §5.5). Each
 * workspace and org page has one of these, and so does each LiveOps pane, so a
 * fault stays where it happened. None wraps the LiveOps command bar: that is
 * what has to survive.
 *
 * It catches render, lifecycle and hook errors in its children only -- not
 * event handlers or async code, which never unmount anything.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`[RoverHub] ${this.props.area} stopped rendering:`, error, info.componentStack)
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && !sameKeys(prev.resetKeys, this.props.resetKeys)) this.reset()
  }

  reset = (): void => this.setState({ error: null })

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return <ErrorFallback error={error} variant={this.props.variant ?? 'page'} style={this.props.fallbackStyle} onReset={this.reset} />
  }
}

function reloadPage(e: React.MouseEvent) {
  e.preventDefault()
  window.location.reload()
}

function ErrorFallback({ error, variant, style, onReset }: {
  error: Error
  variant: ErrorBoundaryVariant
  style?: React.CSSProperties
  onReset: () => void
}) {
  const { t } = useTranslation()
  const message = error.message || t('common.errorBoundary.noMessage')
  const dot = <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: color.red, flexShrink: 0 }} />
  const retry = (
    <Button size="sm" icon={RotateCcw} onClick={onReset}>{t('common.errorBoundary.retry')}</Button>
  )
  const reload = (
    <a href="" onClick={reloadPage} style={{ fontSize: font.size.sm, color: color.t2 }}>
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
        {reload}
      </div>
    )
  }

  const isPage = variant === 'page'
  return (
    <div role="alert" style={{
      ...(isPage ? { flex: 1 } : { width: '100%', height: '100%' }),
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: space[2], padding: space[4], minHeight: 0, boxSizing: 'border-box',
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
      <div style={{ fontSize: font.size.xs, color: color.t3, maxWidth: 420, overflowWrap: 'anywhere' }}>{message}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], marginTop: space[1] }}>
        {retry}
        {reload}
      </div>
    </div>
  )
}
