import type { ReactElement } from 'react'
import { Section } from '../../components/Section/Section'
import { Field } from '../../components/Field/Field'
import { Select } from '../../components/Select/Select'
import type { ParameterSpec, TypeSpec } from '../index-definition/ruleCatalogue'
import type { BacktestOptions, StrategyDocument } from '../shared/strategyDocuments'
import { useIndices } from '../shared/strategyQueries'
import { SettingsEditor, TypedEditor } from './SpecEditors'
import { BoundField } from './SpecFields'
import { addTo, listRows } from './specRowBuilders'
import { SpecRows, type SpecGroup, type SpecRow } from './SpecRows'
import { labelOf, summariseSpec, summariseValues } from './specSummary'
import { KINDS, withStrategy, type StrategySpec, type TypedSpec } from './strategyDraft'

type Edit = (change: (current: StrategyDocument) => StrategyDocument) => void

export interface StrategyFormProps {
  document: StrategyDocument
  onChange: Edit
  options: BacktestOptions | undefined
}

/** An active strategy's two windows, described as the catalogue would. */
const LOOKBACK: ParameterSpec = {
  name: 'lookback_days',
  label: 'Covariance window',
  type: 'integer',
  required: false,
  default: null,
  choices: null,
  help: 'Trading days the covariance is estimated over; a year when empty.',
  unit: 'days',
  order: 0
}

const OBSERVATIONS: ParameterSpec = {
  name: 'minimum_observations',
  label: 'Fewest returns',
  type: 'integer',
  required: false,
  default: null,
  choices: null,
  help: 'The fewest returns a name needs to be measured; 126 when empty.',
  unit: 'days',
  order: 1
}

/**
 * What the strategy is: its name, the index it holds and how it holds it
 * (Karan, 2026-10-19). The details are one row of fields; how it holds the
 * index is rows, as Index Definition draws its methodology.
 */
export function StrategyForm({ document, onChange, options }: StrategyFormProps): ReactElement {
  const indices = useIndices()
  const kind = document.strategy?.type ?? 'index'

  return (
    <>
      <Section title="Strategy" className="strategy-card">
        <div className="strategy-form-row">
          <Field label="Name *" width={240}>
            <input
              className="param-field-input"
              aria-label="Strategy name"
              value={document.name}
              onChange={(event) => {
                const name = event.target.value
                onChange((current) => ({ ...current, name }))
              }}
            />
          </Field>
          <Field label="Index *" width={200}>
            <Select
              label="Index"
              options={(indices.data?.indices ?? []).map((index) => ({
                value: index.id,
                label: `${index.id} · ${index.name}`
              }))}
              value={document.index_id}
              placeholder="Choose…"
              onChange={(index_id) => {
                onChange((current) => ({ ...current, index_id }))
              }}
            />
          </Field>
          <Field label="Kind" width={200}>
            <Select
              label="Kind"
              options={KINDS}
              value={kind}
              onChange={(type) => {
                // What one kind needs means nothing to another, so a change of
                // kind starts it clean rather than carrying stale specs.
                onChange((current) => withKind(current, type))
              }}
            />
          </Field>
          <Field label="Description" width={320}>
            <input
              className="param-field-input"
              aria-label="Strategy description"
              value={document.description ?? ''}
              onChange={(event) => {
                const description = event.target.value
                onChange((current) => ({
                  ...current,
                  description: description === '' ? null : description
                }))
              }}
            />
          </Field>
        </div>
        <p className="strategy-note type-11">{describeKind(kind, document.index_id)}</p>
      </Section>

      {kind === 'index_tracking' && (
        <SpecRows
          title="Replication"
          groups={[replicationGroup(document.strategy, options, onChange)]}
        />
      )}
      {kind === 'active' && (
        <SpecRows title="Portfolio" groups={activeGroups(document.strategy, options, onChange)} />
      )}
    </>
  )
}

/** How a tracking strategy holds the index: one replication, with its own settings. */
function replicationGroup(
  spec: StrategySpec | null | undefined,
  options: BacktestOptions | undefined,
  onChange: Edit
): SpecGroup {
  const catalogue = options?.replications ?? []
  const set = (replication: TypedSpec | null): void => {
    onChange((current) => withStrategy(current, { replication }))
  }
  return single(
    'replication',
    'How the index is held',
    'Replication',
    catalogue,
    spec?.replication,
    set
  )
}

/**
 * What an active strategy believes and how it turns that into a portfolio:
 * a signal, an optimiser (the construction), the constraints the optimiser
 * works within, and how often and over what history it runs.
 */
