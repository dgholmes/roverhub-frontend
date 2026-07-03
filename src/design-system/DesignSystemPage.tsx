import { useState } from 'react'
import {
  Play, Pause, Anchor, Camera, Mic2, OctagonX,
  Navigation, Users, ScanSearch, RotateCcw,
  Sun, Eye, Scan, Flame,
  Settings, ScrollText,
  Zap, Shield,
  AlertTriangle, XCircle, Info,
  ChevronRight,
} from 'lucide-react'
import { color, font, space, radius, shadow, glass, motion, layout, statusColor } from './tokens'

// ─── Helpers ─────────────────────────────────

const f = font.family

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: space[12] }}>
      <div style={{
        fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.t3,
        letterSpacing: font.tracking.widest, textTransform: 'uppercase',
        marginBottom: space[4], paddingBottom: space[2],
        borderBottom: `1px solid ${color.border}`,
      }}>
        {title}
      </div>
      {children}
    </section>
  )
}

function Row({ label, children, gap = space[3] }: { label?: string; children: React.ReactNode; gap?: number }) {
  return (
    <div style={{ marginBottom: space[6] }}>
      {label && (
        <div style={{ fontSize: font.size.xs, color: color.t3, fontFamily: f, marginBottom: space[2] }}>
          {label}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap }}>
        {children}
      </div>
    </div>
  )
}

function TokenChip({ name, value }: { name: string; value: string }) {
  return (
    <div style={{
      background: color.card, border: `1px solid ${color.border}`,
      borderRadius: radius.sm, padding: `${space[2]}px ${space[3]}px`,
      fontFamily: "'Courier New', monospace", fontSize: 10,
    }}>
      <span style={{ color: color.t3 }}>{name}: </span>
      <span style={{ color: color.t1 }}>{value}</span>
    </div>
  )
}

// ─── 1. Colors ───────────────────────────────

function ColorSwatch({ name, value }: { name: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1], width: 80 }}>
      <div style={{
        width: 80, height: 52, borderRadius: radius.md,
        background: value, border: `1px solid ${color.border}`,
      }} />
      <div style={{ fontSize: 9, color: color.t3, fontFamily: f, lineHeight: 1.4 }}>
        <div style={{ color: color.t2, fontWeight: font.weight.semibold }}>{name}</div>
        <div style={{ fontFamily: "'Courier New', monospace" }}>{value}</div>
      </div>
    </div>
  )
}

// ─── 2. Typography ───────────────────────────

function TypeSample({ size, weight, label, tracking, text }: {
  size: number; weight: number; label: string; tracking?: string; text?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: space[4], paddingBottom: space[2], borderBottom: `1px solid ${color.border}` }}>
      <div style={{ width: 120, fontSize: 10, color: color.t3, fontFamily: f, flexShrink: 0 }}>{label}</div>
      <div style={{
        fontSize: size, fontWeight: weight, color: color.t1, fontFamily: f,
        letterSpacing: tracking,
        textTransform: tracking === font.tracking.widest || tracking === font.tracking.wider ? 'uppercase' : undefined,
      }}>
        {text ?? 'RVR-01 "Atlas" — Industrial Patrol'}
      </div>
      <div style={{ fontSize: 9, color: color.t3, fontFamily: "'Courier New', monospace", marginLeft: 'auto', flexShrink: 0 }}>
        {size}px / {weight}
      </div>
    </div>
  )
}

// ─── 3. Buttons ──────────────────────────────

function Btn({
  label, variant = 'default', icon: Icon, size = 'md'
}: {
  label: string
  variant?: 'primary' | 'default' | 'danger' | 'ghost'
  icon?: React.ElementType
  size?: 'sm' | 'md' | 'lg'
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: color.accent,  border: `1px solid ${color.accentBorder}`, color: color.accentText },
    default: { background: color.card,    border: `1px solid ${color.border}`,       color: color.t2 },
    danger:  { background: color.estop,   border: `1px solid ${color.estopBorder}`,  color: color.red },
    ghost:   { background: 'transparent', border: `1px solid ${color.border}`,       color: color.t2 },
  }
  const pad = size === 'sm' ? `${space[1]}px ${space[3]}px` : size === 'lg' ? `${space[3]}px ${space[5]}px` : `${space[2]}px ${space[4]}px`
  const fs  = size === 'sm' ? font.size.xs : size === 'lg' ? font.size.lg : font.size.md
  return (
    <button style={{
      ...styles[variant],
      display: 'inline-flex', alignItems: 'center', gap: space[2],
      padding: pad, borderRadius: radius.sm,
      fontSize: fs, fontWeight: font.weight.semibold, fontFamily: f,
      cursor: 'pointer', transition: `background ${motion.default}`,
    }}>
      {Icon && <Icon size={fs - 1} strokeWidth={1.8} />}
      {label}
    </button>
  )
}

