/** Lets something outside Settings (the account menu's Change password) open
 * it on a particular section. Read once by the next Settings page to mount. */
let pending: string | null = null

export function requestSettingsSection(section: string): void {
  pending = section
}

export function takeRequestedSettingsSection(): string | null {
  const s = pending
  pending = null
  return s
}
