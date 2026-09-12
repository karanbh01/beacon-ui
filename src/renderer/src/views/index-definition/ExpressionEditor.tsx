import { useMemo, type ReactElement } from 'react'
import { AddSlot } from '../../components/AddSlot/AddSlot'
import { CheckSelect } from '../../components/CheckSelect/CheckSelect'
import { Field } from '../../components/Field/Field'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { Select } from '../../components/Select/Select'
import { useUniverseMembers } from '../shared/strategyQueries'
import { useFieldCatalogue } from '../shared/queries'
import { useReferenceFacets, valuesFor } from '../shared/referenceFacets'
import { labelFor } from '../universe/builder'
import {
  blankClause,
  coerceValue,
  COMPARISONS,
  MULTI,
  readScreen,
  writeScreen,
  type Clause,
  type ExpressionNode,
  type Screen
} from './expression'
import './ExpressionEditor.css'

export interface ExpressionEditorProps {
  /** The stored tree, or nothing on a rule that has not been written yet. */
  value: ExpressionNode | undefined
  onChange: (value: ExpressionNode | undefined) => void
  /** The index's universe, whose names supply the values worth offering. */
  universeId: string
}

/**
 * A screen, as rows (BU-182).
 *
 * py-beacon's expression grammar is an arbitrary tree, and this draws the
 * flat case: clauses joined by all or any, each a field, a comparison and a
 * value. That covers a sector screen, which is what this exists for.
 *
 * A tree it cannot draw is shown and left alone rather than approximated.
 * Rewriting somebody's nested screen into the nearest thing these rows can
 * express would change what their index selects, silently, because they
 * opened the rule and closed it again.
 *
 * The fields come from `/data/fields`, which is the authority on how a
 * field is SPELLED — py-beacon lowercases a stored column on the way out,
 * so `SECTOR` is written `reference.sector` and guessing that here is how a
 * screen names a datapoint the engine has never heard of. The values come
 * from the universe's own reference rows, so the options are the ones
 * actually present rather than a list maintained here.
 */
export function ExpressionEditor({
  value,
  onChange,
  universeId
}: ExpressionEditorProps): ReactElement {
  const catalogue = useFieldCatalogue()
  const members = useUniverseMembers(universeId)
  const facets = useReferenceFacets(members.data?.identifiers ?? [])

  const screen = readScreen(value)

  /*
   * Reference fields only, for now.
   *
   * Market and feature fields are screenable too and the grammar reaches
   * them, but their values are numbers with no closed set to offer and
   * FeatureRule already covers the common case. Widening this is a
   * one-line change to the filter when somebody wants it.
   */
  const fields = useMemo(
    () =>
      (catalogue.data?.fields ?? [])
        .filter((field) => field.namespace === 'reference')
        .map((field) => ({ value: field.path, label: labelFor(field.name) })),
    [catalogue.data]
  )

  if (screen === undefined) {
    return (
      <div className="expression-editor">
        <p className="expression-note type-11">
          This screen nests groups inside groups, which these rows cannot show. It is left exactly
          as it is — editing here would have to flatten it, and that would change what the index
          selects.
        </p>
      </div>
    )
  }

  const update = (next: Screen): void => {
    onChange(writeScreen(next))
  }

  const replace = (clause: Clause): void => {
    update({
      ...screen,
      clauses: screen.clauses.map((entry) => (entry.id === clause.id ? clause : entry))
    })
  }

  return (
    <div className="expression-editor">
      {screen.clauses.length > 1 && (
        <SegmentedControl
          segments={[
            { value: 'all', label: 'Match all' },
            { value: 'any', label: 'Match any' }
          ]}
          value={screen.combinator}
          onChange={(combinator) => {
            update({ ...screen, combinator })
          }}
          label="Combine clauses"
        />
      )}

      {screen.clauses.map((clause) => (
        <ClauseRow
          key={clause.id}
          clause={clause}
          fields={fields}
          choices={choicesFor(clause.path, facets.specs)}
          onChange={replace}
          onRemove={() => {
            update({ ...screen, clauses: screen.clauses.filter((one) => one.id !== clause.id) })
          }}
        />
      ))}

      <AddSlot
        label="Add clause…"
        {...(fields.length === 0
          ? { blocked: 'This engine publishes no reference fields to screen on' }
          : {})}
        onClick={() => {
          const first = fields[0]
          if (first === undefined) return
          update({ ...screen, clauses: [...screen.clauses, blankClause(first.value)] })
        }}
      />

      {screen.clauses.length > 0 && facets.specs.length === 0 && !facets.loading && (
        <p className="expression-note type-11">
          {universeId === ''
            ? 'Choose a universe to be offered the values its names actually take.'
            : 'No reference values for this universe, so a value has to be typed.'}
        </p>
      )}
    </div>
  )
}

