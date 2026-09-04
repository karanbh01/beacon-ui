import type { ReactElement } from 'react'
import { AddValue } from '../../components/AddValue/AddValue'
import { Checkbox } from '../../components/Checkbox/Checkbox'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { Select } from '../../components/Select/Select'
import { seriesColor } from '../../charts/theme'
import type { ThemeMode } from '../../tokens/tokens'
import { fieldLabel } from '../features/features'
import { RANGES, type Range } from '../prices/usePrices'
import { INTERVALS, type Interval } from './useChartSeries'
import './ChartToolbar.css'

export interface ChartToolbarProps {
  range: Range
  onRange: (range: Range) => void
  interval: Interval
  onInterval: (interval: Interval) => void
  /** Adjusted or traded, never both at once (BU-129). */
  adjusted: boolean
  onAdjusted: (adjusted: boolean) => void
  /** Corporate actions as flags on the time axis (BU-152). */
  events: boolean
  onEvents: (events: boolean) => void
  /** False for an instrument with none, so the control says so. */
  hasEvents: boolean
  /** The feature on the right axis, '' for none. */
  field: string
  onField: (field: string) => void
  fields: readonly string[]
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
  adjusted,
  onAdjusted,
  events,
  onEvents,
  hasEvents,
  field,
  onField,
  fields,
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

      {/*
        One line at a time. Two that differ only by dividends are
        indistinguishable at chart scale and legible only in the legend, so
        this is a choice rather than a pair of toggles.
      */}
      <Select
        options={[
          { value: 'traded', label: 'Unadjusted' },
          { value: 'adjusted', label: 'Adjusted' }
        ]}
        value={adjusted ? 'adjusted' : 'traded'}
        onChange={(next) => {
          onAdjusted(next === 'adjusted')
        }}
        label="Prices"
      />

      {/*
        What happened to the instrument, and what is known about it (BU-152).

        Both controls are here rather than behind Indicators because they are
        properties of the subject, not of the drawing — and both state what
        there is: an instrument with no actions says so instead of offering a
        toggle that would change nothing.
      */}
      <Checkbox
        label={hasEvents ? 'Corporate actions' : 'No corporate actions'}
        checked={events}
        disabled={!hasEvents}
        onChange={onEvents}
      />

      <Select
        label="Feature"
        value={field}
        disabled={fields.length === 0}
        placeholder={fields.length === 0 ? 'No features' : 'No feature'}
        options={
          fields.length === 0
            ? []
            : [
                { value: '', label: 'No feature' },
                ...fields.map((name) => ({ value: name, label: fieldLabel(name) }))
              ]
        }
        onChange={onField}
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