// ─── 4. Action Buttons (command bar) ─────────

function ActionBtn({ icon: Icon, label, variant = 'default' }: {
  icon: React.ElementType; label: string; variant?: 'default' | 'primary' | 'danger'
}) {
  const bg     = variant === 'primary' ? color.accent : variant === 'danger' ? color.estop : color.card
  const border = variant === 'primary' ? color.accentBorder : variant === 'danger' ? color.estopBorder : color.border
  const clr    = variant === 'primary' ? color.accentText : variant === 'danger' ? color.red : color.t2
  return (
    <button style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: space[1], height: layout.actionBtnHeight, minWidth: 64, padding: `0 ${space[4]}px`,
      background: bg, border: `1px solid ${border}`, borderRadius: radius.sm,
      color: clr, cursor: 'pointer', fontFamily: f, position: 'relative',
    }}>
      {variant === 'danger' && (
        <span className="rec-dot" style={{
          position: 'absolute', top: 6, right: 8,
          width: 7, height: 7, borderRadius: radius.full,
          background: color.red, boxShadow: shadow.glow.red,
        }} />
      )}
      <Icon size={16} strokeWidth={variant === 'primary' ? 2.5 : 1.6} />
      <span style={{ fontSize: font.size.xs, fontWeight: font.weight.bold }}>{label}</span>
    </button>
  )
}

// ─── 5. Status Badge ─────────────────────────

function StatusBadge({ label, level }: { label: string; level: keyof typeof statusColor }) {
  const clr = statusColor[level]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: space[1] + 2,
      fontSize: font.size.xs, fontWeight: font.weight.bold, color: clr,
      background: `${clr}1a`, border: `1px solid ${clr}40`,
      borderRadius: radius.xs, padding: `2px ${space[2]}px`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: radius.full, background: clr, display: 'inline-block' }} />
      {label}
    </span>
  )
}

// ─── 6. Telemetry Pill (glassmorphism) ───────

function TelPill({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <div style={{
      ...glass.overlay,
      display: 'flex', flexDirection: 'column',
      borderRadius: radius.sm, padding: `${space[1] + 1}px ${space[3] - 2}px`, gap: 2,
    }}>
      <span style={{ fontSize: font.size['2xs'], color: color.t4, fontWeight: font.weight.medium, letterSpacing: font.tracking.wider, textTransform: 'uppercase' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[1] }}>
        {dot && <span style={{ width: 5, height: 5, borderRadius: radius.full, background: dot, display: 'inline-block' }} />}
        <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>{value}</span>
      </div>
    </div>
  )
}

// ─── 7. Segmented Control ────────────────────

function SegControl({ options, active }: { options: string[]; active: string }) {
  return (
    <div style={{
      display: 'inline-flex', gap: 2,
      background: color.card, borderRadius: radius.sm + 2, padding: 3,
      border: `1px solid ${color.border}`,
    }}>
      {options.map(o => (
        <button key={o} style={{
          padding: `${space[1] + 2}px ${space[3]}px`, borderRadius: radius.sm,
          border: 'none',
          background: o === active ? color.accent : 'transparent',
          color: o === active ? color.accentText : color.t3,
          fontSize: font.size.md, fontWeight: o === active ? font.weight.bold : font.weight.medium,
          cursor: 'pointer', fontFamily: f,
        }}>{o}</button>
      ))}
    </div>
  )
}

// ─── 8. Progress Bar ─────────────────────────

function ProgressBar({ value, label, color: clr = color.accent }: { value: number; label?: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[3], width: '100%', maxWidth: 360 }}>
      <div style={{ flex: 1, height: 4, background: color.border, borderRadius: radius.xs, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: clr, borderRadius: radius.xs }} />
      </div>
      <span style={{ fontSize: font.size.xs, color: color.t3, minWidth: 28, textAlign: 'right', fontFamily: f }}>{value}%</span>
      {label && <span style={{ fontSize: font.size.xs, color: color.t3, fontFamily: f }}>{label}</span>}
    </div>
  )
}

// ─── 9. Circular Gauge ───────────────────────
// arc helpers imported from the shared gauge — same source, guaranteed consistent

