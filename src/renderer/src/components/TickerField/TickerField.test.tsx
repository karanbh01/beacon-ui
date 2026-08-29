import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { IdentifierIndexContext } from '../../views/shared/identifierIndex'
import { TickerField } from './TickerField'
import type { Suggestion } from './suggestions'

const noop = (): void => undefined

/**
 * A query client, but no `ClientContext` — so `useBeacon()` is null, the
 * search query never runs, and the field falls back to the local index. That
 * is exactly what happens while py-beacon is restarting, so every test in
 * this file exercises the no-engine path for free.
 */
function withIndex(ui: ReactElement, index: Suggestion[] = []): ReturnType<typeof render> {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queries}>
      <IdentifierIndexContext.Provider value={index}>{ui}</IdentifierIndexContext.Provider>
    </QueryClientProvider>
  )
}

describe('TickerField', () => {
  it('carries no chain when it owns its subject', () => {
    // The "⏎ query" hint went with #103: it labelled the return key on a
    // field that is plainly a search field.
    const { container } = withIndex(<TickerField subject="AAPL" onQuery={noop} />)

    expect(container.querySelector('.ticker-chain')).toBeNull()
    expect(screen.queryByText(/⏎/)).toBeNull()
  })

  it('shows the chain when it follows another tab', () => {
    const { container } = withIndex(<TickerField subject="AAPL" linkedTo="Prices" onQuery={noop} />)

    expect(container.querySelector('.ticker-chain')).not.toBeNull()
  })

  it('emits the query on Enter', async () => {
    const onQuery = vi.fn()
    withIndex(<TickerField subject="AAPL" onQuery={onQuery} />)

    const input = screen.getByRole('combobox')
    await userEvent.clear(input)
    await userEvent.type(input, 'MSFT{Enter}')

    expect(onQuery).toHaveBeenCalledWith('MSFT')
  })

  it('ignores Enter on an empty or whitespace-only value', async () => {
    const onQuery = vi.fn()
    withIndex(<TickerField subject="AAPL" onQuery={onQuery} />)

    const input = screen.getByRole('combobox')
    await userEvent.clear(input)
    await userEvent.type(input, '   {Enter}')

    expect(onQuery).not.toHaveBeenCalled()
  })
})

describe('severing (BU-9 acceptance)', () => {
  it('emits sever when typing in a linked field', async () => {
    const onSever = vi.fn()
    withIndex(<TickerField subject="AAPL" linkedTo="Prices" onQuery={noop} onSever={onSever} />)

    await userEvent.type(screen.getByRole('combobox'), 'N')

    expect(onSever).toHaveBeenCalled()
  })

  it('severs on Backspace too, which is how you clear a subject', async () => {
    const onSever = vi.fn()
    withIndex(<TickerField subject="AAPL" linkedTo="Prices" onQuery={noop} onSever={onSever} />)

    await userEvent.type(screen.getByRole('combobox'), '{Backspace}')

    expect(onSever).toHaveBeenCalled()
  })

  it('does not sever on navigation or shortcut keys', async () => {
    const onSever = vi.fn()
    withIndex(<TickerField subject="AAPL" linkedTo="Prices" onQuery={noop} onSever={onSever} />)

    const input = screen.getByRole('combobox')
    await userEvent.type(input, '{ArrowLeft}{ArrowRight}{Tab}')
    await userEvent.keyboard('{Control>}a{/Control}')

    expect(onSever).not.toHaveBeenCalled()
  })

  it('never severs a field that is not linked', async () => {
    const onSever = vi.fn()
    withIndex(<TickerField subject="AAPL" onQuery={noop} onSever={onSever} />)

    await userEvent.type(screen.getByRole('combobox'), 'X')

    expect(onSever).not.toHaveBeenCalled()
  })
})

describe('following a linked source', () => {
  it('re-renders when the upstream subject changes', () => {
    // Rendered twice rather than rerendered: `rerender` replaces the whole
    // tree, so a bare element would drop the providers the wrapper supplies.
    const view = withIndex(<TickerField subject="AAPL" linkedTo="Prices" onQuery={noop} />)
    expect(screen.getByRole('combobox')).toHaveValue('AAPL')

    view.unmount()
    withIndex(<TickerField subject="NVDA" linkedTo="Prices" onQuery={noop} />)
    expect(screen.getByRole('combobox')).toHaveValue('NVDA')
  })
})

const INDEX: Suggestion[] = [
  { identifier: 'CMP000', name: 'CMP000 Corporation' },
  { identifier: 'CMP001', name: 'CMP001 Corporation' },
  { identifier: 'MSFT', name: 'Microsoft Corporation' }
]

