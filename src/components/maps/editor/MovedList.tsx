import { useTranslation } from 'react-i18next'
import { Button } from '@/components/kit'
import { color, font, radius, space } from '@/design-system/tokens'
import type { MovedBlob } from '@/types/mapPipeline'
import type { BlobDecision } from './editSession'

/** "0.09" under a square metre, "1.4" above. */
export function areaText(m2: number): string {
  return m2 < 1 ? m2.toFixed(2) : m2.toFixed(1)
}

/**
 * The review list (option A's right column): every spot the moving-object
 * check marked, biggest first. Picking one zooms the map to it; Remove and Keep
 * stage a decision that Save sends; "Remove all" stages every spot not kept.
 */
export function MovedList({ blobs, state, decisions, selectedId, onSelect, onDecide, onRemoveAll, busy }: {
  blobs: readonly MovedBlob[]
  /** Why there is no list, when there is none. */
  state: { kind: 'ready' } | { kind: 'notRun' } | { kind: 'error'; error: string }
  decisions: Readonly<Record<string, BlobDecision>>
  selectedId: string | null
  onSelect: (id: string) => void
  onDecide: (id: string, decision: BlobDecision | null) => void
  onRemoveAll: () => void
  busy: boolean
}) {
  const { t } = useTranslation()
  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }
  const open = blobs.filter((b) => decisions[b.id] !== 'keep' && decisions[b.id] !== 'remove').length
  const removable = blobs.filter((b) => decisions[b.id] !== 'keep').length

  return (
    <section aria-label={t('missions.maps.editor.moved.title')} style={{
      display: 'flex', flexDirection: 'column', gap: space[3], minHeight: 0, minWidth: 0,
      padding: space[3], borderRadius: radius.lg, background: color.hover,
    }}>
      <h3 style={{ margin: 0, fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1, display: 'flex', gap: space[2], alignItems: 'baseline' }}>
        {t('missions.maps.editor.moved.title')}
        {state.kind === 'ready' && <span style={{ color: color.t3, fontWeight: font.weight.medium, fontVariantNumeric: 'tabular-nums' }}>{blobs.length}</span>}
      </h3>
      {state.kind === 'notRun' && <p style={note}>{t('missions.maps.editor.moved.notRun')}</p>}
      {state.kind === 'error' && <p role="alert" style={{ ...note, color: color.red }}>{t('missions.maps.editor.moved.loadFailed', { error: state.error })}</p>}
      {state.kind === 'ready' && blobs.length === 0 && <p style={note}>{t('missions.maps.editor.moved.none')}</p>}
      {blobs.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2, overflowY: 'auto', minHeight: 0, flex: 1 }}>
          {blobs.map((b, k) => {
            const d = decisions[b.id]
            const selected = b.id === selectedId
            return (
              <li key={b.id} data-blob={b.id} style={{
                display: 'grid', gap: space[1], padding: `${space[2]}px ${space[2]}px`, borderRadius: radius.md,
                background: selected ? color.accentDim : 'transparent',
              }}>
                <button
                  type="button" aria-pressed={selected} onClick={() => onSelect(b.id)}
                  style={{
                    border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer',
                    display: 'flex', gap: space[2], alignItems: 'flex-start', fontFamily: font.family, color: color.t1,
                  }}
                >
                  <span aria-hidden style={{
                    width: 8, height: 8, borderRadius: radius.full, marginTop: 5, flexShrink: 0,
                    background: d === 'keep' ? color.t3 : color.amber, opacity: d === 'remove' ? 0.4 : 1,
                  }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: font.size.md, fontWeight: font.weight.semibold, textDecoration: d === 'remove' ? 'line-through' : undefined }}>
                      {t('missions.maps.editor.moved.spot', { n: k + 1 })}
                    </span>
                    <span style={{ display: 'block', fontSize: font.size.sm, color: color.t2, fontVariantNumeric: 'tabular-nums' }}>
                      {t('missions.maps.editor.moved.detail', { area: areaText(b.area_m2), times: b.pass_through })}
                    </span>
                  </span>
                </button>
                <div style={{ display: 'flex', gap: space[1], alignItems: 'center', paddingLeft: space[4] }}>
                  {d ? (
                    <>
                      <span style={{ fontSize: font.size.sm, color: d === 'remove' ? color.amber : color.t2, flex: 1 }}>
                        {d === 'remove' ? t('missions.maps.editor.moved.willRemove') : t('missions.maps.editor.moved.willKeep')}
                      </span>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDecide(b.id, null)}>{t('missions.maps.editor.moved.undo')}</Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="primary" disabled={busy} onClick={() => onDecide(b.id, 'remove')}>{t('missions.maps.editor.moved.remove')}</Button>
                      <Button size="sm" disabled={busy} onClick={() => onDecide(b.id, 'keep')}>{t('missions.maps.editor.moved.keep')}</Button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {blobs.length > 0 && (
        <>
          <Button variant="primary" disabled={busy || open === 0} onClick={onRemoveAll}>
            {t('missions.maps.editor.moved.removeAll', { count: removable })}
          </Button>
          <p style={{ ...note, fontSize: font.size.xs }}>{t('missions.maps.editor.moved.hint')}</p>
        </>
      )}
    </section>
  )
}
