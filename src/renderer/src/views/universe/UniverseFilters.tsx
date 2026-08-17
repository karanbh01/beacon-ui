import type { ReactElement } from 'react'
import { Field } from '../../components/Field/Field'
import { labelFor, type FilterSpec, type FilterState } from './builder'
import './UniverseFilters.css'

export interface UniverseFiltersProps {
  specs: readonly FilterSpec[]
  state: FilterState
  onChange: (next: FilterState) => void
  /** Numeric fields available to rank by. */
  rankable: readonly string[]
}

/**
 * The bound as a hint, not a number to read off.
 *
 * A free-float market cap runs to thirteen digits and simply does not fit the
 * box — spelled out it clips mid-number, which reads as a broken field rather
 * than as "this is roughly the range".
 */
function hint(value: number | undefined): string {
  if (value === undefined) return ''
  return value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })
}

/**
 * One control per dimension the data actually has (BU-85).
 *
 * Karan asked for region, country, sector, market cap and rank, each its own
 * filter rather than merged. The engine's reference frame carries none of
 * region, country or market cap — so these are generated from whatever
 * columns come back, and those three appear on their own the day py-beacon
 * publishes them. Sector and rank are here today; exchange and currency are
 * the honest proxies for region in this dataset.
 */
export function UniverseFilters({
  specs,
  state,
  onChange,
  rankable
}: UniverseFiltersProps): ReactElement {
  const setCategory = (field: string, value: string, checked: boolean): void => {
    const current = state.categories[field] ?? []
    const next = checked ? [...current, value] : current.filter((entry) => entry !== value)
    onChange({ ...state, categories: { ...state.categories, [field]: next } })
  }

  const setBound = (field: string, edge: 'min' | 'max', raw: string): void => {
    const parsed = raw.trim() === '' ? undefined : Number(raw)
    const kept = edge === 'min' ? 'max' : 'min'
    // Cleared or nonsense means "no bound on this edge" — rebuilt rather than
    // deleted, so an empty box never leaves a stale number behind.
    const bounds =
      parsed === undefined || !Number.isFinite(parsed)
        ? { [kept]: state.ranges[field]?.[kept] }
        : { ...state.ranges[field], [edge]: parsed }

    onChange({ ...state, ranges: { ...state.ranges, [field]: bounds } })
  }

  return (
    <div className="universe-filters">
      {specs.length === 0 && (
        <p className="universe-filters-empty type-11">
          Nothing to filter on — the loaded reference data has no dimension with more than one
          value.
        </p>
      )}

      {specs.map((spec) =>
        spec.kind === 'category' ? (
          <fieldset key={spec.field} className="universe-filter">
            <legend className="universe-filter-legend">{spec.label}</legend>
            <div className="universe-filter-values">
              {(spec.values ?? []).map((value) => (
                <label key={value} className="universe-filter-check type-11">
                  <input
                    type="checkbox"
                    checked={(state.categories[spec.field] ?? []).includes(value)}
                    onChange={(event) => {
                      setCategory(spec.field, value, event.target.checked)
                    }}
                  />
                  {value}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <fieldset key={spec.field} className="universe-filter">
            <legend className="universe-filter-legend">{spec.label}</legend>
            <div className="universe-filter-range">
              <Field label="Min" width={110}>
                <input
                  className="universe-filter-input"
                  inputMode="decimal"
                  aria-label={`${spec.label} minimum`}
                  placeholder={hint(spec.min)}
                  value={state.ranges[spec.field]?.min ?? ''}
                  onChange={(event) => {
                    setBound(spec.field, 'min', event.target.value)
                  }}
                />
              </Field>
              <Field label="Max" width={110}>
                <input
                  className="universe-filter-input"
                  inputMode="decimal"
                  aria-label={`${spec.label} maximum`}
                  placeholder={hint(spec.max)}
                  value={state.ranges[spec.field]?.max ?? ''}
                  onChange={(event) => {
                    setBound(spec.field, 'max', event.target.value)
                  }}
                />
              </Field>
            </div>
          </fieldset>
        )
      )}

      {rankable.length > 0 && (
        <fieldset className="universe-filter">
          <legend className="universe-filter-legend">Rank</legend>
          <div className="universe-filter-range">
            <Field label="Keep" width={90}>
              <select
                className="universe-filter-input"
                aria-label="Rank direction"
                value={state.rank?.direction ?? 'top'}
                onChange={(event) => {
                  const direction = event.target.value === 'bottom' ? 'bottom' : 'top'
                  const field = state.rank?.field ?? rankable[0]
                  if (field === undefined) return
                  onChange({
                    ...state,
                    rank: { field, direction, count: state.rank?.count ?? 10 }
                  })
                }}
              >
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
              </select>
            </Field>
            <Field label="How many" width={110}>
              <input
                className="universe-filter-input"
                inputMode="numeric"
                aria-label="Rank count"
                placeholder="all"
                value={state.rank?.count ?? ''}
                onChange={(event) => {
                  const count = Number(event.target.value)
                  const field = state.rank?.field ?? rankable[0]
                  if (field === undefined) return
                  // An empty or nonsense count means "do not rank" rather
                  // than "keep none", which would empty the table and read
                  // as a filter that had gone wrong.
                  if (!Number.isFinite(count) || count <= 0) {
                    onChange({ categories: state.categories, ranges: state.ranges })
                    return
                  }
                  onChange({
                    ...state,
                    rank: { field, count, direction: state.rank?.direction ?? 'top' }
                  })
                }}
              />
            </Field>
            <Field label="By" width={150}>
              <select
                className="universe-filter-input"
                aria-label="Rank field"
                value={state.rank?.field ?? rankable[0]}
                onChange={(event) => {
                  onChange({
                    ...state,
                    rank: {
                      field: event.target.value,
                      count: state.rank?.count ?? 10,
                      direction: state.rank?.direction ?? 'top'
                    }
                  })
                }}
              >
                {rankable.map((field) => (
                  <option key={field} value={field}>
                    {labelFor(field)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </fieldset>
      )}
    </div>
  )
}