describe('suggestions (BU-68)', () => {
  it('offers nothing until something is typed', () => {
    withIndex(<TickerField subject="" onQuery={noop} />, INDEX)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('opens on the first character', async () => {
    withIndex(<TickerField subject="" onQuery={noop} />, INDEX)

    await userEvent.type(screen.getByRole('combobox'), 'cmp')

    expect(screen.getByRole('listbox', { name: 'Identifier suggestions' })).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('never suggests the subject already on screen', async () => {
    // The whole list would be one row repeating what the field says.
    withIndex(<TickerField subject="CMP000" onQuery={noop} />, INDEX)

    const input = screen.getByRole('combobox')
    await userEvent.clear(input)
    await userEvent.type(input, 'CMP000')

    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('walks the rows with the arrow keys and takes one on Enter', async () => {
    const onQuery = vi.fn()
    withIndex(<TickerField subject="" onQuery={onQuery} />, INDEX)

    await userEvent.type(screen.getByRole('combobox'), 'cmp')
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{Enter}')
    expect(onQuery).toHaveBeenCalledWith('CMP000')
  })

  it('still submits a ticker the index has never heard of', async () => {
    // The index is bounded by what py-beacon will enumerate (#71), so typing
    // past it has to keep working.
    const onQuery = vi.fn()
    withIndex(<TickerField subject="" onQuery={onQuery} />, INDEX)

    await userEvent.type(screen.getByRole('combobox'), 'ZZZZ{Enter}')
    expect(onQuery).toHaveBeenCalledWith('ZZZZ')
  })

  it('submits what was typed when nothing is highlighted', async () => {
    const onQuery = vi.fn()
    withIndex(<TickerField subject="" onQuery={onQuery} />, INDEX)

    await userEvent.type(screen.getByRole('combobox'), 'cmp0{Enter}')
    expect(onQuery).toHaveBeenCalledWith('cmp0')
  })

  it('takes a row on click', async () => {
    const onQuery = vi.fn()
    withIndex(<TickerField subject="" onQuery={onQuery} />, INDEX)

    await userEvent.type(screen.getByRole('combobox'), 'micro')
    await userEvent.click(screen.getByRole('option', { name: /MSFT/ }))

    expect(onQuery).toHaveBeenCalledWith('MSFT')
  })

  it('severs the link when a suggestion is chosen, not just when typing', async () => {
    // Taxonomy §2: taking a subject of your own is a claim of ownership
    // however it was expressed.
    const onSever = vi.fn()
    withIndex(
      <TickerField subject="AAPL" linkedTo="Prices" onQuery={noop} onSever={onSever} />,
      INDEX
    )

    const input = screen.getByRole('combobox')
    await userEvent.clear(input)
    await userEvent.type(input, 'micro')
    onSever.mockClear()
    await userEvent.click(screen.getByRole('option', { name: /MSFT/ }))

    expect(onSever).toHaveBeenCalled()
  })

  it('closes on Escape without clearing what was typed', async () => {
    withIndex(<TickerField subject="" onQuery={noop} />, INDEX)
    const input = screen.getByRole('combobox')

    await userEvent.type(input, 'cmp')
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input).toHaveValue('cmp')

    // And typing on brings it back.
    await userEvent.type(input, '0')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })
})

describe('completing (BU-126)', () => {
  const INDEX: Suggestion[] = [
    { identifier: 'CMP001', name: 'Company One' },
    { identifier: 'CMP002', name: 'Company Two' }
  ]

  it('fills the field with the highlighted suggestion, without committing it', async () => {
    const onQuery = vi.fn()
    withIndex(<TickerField subject="" onQuery={onQuery} />, INDEX)

    const field = screen.getByRole('combobox')
    await userEvent.type(field, 'CMP')
    expect(await screen.findAllByRole('option')).toHaveLength(2)

    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    await userEvent.keyboard('{Tab}')

    // Completed, not committed: the two are separate keystrokes, and on a
    // linked field committing is what breaks the link.
    expect(field).toHaveValue('CMP002')
    expect(onQuery).not.toHaveBeenCalled()

    await userEvent.keyboard('{Enter}')
    expect(onQuery).toHaveBeenCalledWith('CMP002')
  })

  it('completes the first suggestion when nothing is highlighted', async () => {
    withIndex(<TickerField subject="" onQuery={noop} />, INDEX)

    await userEvent.type(screen.getByRole('combobox'), 'CMP')
    await userEvent.keyboard('{Tab}')

    expect(screen.getByRole('combobox')).toHaveValue('CMP001')
  })
})
