import { color, font, radius } from '@/design-system/tokens'

/** The Data workspace's filter <select> (Media's robot filter, Surveys'). */
export const selectStyle: React.CSSProperties = {
  height: 32, padding: '0 10px', borderRadius: radius.sm, background: color.hover,
  border: 'none', color: color.t1, fontFamily: font.family, fontSize: font.size.md,
}