function choicesFor(path: string, specs: ReturnType<typeof useReferenceFacets>['specs']): string[] {
  // The path is `reference.sector`; the reference row is keyed on the column.
  const name = path.split('.').pop() ?? ''
  return valuesFor(specs, name)
}

function ClauseRow({
  clause,
  fields,
  choices,
  onChange,
  onRemove
}: {
  clause: Clause
  fields: readonly { value: string; label: string }[]
  choices: readonly string[]
  onChange: (clause: Clause) => void
  onRemove: () => void
}): ReactElement {
  const multi = MULTI.includes(clause.comparison)

  return (
    <div className="expression-clause">
      <Field label="Field" width={170}>
        <Select
          className="expression-inline-select"
          label="Field"
          options={[...fields]}
          value={clause.path}
          placeholder="Choose…"
          onChange={(path) => {
            // The values belong to the old field, so they do not carry over.
            onChange({ ...clause, path, value: multi ? [] : '' })
          }}
        />
      </Field>

      <Field label="Comparison" width={150}>
        <Select
          className="expression-inline-select"
          label="Comparison"
          options={COMPARISONS.map((entry) => ({
            value: entry.value,
            label: clause.negated ? `not ${entry.label}` : entry.label
          }))}
          value={clause.comparison}
          onChange={(next) => {
            const comparison = next as Clause['comparison']
            // `in` takes a list and `eq` a scalar; carrying the value across
            // beats leaving a string where the engine wants an array, which
            // it refuses at save with the row looking perfectly filled in.
            onChange({ ...clause, comparison, value: coerceValue(clause.value, comparison) })
          }}
        />
      </Field>

      <Field label="Value" width={220}>
        {multi && choices.length > 0 ? (
          <CheckSelect
            options={[...choices]}
            value={Array.isArray(clause.value) ? clause.value.map(String) : []}
            onChange={(value) => {
              onChange({ ...clause, value })
            }}
            label="Value"
            placeholder="Choose…"
          />
        ) : !multi && choices.length > 0 ? (
          <Select
            className="expression-inline-select"
            label="Value"
            options={choices.map((choice) => ({ value: choice, label: choice }))}
            value={String(clause.value)}
            placeholder="Choose…"
            onChange={(value) => {
              onChange({ ...clause, value })
            }}
          />
        ) : (
          <input
            className="expression-input"
            aria-label="Value"
            value={Array.isArray(clause.value) ? clause.value.join(', ') : String(clause.value)}
            onChange={(event) => {
              const raw = event.target.value
              onChange({ ...clause, value: multi ? raw.split(',').map((one) => one.trim()) : raw })
            }}
          />
        )}
      </Field>

      <button
        type="button"
        className="expression-action"
        aria-label={`Negate ${clause.path}`}
        aria-pressed={clause.negated}
        onClick={() => {
          onChange({ ...clause, negated: !clause.negated })
        }}
      >
        not
      </button>

      <button
        type="button"
        className="expression-action"
        aria-label={`Remove ${clause.path}`}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  )
}