import { arcPath } from '@/shared/BatteryGauge'

function CircleGauge({ value, max = 100, label, unit = '%' }: { value: number; max?: number; label?: string; unit?: string }) {
  const CX = 48, CY = 48, R = 36, SW = 10
  const START = 210, END = 150, TOTAL = 300
  const progressEnd = START + (value / max) * TOTAL
  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      <path d={arcPath(CX, CY, R, START, END)}
        fill="none" stroke={color.gaugeTrack} strokeWidth={SW} strokeLinecap="round" />
      <path d={arcPath(CX, CY, R, START, progressEnd)}
        fill="none" stroke={color.accent} strokeWidth={SW} strokeLinecap="round"
        style={{ filter: 'drop-shadow(0 0 8px rgba(170,255,0,0.65))' }} />
      <text x={CX} y={CY - 2} textAnchor="middle" fill={color.t1}
        fontSize="22" fontWeight="700" fontFamily={f}>{value}{unit}</text>
      {label && (
        <text x={CX} y={CY + 15} textAnchor="middle" fill="#AEAEB2"
          fontSize="11" fontFamily={f}>{label}</text>
      )}
    </svg>
  )
}

// ─── 10. Connection Status ───────────────────

function ConnItem({ label, value, level }: { label: string; value: string; level: 'excellent' | 'strong' | 'offline' }) {
  const clr = level === 'excellent' ? color.accent : level === 'strong' ? color.orange : color.t3
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: 160 }}>
      <span style={{ fontSize: font.size.sm, color: color.t3, fontFamily: f }}>{label}</span>
      <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: clr, fontFamily: f }}>{value}</span>
    </div>
  )
}

// ─── 11. Mission Preset Button ───────────────

function PresetBtn({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <button style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: space[1] + 2, padding: `${space[3] - 2}px ${space[2]}px`,
      background: color.card, border: `1px solid ${color.border}`, borderRadius: radius.md,
      color: color.t2, cursor: 'pointer', minWidth: 64, fontFamily: f,
    }}>
      <Icon size={18} strokeWidth={1.5} />
      <span style={{ fontSize: font.size.sm, fontWeight: font.weight.medium }}>{label}</span>
    </button>
  )
}

// ─── 12. Alert Banner ────────────────────────

function AlertBanner({ level, message }: { level: 'info' | 'warning' | 'error' | 'critical'; message: string }) {
  const cfg = {
    info:     { bg: 'rgba(10,132,255,0.10)', border: 'rgba(10,132,255,0.25)', clr: '#0A84FF', Icon: Info },
    warning:  { bg: color.amberBg,           border: color.amberBorder,       clr: color.amber,  Icon: AlertTriangle },
    error:    { bg: color.redBg,             border: color.redBorder,         clr: color.red,    Icon: XCircle },
    critical: { bg: color.redBg,             border: color.red,               clr: color.red,    Icon: OctagonX },
  }[level]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: space[3],
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      borderRadius: radius.sm, padding: `${space[2]}px ${space[3]}px`,
      maxWidth: 480,
    }}>
      <cfg.Icon size={14} color={cfg.clr} strokeWidth={1.8} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: font.size.md, color: color.t1, fontFamily: f }}>{message}</span>
    </div>
  )
}

// ─── 13. Nav Pill ────────────────────────────

function NavPill({ label, active }: { label: string; active?: boolean }) {
  return (
    <button style={{
      padding: `${space[1] + 2}px ${space[4]}px`, borderRadius: radius.sm + 2,
      border: active ? `1px solid rgba(255,255,255,0.10)` : '1px solid transparent',
      background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
      color: active ? color.t1 : color.t3,
      fontSize: font.size.lg, fontWeight: active ? font.weight.semibold : font.weight.regular,
      cursor: 'pointer', fontFamily: f,
    }}>
      {label}
    </button>
  )
}

// ─── 14. Status Item (bottom bar) ────────────

function StatusItem({ label, value, ok = true }: { label: string; value: string; ok?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: font.size['2xs'], fontWeight: font.weight.bold, color: color.t3, letterSpacing: font.tracking.wider, textTransform: 'uppercase' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[1] }}>
        <span style={{ width: 5, height: 5, borderRadius: radius.full, background: ok ? color.accent : color.red, display: 'inline-block' }} />
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: ok ? color.t2 : color.red, fontFamily: f }}>{value}</span>
      </div>
    </div>
  )
}

// ─── 15. Dividers ────────────────────────────

