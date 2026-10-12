import type { Config } from 'tailwindcss'
import { color, font, space, radius } from './src/design-system/tokens'

export default {
  // Required for shadcn dark-mode class strategy
  darkMode: ['class'],

  content: ['./index.html', './src/**/*.{ts,tsx}'],

  theme: {
    extend: {
      // ── Font ──────────────────────────────────────────────────────────────
      fontFamily: {
        sans: [font.family, 'system-ui', 'sans-serif'],
      },

      // ── Border radius ─────────────────────────────────────────────────────
      // shadcn uses these three names; we drive them from our token scale
      borderRadius: {
        lg:     `${radius.md}px`,   // 8px  — shadcn "lg"
        md:     `${radius.sm}px`,   // 6px  — shadcn "md" (our default)
        sm:     `${radius.xs}px`,   // 4px  — shadcn "sm"
        // RoverHub explicit scale (use these in custom components)
        'rh-xs': `${radius.xs}px`,
        'rh-sm': `${radius.sm}px`,
        'rh-md': `${radius.md}px`,
        'rh-lg': `${radius.lg}px`,
        'rh-xl': `${radius.xl}px`,
      },

      // ── Spacing (4px grid) ────────────────────────────────────────────────
      spacing: {
        'rh-1': `${space[1]}px`,
        'rh-2': `${space[2]}px`,
        'rh-3': `${space[3]}px`,
        'rh-4': `${space[4]}px`,
        'rh-5': `${space[5]}px`,
        'rh-6': `${space[6]}px`,
        'rh-8': `${space[8]}px`,
      },

      // ── Colors ────────────────────────────────────────────────────────────
      colors: {
        // shadcn CSS-variable colors — these read from :root variables in index.css
        // so shadcn components inherit the RoverHub palette automatically.
        background:  'var(--rh-bg)',
        foreground:  'var(--rh-t1)',
        border:      'var(--rh-border)',
        input:       'var(--rh-border)',
        ring:        'var(--rh-accent)',
        card: {
          DEFAULT:    'var(--rh-card)',
          foreground: 'var(--rh-t1)',
        },
        popover: {
          DEFAULT:    'var(--rh-elevated)',
          foreground: 'var(--rh-t1)',
        },
        primary: {
          DEFAULT:    'var(--rh-accent-solid)',
          foreground: 'var(--rh-accent-text)',
        },
        secondary: {
          DEFAULT:    'var(--rh-elevated)',
          foreground: 'var(--rh-t2)',
        },
        muted: {
          DEFAULT:    'var(--rh-elevated)',
          foreground: 'var(--rh-t3)',
        },
        accent: {
          DEFAULT:    'var(--rh-card-hover)',
          foreground: 'var(--rh-t1)',
        },
        destructive: {
          DEFAULT:    'var(--rh-red)',
          foreground: 'var(--rh-accent-text)',
        },

        // RoverHub token utilities — use as bg-rh-surface, text-rh-t1, etc.
        rh: {
          // Backgrounds
          bg:           color.bg,
          surface:      color.surface,
          elevated:     color.elevated,
          card:         color.card,
          'card-hover': color.cardHover,
          overlay:      color.overlay,
          // Borders
          border:       color.border,
          'border-lt':  color.borderLt,
          // Text
          t1:           color.t1,
          t2:           color.t2,
          t3:           color.t3,
          t4:           color.t4,
          // Accent
          accent:       color.accent,
          'accent-dim': color.accentDim,
          'accent-text':color.accentText,
          // Status
          green:        color.green,
          'green-bg':   color.greenBg,
          amber:        color.amber,
          'amber-bg':   color.amberBg,
          red:          color.red,
          'red-bg':     color.redBg,
          orange:       color.orange,
          // E-Stop
          estop:        color.estop,
          'estop-border':color.estopBorder,
        },
      },

      // ── Box shadows ────────────────────────────────────────────────────────
      boxShadow: {
        'rh-sm':          'var(--rh-shadow-sm)',
        'rh-md':          'var(--rh-shadow-md)',
        'rh-lg':          'var(--rh-shadow-lg)',
      },

      // ── Backdrop blur ──────────────────────────────────────────────────────
      backdropBlur: {
        'rh-glass': '18px',
        'rh-heavy': '24px',
      },

      // ── Key-frame animations ───────────────────────────────────────────────
      keyframes: {
        'rh-blink': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.3' },
        },
        'rh-fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'rh-pop': {
          '0%':   { transform: 'scale(0.96)', opacity: '0' },
          '100%': { transform: 'scale(1)',    opacity: '1' },
        },
      },
      animation: {
        'rh-blink':    'rh-blink 1.5s ease-in-out infinite',
        'rh-fade-up':  'rh-fade-up 0.2s ease both',
        'rh-pop':      'rh-pop 0.18s cubic-bezier(0.16,1,0.3,1) both',
        'rh-rec':      'rh-blink 1.4s ease-in-out infinite',
      },
    },
  },

  plugins: [],
} satisfies Config
