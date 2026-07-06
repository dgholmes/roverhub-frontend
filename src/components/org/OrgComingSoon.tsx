import { color, font, space } from '@/design-system/tokens'

/** Placeholder for org-level pages not yet built — present and labeled
 * rather than a missing nav entry (docs/05-ui-ux.md §18.3 R2/Future pattern). */
export function OrgComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: space[2], color: color.t3,
    }}>
      <div style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: color.t2 }}>{title}</div>
      <div style={{ fontSize: font.size.sm, maxWidth: 380, textAlign: 'center' }}>{description}</div>
      <div style={{ fontSize: font.size.xs, color: color.t3, marginTop: space[2] }}>Coming soon.</div>
    </div>
  )
}
