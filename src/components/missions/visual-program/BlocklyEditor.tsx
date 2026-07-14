import { useEffect, useRef } from 'react'
import * as Blockly from 'blockly/core'
import * as BlocklyEn from 'blockly/msg/en'
import type { MissionWaypoint } from '@/types'
import { defineBlocks, TOOLBOX } from './blocklyBlocks'
import { compileBlocksToWaypoints, type CompiledBlock } from './compileProgram'

// blockly/core ships with no locale loaded — Blockly.Msg strings (used
// internally for e.g. ARIA labels, not just visible UI text) are undefined
// without this, which crashes Blockly.inject() before anything renders.
Blockly.setLocale(BlocklyEn as unknown as { [key: string]: string })
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

function walkProgram(workspace: Blockly.WorkspaceSvg): CompiledBlock[] {
  const startBlocks = workspace.getBlocksByType('rh_start', false)
  const blocks: CompiledBlock[] = []
  if (startBlocks.length === 0) return blocks

  let current = startBlocks[0].getNextBlock()
  while (current) {
    const fields: Record<string, string | number> = {}
    for (const input of current.inputList) {
      for (const field of input.fieldRow) {
        if (field.name) fields[field.name] = field.getValue()
      }
    }
    blocks.push({ type: current.type, fields })
    current = current.getNextBlock()
  }
  return blocks
}

function seedDefaultProgram(workspace: Blockly.WorkspaceSvg) {
  const start = workspace.newBlock('rh_start')
  start.initSvg()
  start.render()
  start.moveBy(30, 30)
}

/**
 * Visual Program mission authoring (Blockly canvas) — an alternate way to
 * author the same Mission a waypoint-editor session would, per the reference
 * app's block-based scripting. Compiles to the same waypoint/action shape
 * (compileProgram.ts) rather than to executable code — we don't need a
 * programming-language output, just a route.
 */
export function BlocklyEditor({
  initialState, onCompile,
}: {
  initialState?: string
  onCompile: (waypoints: MissionWaypoint[], state: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const workspace = Blockly.inject(containerRef.current, {
      toolbox: TOOLBOX,
      trashcan: true,
      zoom: { controls: true, wheel: true, startScale: 0.9 },
      theme: THEME,
    })

    if (initialState) {
      try {
        Blockly.serialization.workspaces.load(JSON.parse(initialState), workspace)
      } catch {
        seedDefaultProgram(workspace)
      }
    } else {
      seedDefaultProgram(workspace)
    }

    function handleChange() {
      const blocks = walkProgram(workspace)
      const waypoints = compileBlocksToWaypoints(blocks)
      const state = JSON.stringify(Blockly.serialization.workspaces.save(workspace))
      onCompile(waypoints, state)
    }
    workspace.addChangeListener(handleChange)
    handleChange()

    return () => {
      workspace.removeChangeListener(handleChange)
      workspace.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={containerRef} style={{ flex: 1, minHeight: 0, background: '#0B0B0D' }} />
}
