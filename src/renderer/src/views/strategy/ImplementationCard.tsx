import type { ReactElement } from 'react'
import { Section } from '../../components/Section/Section'
import type { BacktestOptions, StrategyDocument } from '../shared/strategyDocuments'
import { BoundField, GroupFields, SpecList } from './SpecFields'
import { withImplementation, type ImplementationSpec } from './strategyDraft'

type Edit = (change: (current: StrategyDocument) => StrategyDocument) => void

/** Settings that travel as one object each, in the order a trader meets them. */
const GROUPS = [
  { key: 'minimum_position', title: 'Minimum position' },
  { key: 'execution', title: 'Execution limits' },
  { key: 'impact', title: 'Market impact' },
  { key: 'equitise', title: 'Equitise cash with futures' }
] as const

/**
 * How the strategy is carried out at the fund's size (BN-312): which names
 * may be held, how much of each, and what trading costs and allows. None of
 * it is the index's; all of it is why a fund's return differs from it, which
 * the Overview's Implementation face then reads back off the run.
 */
export function ImplementationCard({
  document,
  onChange,
  options
}: {
  document: StrategyDocument
  onChange: Edit
  options: BacktestOptions | undefined
}): ReactElement {
  const implementation = document.implementation
  const settings = options?.implementation_settings ?? []
  const scalars = settings.filter((param) => !param.name.includes('.'))

  const patch = (change: Partial<ImplementationSpec>): void => {
    onChange((current) => withImplementation(current, change))
  }

  return (
    <Section title="Implementation" className="strategy-card">
      <h4 className="strategy-section-label type-11">Screens · which names may be held</h4>
      <SpecList
        label="Screen"
        addLabel="Add screen"
        catalogue={options?.screens ?? []}
        specs={implementation?.screens ?? []}
        onChange={(screens) => {
          patch({ screens })
        }}
      />

      <h4 className="strategy-section-label type-11">Caps · how much of each</h4>
      <SpecList
        label="Cap"
        addLabel="Add cap"
        catalogue={options?.caps ?? []}
        specs={implementation?.caps ?? []}
        onChange={(caps) => {
          patch({ caps })
        }}
      />

      <h4 className="strategy-section-label type-11">The book</h4>
      <div className="strategy-form-row">
        {scalars.map((param) => (
          <BoundField
            key={param.name}
            param={param}
            value={scalarOf(implementation, param.name)}
            onChange={(value) => {
              // Keyed by the catalogue's name, which is the spec's field.
              patch({ [param.name]: value ?? param.default })
            }}
          />
        ))}
      </div>

      {GROUPS.map((group) => (
        <div key={group.key}>
          <h4 className="strategy-section-label type-11">{group.title}</h4>
          <div className="strategy-form-row">
            <GroupFields
              params={settings}
              group={group.key}
              value={groupOf(implementation, group.key)}
              onChange={(value) => {
                patch({ [group.key]: value })
              }}
            />
          </div>
        </div>
      ))}
    </Section>
  )
}

function scalarOf(implementation: ImplementationSpec | null | undefined, name: string): unknown {
  if (implementation == null) return undefined
  return (implementation as Record<string, unknown>)[name]
}

function groupOf(
  implementation: ImplementationSpec | null | undefined,
  key: string
): Record<string, unknown> | null {
  const value = scalarOf(implementation, key)
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}
