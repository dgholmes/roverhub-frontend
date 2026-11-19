/** Seconds as mm:ss, minutes unbounded: 980 -> "16:20", 3725 -> "62:05".
 * Survey times are seconds from the start of the recording, so this is how
 * far into the survey something happened, not a clock time. */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
