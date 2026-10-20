import { useState, type ReactElement } from 'react'
import { TickerField } from '../../../components/TickerField/TickerField'
import { plainLabel, readList, written } from './paramValues'
import './params.css'

/**
 * Names, such as those a screen leaves out or a bound applies to (BN-330):
 * each a ticker that can be taken off, and a search to add more from the
 * engine's identifiers.
 */
export function IdentifierListField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (next: string) => void
}): ReactElement {
  const names = readList(value)
  // A new search box after each name, so it starts empty for the next.
  const [added, setAdded] = useState(0)

  return (
    <div className="param-field-structured">
      <span className="field-label">{label}</span>
      {names.length > 0 && (
        <ul className="param-names" aria-label={plainLabel(label)}>
          {names.map((name) => (
            <li key={name} className="param-name">
              <span>{name}</span>
              <button
                type="button"
                className="param-remove"
                aria-label={`Remove ${name}`}
                onClick={() => {
                  onChange(written(names.filter((entry) => entry !== name)))
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <TickerField
        key={added}
        subject=""
        label={`Add to ${plainLabel(label).toLowerCase()}`}
        className="param-search"
        onQuery={(name) => {
          if (!names.includes(name)) onChange(written([...names, name]))
          setAdded((count) => count + 1)
        }}
      />
    </div>
  )
}
