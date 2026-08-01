import type { ReactElement } from 'react'
import { AddValue } from '../../components/AddValue/AddValue'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { Select } from '../../components/Select/Select'
import { seriesColor } from '../../charts/theme'
import type { ThemeMode } from '../../tokens/tokens'
import { RANGES, type Range } from '../prices/usePrices'
import { INTERVALS, type Interval } from './useChartSeries'
import './ChartToolbar.css'

export interface ChartToolbarProps {
  range: Range
  onRange: (range: Range) => void
  interval: Interval
  onInterval: (interval: Interval) => void
  compare: readonly string[]
  onAdd: (identifier: string) => void
  onRemove: (identifier: string) => void
  mode: ThemeMode
}

/**
 * Figma 283:10930. Range segments, interval, then one chip per compared
 * asset and the add slot.
 *
 * The chip's dot carries the series colour, so the chart legend and the
 * toolbar cannot disagree about which line is which — both call
 * `seriesColor` with the same index, and the subject is always index 0.
 */
export function ChartToolbar({
  range,
  onRange,
  interval,
  onInterval,
  compare,
  onAdd,
  onRemove,
  mode
}: ChartToolbarProps): ReactElement {
  return (
    <div className="chart-toolbar">
      <SegmentedControl segments={RANGES} value={range} onChange={onRange} label="Range" />

      <Select
        options={INTERVALS.map((option) => ({ value: option.value, label: option.label }))}
        value={interval}
        onChange={(next) => {
          onInterval(next as Interval)
        }}
        label="Interval"
      />

      {compare.map((identifier, index) => (
        <span key={identifier} className="compare-chip type-11">
          <span
            className="compare-dot"
            style={{ background: seriesColor(mode, index + 1) }}
            aria-hidden="true"
          />
          {identifier}
          <button
            type="button"
            className="compare-remove"
            aria-label={`Remove ${identifier}`}
            onClick={() => {
              onRemove(identifier)
            }}
          >
            &times;
          </button>
        </span>
      ))}

      <AddValue label="Add asset…" onAdd={onAdd} />
    </div>
  )
}
