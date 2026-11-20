import type { ReactElement } from 'react'
import type { StatisticSpec, TableFrame } from '../../api/analytics'
import { percent } from '../shared/indexMetrics'
import { HoverTip } from './HoverTip'

const SIZES = ['large', 'mid', 'small']
const STYLES = ['value', 'blend', 'growth']
const CELL = 48
/** How far each name's weight spreads around its place, in px. */
const SPREAD = CELL * 0.6
const SIDE = CELL * 3

/*
 * Where a position is drawn. py-beacon does not clip positions (Karan,
 * BN-427): a name over $1tn sits above 0 and one under $100m below 3, so
 * the drawing pins them to the box's edge while every figure keeps the true
 * value.
 */
const pinned = (position: number): number => Math.min(3, Math.max(0, position))

type Weights = number[][]

/**
 * Morningstar's style box (BU-294): size down, style across, shaded from
 * the pane's grey to the accent by where the fund's weight sits, name by
 * name, so it reads as where the money is rather than as nine numbers. A circle
 * marks the fund's centre and a diamond the index's; the weights are in the
 * hover popup (Karan, 2026-11-19). A benchmark other than the index is an X;
 * one that is the index shares its diamond (Karan, 2026-11-20).
 */
export function StyleBox({
  frame,
  positions,
  classification,
  spec,
  benchmarkIsIndex
}: {
  frame: TableFrame | undefined
  /** Each held name's place and weight; the shading follows these when there are any. */
  positions: TableFrame | undefined
  /** Each book's cell and weighted centre, where its marker sits. */
  classification: TableFrame | undefined
  spec: StatisticSpec | undefined
  benchmarkIsIndex: boolean
}): ReactElement {
  if (frame === undefined) return <p className="summary-profile-none type-11">Not worked out</p>
  const labelOf = (column: string, code: string): string =>
    spec?.columns?.find((candidate) => candidate.name === column)?.labels?.[code] ?? code
  const fund = weightsOf(frame, 'fund')
  const index = weightsOf(frame, 'index')
  const names = positions === undefined ? [] : placedOf(positions)
  const heaviest = Math.max(...names.map((entry) => entry.fund), 0.0001)
  const mine = centreOf(classification, 'fund')
  const theirs = centreOf(classification, 'index')
  const benchmark = benchmarkIsIndex ? undefined : centreOf(classification, 'benchmark')

  return (
    <div className="style-box">
      <span />
      <div className="style-box-heads">
        {STYLES.map((style) => (
          <span key={style}>{labelOf('style', style)}</span>
        ))}
      </div>
      <div className="style-box-sides">
        {SIZES.map((size) => (
          <span key={size}>{labelOf('size', size)}</span>
        ))}
      </div>
      <HoverTip
        className="style-box-plot"
        tip={
          <StyleTip
            fund={fund}
            index={index}
            benchmark={benchmark === undefined ? undefined : weightsOf(frame, 'benchmark')}
            labelOf={labelOf}
          />
        }
      >
        <svg width={SIDE} height={SIDE} role="img" aria-label="Style box">
          <defs>
            <clipPath id="style-box-clip">
              <rect width={SIDE} height={SIDE} />
            </clipPath>
            <radialGradient id="style-box-glow">
              <stop offset="0" className="style-box-glow-core" />
              <stop offset="1" className="style-box-glow-edge" />
            </radialGradient>
          </defs>
          <rect className="style-box-ground" width={SIDE} height={SIDE} />
          {/*
            Each held name as a soft spot where it sits, as deep as its
            weight against the heaviest name's, so the colour gathers where
            the fund's money is (Morningstar's ownership zone).
          */}
          <g clipPath="url(#style-box-clip)">
            {names
              .filter((entry) => entry.fund > 0)
              .map((entry) => (
                <circle
                  key={entry.name}
                  cx={pinned(entry.style) * CELL}
                  cy={pinned(entry.size) * CELL}
                  r={SPREAD}
                  fill="url(#style-box-glow)"
                  opacity={Math.min(1, (entry.fund / heaviest) * 0.9)}
                />
              ))}
          </g>
          <line className="style-box-guide" x1={CELL} x2={CELL} y1={0} y2={SIDE} />
          <line className="style-box-guide" x1={CELL * 2} x2={CELL * 2} y1={0} y2={SIDE} />
          <line className="style-box-guide" x1={0} x2={SIDE} y1={CELL} y2={CELL} />
          <line className="style-box-guide" x1={0} x2={SIDE} y1={CELL * 2} y2={CELL * 2} />
          <rect className="style-box-outline" width={SIDE} height={SIDE} />
          {theirs !== undefined && (
            <rect
              className="style-box-index"
              x={theirs.x - 5}
              y={theirs.y - 5}
              width={10}
              height={10}
              transform={`rotate(45 ${String(theirs.x)} ${String(theirs.y)})`}
            />
          )}
          {benchmark !== undefined && <BenchmarkMark x={benchmark.x} y={benchmark.y} half={4.5} />}
          {mine !== undefined && (
            <circle className="style-box-fund" cx={mine.x} cy={mine.y} r={5.5} />
          )}
        </svg>
      </HoverTip>
      <span />
      <div className="style-box-legend type-11">
        <span>
          <svg width={10} height={10} aria-hidden="true">
            <circle className="style-box-fund" cx={5} cy={5} r={4} />
          </svg>
          Fund
        </span>
        <span>
          <svg width={10} height={10} aria-hidden="true">
            <rect
              className="style-box-index"
              x={2}
              y={2}
              width={6}
              height={6}
              transform="rotate(45 5 5)"
            />
          </svg>
          {benchmarkIsIndex ? 'Index/benchmark' : 'Index'}
        </span>
        {benchmark !== undefined && (
          <span>
            <svg width={10} height={10} aria-hidden="true">
              <BenchmarkMark x={5} y={5} half={3.5} />
            </svg>
            Benchmark
          </span>
        )}
      </div>
    </div>
  )
}

