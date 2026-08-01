import type { ReactElement } from 'react'
import { correlationPosition, heatColor, heatTextColor } from './heatmap'
import './CorrelationHeatmap.css'

export interface CorrelationHeatmapProps {
  assets: readonly string[]
  /** `matrix[row][column]`, aligned to `assets`. */
  matrix: readonly (readonly (number | null)[])[]
  /** Cell edge in px. */
  cell?: number
}

/**
 * The correlation matrix (Figma 347:11024).
 *
 * A grid of coloured cells needs no chart library at all — the interesting
 * decision is the colormap, not the layout. It is raw RGB and mode-independent
 * by approval: the colour is the measurement, so it must not flip with the
 * theme (see `heatmap.ts`).
 */
export function CorrelationHeatmap({
  assets,
  matrix,
  cell = 34
}: CorrelationHeatmapProps): ReactElement {
  return (
    <div className="heatmap" role="table" aria-label="Correlation matrix">
      <div
        className="heatmap-grid"
        style={{ gridTemplateColumns: `60px repeat(${String(assets.length)}, ${String(cell)}px)` }}
      >
        <span className="heatmap-corner" />
        {assets.map((asset) => (
          <span key={`head-${asset}`} className="heatmap-head type-11">
            {asset}
          </span>
        ))}

        {assets.map((rowAsset, row) => (
          <Row key={rowAsset} asset={rowAsset} values={matrix[row] ?? []} cell={cell} />
        ))}
      </div>
    </div>
  )
}

function Row({
  asset,
  values,
  cell
}: {
  asset: string
  values: readonly (number | null)[]
  cell: number
}): ReactElement {
  return (
    <>
      <span className="heatmap-row-head type-11">{asset}</span>
      {values.map((value, column) => (
        <Cell key={column} value={value} cell={cell} />
      ))}
    </>
  )
}

function Cell({ value, cell }: { value: number | null; cell: number }): ReactElement {
  if (value === null || !Number.isFinite(value)) {
    return <span className="heatmap-cell heatmap-empty" style={{ height: cell }} />
  }

  const position = correlationPosition(value)
  return (
    <span
      className="heatmap-cell"
      style={{ height: cell, background: heatColor(position), color: heatTextColor(position) }}
      title={value.toFixed(3)}
    >
      {value.toFixed(2)}
    </span>
  )
}
