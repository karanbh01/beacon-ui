import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Tab } from './Tab'
import { TabBar } from './TabBar'

describe('the six archetypes (taxonomy 1)', () => {
  it('1. active document: bare label, underline, primary text', () => {
    const { container } = render(<Tab label="TECH10" active />)

    expect(container.querySelector('.tab')).toHaveClass('tab-active')
    expect(container.querySelector('.tab-chip')).toBeNull()
    expect(container.querySelector('.tab-dirty')).toBeNull()
  })

  it('2. dirty document: dot, no chip', () => {
    const { container } = render(<Tab label="FACTSHEET-A4" dirty />)

    expect(container.querySelector('.tab-dirty')).not.toBeNull()
    expect(container.querySelector('.tab-chip')).toBeNull()
  })

  it('3. pinned view: link chip with chain and target', () => {
    const { container } = render(<Tab label="Frontier" chip={{ kind: 'pin', target: 'TECH10' }} />)

    expect(container.querySelector('.tab-chip-pin')).not.toBeNull()
    expect(container.querySelector('.tab-chip-chain')).not.toBeNull()
    expect(screen.getByText('TECH10')).toBeInTheDocument()
  })

  it('4. global tool: label only', () => {
    const { container } = render(<Tab label="Data Coverage" />)

    expect(container.querySelector('.tab-chip')).toBeNull()
    expect(container.querySelector('.tab-dirty')).toBeNull()
  })

  it('5. query view: subject chip, no chain', () => {
    const { container } = render(<Tab label="Prices" chip={{ kind: 'query', subject: 'AAPL' }} />)

    expect(container.querySelector('.tab-chip-query')).not.toBeNull()
    expect(container.querySelector('.tab-chip-chain')).toBeNull()
  })

  it('6. linked query view: subject chip WITH chain', () => {
    const { container } = render(
      <Tab label="Charting" chip={{ kind: 'query', subject: 'AAPL', linked: true }} />
    )

    expect(container.querySelector('.tab-chip-query')).not.toBeNull()
    expect(container.querySelector('.tab-chip-chain')).not.toBeNull()
  })
})

describe('Tab interaction', () => {
  it('selects on click', async () => {
    const onSelect = vi.fn()
    render(<Tab label="Prices" onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('button', { name: /Prices/ }))
    expect(onSelect).toHaveBeenCalled()
  })

  it('closes without also selecting', async () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<Tab label="Prices" onSelect={onSelect} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Close Prices' }))

    expect(onClose).toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('offers no close affordance when unclosable', () => {
    render(<Tab label="Data Coverage" />)
    expect(screen.queryByRole('button', { name: /^Close/ })).toBeNull()
  })

  it('marks the active tab for assistive tech', () => {
    render(<Tab label="TECH10" active />)
    expect(screen.getByRole('button', { name: /TECH10/ })).toHaveAttribute('aria-current', 'true')
  })
})

describe('TabBar overflow (BU-11 decision: scroll)', () => {
  /**
   * jsdom does not apply imported stylesheets, so getComputedStyle cannot
   * verify the overflow rule — an assertion on it would pass or fail for
   * reasons unrelated to the CSS. What IS testable here is that every tab
   * renders in full: scroll was chosen precisely so no chip is dropped or
   * truncated. The visual rule is covered by the Overflow story and will be
   * covered by BU-35's screenshot diff.
   */
  it('renders every tab in full rather than dropping any', () => {
    const labels = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']
    render(
      <TabBar>
        {labels.map((label) => (
          <Tab key={label} label={label} chip={{ kind: 'query', subject: 'AAPL' }} />
        ))}
      </TabBar>
    )

    for (const label of labels) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument()
    }
    // No collapse menu, no truncation: every subject chip survives.
    expect(screen.getAllByText('AAPL')).toHaveLength(labels.length)
  })

  it('scrolls the active tab into view when it changes', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    const { rerender } = render(
      <TabBar activeIndex={0}>
        <Tab label="One" active />
        <Tab label="Two" />
      </TabBar>
    )
    scrollIntoView.mockClear()

    rerender(
      <TabBar activeIndex={1}>
        <Tab label="One" />
        <Tab label="Two" active />
      </TabBar>
    )

    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('offers a new-tab control only when it can create one', () => {
    const onNewTab = vi.fn()
    const { rerender } = render(
      <TabBar onNewTab={onNewTab}>
        <Tab label="One" />
      </TabBar>
    )
    expect(screen.getByRole('button', { name: 'New tab' })).toBeInTheDocument()

    rerender(
      <TabBar>
        <Tab label="One" />
      </TabBar>
    )
    expect(screen.queryByRole('button', { name: 'New tab' })).toBeNull()
  })
})