/** A benchmark other than the index: an X, drawn about its centre. */
export function BenchmarkMark({
  x,
  y,
  half
}: {
  x: number
  y: number
  half: number
}): ReactElement {
  return (
    <path
      className="style-box-benchmark"
      d={`M${String(x - half)} ${String(y - half)}L${String(x + half)} ${String(y + half)}M${String(x + half)} ${String(y - half)}L${String(x - half)} ${String(y + half)}`}
    />
  )
}

function weightsOf(frame: TableFrame, book: string): Weights {
  const at = frame.columns.indexOf(book)
  return SIZES.map((size) =>
    STYLES.map((style) => {
      const row = frame.data.find((cells) => cells[0] === size && cells[1] === style)
      const value = row?.[at]
      return typeof value === 'number' ? value : 0
    })
  )
}

interface Placed {
  name: string
  size: number
  style: number
  fund: number
  index: number
}

function placedOf(frame: TableFrame): Placed[] {
  const at = (name: string): number => frame.columns.indexOf(name)
  const number = (value: unknown): number => (typeof value === 'number' ? value : 0)
  return frame.data.map((cells) => ({
    name: String(cells[at('name')] ?? ''),
    size: number(cells[at('size')]),
    style: number(cells[at('style')]),
    fund: number(cells[at('fund')]),
    index: number(cells[at('index')])
  }))
}

/** The engine's centre for a book, in the plot's pixels; the middle when it gives none. */
function centreOf(
  frame: TableFrame | undefined,
  book: string
): { x: number; y: number } | undefined {
  if (frame === undefined) return undefined
  const row = frame.data.find((cells) => cells[0] === book)
  const size = row?.[frame.columns.indexOf('size_centre')]
  const style = row?.[frame.columns.indexOf('style_centre')]
  if (typeof size !== 'number' || typeof style !== 'number') return undefined
  return { x: pinned(style) * CELL, y: pinned(size) * CELL }
}

function StyleTip({
  fund,
  index,
  benchmark,
  labelOf
}: {
  fund: Weights
  index: Weights
  /** Only for a benchmark other than the index. */
  benchmark: Weights | undefined
  labelOf: (column: string, code: string) => string
}): ReactElement {
  const share = (weights: Weights, r: number, c: number): string =>
    percent((weights[r]?.[c] ?? 0) * 100, 1)
  return (
    <>
      <div className="header-tip-title">Weight by size and style</div>
      <dl className="header-tip-params">
        {SIZES.flatMap((size, r) =>
          STYLES.map((style, c) => [
            <dt key={`${size}-${style}-name`}>
              {`${labelOf('size', size)} ${labelOf('style', style).toLowerCase()}`}
            </dt>,
            <dd key={`${size}-${style}-value`}>
              {`${share(fund, r, c)} fund · ${share(index, r, c)} index`}
              {benchmark !== undefined && ` · ${share(benchmark, r, c)} benchmark`}
            </dd>
          ])
        )}
      </dl>
    </>
  )
}