function activeGroups(
  spec: StrategySpec | null | undefined,
  options: BacktestOptions | undefined,
  onChange: Edit
): SpecGroup[] {
  const set = (change: Partial<StrategySpec>): void => {
    onChange((current) => withStrategy(current, change))
  }
  const constraints = spec?.constraints ?? []
  const constraintCatalogue = options?.active_constraints ?? []
  const rebalancing = options?.choices.rebalancing ?? ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']

  return [
    single(
      'signal',
      'Signal · what it believes',
      'Signal',
      options?.signals ?? [],
      spec?.signal,
      (signal) => {
        set({ signal })
      }
    ),
    single(
      'construction',
      'Optimiser · how it builds the portfolio',
      'Optimiser',
      options?.constructions ?? [],
      spec?.construction,
      (construction) => {
        set({ construction })
      }
    ),
    {
      key: 'constraints',
      label: 'Constraints · what the portfolio must satisfy',
      rows: listRows('constraint', 'Constraint', constraintCatalogue, constraints, (next) => {
        set({ constraints: next })
      }),
      add: addTo('Add constraint', 'constraint', constraintCatalogue, constraints, (next) => {
        set({ constraints: next })
      })
    },
    {
      key: 'running',
      label: 'Rebalancing and estimation',
      rows: [runningRow(spec, rebalancing, set)]
    }
  ]
}

/** A group holding at most one typed spec: a row when chosen, an add slot when not. */
function single(
  key: string,
  heading: string,
  label: string,
  catalogue: readonly TypeSpec[],
  spec: TypedSpec | null | undefined,
  onChange: (next: TypedSpec | null) => void
): SpecGroup {
  const editor = (close: () => void) => (
    <TypedEditor
      label={label}
      catalogue={catalogue}
      spec={spec}
      onApply={(next) => {
        onChange(next)
        close()
      }}
      onCancel={close}
    />
  )
  if (spec == null) {
    const first = catalogue[0]
    return {
      key,
      label: heading,
      rows: [],
      add: {
        label: `Choose ${label.toLowerCase()}`,
        ...(first === undefined ? { blocked: 'This engine lists none.' } : {}),
        onAdd: () => {
          if (first === undefined) return undefined
          onChange({ type: first.name, params: {} })
          return key
        }
      }
    }
  }
  return {
    key,
    label: heading,
    rows: [
      {
        id: key,
        badge: labelOf(catalogue, spec.type),
        summary: summariseSpec(catalogue, spec),
        editor,
        onRemove: () => {
          onChange(null)
        }
      }
    ]
  }
}

/** How often an active strategy rebalances, and the history it estimates over. */
function runningRow(
  spec: StrategySpec | null | undefined,
  rebalancing: readonly string[],
  set: (change: Partial<StrategySpec>) => void
): SpecRow {
  const every = (spec?.rebalancing ?? 'MONTHLY').toLowerCase()
  const windows = summariseValues([LOOKBACK, OBSERVATIONS], {
    lookback_days: spec?.lookback_days,
    minimum_observations: spec?.minimum_observations
  })
  return {
    id: 'running',
    badge: 'Rebalancing',
    summary: `${every.charAt(0).toUpperCase()}${every.slice(1)} · ${windows}`,
    editor: (close) => (
      <SettingsEditor onDone={close}>
        <Field label="Rebalancing" width={160}>
          <Select
            label="Rebalancing"
            options={rebalancing.map((value) => ({ value, label: value.toLowerCase() }))}
            value={spec?.rebalancing ?? 'MONTHLY'}
            onChange={(next) => {
              set({ rebalancing: next })
            }}
          />
        </Field>
        <BoundField
          param={LOOKBACK}
          value={spec?.lookback_days ?? undefined}
          onChange={(value) => {
            set({ lookback_days: typeof value === 'number' ? value : null })
          }}
        />
        <BoundField
          param={OBSERVATIONS}
          value={spec?.minimum_observations ?? undefined}
          onChange={(value) => {
            set({ minimum_observations: typeof value === 'number' ? value : null })
          }}
        />
      </SettingsEditor>
    )
  }
}

function withKind(document: StrategyDocument, type: string): StrategyDocument {
  return {
    ...document,
    strategy: { type, rebalancing: document.strategy?.rebalancing ?? 'MONTHLY' }
  }
}

function describeKind(kind: string, indexId: string): string {
  const index = indexId === '' ? 'the index' : indexId
  if (kind === 'index_tracking')
    return `Holds ${index} through a replication: a sample, an optimised subset, futures or a swap.`
  if (kind === 'active')
    return `Builds its own portfolio from ${index}'s constituents with an optimiser, measured against ${index}.`
  return `Holds ${index} exactly as defined, at its own weights.`
}
