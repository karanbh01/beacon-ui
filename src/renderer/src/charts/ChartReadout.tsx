import type { ReactElement } from 'react'
import type { Readout } from './readout'

/**
 * The popup under the pointer, as py-beacon's interactive charts draw it:
 * the date, then a row of swatch, name and value per series.
 */
export function ChartReadout({ readout }: { readout: Readout | null }): ReactElement | null {
  if (readout === null) return null
  const shiftX = readout.flipX ? 'calc(-100% - 12px)' : '12px'
  const shiftY = readout.flipY ? 'calc(-100% - 12px)' : '12px'
  return (
    <div
      className="chart-readout"
      style={{
        left: readout.x,
        top: readout.y,
        transform: `translate(${shiftX}, ${shiftY})`
      }}
      aria-hidden="true"
    >
      <div className="chart-readout-date">{readout.date}</div>
      {readout.rows.map((row) => (
        <div key={row.key} className="chart-readout-row">
          <span className="chart-readout-swatch" style={{ background: row.colour }} />
          <span>{row.label}</span>
          <span className="chart-readout-value">{row.value}</span>
        </div>
      ))}
    </div>
  )
}
