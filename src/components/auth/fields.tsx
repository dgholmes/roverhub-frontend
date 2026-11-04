import { color, font, radius } from '@/design-system/tokens'

/** Text inputs for the sign-in, account and user forms -- the same look as the
 * Sites page's Create Site dialog. */
export const inputStyle: React.CSSProperties = {
  background: color.card, border: `1px solid ${color.border}`, borderRadius: radius.sm,
  color: color.t1, fontSize: font.size.md, padding: '8px 10px', fontFamily: font.family, width: '100%',
  boxSizing: 'border-box',
}

export function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} style={{ fontSize: font.size.sm, color: color.t2, marginBottom: 4, display: 'block' }}>{label}</label>
      {children}
    </div>
  )
}

/** A short status line under a form: the server's error, or what just happened. */
export function FormMessage({ tone, children }: { tone: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      style={{ fontSize: font.size.sm, lineHeight: 1.5, color: tone === 'error' ? color.red : color.t2 }}
    >
      {children}
    </div>
  )
}
