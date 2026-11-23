import { useMemo, useState, type ReactElement } from 'react'
import type { Analytics, StatisticSpec } from '../../api/analytics'
import { CorrelationHeatmap } from '../../charts/CorrelationHeatmap'
import { LevelChart, type Series } from '../../charts/LevelChart'
import { Section } from '../../components/Section/Section'
import type { ThemeMode } from '../../tokens/tokens'
import type { TableFrame } from '../../api/analytics'
import { frameOf, numberOf, reasonOf, recordsOf, textOf } from './analyticsFrames'
import { VolatilityRanges, type VolatilityRange } from './VolatilityRanges'

/** What the rolling chart draws before a reader picks: the index, global equity and bonds. */
const FIRST_PICKS = ['index', 'ACWI', 'AGG']
// 1.2 times its first height (Karan, 2026-11-22).
const ROLLING_HEIGHT = 264
/** Narrower now the names are tilted over the columns rather than across them (Karan, 2026-11-23). */
const CELL = 30
const ROW = 24
/** Each series' key in the matrix: the books' short heads, the markets' tickers. */
const SHORT: Record<string, string> = { fund: 'Fund', index: 'Index', benchmark: 'BM' }

/**
 * The fund against the markets (Karan, 2026-11-21): how its correlation with
 * each has moved over the run, and all of them against each other now. A
 * column picked in the matrix is a line on the chart above it, so the two
 * read as one thing.
 *
 * Provisional until the store holds market series: the stub's are stand-ins
 * made from the index (py-beacon, 2026-11-21).
 */
export function MarketCorrelation({
  answer,
  mode,
  spec,
  indexName
}: {
  answer: Analytics | undefined
  mode: ThemeMode
  spec: StatisticSpec | undefined
  /** What the index is called here: "Index/benchmark" when it is both. */
  indexName: string
}): ReactElement {
  const [picked, setPicked] = useState<string[]>(FIRST_PICKS)
  const matrix = frameOf(answer, 'market_correlations')
  const rolling = frameOf(answer, 'rolling_correlations')
  const volatility = frameOf(answer, 'market_volatility')
  const codes = matrix?.columns.slice(1) ?? []
  const labelOf = (code: string): string => seriesLabel(code, spec, indexName)
  const headOf = (code: string): string => SHORT[code] ?? code

  const series = useMemo((): Series[] => {
    const rows = recordsOf(rolling)
    return picked
      .filter((code) => rolling?.columns.includes(code) === true)
      .map((code) => ({
        label:
          SHORT[code] === undefined
            ? `${seriesLabel(code, spec, indexName)} (${code})`
            : seriesLabel(code, spec, indexName),
        points: rows.flatMap((row) => {
          const date = textOf(row.date)
          const value = numberOf(row[code])
          return date === undefined || value === undefined ? [] : [{ date, value }]
        })
      }))
  }, [rolling, picked, spec, indexName])

  const toggle = (head: string): void => {
    const code = codes.find((each) => headOf(each) === head)
    // The fund against itself is 1 throughout: nothing to chart.
    if (code === undefined || code === 'fund') return
    setPicked((current) =>
      current.includes(code) ? current.filter((each) => each !== code) : [...current, code]
    )
  }

  const unavailable = reasonOf(answer, 'market_correlations')
  if (matrix === undefined) {
    return (
      <Section title="Correlation">
        <p className="overview-note type-11">{unavailable ?? 'Not worked out for this run.'}</p>
      </Section>
    )
  }

  return (
    <div className="risk-correlation">
      <Section title="Rolling correlation">
        {series.length === 0 ? (
          <p className="overview-note type-11">Pick a column in the matrix below to chart it.</p>
        ) : (
          <LevelChart
            mode={mode}
            series={series}
            height={ROLLING_HEIGHT}
            legend
            reference={0}
            note="Each point looks back a year. Pick a column in the matrix to show or hide its line"
          />
        )}
      </Section>
      <Section title="Correlation">
        <div className="risk-matrix">
          <CorrelationHeatmap
            assets={codes.map(headOf)}
            matrix={recordsOf(matrix).map((row) =>
              codes.map((code) => numberOf(row[code]) ?? null)
            )}
            cell={CELL}
            rowHeight={ROW}
            names={Object.fromEntries(codes.map((code) => [headOf(code), labelOf(code)]))}
            picked={picked.map(headOf)}
            onPick={toggle}
            bare
            fullNames
          />
          {volatility !== undefined && (
            <VolatilityRanges
              ranges={codes.map((code) => rangeOf(volatility, code, headOf(code), labelOf(code)))}
              row={ROW}
            />
          )}
        </div>
      </Section>
    </div>
  )
}

/** A series' full name: the catalogue's, or the index's name here. */
function seriesLabel(code: string, spec: StatisticSpec | undefined, indexName: string): string {
  if (code === 'index') return indexName
  return spec?.columns?.find((column) => column.name === 'series')?.labels?.[code] ?? code
}

/** A series' volatility range, when the table has a row for it. */
function rangeOf(
  frame: TableFrame,
  code: string,
  head: string,
  name: string
): VolatilityRange | undefined {
  const row = recordsOf(frame).find((each) => each.series === code)
  const low = numberOf(row?.low)
  const high = numberOf(row?.high)
  if (low === undefined || high === undefined) return undefined
  return { head, name, low, high, latest: numberOf(row?.latest) }
}
