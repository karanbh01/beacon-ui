import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TickerField } from './TickerField'

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

    const input = screen.getByRole('textbox')
    await userEvent.clear(input)
    await userEvent.type(input, 'MSFT{Enter}')

    expect(onQuery).toHaveBeenCalledWith('MSFT')
  })

  it('ignores Enter on an empty or whitespace-only value', async () => {
    const onQuery = vi.fn()
    render(<TickerField subject="AAPL" onQuery={onQuery} />)

    const input = screen.getByRole('textbox')
    await userEvent.clear(input)
    await userEvent.type(input, '   {Enter}')

    expect(onQuery).not.toHaveBeenCalled()
  })
})

describe('severing (BU-9 acceptance)', () => {
  it('emits sever when typing in a linked field', async () => {
    const onSever = vi.fn()
    render(<TickerField subject="AAPL" linkedTo="Prices" onQuery={noop} onSever={onSever} />)

    await userEvent.type(screen.getByRole('textbox'), 'N')

    expect(onSever).toHaveBeenCalled()
  })

  it('severs on Backspace too, which is how you clear a subject', async () => {
    const onSever = vi.fn()
    render(<TickerField subject="AAPL" linkedTo="Prices" onQuery={noop} onSever={onSever} />)

    await userEvent.type(screen.getByRole('textbox'), '{Backspace}')

    expect(onSever).toHaveBeenCalled()
  })

  it('does not sever on navigation or shortcut keys', async () => {
    const onSever = vi.fn()
    render(<TickerField subject="AAPL" linkedTo="Prices" onQuery={noop} onSever={onSever} />)

    const input = screen.getByRole('textbox')
    await userEvent.type(input, '{ArrowLeft}{ArrowRight}{Tab}')
    await userEvent.keyboard('{Control>}a{/Control}')

    expect(onSever).not.toHaveBeenCalled()
  })

  it('never severs a field that is not linked', async () => {
    const onSever = vi.fn()
    render(<TickerField subject="AAPL" onQuery={noop} onSever={onSever} />)

    await userEvent.type(screen.getByRole('textbox'), 'X')

    expect(onSever).not.toHaveBeenCalled()
  })
})

describe('following a linked source', () => {
  it('re-renders when the upstream subject changes', () => {
    const { rerender } = render(<TickerField subject="AAPL" linkedTo="Prices" onQuery={noop} />)
    expect(screen.getByRole('textbox')).toHaveValue('AAPL')

    rerender(<TickerField subject="NVDA" linkedTo="Prices" onQuery={noop} />)
    expect(screen.getByRole('textbox')).toHaveValue('NVDA')
  })
})
