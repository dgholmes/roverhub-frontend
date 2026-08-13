import * as React from 'react'

/**
 * Where Radix overlays should render.
 *
 * Radix portals to `document.body` by default. When any part of the app is
 * fullscreen, `document.body` sits *outside* the fullscreen subtree, so the
 * overlay is painted but never composited — invisible, while still taking
 * focus and swallowing pointer events. Symptoms differ per primitive and all
 * look like bugs in the app rather than in the portal:
 *
 *   - Dialog: a confirm that appears to freeze the console.
 *   - DropdownMenu: the robot selector opens onto nothing in fullscreen.
 *   - Select: the Fleet state filter does the same.
 *
 * Resolved per-open and shared by all three, so a primitive added later gets
 * the same behaviour by using this hook rather than by remembering a rule.
 * docs/audit/2026-08-12-ui-ux-audit.md A-03.
 */
export function usePortalContainer(): HTMLElement | undefined {
  const [container, setContainer] = React.useState<HTMLElement | undefined>(undefined)
  React.useEffect(() => {
    const sync = () => setContainer((document.fullscreenElement as HTMLElement | null) ?? undefined)
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  return container
}
