import { useTranslation } from 'react-i18next'
import { BoxSelect, Circle, Eraser, Hand, Minus, Paintbrush, Plus, Square, Trash2, Undo2 } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { BRUSH_SIZES } from './gridEdit'
import type { EditorMode, EditorTool } from './FloorEditCanvas'

/** One rail button: icon over a short label, tinted when on. */
export function RailButton({ icon: Icon, label, title, pressed, disabled, onClick, tone = 'accent' }: {
  icon: React.ElementType
  label: string
  title?: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  tone?: 'accent' | 'red'
}) {
  return (
    <button
      type="button" aria-pressed={pressed} title={title ?? label} disabled={disabled} onClick={onClick}
      style={{
        border: 'none', borderRadius: radius.md, padding: `${space[2]}px ${space[1]}px`, width: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontFamily: font.family,
        fontSize: font.size.xs, fontWeight: font.weight.semibold, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        background: pressed ? (tone === 'red' ? color.redBg : color.accentDim) : 'transparent',
        color: pressed ? (tone === 'red' ? color.red : color.accent) : color.t2,
      }}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden />
      {label}
    </button>
  )
}

const railStyle: React.CSSProperties = {
  width: 84, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: space[1], padding: space[1],
  borderRadius: radius.lg, background: color.hover, alignSelf: 'start',
}

const divider = <span aria-hidden style={{ height: space[2] }} />

/**
 * The flat editor's tools (option A's left rail): Move, Erase, Restore; brush
 * or box; size; Undo. Erase and Restore are off until there is a planning grid
 * to paint.
 */
export function FlatToolRail({ tool, onTool, canPaint, canUndo, onUndo, res }: {
  tool: EditorTool
  onTool: (tool: EditorTool) => void
  canPaint: boolean
  canUndo: boolean
  onUndo: () => void
  /** Metres per cell, for the size in centimetres. */
  res: number
}) {
  const { t } = useTranslation()
  const mode = (m: EditorMode) => onTool({ ...tool, mode: m })
  const sizeIndex = Math.max(0, BRUSH_SIZES.indexOf(tool.size as typeof BRUSH_SIZES[number]))
  const step = (d: number) => {
    const next = BRUSH_SIZES[Math.min(BRUSH_SIZES.length - 1, Math.max(0, sizeIndex + d))]
    onTool({ ...tool, size: next })
  }
  return (
    <div role="toolbar" aria-orientation="vertical" aria-label={t('missions.maps.editor.tools.aria')} style={railStyle}>
      <RailButton icon={Hand} label={t('missions.maps.editor.tools.move')} title={t('missions.maps.editor.tools.moveHint')}
        pressed={tool.mode === 'move'} onClick={() => mode('move')} />
      <RailButton icon={Eraser} label={t('missions.maps.editor.tools.erase')} title={t('missions.maps.editor.tools.eraseHint')}
        pressed={tool.mode === 'erase'} disabled={!canPaint} onClick={() => mode('erase')} />
      <RailButton icon={Paintbrush} label={t('missions.maps.editor.tools.restore')} title={t('missions.maps.editor.tools.restoreHint')}
        pressed={tool.mode === 'restore'} disabled={!canPaint} onClick={() => mode('restore')} tone="red" />
      {divider}
      <div role="group" aria-label={t('missions.maps.editor.tools.shapeAria')} style={{ display: 'grid', gap: space[1] }}>
        <RailButton icon={Circle} label={t('missions.maps.editor.tools.brush')} pressed={tool.shape === 'brush'}
          disabled={!canPaint} onClick={() => onTool({ ...tool, shape: 'brush' })} />
        <RailButton icon={Square} label={t('missions.maps.editor.tools.box')} pressed={tool.shape === 'box'}
          disabled={!canPaint} onClick={() => onTool({ ...tool, shape: 'box' })} />
      </div>
      {divider}
      <div style={{ display: 'grid', justifyItems: 'center', gap: 2, opacity: canPaint && tool.shape === 'brush' ? 1 : 0.45 }}>
        <span style={{ fontSize: font.size['2xs'], fontWeight: font.weight.bold, letterSpacing: font.tracking.widest, textTransform: 'uppercase', color: color.t3 }}>
          {t('missions.maps.editor.tools.size')}
        </span>
        <span data-testid="brush-size" style={{ fontSize: font.size.sm, color: color.t1, fontVariantNumeric: 'tabular-nums' }}>
          {t('missions.maps.editor.tools.sizeValue', { cm: Math.round(tool.size * res * 100) })}
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          {([[-1, Minus, 'smaller'], [1, Plus, 'larger']] as const).map(([d, Icon, key]) => (
            <button
              key={key} type="button" aria-label={t(`missions.maps.editor.tools.${key}`)} title={t(`missions.maps.editor.tools.${key}`)}
              disabled={!canPaint || tool.shape !== 'brush' || (d < 0 ? sizeIndex === 0 : sizeIndex === BRUSH_SIZES.length - 1)}
              onClick={() => step(d)}
              style={{
                border: 'none', borderRadius: radius.sm, width: 28, height: 24, display: 'grid', placeItems: 'center',
                background: color.card, color: color.t1, cursor: 'pointer',
              }}
            >
              <Icon size={14} strokeWidth={1.75} aria-hidden />
            </button>
          ))}
        </div>
      </div>
      {divider}
      <RailButton icon={Undo2} label={t('missions.maps.editor.tools.undo')} disabled={!canUndo} onClick={onUndo} />
    </div>
  )
}

/** The 3D tab's tools: select a box, its height band, delete the points in it. */
export function SceneToolRail({ selecting, onSelecting, band, onBand, canDelete, onDelete, onClear }: {
  selecting: boolean
  onSelecting: (on: boolean) => void
  band: [number, number]
  onBand: (band: [number, number]) => void
  canDelete: boolean
  onDelete: () => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  const field = (k: 0 | 1, label: string) => (
    <label style={{ display: 'grid', gap: 2, justifyItems: 'center' }}>
      <span style={{ fontSize: font.size.xs, color: color.t2 }}>{label}</span>
      <input
        type="number" step={0.1} min={-0.15} max={3.9} value={band[k]}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (!Number.isFinite(v)) return
          onBand(k === 0 ? [v, band[1]] : [band[0], v])
        }}
        style={{
          width: 64, border: 'none', borderRadius: radius.sm, background: color.card, color: color.t1, padding: '4px 6px',
          fontFamily: font.family, fontSize: font.size.sm, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
        }}
      />
    </label>
  )
  return (
    <div role="toolbar" aria-orientation="vertical" aria-label={t('missions.maps.editor.tools.aria')} style={railStyle}>
      <RailButton icon={BoxSelect} label={t('missions.maps.editor.scene.select')} title={t('missions.maps.editor.scene.selectHint')}
        pressed={selecting} onClick={() => onSelecting(!selecting)} />
      {divider}
      <span style={{ fontSize: font.size['2xs'], fontWeight: font.weight.bold, letterSpacing: font.tracking.widest, textTransform: 'uppercase', color: color.t3, textAlign: 'center' }}>
        {t('missions.maps.editor.scene.height')}
      </span>
      {field(1, t('missions.maps.editor.scene.to'))}
      {field(0, t('missions.maps.editor.scene.from'))}
      {divider}
      <RailButton icon={Trash2} label={t('missions.maps.editor.scene.deleteBox')} disabled={!canDelete} onClick={onDelete} tone="red" pressed={canDelete} />
      <RailButton icon={Undo2} label={t('missions.maps.editor.scene.clearBox')} disabled={!canDelete} onClick={onClear} />
    </div>
  )
}
