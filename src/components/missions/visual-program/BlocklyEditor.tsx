import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as Blockly from 'blockly/core'
import * as BlocklyEn from 'blockly/msg/en'
import * as BlocklyKo from 'blockly/msg/ko'
import { useTranslation } from 'react-i18next'
import { font } from '@/design-system/tokens'
import { programBlocksFrom, type BlockLike } from '@/missions/program/programBlocks'
import type { ProgramEditorHandle } from '@/missions/program/useProgramRun'
import type { ProgramBlock } from '@/missions/program/types'
import { BLOCK_COLOURS, type BlockCategory } from './blockSpecs'
import { defineBlocks, toolbox } from './blocklyBlocks'
import { shouldSaveProgramState } from '@/missions/authoring'

type BlocklyMsgs = { [key: string]: string }

// blockly/core ships with no locale loaded — Blockly.Msg strings (used
// internally for e.g. ARIA labels, not just visible UI text) are undefined
// without this, which crashes Blockly.inject() before anything renders.
// English is always loaded first so any key the Korean pack lacks falls back.
function applyBlocklyLocale(lng: string) {
  Blockly.setLocale(BlocklyEn as unknown as BlocklyMsgs)
  if (lng === 'ko') Blockly.setLocale(BlocklyKo as unknown as BlocklyMsgs)
}
defineBlocks()

const THEME = Blockly.Theme.defineTheme('roverhub', {
  name: 'roverhub',
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: '#0B0B0D',
    toolboxBackgroundColour: '#111115',
    toolboxForegroundColour: '#E8E8EA',
    flyoutBackgroundColour: '#17171A',
    flyoutForegroundColour: '#E8E8EA',
    flyoutOpacity: 1,
    scrollbarColour: '#252527',
    insertionMarkerColour: '#AAFF00',
    insertionMarkerOpacity: 0.5,
  },
})

/** Lucide-style glyphs for the category tiles (24-unit viewBox, stroked). */
const CATEGORY_GLYPH: Record<Exclude<BlockCategory, 'start'>, string> = {
  logic: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  motion: '<path d="M12 2v20M2 12h20"/><path d="m15 19-3 3-3-3M19 9l3 3-3 3M5 9l-3 3 3 3M9 5l3-3 3 3"/>',
  actions: '<path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z"/>',
  mode: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  multimedia: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
}

