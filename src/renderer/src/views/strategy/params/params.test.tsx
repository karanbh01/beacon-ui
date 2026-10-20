import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BeaconClient } from '../../../api/client'
import { ClientContext } from '../../../api/queryClient'
import type { ParameterSpec, TypeSpec } from '../../index-definition/ruleCatalogue'
import { summariseValues } from '../specSummary'
import { describeStructured, readNumbers, readRows } from './paramValues'
import { StrategyParamField } from './StrategyParamField'

const param = (name: string, label: string, extra: Partial<ParameterSpec> = {}): ParameterSpec => ({
  name,
  label,
  type: 'json',
  required: false,
  default: null,
  choices: null,
  help: '',
  unit: null,
  order: 0,
  ...extra
})

const CARDINALITY: TypeSpec = {
  name: 'Cardinality',
  label: 'Cardinality',
  summary: 'A limit on how many names may be held.',
  parameters: [param('max_names', 'Maximum holdings', { type: 'integer' })]
}

/** An engine with the replication constraints and one column's values. */
function withEngine(children: ReactNode): ReactElement {
  const client = {
    get: vi.fn((path: string) => {
      if (path === '/backtest/options')
        return Promise.resolve({ replication_constraints: [CARDINALITY] })
      if (path === '/data/reference-values')
        return Promise.resolve({ column: 'SECTOR', values: ['Financials', 'Health Care'] })
      return Promise.reject(new Error(`unexpected ${path}`))
    })
  } as unknown as BeaconClient
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return (
    <QueryClientProvider client={queries}>
      <ClientContext.Provider value={client}>{children}</ClientContext.Provider>
    </QueryClientProvider>
  )
}

describe('structured settings read back (BN-330)', () => {
  it('reads rows and numbers, leaving out what is not of the shape', () => {
    expect(readRows('[{"type":"Cardinality","params":{"max_names":30}},{"oops":1}]')).toEqual([
      { id: 'row-0', type: 'Cardinality', params: { max_names: 30 } }
    ])
    expect(readNumbers('{"AAA":0.6,"BBB":"x"}')).toEqual([['AAA', 0.6]])
    expect(readRows('not json')).toEqual([])
  })

  it('describes each shape in a few words for its row', () => {
    const rows = param('constraints', 'Constraints', { ref: 'ConstraintRows' })
    const sectors = param('sectors', 'Sectors', { ref: 'ReferenceValueList', column: 'SECTOR' })
    const field = param('field', 'Field', { ref: 'FieldNode' })
    expect(describeStructured(rows, '[{"type":"A"},{"type":"B"}]')).toBe('2 constraints')
    expect(describeStructured(sectors, ['Financials', 'Health Care'])).toBe(
      'Sectors Financials, Health Care'
    )
    expect(
      describeStructured(field, { node: 'field', namespace: 'features', name: 'price_to_book' })
    ).toBe('Field price to book')
    expect(summariseValues([rows, sectors], { constraints: [], sectors: ['Energy'] })).toBe(
      'Sectors Energy'
    )
  })
})

describe('a structured setting is edited in its own shape (BN-330)', () => {
  it('adds an optimised replication constraint as a row', async () => {
    const onChange = vi.fn()
    render(
      withEngine(
        <StrategyParamField
          param={param('constraints', 'Constraints', {
            ref: 'ConstraintRows',
            options: 'replication_constraints'
          })}
          value=""
          onChange={onChange}
        />
      )
    )
    const add = await screen.findByRole('button', { name: /Add constraint/ })
    await waitFor(() => {
      expect(add).toBeEnabled()
    })
    await userEvent.click(add)
    const written = JSON.parse(String(onChange.mock.lastCall?.[0])) as unknown
    expect(written).toEqual([{ id: 'constraint-1', type: 'Cardinality', params: {} }])
  })

  it('offers the values a reference column holds, and writes those ticked', async () => {
    const onChange = vi.fn()
    render(
      withEngine(
        <StrategyParamField
          param={param('sectors', 'Sectors', { ref: 'ReferenceValueList', column: 'SECTOR' })}
          value=""
          onChange={onChange}
        />
      )
    )
    const box = screen.getByRole('button', { name: 'Sectors' })
    await waitFor(() => {
      expect(box).toBeEnabled()
    })
    await userEvent.click(box)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Financials' }))
    expect(onChange).toHaveBeenLastCalledWith('["Financials"]')
  })

  it('takes a target for each factor the tilt names, and none for a factor left empty', async () => {
    const onChange = vi.fn()
    render(
      withEngine(
        <StrategyParamField
          param={param('targets', 'Target active exposures', { ref: 'FactorTargets' })}
          value=""
          onChange={onChange}
          siblings={{ factors: '{"value":{"type":"FieldSignal"},"momentum":{"type":"Momentum"}}' }}
        />
      )
    )
    expect(screen.getByText('value')).toBeInTheDocument()
    expect(screen.getByText('momentum')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Target for value' }), '3')
    expect(onChange).toHaveBeenLastCalledWith('{"value":3}')
  })
})
