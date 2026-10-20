import { useState, type ReactElement } from 'react'
import { FormattedInput } from '../../../components/FormattedInput/FormattedInput'
import { TickerField } from '../../../components/TickerField/TickerField'
import { plainLabel, readNumbers, written } from './paramValues'
import './params.css'

interface KeyedNumbersProps {
  label: string
  /** What the keys are, as the first column's head. */
  keyLabel: string
  /** What the numbers are, as the second column's head. */
  valueLabel: string
  value: string
  onChange: (next: string) => void
  /** Fractions typed as percents, such as weights; otherwise plain numbers. */
  percent: boolean
  /**
   * Fixed rows, such as the factors a tilt names: each takes a number or
   * none, and no row is added or taken off. Without them, rows are tickers
   * added from a search.
   */
  keys?: readonly string[]
}

/**
 * A number for each name (BN-330), as a table: a basket's weights, a risk
 * budget, expected returns, or a target for each factor. With tickers, the
 * total shows under the table, since some of these are scaled to add up.
 */
export function KeyedNumbersField({
  label,
  keyLabel,
  valueLabel,
  value,
  onChange,
  percent,
  keys
}: KeyedNumbersProps): ReactElement {
  const entries = readNumbers(value)
  const numbers = new Map(entries)
  const rows = keys ?? entries.map(([key]) => key)
  const [added, setAdded] = useState(0)

  const set = (key: string, text: string): void => {
    const next = new Map(numbers)
    const number = Number(text)
    // A fixed row left empty is left out; a ticker's row stays while typed.
    if (text.trim() === '' && keys !== undefined) next.delete(key)
    else next.set(key, text.trim() === '' || !Number.isFinite(number) ? 0 : number)
    onChange(written(Object.fromEntries(next)))
  }

  const remove = (key: string): void => {
    onChange(written(Object.fromEntries(entries.filter(([entry]) => entry !== key))))
  }

  return (
    <div className="param-field-structured">
      <span className="field-label">{label}</span>
      {rows.length > 0 && (
        <table className="param-table" aria-label={plainLabel(label)}>
          <thead>
            <tr>
              <th>{keyLabel}</th>
              <th>{percent ? `${valueLabel} (%)` : valueLabel}</th>
              {keys === undefined && <th aria-label="Remove" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((key) => (
              <tr key={key}>
                <td>{key}</td>
                <td>
                  <NumberCell
                    label={`${valueLabel} for ${key}`}
                    value={numbers.get(key)}
                    percent={percent}
                    onChange={(text) => {
                      set(key, text)
                    }}
                  />
                </td>
                {keys === undefined && (
                  <td>
                    <button
                      type="button"
                      className="param-remove"
                      aria-label={`Remove ${key}`}
                      onClick={() => {
                        remove(key)
                      }}
                    >
                      ×
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {keys === undefined && entries.length > 0 && (
        <p className="param-total">Total {total(entries, percent)}</p>
      )}
      {keys === undefined && (
        <TickerField
          key={added}
          subject=""
          label={`Add to ${plainLabel(label).toLowerCase()}`}
          className="param-search"
          onQuery={(name) => {
            if (!numbers.has(name)) set(name, '0')
            setAdded((count) => count + 1)
          }}
        />
      )}
      {keys?.length === 0 && <p className="param-note type-11">Name the factors first.</p>}
    </div>
  )
}

function NumberCell({
  label,
  value,
  percent,
  onChange
}: {
  label: string
  value: number | undefined
  percent: boolean
  onChange: (text: string) => void
}): ReactElement {
  const text = value === undefined ? '' : String(value)
  // What is typed is kept while it still means the stored number: "0." and
  // "-" are on the way to one, and re-reading the number would undo them.
  const [draft, setDraft] = useState(text)
  const shown = draft === '-' || (draft !== '' && Number(draft) === value) ? draft : text
  if (percent) {
    return (
      <FormattedInput
        className="param-field-input"
        label={label}
        value={text}
        format="percent"
        onChange={onChange}
      />
    )
  }
  return (
    <input
      className="param-field-input"
      aria-label={label}
      // Left empty, a factor is aimed at zero.
      placeholder="0"
      value={shown}
      onChange={(event) => {
        setDraft(event.target.value)
        onChange(event.target.value)
      }}
    />
  )
}

function total(entries: readonly [string, number][], percent: boolean): string {
  const sum = entries.reduce((running, [, number]) => running + number, 0)
  return percent ? `${(sum * 100).toFixed(1)}%` : sum.toLocaleString('en-US')
}
