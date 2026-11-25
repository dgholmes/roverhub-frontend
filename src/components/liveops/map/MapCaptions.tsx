import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * The map's one bottom-left caption column.
 *
 * Several layers have something to say about the floor they are drawing -- how
 * much of it the robot can walk, how thinly it was surveyed, how much of its
 * grid was never surveyed at all -- and each of them used to place its own card
 * at `left: 12, bottom: 12`. With one of them on that was fine. With two, they
 * were drawn on top of each other: measured in the running console on
 * 2026-11-25, the walkable card is 90 px tall and the survey-extent card 72,
 * and they overlapped by 38.
 *
 * The obvious fix -- give the second card a bigger `bottom` -- means one layer
 * carrying a magic number for another layer's height, in a card whose height
 * depends on how its sentence wraps and therefore on the language. So the
 * position belongs to neither of them: the map owns the column, the layers
 * hand it cards, and flex stacks them with a gap whatever they measure.
 *
 * `column-reverse` keeps the first card rendered at the bottom, where the
 * walkable notice has always been, and puts later ones above it.
 */
const CaptionHost = createContext<HTMLElement | null>(null)

export function MapCaptionsProvider({ host, children }: { host: HTMLElement | null; children: ReactNode }) {
  return <CaptionHost.Provider value={host}>{children}</CaptionHost.Provider>
}

/** The column itself. `ref` is a callback so the host element is state and the
 * portals below re-render once it exists; a plain ref would still be null on
 * the paint that mounts the layers. */
export const captionColumnStyle: React.CSSProperties = {
  position: 'absolute', left: 12, bottom: 12, zIndex: 1000, pointerEvents: 'none',
  display: 'flex', flexDirection: 'column-reverse', alignItems: 'flex-start', gap: 8,
  maxWidth: 'calc(100% - 24px)',
}

/**
 * One card in that column. Outside a provider -- a map pane that has not opted
 * in -- it renders where it stands, so a caption is never lost.
 */
export function MapCaption({ children }: { children: ReactNode }) {
  const host = useContext(CaptionHost)
  return host ? createPortal(children, host) : <>{children}</>
}
