/**
 * A shell is exactly one viewport tall, and on a phone that is `100dvh`, not
 * `100vh`: `vh` is the *largest* viewport, so with the browser's own toolbars
 * showing, a `100vh` shell is taller than the window and the bottom of it --
 * the LiveOps dock, and the E-Stop in it -- sits below the fold with nothing
 * to scroll, since the shell is `overflow: hidden`. `dvh` tracks the toolbars.
 *
 * It is a class rather than two `style` entries because a React style object
 * cannot hold two declarations for one property, and the `vh` line is the
 * fallback for an engine that does not know `dvh` (Safari < 15.4, Chrome < 108).
 *
 * Shared by both shells: the org console is reachable on a handheld too, so a
 * fix that lived only in SiteShell would leave half the console cut off.
 */
export const VIEWPORT_CLASS = 'rh-viewport'
export const VIEWPORT_CSS = `.${VIEWPORT_CLASS}{height:100vh;height:100dvh;}`
