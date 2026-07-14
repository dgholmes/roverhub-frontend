import { color, font, radius, space } from '@/design-system/tokens'

/** Generic compact data table — shared shell for the joint diagnostics and
 * joint limits tables, which only differ in columns. */
export function DiagnosticsTable({
  columns, rows,
}: {
  columns: string[]
  rows: { key: string; cells: React.ReactNode[] }[]
}) {
  return (
    <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, overflow: 'hidden' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: `1.3fr repeat(${columns.length - 1}, 1fr)`,
        background: color.card, borderBottom: `1px solid ${color.border}`,
      }}>
        {columns.map((col) => (
          <div key={col} style={{
            padding: `${space[2]}px ${space[2]}px`, fontSize: font.size.xs, fontWeight: font.weight.bold,
            color: color.t3, letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            {col}
          </div>
        ))}
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          style={{
            display: 'grid', gridTemplateColumns: `1.3fr repeat(${columns.length - 1}, 1fr)`,
            borderBottom: `1px solid ${color.border}`,
          }}
        >
          {row.cells.map((cell, i) => (
            <div key={i} style={{ padding: `${space[2]}px ${space[2]}px`, fontSize: font.size.sm, color: color.t1 }}>
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
