import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { IdentifierIndexContext } from '../../views/shared/identifierIndex'
import { TickerField } from './TickerField'
import type { Suggestion } from './suggestions'

const noop = (): void => undefined

describe('TickerField', () => {
  it('shows the query hint when unlinked, with no chain', () => {
    const { container } = render(<TickerField subject="AAPL" onQuery={noop} />)

    expect(screen.getByText('⏎ query')).toBeInTheDocument()
    expect(container.querySelector('.ticker-chain')).toBeNull()
  })

  it('shows the chain and the sever instruction when linked', () => {
    const { container } = render(<TickerField subject="AAPL" linkedTo="Prices" onQuery={noop} />)

    expect(container.querySelector('.ticker-chain')).not.toBeNull()
    expect(screen.getByText('linked to Prices · type to break ⏎')).toBeInTheDocument()
  })

  it('emits the query on Enter', async () => {
    const onQuery = vi.fn()
    render(<TickerField subject="AAPL" onQuery={onQuery} />)

    const input = screen.getByRole('combobox')
    await userEvent.clear(input)
    await userEvent.type(input, 'MSFT{Enter}')

    expect(onQuery).toHaveBeenCalledWith('MSFT')
  })

  it('ignores Enter on an empty or whitespace-only value', async () => {
    const onQuery = vi.fn()
    render(<TickerField subject="AAPL" onQuery={onQuery} />)

    const input = screen.getByRole('combobox')
    await userEvent.clear(input)
    await userEvent.type(input, '   {Enter}')

    expect(onQuery).not.toHaveBeenCalled()
  })
})

describe('severing (BU-9 acceptance)', () => {
  it('emits sever when typing in a linked field', async () => {
    const onSever = vi.fn()
    render(<TickerField subject="AAPL" linkedTo="Prices" onQuery={noop} onSever={onSever} />)

    await userEvent.type(screen.getByRole('combobox'), 'N')

    expect(onSever).toHaveBeenCalled()
  })

  it('severs on Backspace too, which is how you clear a subject', async () => {
    const onSever = vi.fn()
    render(<TickerField subject="AAPL" linkedTo="Prices" onQuery={noop} onSever={onSever} />)

    await userEvent.type(screen.getByRole('combobox'), '{Backspace}')

    expect(onSever).toHaveBeenCalled()
  })

  it('does not sever on navigation or shortcut keys', async () => {
    const onSever = vi.fn()
    render(<TickerField subject="AAPL" linkedTo="Prices" onQuery={noop} onSever={onSever} />)

    const input = screen.getByRole('combobox')
    await userEvent.type(input, '{ArrowLeft}{ArrowRight}{Tab}')
    await userEvent.keyboard('{Control>}a{/Control}')

    expect(onSever).not.toHaveBeenCalled()
  })

  it('never severs a field that is not linked', async () => {
    const onSever = vi.fn()
    render(<TickerField subject="AAPL" onQuery={noop} onSever={onSever} />)

    await userEvent.type(screen.getByRole('combobox'), 'X')

    expect(onSever).not.toHaveBeenCalled()
  })
})

describe('following a linked source', () => {
  it('re-renders when the upstream subject changes', () => {
    const { rerender } = render(<TickerField subject="AAPL" linkedTo="Prices" onQuery={noop} />)
    expect(screen.getByRole('combobox')).toHaveValue('AAPL')

    rerender(<TickerField subject="NVDA" linkedTo="Prices" onQuery={noop} />)
    expect(screen.getByRole('combobox')).toHaveValue('NVDA')
  })
})

/**
 * The index arrives through context, so these wrap the field in a provider
 * rather than reaching for a query client — which is the point of putting it
 * in context (BU-68).
 */
function withIndex(ui: ReactElement, index: Suggestion[]): ReturnType<typeof render> {
  return render(
    <IdentifierIndexContext.Provider value={index}>{ui}</IdentifierIndexContext.Provider>
  )
}

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
