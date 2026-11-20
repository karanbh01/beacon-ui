import { useState, type ReactElement } from 'react'
import type { TableFrame } from '../../api/analytics'
import { Section } from '../../components/Section/Section'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { percent, signedPercent } from '../shared/indexMetrics'
import { EdgeScroll } from '../home/EdgeScroll'
import { HoverTip } from './HoverTip'
import { BenchmarkMark } from './StyleBox'

type Grouping = 'sector' | 'country'

const GROUPINGS = [
  { value: 'sector', label: 'Sector' },
  { value: 'country', label: 'Country' }
] as const

interface Exposure {
  group: string
  fund: number
  index: number
  /** A benchmark other than the index; null when there is none, or it is the index. */
  benchmark: number | null
}

/**
 * Under the style box (BU-294): where the fund's money is by sector or by
 * country, against the index (Karan, 2026-11-20). A thick bar for the fund
 * and the style box's diamond for the index, with the figures on hover; a
 * long list scrolls inside its own box so the face keeps its shape. A
 * benchmark other than the index is the style box's X. The table is
 * provisional until py-beacon names its own.
 */
export function Exposures({
  frame,
  benchmarkIsIndex
}: {
  frame: TableFrame | undefined
  benchmarkIsIndex: boolean
}): ReactElement {
  const [grouping, setGrouping] = useState<Grouping>('sector')
  const rows = frame === undefined ? [] : exposuresOf(frame, grouping, benchmarkIsIndex)
  // Against the heaviest weight in any book, so the largest bar nearly fills the width.
  const widest =
    Math.max(...rows.flatMap((row) => [row.fund, row.index, row.benchmark ?? 0]), 0.0001) * 1.05

  return (
    <Section
      title="Exposures"
      className="exposures"
      aside={
        <SegmentedControl
          segments={GROUPINGS}
          value={grouping}
          onChange={setGrouping}
          label="Exposures by"
        />
      }
    >
      {frame === undefined ? (
        <p className="summary-profile-none type-11">Not worked out</p>
      ) : (
        // Home's scrolling list: no scrollbar, and an edge with more beyond it blurs.
        <EdgeScroll>
          <div className="exposures-list">
            {rows.map((row) => (
              <ExposureRow
                key={row.group}
                row={row}
                widest={widest}
                benchmarkIsIndex={benchmarkIsIndex}
              />
            ))}
          </div>
        </EdgeScroll>
      )}
    </Section>
  )
}

function ExposureRow({
  row,
  widest,
  benchmarkIsIndex
}: {
  row: Exposure
  widest: number
  benchmarkIsIndex: boolean
}): ReactElement {
  const at = (weight: number): string => `${String((weight / widest) * 100)}%`
  return (
    <HoverTip
      // Cash apart and in grey: money the fund holds, not an exposure (Karan, 2026-11-20).
      className={row.group === 'Cash' ? 'exposure exposure-cash' : 'exposure'}
      tip={<ExposureTip row={row} benchmarkIsIndex={benchmarkIsIndex} />}
    >
      <span className="exposure-name type-11">{row.group}</span>
      <span className="exposure-track">
        <span className="exposure-fill" style={{ width: at(row.fund) }} />
        <svg
          className="exposure-index"
          style={{ left: at(row.index) }}
          width={10}
          height={10}
          aria-hidden="true"
        >
          <rect x={2} y={2} width={6} height={6} transform="rotate(45 5 5)" />
        </svg>
        {row.benchmark !== null && (
          <svg
            className="exposure-index"
            style={{ left: at(row.benchmark) }}
            width={10}
            height={10}
            aria-hidden="true"
          >
            <BenchmarkMark x={5} y={5} half={3.5} />
          </svg>
        )}
      </span>
    </HoverTip>
  )
}

function ExposureTip({
  row,
  benchmarkIsIndex
}: {
  row: Exposure
  benchmarkIsIndex: boolean
}): ReactElement {
  const index = benchmarkIsIndex ? 'Index/benchmark' : 'Index'
  const benchmark = row.benchmark
  return (
    <>
      <div className="header-tip-title">{row.group}</div>
      <dl className="header-tip-params">
        <dt>Fund</dt>
        <dd>{percent(row.fund * 100, 1)}</dd>
        <dt>{index}</dt>
        <dd>{percent(row.index * 100, 1)}</dd>
        {benchmark !== null && (
          <>
            <dt>Benchmark</dt>
            <dd>{percent(benchmark * 100, 1)}</dd>
          </>
        )}
        <dt>{`vs. ${index.toLowerCase()}`}</dt>
        <dd>{signedPercent((row.fund - row.index) * 100, 1)}</dd>
        {benchmark !== null && (
          <>
            <dt>vs. benchmark</dt>
            <dd>{signedPercent((row.fund - benchmark) * 100, 1)}</dd>
          </>
        )}
      </dl>
    </>
  )
}

/**
 * The groups py-beacon puts after every real one: names with no value for the
 * field, then the fund's cash (py-beacon, 2026-11-20).
 */
const TRAILING = ['Unknown', 'Cash']

/** One grouping's rows, heaviest in the fund first, then Unknown and Cash. */
function exposuresOf(frame: TableFrame, grouping: Grouping, benchmarkIsIndex: boolean): Exposure[] {
  const at = (name: string): number => frame.columns.indexOf(name)
  const number = (value: unknown): number => (typeof value === 'number' ? value : 0)
  const benchmarkOf = (value: unknown): number | null =>
    benchmarkIsIndex || typeof value !== 'number' ? null : value
  return frame.data
    .filter((cells) => cells[at('grouping')] === grouping)
    .map((cells) => ({
      group: String(cells[at('group')] ?? ''),
      fund: number(cells[at('fund')]),
      index: number(cells[at('index')]),
      benchmark: benchmarkOf(cells[at('benchmark')])
    }))
    .sort(
      (one, other) =>
        TRAILING.indexOf(one.group) - TRAILING.indexOf(other.group) || other.fund - one.fund
    )
}
