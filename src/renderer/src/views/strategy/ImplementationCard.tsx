import type { ReactElement } from 'react'
import type { ParameterSpec } from '../index-definition/ruleCatalogue'
import type { BacktestOptions, StrategyDocument } from '../shared/strategyDocuments'
import { SettingsEditor } from './SpecEditors'
import { BoundField, GroupFields } from './SpecFields'
import { SpecRows, type SpecGroup, type SpecRow } from './SpecRows'
import { addTo, listRows } from './specRowBuilders'
import { summariseValues } from './specSummary'
import { withImplementation, type ImplementationSpec } from './strategyDraft'

type Edit = (change: (current: StrategyDocument) => StrategyDocument) => void

/** Settings that travel as one object each, under the group a trader meets them in. */
const TRADING = [
  { key: 'minimum_position', title: 'Minimum position' },
  { key: 'execution', title: 'Execution limits' },
  { key: 'impact', title: 'Market impact' }
] as const

const FUTURES = [{ key: 'equitise', title: 'Equitise cash with futures' }] as const

/** How far the cash may drift between rebalances before it is reset (py-beacon 0.9.7). */
const CASH_BAND = { key: 'cash_band', title: 'Cash band' } as const

/**
 * How the strategy is carried out at the fund's size (BN-312), drawn as
 * Index Definition draws its methodology (Karan, 2026-10-19): which names
 * may be held (screens), how much of each (caps), the fund's cash and
 * flows, how it trades, and futures for its cash. Each is a row that opens
 * its settings; screens and caps can be added, moved and removed.
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
  const patch = (change: Partial<ImplementationSpec>): void => {
    onChange((current) => withImplementation(current, change))
  }

  const screens = implementation?.screens ?? []
  const caps = implementation?.caps ?? []
  const screenCatalogue = options?.screens ?? []
  const capCatalogue = options?.caps ?? []

  const groups: SpecGroup[] = [
    {
      key: 'screens',
      label: 'Screens · which names may be held',
      rows: listRows('screen', 'Screen', screenCatalogue, screens, (next) => {
        patch({ screens: next })
      }),
      add: addTo('Add screen', 'screen', screenCatalogue, screens, (next) => {
        patch({ screens: next })
      })
    },
    {
      key: 'caps',
      label: 'Caps · how much of each',
      rows: listRows('cap', 'Cap', capCatalogue, caps, (next) => {
        patch({ caps: next })
      }),
      add: addTo('Add cap', 'cap', capCatalogue, caps, (next) => {
        patch({ caps: next })
      })
    },
    {
      key: 'cash',
      label: 'Cash and flows',
      rows: [
        cashRow(settings, implementation, patch),
        groupRow(CASH_BAND, settings, implementation, patch)
      ]
    },
    {
      key: 'trading',
      label: 'Trading',
      rows: TRADING.map((group) => groupRow(group, settings, implementation, patch))
    },
    {
      key: 'futures',
      label: 'Futures',
      rows: FUTURES.map((group) => groupRow(group, settings, implementation, patch))
    }
  ]

  return <SpecRows title="Implementation" groups={groups} />
}

/** The fund's cash buffer, where removed weight goes, and what inflows buy. */
function cashRow(
  settings: readonly ParameterSpec[],
  implementation: ImplementationSpec | null | undefined,
  patch: (change: Partial<ImplementationSpec>) => void
): SpecRow {
  const scalars = settings.filter((param) => !param.name.includes('.'))
  const values = (implementation ?? {}) as Record<string, unknown>
  return {
    id: 'cash',
    badge: 'Cash and flows',
    summary: summariseValues(scalars, values),
    editor: (close) => (
      <SettingsEditor onDone={close}>
        {scalars.map((param) => (
          <BoundField
            key={param.name}
            param={param}
            value={values[param.name]}
            onChange={(value) => {
              patch({ [param.name]: value ?? param.default })
            }}
          />
        ))}
      </SettingsEditor>
    )
  }
}

/** A group of settings that travel as one object, such as the execution limits. */
function groupRow(
  group: { key: string; title: string },
  settings: readonly ParameterSpec[],
  implementation: ImplementationSpec | null | undefined,
  patch: (change: Partial<ImplementationSpec>) => void
): SpecRow {
  const value = groupOf(implementation, group.key)
  const members = settings
    .filter((param) => param.name.startsWith(`${group.key}.`))
    .map((param) => ({ ...param, name: param.name.slice(group.key.length + 1) }))
  return {
    id: group.key,
    badge: group.title,
    summary: value === null ? 'Off' : summariseValues(members, value),
    editor: (close) => (
      <SettingsEditor onDone={close}>
        <GroupFields
          params={settings}
          group={group.key}
          value={value}
          onChange={(next) => {
            patch({ [group.key]: next })
          }}
        />
      </SettingsEditor>
    )
  }
}

function groupOf(
  implementation: ImplementationSpec | null | undefined,
  key: string
): Record<string, unknown> | null {
  const value = (implementation as Record<string, unknown> | null | undefined)?.[key]
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}
