import { Moon, Sun } from 'lucide-react'
import { useThemeStore } from '@/lib/theme'

/**
 * RoverHub component kit. Every visual decision lives in design-system/kit.css
 * so that hover, pressed, focus and disabled states work — inline styles can
 * express none of them. Prefer these over hand-rolled <button>/<span> styling.
 */

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

export const ICON = { size: 16, stroke: 1.75 } as const

type ButtonVariant = 'secondary' | 'primary' | 'ghost' | 'danger'

// Class names are spelled out in full, never built as `rh-btn--${variant}`:
// kit.css lives in Tailwind's @layer components, and Tailwind drops any rule
// whose class name it cannot find written literally in the source. Built
// names compiled fine and rendered unstyled — every toned badge came out grey.
const VARIANT_CLASS: Record<ButtonVariant, string | false> = {
  secondary: false, primary: 'rh-btn--primary', ghost: 'rh-btn--ghost', danger: 'rh-btn--danger',
}
const SIZE_CLASS = { sm: 'rh-btn--sm', md: false, lg: 'rh-btn--lg' } as const

export function Button({
  variant = 'secondary', size = 'md', active, icon: Icon, className, children, ...rest
}: {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  /** Toggle-on state for buttons that represent a mode. */
  active?: boolean
  icon?: React.ElementType
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      aria-pressed={active ?? undefined}
      className={cx(
        'rh-btn',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        active && 'rh-btn--active',
        className,
      )}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : ICON.size} strokeWidth={ICON.stroke} aria-hidden />}
      {children}
    </button>
  )
}

export function IconButton({
  icon: Icon, label, size = 'md', bordered, className, ...rest
}: {
  icon: React.ElementType
  /** Required: an icon-only control has no other accessible name. */
  label: string
  size?: 'sm' | 'md'
  bordered?: boolean
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx('rh-icon-btn', size === 'sm' && 'rh-icon-btn--sm', bordered && 'rh-icon-btn--bordered', className)}
    >
      <Icon size={size === 'sm' ? 14 : ICON.size} strokeWidth={ICON.stroke} aria-hidden />
    </button>
  )
}

export type Tone = 'neutral' | 'accent' | 'green' | 'amber' | 'red' | 'blue'

/** Literal class names, for the reason given at VARIANT_CLASS. */
const TONE_CLASS: Record<Tone, string | false> = {
  neutral: false,
  accent: 'rh-badge--accent',
  green: 'rh-badge--green',
  amber: 'rh-badge--amber',
  red: 'rh-badge--red',
  blue: 'rh-badge--blue',
}

export function Badge({
  tone = 'neutral', dot, size = 'md', children, title, style,
}: {
  tone?: Tone
  dot?: boolean
  size?: 'md' | 'lg'
  children: React.ReactNode
  title?: string
  style?: React.CSSProperties
}) {
  return (
    <span
      title={title}
      style={style}
      className={cx('rh-badge', TONE_CLASS[tone], size === 'lg' && 'rh-badge--lg')}
    >
      {dot && <span className="rh-dot" aria-hidden />}
      {children}
    </span>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: React.ReactNode
  icon?: React.ElementType
  disabled?: boolean
  title?: string
}

/** Mutually exclusive choice rendered as tabs: role="tablist" with
 * aria-selected, so assistive tech announces which one is active. */
export function Segmented<T extends string>({
  options, value, onChange, label,
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="rh-seg">
      {options.map((o) => {
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={o.value === value}
            disabled={o.disabled}
            title={o.title}
            aria-label={typeof o.label === 'string' ? o.label : undefined}
            className="rh-seg__item"
            onClick={() => onChange(o.value)}
          >
            {Icon && <Icon size={14} strokeWidth={ICON.stroke} aria-hidden />}
            {/* Wrapped so a narrow bar can hide the text and keep the icon;
                aria-label keeps the name when it does. */}
            <span className="rh-seg__label">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Page-section tabs (underline style). */
export function Tabs<T extends string>({
  options, value, onChange, label,
}: {
  options: { value: T; label: React.ReactNode }[]
  value: T
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="rh-tabs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className="rh-tabs__item"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Aligned label/value telemetry rows with tabular figures. */
export function KeyValue({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="rh-kv">
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'contents' }}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Blue/lime accent switch — temporary, while the accent is being chosen.
 * Shows a swatch of the current accent; clicking swaps to the other. */
export function AccentToggle() {
  const accent = useThemeStore((s) => s.accent)
  const toggleAccent = useThemeStore((s) => s.toggleAccent)
  const other = accent === 'blue' ? 'lime' : 'blue'
  return (
    <button
      type="button"
      className="rh-icon-btn"
      onClick={toggleAccent}
      title={`Accent: ${accent} — switch to ${other}`}
      aria-label={`Accent colour is ${accent}. Switch to ${other}.`}
    >
      <span
        aria-hidden
        style={{
          width: 14, height: 14, borderRadius: 4,
          background: 'var(--rh-accent-solid)', boxShadow: '0 0 0 1px var(--rh-border-lt)',
        }}
      />
    </button>
  )
}

/** One button showing the icon for the current mode (ui-design-system skill). */
export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggle)
  return (
    <IconButton
      icon={theme === 'dark' ? Moon : Sun}
      label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggle}
    />
  )
}
