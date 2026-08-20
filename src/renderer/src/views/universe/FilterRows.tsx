import type { ReactElement } from 'react'
import { AddSlot } from '../../components/AddSlot/AddSlot'
import { Badge } from '../../components/Badge/Badge'
import { describeRow, newRow, type FilterRow, type FilterSpec } from './builder'
import './FilterRows.css'

export interface FilterRowsProps {
  specs: readonly FilterSpec[]
  rows: readonly FilterRow[]
  /** Names surviving each row, aligned to `rows`. */
  remaining: readonly (number | undefined)[]
  onChange: (rows: FilterRow[]) => void
}

/**
 * Filters as rows, the way the index designer draws a pipeline (BU-90).
 *
 * The panel this replaced drew every dimension at once — after BN-128 that is
 * seven fieldsets and 67 checkboxes on screen before the user has expressed
 * an intent, and no indication of what any one of them costs. A row is added,
 * says what it did, and can be moved or removed.
 *
 * The count on the right is the funnel figure: names surviving AFTER that
 * row. A single total at the top cannot answer "which of my filters is doing
 * the damage", and 5,000 narrowed to 12 is either three sensible filters or
 * one mistake. Computed here rather than fetched, because the whole pool is
 * already in the client — so it moves as the row is edited.
 */
export function FilterRows({ specs, rows, remaining, onChange }: FilterRowsProps): ReactElement {
  const rankable = specs.filter((spec) => spec.kind === 'range')

  const move = (index: number, delta: -1 | 1): void => {
    const next = [...rows]
    const moved = next[index]
    const displaced = next[index + delta]
    if (moved === undefined || displaced === undefined) return
    next[index] = displaced
    next[index + delta] = moved
    onChange(next)
  }

  return (
    <div className="filter-rows">
      {rows.map((row, index) => (
        <Row
          key={row.id}
          row={row}
          position={index + 1}
          specs={row.kind === 'rank' ? rankable : specs}
          remaining={remaining[index]}
          summary={describeRow(row, specs)}
          onChange={(next) => {
            onChange(rows.map((candidate) => (candidate.id === row.id ? next : candidate)))
          }}
          onRemove={() => {
            onChange(rows.filter((candidate) => candidate.id !== row.id))
          }}
          onMove={(delta) => {
            move(index, delta)
          }}
        />
      ))}

      <AddSlot
        label="Add filter…"
        indent={44}
        {...(specs.length === 0 ? { blocked: 'Nothing in the loaded data to filter on' } : {})}
        onClick={() => {
          onChange([...rows, newRow('filter')])
        }}
      />
      <AddSlot
        label="Add rank…"
        indent={44}
        {...(rankable.length === 0
          ? { blocked: 'No numeric column in the loaded data to rank by' }
          : {})}
        onClick={() => {
          onChange([...rows, newRow('rank')])
        }}
      />
    </div>
  )
}

interface RowProps {
  row: FilterRow
  position: number
  /** The dimensions this row may choose from — rank can only take a number. */
  specs: readonly FilterSpec[]
  remaining: number | undefined
  summary: string
  onChange: (row: FilterRow) => void
  onRemove: () => void
  onMove: (delta: -1 | 1) => void
}

function Row({
  row,
  position,
  specs,
  remaining,
  summary,
  onChange,
  onRemove,
  onMove
}: RowProps): ReactElement {
  const spec = specs.find((candidate) => candidate.field === row.field)
  const number = String(position).padStart(2, '0')

  return (
    <div className="filter-row">
      <span className="filter-row-index type-11">{number}</span>
      <Badge>{row.kind === 'rank' ? 'Rank' : 'Filter'}</Badge>

      <select
        className="filter-row-input"
        aria-label={`Row ${number} dimension`}
        value={row.field}
        onChange={(event) => {
          // Values and bounds belong to the old dimension, so they go with it.
          onChange({
            ...row,
            field: event.target.value,
            values: [],
            min: undefined,
            max: undefined
          })
        }}
      >
        <option value="">Choose…</option>
        {specs.map((candidate) => (
          <option key={candidate.field} value={candidate.field}>
            {candidate.label}
          </option>
        ))}
      </select>

      <RowControls row={row} spec={spec} number={number} onChange={onChange} />

      <span className="filter-row-summary type-11">{summary}</span>
      <span className="filter-row-outcome type-11">
        {remaining === undefined ? '—' : `${remaining.toLocaleString('en-US')} pass`}
      </span>

      <span className="filter-row-actions">
        <Action
          label={`Move row ${number} up`}
          glyph="↑"
          onClick={() => {
            onMove(-1)
          }}
        />
        <Action
          label={`Move row ${number} down`}
          glyph="↓"
          onClick={() => {
            onMove(1)
          }}
        />
        <Action label={`Remove row ${number}`} glyph="×" onClick={onRemove} />
      </span>
    </div>
  )
}

interface ControlProps {
  row: FilterRow
  spec: FilterSpec | undefined
  number: string
  onChange: (row: FilterRow) => void
}

/** What the row collects, which follows from the dimension it chose. */
function RowControls({ row, spec, number, onChange }: ControlProps): ReactElement | null {
  if (spec === undefined) return null

  if (row.kind === 'rank') {
    return (
      <>
        <select
          className="filter-row-input filter-row-narrow"
          aria-label={`Row ${number} direction`}
          value={row.direction}
          onChange={(event) => {
            onChange({ ...row, direction: event.target.value === 'bottom' ? 'bottom' : 'top' })
          }}
        >
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </select>
        <input
          className="filter-row-input filter-row-narrow"
          inputMode="numeric"
          placeholder="how many"
          aria-label={`Row ${number} count`}
          value={row.count ?? ''}
          onChange={(event) => {
            onChange({ ...row, count: toNumber(event.target.value) })
          }}
        />
      </>
    )
  }

  if (spec.kind === 'category') {
    return (
      <select
        className="filter-row-input filter-row-values"
        multiple
        size={3}
        aria-label={`Row ${number} values`}
        value={row.values}
        onChange={(event) => {
          onChange({
            ...row,
            values: [...event.target.selectedOptions].map((option) => option.value)
          })
        }}
      >
        {(spec.values ?? []).map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    )
  }

  return (
    <>
      <input
        className="filter-row-input filter-row-narrow"
        inputMode="decimal"
        placeholder={compact(spec.min)}
        aria-label={`Row ${number} minimum`}
        value={row.min ?? ''}
        onChange={(event) => {
          onChange({ ...row, min: toNumber(event.target.value) })
        }}
      />
      <input
        className="filter-row-input filter-row-narrow"
        inputMode="decimal"
        placeholder={compact(spec.max)}
        aria-label={`Row ${number} maximum`}
        value={row.max ?? ''}
        onChange={(event) => {
          onChange({ ...row, max: toNumber(event.target.value) })
        }}
      />
    </>
  )
}

/** Cleared or nonsense means "no bound", not zero. */
function toNumber(raw: string): number | undefined {
  const text = raw.trim()
  if (text === '') return undefined
  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}

/**
 * The bound as a hint. A free-float market cap runs to thirteen digits and
 * clips mid-number, which reads as a broken field rather than as a range.
 */
function compact(value: number | undefined): string {
  if (value === undefined) return ''
  return value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })
}

function Action({
  label,
  glyph,
  onClick
}: {
  label: string
  glyph: string
  onClick: () => void
}): ReactElement {
  return (
    <button type="button" className="filter-row-action" aria-label={label} onClick={onClick}>
      {glyph}
    </button>
  )
}