// ─── 16. REC / Live Dot ──────────────────────

function LiveDot({ color: clr = color.red, label = 'REC', time = '00:09:46' }: { color?: string; label?: string; time?: string }) {
  return (
    <div style={{
      ...glass.overlay, display: 'inline-flex', alignItems: 'center', gap: space[1] + 2,
      borderRadius: radius.sm, padding: `${space[1] + 1}px ${space[3] - 2}px`,
    }}>
      <span className="rec-dot" style={{ width: 7, height: 7, borderRadius: radius.full, background: clr, display: 'inline-block', boxShadow: shadow.glow.red }} />
      <span style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.t1, fontFamily: f, letterSpacing: font.tracking.wide }}>{label}</span>
      <span style={{ fontSize: font.size.sm, color: color.t2, fontFamily: f }}>{time}</span>
    </div>
  )
}

// ─── 17. Camera Tab ──────────────────────────

function CamTab({ icon: Icon, label, active }: { icon: React.ElementType; label: string; active?: boolean }) {
  return (
    <button style={{
      display: 'inline-flex', alignItems: 'center', gap: space[1] + 1,
      padding: `${space[1]}px ${space[3]}px`, borderRadius: radius.sm,
      background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
      border: active ? `1px solid rgba(255,255,255,0.12)` : '1px solid transparent',
      color: active ? color.t1 : color.t3,
      fontSize: font.size.md, fontWeight: active ? font.weight.semibold : font.weight.regular,
      cursor: 'pointer', fontFamily: f,
    }}>
      <Icon size={12} strokeWidth={1.8} />{label}
    </button>
  )
}

// ─── 19. Card Surface ────────────────────────

function CardSurface({ title, children, width = 240 }: { title: string; children: React.ReactNode; width?: number }) {
  return (
    <div style={{
      width, background: color.card, border: `1px solid ${color.border}`,
      borderRadius: radius.lg, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3],
    }}>
      <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.t1, fontFamily: f, letterSpacing: font.tracking.tight }}>{title}</div>
      {children}
    </div>
  )
}

// ─── Left Nav ────────────────────────────────

const SECTIONS = [
  { id: 'colors',     label: 'Colors' },
  { id: 'typography', label: 'Typography' },
  { id: 'spacing',    label: 'Spacing' },
  { id: 'buttons',    label: 'Buttons' },
  { id: 'actions',    label: 'Action Buttons' },
  { id: 'badges',     label: 'Badges & Status' },
  { id: 'pills',      label: 'Telemetry Pills' },
  { id: 'segments',   label: 'Segmented Controls' },
  { id: 'progress',   label: 'Progress & Gauges' },
  { id: 'nav',        label: 'Navigation' },
  { id: 'camera',     label: 'Camera Tabs' },
  { id: 'alerts',     label: 'Alerts & Banners' },
  { id: 'cards',      label: 'Cards & Panels' },
  { id: 'indicators', label: 'Indicators' },
  { id: 'presets',    label: 'Mission Presets' },
  { id: 'glass',      label: 'Glassmorphism' },
  { id: 'tokens',     label: 'Token Reference' },
]

// ─── Main Page ───────────────────────────────

