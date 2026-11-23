import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactElement
} from 'react'
import { correlationPosition, heatColor, heatTextColor } from './heatmap'
import '../components/Table/HeaderTip.css'
import './CorrelationHeatmap.css'

export interface CorrelationHeatmapProps {
  assets: readonly string[]
  /** `matrix[row][column]`, aligned to `assets`. */
  matrix: readonly (readonly (number | null)[])[]
  /** Cell edge in px. */
  cell?: number
  /** A row's height in px, when the cells are to be shorter than they are wide. */
  rowHeight?: number
  /** A fuller name for each asset, for its heads' hover. */
  names?: Readonly<Record<string, string>>
  /** Columns a click on their head picks, as the rolling chart's lines do (Karan, 2026-11-21). */
  picked?: readonly string[]
  onPick?: (asset: string) => void
  /**
   * Colour alone, each cell's blended into its neighbours' with no edges
   * between them, and each figure in its hover rather than written on it
   * (Karan, 2026-11-22).
   */
  bare?: boolean
  /**
   * Each head the asset's full name rather than its ticker, the columns'
   * tilted so the cells need not be as wide as the names; the ticker goes to
   * the hover (Karan, 2026-11-23).
   */
  fullNames?: boolean
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
  cell = 34,
  rowHeight = cell,
  names,
  picked = [],
  onPick,
  bare = false,
  fullNames = false
}: CorrelationHeatmapProps): ReactElement {
  const [hovered, setHovered] = useState<{ row: string; column: string; at: CellAt } | undefined>(
    undefined
  )
  const headOf = (asset: string): string => (fullNames ? (names?.[asset] ?? asset) : asset)
  const tipOf = (asset: string): string | undefined =>
    fullNames ? (headOf(asset) === asset ? undefined : asset) : names?.[asset]
  const label = (asset: string): ReactElement | string =>
    fullNames ? <span className="heatmap-head-text">{headOf(asset)}</span> : asset

  return (
    <div className="heatmap-block">
      <div
        className={fullNames ? 'heatmap heatmap-tilted' : 'heatmap'}
        role="table"
        aria-label="Correlation matrix"
      >
        <div
          className={bare ? 'heatmap-grid heatmap-bare' : 'heatmap-grid'}
          style={{
            gridTemplateColumns: `${fullNames ? 'max-content' : '60px'} repeat(${String(assets.length)}, ${String(cell)}px)`
          }}
        >
          <span className="heatmap-corner" style={{ gridArea: '1 / 1' }} />
          {/* Every item placed, so the blended field can lie under the cells. */}
          {bare && (
            <HeatField
              matrix={matrix}
              style={{
                gridRow: `2 / span ${String(assets.length)}`,
                gridColumn: `2 / span ${String(assets.length)}`
              }}
            />
          )}
          {assets.map((asset, column) =>
            onPick === undefined ? (
              <span
                key={`head-${asset}`}
                className="heatmap-head type-11"
                title={tipOf(asset)}
                style={{ gridArea: `1 / ${String(column + 2)}` }}
              >
                {label(asset)}
              </span>
            ) : (
              <button
                key={`head-${asset}`}
                style={{ gridArea: `1 / ${String(column + 2)}` }}
                type="button"
                className={
                  picked.includes(asset)
                    ? 'heatmap-head heatmap-pick heatmap-picked type-11'
                    : 'heatmap-head heatmap-pick type-11'
                }
                title={tipOf(asset)}
                aria-pressed={picked.includes(asset)}
                onClick={() => {
                  onPick(asset)
                }}
              >
                {label(asset)}
              </button>
            )
          )}

          {assets.map((rowAsset, row) => (
            <Row
              key={rowAsset}
              row={row}
              asset={headOf(rowAsset)}
              name={tipOf(rowAsset)}
              values={matrix[row] ?? []}
              cell={rowHeight}
              bare={bare}
              onHover={(column, at) => {
                setHovered(
                  at === undefined ? undefined : { row: rowAsset, column: assets[column] ?? '', at }
                )
              }}
            />
          ))}
        </div>
      </div>
      {/* Outside the scrolling grid, so the top row's tip is not cut off by it. */}
      {hovered !== undefined && (
        <div
          className="header-tip heatmap-tip"
          role="tooltip"
          style={{ left: hovered.at.left, top: hovered.at.top }}
        >
          <div className="header-tip-title">
            {names?.[hovered.row] ?? hovered.row} · {names?.[hovered.column] ?? hovered.column}
          </div>
          <dl className="header-tip-params">
            <dt>Correlation</dt>
            <dd>{hovered.at.value.toFixed(2)}</dd>
          </dl>
        </div>
      )}
    </div>
  )
}

/** Where a hovered cell sits in the grid, and its figure. */
interface CellAt {
  left: number
  top: number
  value: number
}

function Row({
  row,
  asset,
  name,
  values,
  cell,
  bare,
  onHover
}: {
  row: number
  asset: string
  name: string | undefined
  values: readonly (number | null)[]
  cell: number
  bare: boolean
  onHover: (column: number, at: CellAt | undefined) => void
}): ReactElement {
  return (
    <>
      <span
        className="heatmap-row-head type-11"
        title={name}
        style={{ gridArea: `${String(row + 2)} / 1` }}
      >
        {asset}
      </span>
      {values.map((value, column) => (
        <Cell
          key={column}
          area={`${String(row + 2)} / ${String(column + 2)}`}
          value={value}
          cell={cell}
          bare={bare}
          onHover={(at) => {
            onHover(column, at)
          }}
        />
      ))}
    </>
  )
}

function Cell({
  area,
  value,
  cell,
  bare,
  onHover
}: {
  area: string
  value: number | null
  cell: number
  bare: boolean
  onHover: (at: CellAt | undefined) => void
}): ReactElement {
  if (value === null || !Number.isFinite(value)) {
    return <span className="heatmap-cell heatmap-empty" style={{ height: cell, gridArea: area }} />
  }

  const position = correlationPosition(value)
  // A bare cell is clear over the blended field: its figure shows in the hover, not on it.
  return (
    <span
      className="heatmap-cell"
      style={
        bare
          ? { height: cell, gridArea: area }
          : {
              height: cell,
              gridArea: area,
              background: heatColor(position),
              color: heatTextColor(position)
            }
      }
      {...(bare
        ? {
            onMouseEnter: (event: MouseEvent<HTMLSpanElement>) => {
              const target = event.currentTarget
              onHover({
                left: target.offsetLeft + target.offsetWidth / 2,
                top: target.offsetTop,
                value
              })
            },
            onMouseLeave: () => {
              onHover(undefined)
            }
          }
        : { title: value.toFixed(3) })}
    >
      {bare ? null : value.toFixed(2)}
    </span>
  )
}

/**
 * The matrix as one field: a pixel a cell, scaled up smoothly by the
 * browser, so each colour runs into its neighbours' rather than meeting
 * them at an edge.
 */
function HeatField({
  matrix,
  style
}: {
  matrix: readonly (readonly (number | null)[])[]
  style: CSSProperties
}): ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null)
  const size = matrix.length

  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (context === null || context === undefined) return
    context.clearRect(0, 0, size, size)
    matrix.forEach((values, row) => {
      values.forEach((value, column) => {
        if (value === null || !Number.isFinite(value)) return
        context.fillStyle = heatColor(correlationPosition(value))
        context.fillRect(column, row, 1, 1)
      })
    })
  }, [matrix, size])

  return (
    <canvas
      ref={canvas}
      className="heatmap-field"
      width={size}
      height={size}
      style={style}
      aria-hidden="true"
    />
  )
}
