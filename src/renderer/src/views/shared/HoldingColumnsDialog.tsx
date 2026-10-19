import { useState, type ReactElement } from 'react'
import { Checkbox } from '../../components/Checkbox/Checkbox'
import { Dialog } from '../../components/Dialog/Dialog'
import { useHoldingColumnsStore } from '../../state/holdingColumns'
import { referenceChoices, type ReferenceColumn } from './holdingColumns'
import { useFieldCatalogue } from './queries'
import './HoldingColumnsDialog.css'

interface HoldingColumnsDialogProps {
  /** The table being set; omitted, the dialog sets the default for every table. */
  table?: string
  onClose: () => void
}

/**
 * Which reference columns sit beside the ticker (Karan, 2026-10-19).
 *
 * From Asset → Holding columns it sets the default every holdings table
 * follows; from a table's own button it sets that table, which can also go
 * back to the default. The choices are the engine's catalogue of stored
 * reference columns, so a column the loaded data carries can be shown
 * without a change here. Changes apply as they are made.
 */
export function HoldingColumnsDialog({ table, onClose }: HoldingColumnsDialogProps): ReactElement {
  const defaults = useHoldingColumnsStore((state) => state.defaults)
  const own = useHoldingColumnsStore((state) =>
    table === undefined ? undefined : state.byTable[table]
  )
  const setDefaults = useHoldingColumnsStore((state) => state.setDefaults)
  const setTable = useHoldingColumnsStore((state) => state.setTable)
  const catalogue = useFieldCatalogue()

  const followsDefault = table !== undefined && own === undefined
  const chosen = table === undefined ? defaults : (own ?? defaults)
  const choices = withChosen(referenceChoices(catalogue.data?.fields ?? []), chosen)

  const choose = (next: readonly string[]): void => {
    if (table === undefined) setDefaults(next)
    else setTable(table, next)
  }

  return (
    <Dialog
      title={table === undefined ? 'Holding columns' : 'Columns'}
      // A table's own chooser says nothing about itself: what it is for is
      // plain from where it opened (Karan, 2026-10-19).
      {...(table === undefined
        ? {
            note: 'The columns every holdings table shows beside the ticker, unless a table has its own.'
          }
        : {})}
      onClose={onClose}
      width={420}
    >
      {table !== undefined && (
        <Checkbox
          label="Global Settings"
          checked={followsDefault}
          onChange={(checked) => {
            setTable(table, checked ? undefined : defaults)
          }}
        />
      )}
      <ColumnList
        choices={choices}
        chosen={chosen}
        disabled={followsDefault}
        loading={catalogue.isPending}
        onChange={choose}
      />
    </Dialog>
  )
}

interface ColumnListProps {
  choices: readonly ReferenceColumn[]
  chosen: readonly string[]
  disabled: boolean
  loading: boolean
  onChange: (next: readonly string[]) => void
}

function ColumnList({ choices, chosen, disabled, loading, onChange }: ColumnListProps) {
  const [query, setQuery] = useState('')
  const shown = choices.filter((choice) =>
    choice.label.toLowerCase().includes(query.trim().toLowerCase())
  )

  return (
    <div className="holding-columns">
      <input
        className="holding-columns-search"
        aria-label="Find a column"
        placeholder="Find a column"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
        }}
      />
      {loading && choices.length === 0 && (
        <p className="holding-columns-note type-11">Reading the columns the data carries…</p>
      )}
      <div className="holding-columns-list">
        {shown.map((choice) => (
          <Checkbox
            key={choice.key}
            label={choice.label}
            checked={chosen.includes(choice.key)}
            disabled={disabled}
            onChange={(checked) => {
              // A new column goes on the end, so what was there keeps its place.
              onChange(
                checked ? [...chosen, choice.key] : chosen.filter((key) => key !== choice.key)
              )
            }}
          />
        ))}
      </div>
    </div>
  )
}

/*
 * A chosen column the catalogue does not list (no engine yet, or data
 * without it) stays in the list, so it can still be taken off.
 */
function withChosen(
  choices: readonly ReferenceColumn[],
  chosen: readonly string[]
): ReferenceColumn[] {
  const listed = new Set(choices.map((choice) => choice.key))
  const missing = chosen.filter((key) => !listed.has(key)).map((key) => ({ key, label: key }))
  return [...choices, ...missing]
}