export default function DesignSystemPage() {
  const [activeSection, setActiveSection] = useState('colors')

  const scrollTo = (id: string) => {
    setActiveSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: color.bg, fontFamily: f, color: color.t1,
    }}>

      {/* ── Left Nav ── */}
      <nav style={{
        width: 200, flexShrink: 0,
        background: color.surface, borderRight: `1px solid ${color.border}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: `${space[4]}px ${space[4]}px ${space[3]}px`, borderBottom: `1px solid ${color.border}` }}>
          <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.t1, letterSpacing: font.tracking.tight, lineHeight: 1.2 }}>
            Design System
          </div>
          <div style={{ fontSize: font.size.xs, color: color.accent, fontWeight: font.weight.semibold, marginTop: 2 }}>
            RoverHub v0
          </div>
        </div>

        {/* Nav links */}
        <div style={{ overflowY: 'auto', padding: `${space[2]}px ${space[2]}px` }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => scrollTo(s.id)} style={{
              width: '100%', textAlign: 'left',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: `${space[1] + 2}px ${space[3]}px`,
              borderRadius: radius.sm, border: 'none',
              background: activeSection === s.id ? 'rgba(170,255,0,0.10)' : 'transparent',
              color: activeSection === s.id ? color.accent : color.t2,
              fontSize: font.size.sm, fontWeight: activeSection === s.id ? font.weight.semibold : font.weight.regular,
              cursor: 'pointer', fontFamily: f,
              transition: `background ${motion.default}`,
            }}>
              {s.label}
              {activeSection === s.id && <ChevronRight size={10} strokeWidth={2} />}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 'auto', padding: space[4],
          borderTop: `1px solid ${color.border}`,
          fontSize: 10, color: color.t3, fontFamily: f,
        }}>
          <div>tokens.ts</div>
          <div style={{ color: color.t3, marginTop: 2 }}>←→ #/design</div>
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, overflowY: 'auto', padding: `${space[8]}px ${space[8]}px ${space[12]}px` }}>

        {/* Page title */}
        <div style={{ marginBottom: space[10] }}>
          <h1 style={{ fontSize: 28, fontWeight: font.weight.bold, color: color.t1, letterSpacing: font.tracking.tight, margin: 0 }}>
            RoverHub Design System
          </h1>
          <p style={{ fontSize: font.size.lg, color: color.t2, marginTop: space[2], fontWeight: font.weight.regular }}>
            Visual tokens and component patterns for the LiveOps dashboard.
          </p>
        </div>

        {/* ── 1. Colors ── */}
        <Section id="colors" title="Colors">
          <Row label="Backgrounds">
            <ColorSwatch name="bg"        value={color.bg} />
            <ColorSwatch name="surface"   value={color.surface} />
            <ColorSwatch name="elevated"  value={color.elevated} />
            <ColorSwatch name="card"      value={color.card} />
            <ColorSwatch name="cardHover" value={color.cardHover} />
          </Row>
          <Row label="Borders">
            <ColorSwatch name="border"   value={color.border} />
            <ColorSwatch name="borderLt" value={color.borderLt} />
          </Row>
          <Row label="Text">
            <ColorSwatch name="t1 — Primary"   value={color.t1} />
            <ColorSwatch name="t2 — Secondary" value={color.t2} />
            <ColorSwatch name="t3 — Muted"     value={color.t3} />
          </Row>
          <Row label="Accent (Lime)">
            <ColorSwatch name="accent"       value={color.accent} />
            <ColorSwatch name="accentDim"    value="rgba(170,255,0,0.12)" />
            <ColorSwatch name="accentBorder" value="rgba(170,255,0,0.25)" />
          </Row>
          <Row label="Status">
            <ColorSwatch name="green"  value={color.green} />
            <ColorSwatch name="amber"  value={color.amber} />
            <ColorSwatch name="red"    value={color.red} />
            <ColorSwatch name="orange" value={color.orange} />
          </Row>
          <Row label="E-Stop">
            <ColorSwatch name="estop"       value={color.estop} />
            <ColorSwatch name="estopBorder" value={color.estopBorder} />
          </Row>
        </Section>

        {/* ── 2. Typography ── */}
        <Section id="typography" title="Typography">
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[3], maxWidth: 700 }}>
            <TypeSample label="3xl / bold"    size={font.size['3xl']} weight={font.weight.bold}     text="78%" />
            <TypeSample label="2xl / bold"    size={font.size['2xl']} weight={font.weight.bold}     text="2h 48m" />
            <TypeSample label="xl / bold"     size={font.size.xl}     weight={font.weight.bold}     text='Industrial Patrol — Sector 7B' />
            <TypeSample label="lg / semibold" size={font.size.lg}     weight={font.weight.semibold} text='Live View — RVR-01 "Atlas"' />
            <TypeSample label="md / semibold" size={font.size.md}     weight={font.weight.semibold} text='Dashboard  Robots  Missions' />
            <TypeSample label="sm / regular"  size={font.size.sm}     weight={font.weight.regular}  text='Waypoint 7 of 12 · Inspect Valve Cluster' />
            <TypeSample label="xs / bold + upper" size={font.size.xs} weight={font.weight.bold}     tracking={font.tracking.widest} text='Current Task' />
            <TypeSample label="2xs / bold + upper" size={font.size['2xs']} weight={font.weight.bold} tracking={font.tracking.wider} text='Speed · Stability · CPU/Edge' />
          </div>
        </Section>

        {/* ── 3. Spacing ── */}
        <Section id="spacing" title="Spacing (4px grid)">
          <Row>
            {([1,2,3,4,5,6,8,10,12] as const).map(k => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: space[1] }}>
                <div style={{ width: space[k], height: space[k], background: color.accent, borderRadius: 2 }} />
                <div style={{ fontSize: 9, color: color.t3, fontFamily: f }}>{space[k]}px</div>
                <div style={{ fontSize: 9, color: color.t3, fontFamily: "'Courier New', monospace" }}>space[{k}]</div>
              </div>
            ))}
          </Row>
        </Section>

        {/* ── 4. Buttons ── */}
        <Section id="buttons" title="Buttons">
          <Row label="Variants">
            <Btn label="Primary"  variant="primary" />
            <Btn label="Default"  variant="default" />
            <Btn label="Danger"   variant="danger" />
            <Btn label="Ghost"    variant="ghost" />
          </Row>
          <Row label="With Icons">
            <Btn label="Start"    variant="primary" icon={Play} />
            <Btn label="Settings" variant="default" icon={Settings} />
            <Btn label="E-Stop"   variant="danger"  icon={OctagonX} />
            <Btn label="Logs"     variant="ghost"   icon={ScrollText} />
          </Row>
          <Row label="Sizes">
            <Btn label="Small"    variant="default" size="sm" />
            <Btn label="Medium"   variant="default" size="md" />
            <Btn label="Large"    variant="default" size="lg" />
          </Row>
        </Section>

        {/* ── 5. Action Buttons ── */}
        <Section id="actions" title="Action Buttons (Command Bar)">
          <Row label="Full command row">
            <ActionBtn icon={Play}     label="Start"    variant="primary" />
            <ActionBtn icon={Pause}    label="Pause" />
            <ActionBtn icon={Anchor}   label="Dock" />
            <ActionBtn icon={Camera}   label="Snapshot" />
            <ActionBtn icon={Mic2}     label="Speak" />
            <ActionBtn icon={OctagonX} label="E-Stop"   variant="danger" />
          </Row>
          <Row label="Height token">
            <TokenChip name="layout.actionBtnHeight" value={`${layout.actionBtnHeight}px`} />
          </Row>
        </Section>

        {/* ── 6. Badges & Status ── */}
        <Section id="badges" title="Badges & Status">
          <Row label="Status badges">
            <StatusBadge label="Active"     level="ok" />
            <StatusBadge label="Good"       level="good" />
            <StatusBadge label="Warning"    level="warning" />
            <StatusBadge label="Error"      level="error" />
            <StatusBadge label="Offline"    level="offline" />
            <StatusBadge label="Excellent"  level="excellent" />
            <StatusBadge label="Strong"     level="strong" />
            <StatusBadge label="Degraded"   level="degraded" />
          </Row>
          <Row label="Task badge">
            {['Patrol','Escort','Inspect','Return'].map(t => (
              <span key={t} style={{
                fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.accent,
                background: color.accentDim, border: `1px solid ${color.accentBorder}`,
                borderRadius: radius.xs, padding: `1px ${space[2]}px`, fontFamily: f,
              }}>{t}</span>
            ))}
          </Row>
          <Row label="Bottom bar status items">
            <StatusItem label="Motors"  value="OK" ok />
            <StatusItem label="Sensors" value="OK" ok />
            <StatusItem label="Cameras" value="OK" ok />
            <StatusItem label="LiDAR"   value="Active" ok />
            <StatusItem label="Thermal" value="Fault" ok={false} />
          </Row>
          <Row label="Connection quality">
            <div style={{ background: color.card, border: `1px solid ${color.border}`, borderRadius: radius.md, padding: `${space[3]}px ${space[4]}px`, display: 'flex', flexDirection: 'column', gap: space[2] }}>
              <ConnItem label="Edge Bridge" value="Strong"    level="strong" />
              <ConnItem label="5G Link"     value="Excellent" level="excellent" />
              <ConnItem label="DDS"         value="Offline"   level="offline" />
            </div>
          </Row>
        </Section>

        {/* ── 7. Telemetry Pills ── */}
        <Section id="pills" title="Telemetry Pills (Glassmorphism)">
          <div style={{ position: 'relative', borderRadius: radius.lg, overflow: 'hidden', height: 120 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #1a1f27, #0b0e12)' }} />
            <div style={{ position: 'absolute', top: space[3], left: space[3], display: 'flex', gap: space[1] + 2, flexWrap: 'wrap' }}>
              <TelPill label="Speed"       value="1.2 m/s" />
              <TelPill label="Stability"   value="Good"      dot={color.accent} />
              <TelPill label="Terrain"     value="Gravel"    dot={color.amber} />
              <TelPill label="Obstacles"   value="3 Detected" dot={color.amber} />
              <TelPill label="Temperature" value="42 °C"     dot={color.amber} />
              <TelPill label="CPU/Edge"    value="63%"       dot={color.accent} />
            </div>
          </div>
          <Row label="Token">
            <TokenChip name="glass.overlay.backdropFilter" value="blur(18px) saturate(160%)" />
            <TokenChip name="glass.overlay.background"     value="rgba(8,8,10,0.48)" />
          </Row>
        </Section>

        {/* ── 8. Segmented Controls ── */}
        <Section id="segments" title="Segmented Controls">
          <Row label="Control Mode">
            <SegControl options={['Manual','Assisted','Auto']} active="Manual" />
            <SegControl options={['Manual','Assisted','Auto']} active="Assisted" />
            <SegControl options={['Manual','Assisted','Auto']} active="Auto" />
          </Row>
          <Row label="Two-option">
            <SegControl options={['Day','Night']} active="Day" />
          </Row>
        </Section>

        {/* ── 9. Progress & Gauges ── */}
        <Section id="progress" title="Progress & Gauges">
          <Row label="Progress bars">
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], width: '100%', maxWidth: 400 }}>
              <ProgressBar value={58} />
              <ProgressBar value={78} color={color.accent} />
              <ProgressBar value={32} color={color.amber} />
              <ProgressBar value={15} color={color.red} />
            </div>
          </Row>
          <Row label="Circular gauges">
            <CircleGauge value={78} label="Battery" />
            <CircleGauge value={63} unit="%" label="CPU" />
            <CircleGauge value={32} unit="%" label="Storage" />
          </Row>
        </Section>

        {/* ── 10. Navigation ── */}
        <Section id="nav" title="Navigation">
          <Row label="Workspace nav pills">
            <NavPill label="Dashboard" active />
            <NavPill label="Robots" />
            <NavPill label="Missions" />
            <NavPill label="Data" />
            <NavPill label="System" />
          </Row>
        </Section>

        {/* ── 11. Camera Tabs ── */}
        <Section id="camera" title="Camera Mode Tabs">
          <Row>
            <div style={{ display: 'flex', gap: 2, background: color.surface, padding: space[1], borderRadius: radius.sm + 2 }}>
              <CamTab icon={Sun}   label="Day"     active />
              <CamTab icon={Eye}   label="IR" />
              <CamTab icon={Scan}  label="LiDAR" />
              <CamTab icon={Flame} label="Thermal" />
            </div>
          </Row>
        </Section>

        {/* ── 12. Alerts ── */}
        <Section id="alerts" title="Alerts & Banners">
          <Row>
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
              <AlertBanner level="info"     message="Bridge reconnecting — commands queued." />
              <AlertBanner level="warning"  message="Battery below 35% — return to dock recommended." />
              <AlertBanner level="error"    message="DDS connection lost — wired Ethernet required." />
              <AlertBanner level="critical" message="E-Stop Active — Soft stop engaged. Do not re-enable remotely." />
            </div>
          </Row>
        </Section>

        {/* ── 13. Cards & Panels ── */}
        <Section id="cards" title="Cards & Panels">
          <Row>
            <CardSurface title="Power & Connection">
              <div style={{ display: 'flex', alignItems: 'center', gap: space[4] }}>
                <CircleGauge value={78} label="Battery" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
                  <div style={{ fontSize: font.size['3xl'], fontWeight: font.weight.bold, color: color.t1 }}>2h 48m</div>
                  <div style={{ fontSize: font.size.sm, color: color.t3 }}>Est. Runtime</div>
                  <ConnItem label="Edge Bridge" value="Strong"    level="strong" />
                  <ConnItem label="5G Link"     value="Excellent" level="excellent" />
                </div>
              </div>
            </CardSurface>
            <CardSurface title="Robot Status">
              <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: font.size.sm, color: color.t3, fontFamily: f }}>State</span>
                  <StatusBadge label="Active" level="ok" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: font.size.sm, color: color.t3, fontFamily: f }}>Mode</span>
                  <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1, fontFamily: f }}>Manual</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: font.size.sm, color: color.t3, fontFamily: f }}>Unit ID</span>
                  <span style={{ fontSize: font.size.sm, color: color.t2, fontFamily: f }}>RVR-01-A7C9</span>
                </div>
              </div>
            </CardSurface>
          </Row>
        </Section>

        {/* ── 14. Indicators ── */}
        <Section id="indicators" title="Indicators">
          <Row label="Live / Recording">
            <LiveDot color={color.red} label="REC" time="00:09:46" />
            <LiveDot color={color.accent} label="LIVE" time="12:04:31" />
            <LiveDot color={color.amber} label="PAUSED" time="--:--:--" />
          </Row>
          <Row label="Status dots">
            {[
              { clr: color.accent, label: 'Nominal' },
              { clr: color.amber,  label: 'Warning' },
              { clr: color.red,    label: 'Fault' },
              { clr: color.t3,     label: 'Offline' },
            ].map(({ clr, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: space[2], fontFamily: f }}>
                <span style={{ width: 8, height: 8, borderRadius: radius.full, background: clr, display: 'inline-block', boxShadow: `0 0 6px ${clr}88` }} />
                <span style={{ fontSize: font.size.sm, color: color.t2 }}>{label}</span>
              </div>
            ))}
          </Row>
          <Row label="REC dot animation">
            <TokenChip name="animation" value="rec-pulse 1.4s ease-in-out infinite" />
          </Row>
        </Section>

        {/* ── 15. Mission Presets ── */}
        <Section id="presets" title="Mission Preset Buttons">
          <Row>
            <PresetBtn icon={Navigation} label="Patrol" />
            <PresetBtn icon={Users}      label="Escort" />
            <PresetBtn icon={ScanSearch} label="Inspect" />
            <PresetBtn icon={RotateCcw}  label="Return" />
            <PresetBtn icon={Shield}     label="Guard" />
            <PresetBtn icon={Zap}        label="Sprint" />
          </Row>
        </Section>

        {/* ── 16. Glassmorphism ── */}
        <Section id="glass" title="Glassmorphism">
          <Row label="overlay (telemetry, REC, map inset, media controls)">
            <div style={{ position: 'relative', width: 360, height: 140, borderRadius: radius.lg, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #1a2030 0%, #0d1520 50%, #101808 100%)' }} />
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 30% 60%, rgba(170,255,0,0.08) 0%, transparent 60%)' }} />
              <div style={{ position: 'absolute', top: space[3], left: space[3], ...glass.overlay, borderRadius: radius.md, padding: `${space[3]}px ${space[4]}px` }}>
                <div style={{ fontSize: font.size.sm, color: color.t1, fontFamily: f, fontWeight: font.weight.semibold }}>glass.overlay</div>
                <div style={{ fontSize: font.size.xs, color: color.t3, fontFamily: f, marginTop: 2 }}>blur(18px) saturate(160%)</div>
              </div>
              <div style={{ position: 'absolute', bottom: space[3], right: space[3], ...glass.heavy, borderRadius: radius.md, padding: `${space[3]}px ${space[4]}px` }}>
                <div style={{ fontSize: font.size.sm, color: color.t1, fontFamily: f, fontWeight: font.weight.semibold }}>glass.heavy</div>
                <div style={{ fontSize: font.size.xs, color: color.t3, fontFamily: f, marginTop: 2 }}>blur(24px) saturate(180%)</div>
              </div>
            </div>
          </Row>
        </Section>

        {/* ── 17. Token Reference ── */}
        <Section id="tokens" title="Token Reference">
          <Row label="Key measurements">
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
              {[
                ['layout.topBarHeight',       `${layout.topBarHeight}px`],
                ['layout.sidebarWidth',        `${layout.sidebarWidth}px`],
                ['layout.bottomBarHeight',     `${layout.bottomBarHeight}px`],
                ['layout.currentTaskHeight',   `${layout.currentTaskHeight}px`],
                ['layout.actionBtnHeight',     `${layout.actionBtnHeight}px`],
                ['layout.videoInset',          `${layout.videoInset}px`],
                ['radius.sm',                  `${radius.sm}px — buttons, inputs`],
                ['radius.md',                  `${radius.md}px — cards, map inset`],
                ['radius.lg',                  `${radius.lg}px — panels`],
                ['font.family',                font.family],
              ].map(([k, v]) => (
                <TokenChip key={k} name={k} value={v} />
              ))}
            </div>
          </Row>
          <Row label="Import path">
            <div style={{
              background: color.card, border: `1px solid ${color.border}`, borderRadius: radius.sm,
              padding: `${space[3]}px ${space[4]}px`,
              fontFamily: "'Courier New', monospace", fontSize: font.size.md, color: color.t2,
            }}>
              import &#123; color, font, space, radius, shadow, glass, layout &#125; from '@/design-system/tokens'
            </div>
          </Row>
        </Section>

      </main>
    </div>
  )
}
