import type { ReactElement } from 'react'
import { Section } from '../../components/Section/Section'
import { Field } from '../../components/Field/Field'
import { Select } from '../../components/Select/Select'
import type { ParameterSpec } from '../index-definition/ruleCatalogue'
import type { BacktestOptions, StrategyDocument } from '../shared/strategyDocuments'
import { useIndices } from '../shared/strategyQueries'
import { BoundField, SpecEditor, SpecList } from './SpecFields'
import { KINDS, withStrategy } from './strategyDraft'

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
 * What the strategy is: its name, the index it holds, and how it holds it.
 *
 * The kind decides the rest of the card. The index as defined needs nothing
 * more; tracking it needs a replication; active needs what it believes (a
 * signal), how it builds a portfolio from that (a construction) and what
 * that portfolio must satisfy (constraints), all measured against the index.
 */
export function StrategyForm({ document, onChange, options }: StrategyFormProps): ReactElement {
  const indices = useIndices()
  const kind = document.strategy?.type ?? 'index'

  return (
    <Section title="Strategy" className="strategy-card">
      <div className="strategy-form-row">
        <Field label="Name *" width={260}>
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
        <Field label="Kind" width={220}>
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
      </div>

      <div className="strategy-form-row">
        <Field label="Description" width={540}>
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

      {kind === 'index_tracking' && (
        <SpecEditor
          label="Replication"
          catalogue={options?.replications ?? []}
          spec={document.strategy?.replication}
          onChange={(replication) => {
            onChange((current) => withStrategy(current, { replication }))
          }}
        />
      )}

      {kind === 'active' && (
        <ActiveFields document={document} onChange={onChange} options={options} />
      )}

      <p className="strategy-note type-11">{describeKind(kind, document.index_id)}</p>
    </Section>
  )
}

function ActiveFields({ document, onChange, options }: StrategyFormProps): ReactElement {
  const spec = document.strategy
  const rebalancing = options?.choices.rebalancing ?? ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']

  return (
    <>
      <SpecEditor
        label="Signal"
        catalogue={options?.signals ?? []}
        spec={spec?.signal}
        noneLabel="None"
        onChange={(signal) => {
          onChange((current) => withStrategy(current, { signal }))
        }}
      />
      <SpecEditor
        label="Construction"
        catalogue={options?.constructions ?? []}
        spec={spec?.construction}
        noneLabel="MaxAlpha, default budget"
        onChange={(construction) => {
          onChange((current) => withStrategy(current, { construction }))
        }}
      />
      <SpecList
        label="Constraint"
        addLabel="Add constraint"
        catalogue={options?.active_constraints ?? []}
        specs={spec?.constraints ?? []}
        onChange={(constraints) => {
          onChange((current) => withStrategy(current, { constraints }))
        }}
      />
      <div className="strategy-form-row">
        <Field label="Rebalancing" width={160}>
          <Select
            label="Rebalancing"
            options={rebalancing.map((value) => ({ value, label: value.toLowerCase() }))}
            value={spec?.rebalancing ?? 'MONTHLY'}
            onChange={(next) => {
              onChange((current) => withStrategy(current, { rebalancing: next }))
            }}
          />
        </Field>
        <BoundField
          param={LOOKBACK}
          value={spec?.lookback_days ?? undefined}
          onChange={(value) => {
            onChange((current) =>
              withStrategy(current, { lookback_days: typeof value === 'number' ? value : null })
            )
          }}
        />
        <BoundField
          param={OBSERVATIONS}
          value={spec?.minimum_observations ?? undefined}
          onChange={(value) => {
            onChange((current) =>
              withStrategy(current, {
                minimum_observations: typeof value === 'number' ? value : null
              })
            )
          }}
        />
      </div>
    </>
  )
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
    return `Holds ${index} through the replication above: a sample, an optimised subset, futures or a swap.`
  if (kind === 'active')
    return `Builds its own portfolio, measured against ${index}. Its universe is ${index}'s constituents.`
  return `Holds ${index} exactly as defined, at its own weights.`
}
