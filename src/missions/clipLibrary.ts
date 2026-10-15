/** Announcement clips made in the console, remembered per site in this
 * browser so they can be picked again. The audio itself lives in the
 * backend's clip store (AUDIO_CLIPS_DIR); this is only the list. */
export interface SavedClip { clip_id: string; label: string; text: string | null; created_at: string }

const key = (siteId: string) => `rh.clips.${siteId}`
const MAX = 50

export function loadClips(siteId: string): SavedClip[] {
  try {
    const raw = localStorage.getItem(key(siteId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed as SavedClip[] : []
  } catch {
    return []
  }
}

export function saveClip(siteId: string, clip: SavedClip): SavedClip[] {
  const next = [clip, ...loadClips(siteId).filter((c) => c.clip_id !== clip.clip_id)].slice(0, MAX)
  try { localStorage.setItem(key(siteId), JSON.stringify(next)) } catch { /* per-viewer convenience */ }
  return next
}