const glyphUrl = (paths: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`)}")`

/**
 * The toolbox as a rail of coloured tiles with the category name beneath,
 * like Dobot's block editor. Blockly paints each category's colour as a
 * left border and as the selected row's fill; both are replaced here by the
 * tile, with a quiet tint for the selected row (no stripes, no outlines).
 */
const RAIL_CSS = `
.rh-blockly .blocklyToolbox { padding: 8px 6px; background: #111115; }
.rh-blockly .blocklyMainBackground { stroke: none; }
/* The block a run is on: a bright ring, so it reads as "running" rather than faded. */
.rh-blockly .blocklyHighlighted > .blocklyPath { stroke: #AAFF00; stroke-width: 3px; }
.rh-blockly .blocklyToolboxCategoryGroup { gap: 2px; }
.rh-blockly .blocklyToolboxCategoryContainer { margin: 0; }
.rh-blockly .blocklyToolboxCategory {
  height: auto; line-height: normal; margin: 0; padding: 8px 4px; width: 68px; box-sizing: border-box;
  border: 0 !important; border-radius: 8px; background-color: transparent !important; cursor: pointer;
}
.rh-blockly .blocklyToolboxCategory:not(.blocklyToolboxSelected):hover { background-color: rgba(255,255,255,0.06) !important; }
.rh-blockly .blocklyToolboxCategory.blocklyToolboxSelected { background-color: rgba(255,255,255,0.10) !important; }
.rh-blockly .blocklyTreeRowContentContainer, .rh-blockly .blocklyToolboxCategory > div {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.rh-blockly .blocklyToolboxCategoryIcon {
  visibility: visible !important; width: 28px; height: 28px; border-radius: 8px;
  background-position: center; background-repeat: no-repeat; background-size: 16px;
}
.rh-blockly .blocklyToolboxCategoryLabel {
  font: 500 11px ${font.family}; color: #C9C9CE; padding: 0; text-align: center; white-space: normal; cursor: pointer;
}
.rh-blockly .blocklyToolboxSelected .blocklyToolboxCategoryLabel { color: #FFFFFF; }
${Object.entries(CATEGORY_GLYPH).map(([cat, paths]) =>
  `.rh-blockly .rh-cat-${cat} { background-color: ${BLOCK_COLOURS[cat as BlockCategory]}; background-image: ${glyphUrl(paths)}; }`).join('\n')}
`

/** The program as plain data plus how many canvas blocks hang loose. */
function readProgram(workspace: Blockly.WorkspaceSvg): { blocks: ProgramBlock[]; detached: number } {
  const start = workspace.getBlocksByType('rh_start', false)[0] ?? null
  const { blocks, visited } = programBlocksFrom(start as unknown as BlockLike | null)
  return { blocks, detached: Math.max(0, workspace.getAllBlocks(false).length - visited) }
}

function seedDefaultProgram(workspace: Blockly.WorkspaceSvg) {
  const start = workspace.newBlock('rh_start')
  start.initSvg()
  start.render()
  start.moveBy(30, 30)
}

/**
 * Visual Program mission authoring (Blockly canvas). The mission's program is
 * the serialised workspace, reported through `onState`; nothing is compiled
 * into waypoints. (A compile step used to dead-reckon a route from (0, 0) out
 * of the relative move blocks. That route corresponded to no real place, was
 * checked against no-go zones as if it did, and made the backend answer 422,
 * which refuses a program that carries waypoints. It is gone: a program has no
 * map frame.)
 */
export const BlocklyEditor = forwardRef<ProgramEditorHandle, {
  initialState?: string
  /** The serialised workspace, on a real edit and to seed a program that has none. */
  onState: (state: string) => void
  /** The program after every edit (and on open), for the run bar's checks. */
  onProgram?: (blocks: ProgramBlock[], detached: number) => void
}>(function BlocklyEditor({ initialState, onState, onProgram }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null)
  const onProgramRef = useRef(onProgram)
  onProgramRef.current = onProgram

  useImperativeHandle(ref, () => ({
    programBlocks: () => (workspaceRef.current ? readProgram(workspaceRef.current).blocks : null),
    detachedCount: () => (workspaceRef.current ? readProgram(workspaceRef.current).detached : 0),
    highlight(blockId) {
      const ws = workspaceRef.current
      if (!ws) return
      // A block deleted mid-run is simply not highlighted.
      if (blockId && !ws.getBlockById(blockId)) return
      ws.highlightBlock(blockId)
    },
  }), [])
  // Block labels are read when a block is created, so a language change
  // re-injects the workspace (restored from the latest saved state).
  const { i18n } = useTranslation()
  const lng = i18n.language

  useEffect(() => {
    if (!containerRef.current) return
    applyBlocklyLocale(lng)
    const workspace = Blockly.inject(containerRef.current, {
      toolbox: toolbox(),
      trashcan: true,
      zoom: { controls: true, wheel: true, startScale: 0.9 },
      theme: THEME,
      toolboxPosition: 'start',
    })
    workspaceRef.current = workspace

    // Loading or seeding the canvas is not an edit: Blockly fires its events
    // asynchronously, so without this they would arrive after the listener
    // below and report a change on their own.
    let hasProgram = false
    Blockly.Events.disable()
    try {
      if (initialState) {
        try {
          Blockly.serialization.workspaces.load(JSON.parse(initialState), workspace)
          hasProgram = true
        } catch {
          seedDefaultProgram(workspace)
        }
      } else {
        seedDefaultProgram(workspace)
      }
    } finally {
      Blockly.Events.enable()
    }

    function saveState() {
      onState(JSON.stringify(Blockly.serialization.workspaces.save(workspace)))
    }
    function report() {
      const { blocks, detached } = readProgram(workspace)
      onProgramRef.current?.(blocks, detached)
    }
    function handleChange(e: Blockly.Events.Abstract) {
      if (shouldSaveProgramState({ onOpen: false, isUiEvent: e.isUiEvent, hasProgram })) saveState()
      if (!e.isUiEvent) report()
    }
    workspace.addChangeListener(handleChange)
    if (shouldSaveProgramState({ onOpen: true, isUiEvent: false, hasProgram })) saveState()
    report()

    return () => {
      workspace.removeChangeListener(handleChange)
      workspaceRef.current = null
      workspace.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lng])

  return (
    <>
      <style>{RAIL_CSS}</style>
      <div ref={containerRef} className="rh-blockly" style={{ flex: 1, minHeight: 0, minWidth: 0, background: '#0B0B0D' }} />
    </>
  )
})
