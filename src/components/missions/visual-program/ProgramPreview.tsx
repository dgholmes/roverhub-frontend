import { useEffect, useRef } from 'react'
import * as Blockly from 'blockly/core'
import { useTranslation } from 'react-i18next'
// Importing the editor module also registers the block definitions.
import { applyBlocklyLocale, THEME } from './BlocklyEditor'

/**
 * A program mission's blocks, read-only: no toolbox, no dragging, no editing,
 * just the canvas zoomed to fit with the wheel and drag to look around. The
 * mission library shows this where a route mission shows its map, since a
 * program has no route to draw (2026-11-06).
 *
 * A state that does not parse shows an empty canvas rather than throwing.
 */
export function ProgramPreview({ state }: { state: string | undefined }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { i18n } = useTranslation()
  const lng = i18n.language

  useEffect(() => {
    if (!containerRef.current) return
    applyBlocklyLocale(lng)
    const workspace = Blockly.inject(containerRef.current, {
      readOnly: true,
      theme: THEME,
      zoom: { controls: false, wheel: true, startScale: 0.9, maxScale: 1.2, minScale: 0.3 },
      move: { scrollbars: false, drag: true, wheel: false },
    })
    Blockly.Events.disable()
    try {
      if (state) Blockly.serialization.workspaces.load(JSON.parse(state), workspace)
    } catch {
      workspace.clear()
    } finally {
      Blockly.Events.enable()
    }
    // Never enlarge a short program past its normal size.
    const fit = () => {
      Blockly.svgResize(workspace)
      workspace.zoomToFit()
      if (workspace.getScale() > 1) workspace.setScale(1)
      workspace.scrollCenter()
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(containerRef.current)
    return () => { ro.disconnect(); workspace.dispose() }
  }, [state, lng])

  return (
    <>
      {/* Blockly outlines its canvas by default; no hairlines here. */}
      <style>{'.rh-blockly-preview .blocklyMainBackground { stroke: none; }'}</style>
      <div ref={containerRef} className="rh-blockly rh-blockly-preview" style={{ position: 'absolute', inset: 0, background: '#0B0B0D' }} />
    </>
  )
}
