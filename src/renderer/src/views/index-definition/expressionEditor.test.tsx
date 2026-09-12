import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BeaconClient } from '../../api/client'
import { ClientContext } from '../../api/queryClient'
import { ExpressionEditor } from './ExpressionEditor'
import type { ExpressionNode } from './expression'

const SECTOR: ExpressionNode = {
  node: 'comparison',
  field: { node: 'field', namespace: 'reference', name: 'sector' },
  comparison: 'in',
  value: ['Financials']
}

/** A screen the rows cannot express: a group nested inside a group. */
const NESTED: ExpressionNode = {
  node: 'all',
  operands: [SECTOR, { node: 'any', operands: [SECTOR, SECTOR] }]
}

let queries: QueryClient

function client(): BeaconClient {
  return {
    get: (path: string) => {
      if (path === '/data/fields') {
        return Promise.resolve({
          namespaces: ['reference'],
          fields: [
            {
              path: 'reference.sector',
              namespace: 'reference',
              name: 'sector',
              dataset: null,
              derived: false
            }
          ]
        })
      }
      return Promise.resolve({ universe_id: 'GLOBAL', identifiers: [] })
    },
    universes: { members: () => Promise.resolve({ universe_id: 'GLOBAL', identifiers: [] }) },
    data: { referenceBatch: () => Promise.resolve({ entries: [] }) }
  } as unknown as BeaconClient
}

function mount(node: ExpressionNode | undefined, onChange = vi.fn()): ReactElement {
  return (
    <QueryClientProvider client={queries}>
      <ClientContext.Provider value={client()}>
        <ExpressionEditor value={node} onChange={onChange} universeId="GLOBAL" />
      </ClientContext.Provider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
})

describe('a screen the rows cannot draw (BU-182)', () => {
  it('says so rather than showing an empty editor', async () => {
    render(mount(NESTED))

    expect(await screen.findByText(/nests groups inside groups/)).toBeInTheDocument()
    // No rows, and nothing to add one with: the editor is not offering to
    // rewrite what it cannot read.
    expect(screen.queryByRole('button', { name: /Add clause/ })).not.toBeInTheDocument()
  })

  it('never reports a change, so the stored tree survives being opened', async () => {
    /*
     * The property that matters. Flattening a nested screen into the
     * nearest thing these rows express would change what the index selects,
     * silently, because somebody looked at it.
     */
    const onChange = vi.fn()
    render(mount(NESTED, onChange))

    expect(await screen.findByText(/nests groups inside groups/)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('an empty screen (BU-182)', () => {
  it('opens ready to add a clause rather than claiming to be broken', async () => {
    render(mount(undefined))

    expect(await screen.findByRole('button', { name: /Add clause/ })).toBeInTheDocument()
    expect(screen.queryByText(/nests groups/)).not.toBeInTheDocument()
  })

  it('writes a bare comparison for the first clause, not a group of one', async () => {
    const onChange = vi.fn()
    render(mount(undefined, onChange))

    await userEvent.click(await screen.findByRole('button', { name: /Add clause/ }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ node: 'comparison', comparison: 'eq' })
    )
  })
})
