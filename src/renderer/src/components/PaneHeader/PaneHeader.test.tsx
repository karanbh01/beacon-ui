import { render, screen } from '@testing-library/react'
import { WithQueries } from '../../../../test/queries'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '../Button/Button'
import { Field } from '../Field/Field'
import { PaneHeader } from './PaneHeader'

const noop = (): void => undefined

describe('query kind', () => {
  it('renders the subject and meta', () => {
    render(
      <WithQueries>
        <PaneHeader kind="query" subject="AAPL" meta="Apple Inc. · NASDAQ" onQuery={noop} />
      </WithQueries>
    )

    expect(screen.getByRole('combobox')).toHaveValue('AAPL')
    expect(screen.getByText('Apple Inc. · NASDAQ')).toBeInTheDocument()
  })

  it('covers linked query without a separate kind (taxonomy 4)', () => {
    const { container } = render(
      <WithQueries>
        <PaneHeader kind="query" subject="AAPL" linkedTo="Prices" onQuery={noop} />
      </WithQueries>
    )

    // Linked is a property of the nested TickerField, not a header variant.
    expect(container.querySelector('.ticker-chain')).not.toBeNull()
  })

  it('passes the sever event through from the ticker field', async () => {
    const onSever = vi.fn()
    render(
      <WithQueries>
        <PaneHeader
          kind="query"
          subject="AAPL"
          linkedTo="Prices"
          onQuery={noop}
          onSever={onSever}
        />
      </WithQueries>
    )

    await userEvent.type(screen.getByRole('combobox'), 'N')
    expect(onSever).toHaveBeenCalled()
  })
})

describe('document kind', () => {
  it('renders title, meta and dirty status', () => {
    render(
      <PaneHeader
        kind="document"
        title="TECH10"
        meta="Equity index · USD"
        status="1 unsaved change"
      />
    )

    expect(screen.getByRole('heading', { name: 'TECH10' })).toBeInTheDocument()
    expect(screen.getByText(/1 unsaved change/)).toBeInTheDocument()
  })

  it('omits the status entirely when clean', () => {
    const { container } = render(
      <WithQueries>
        <PaneHeader kind="document" title="TECH10" />
      </WithQueries>
    )
    expect(container.querySelector('.pane-header-status')).toBeNull()
  })

  it('hides the dirty dot from assistive tech, keeping the words', () => {
    const { container } = render(
      <PaneHeader kind="document" title="TECH10" status="1 unsaved change" />
    )
    const dot = container.querySelector('.pane-header-status span')

    expect(dot).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('fields kind', () => {
  it('renders its field children and controls', () => {
    render(
      <PaneHeader kind="fields" controls={<Button variant="accent">Re-estimate</Button>}>
        <Field label="Risk model" value="BEACON-COV-1Y" chevron />
        <Field label="Window" value="252 trading days" chevron />
      </PaneHeader>
    )

    expect(screen.getByText('Risk model')).toBeInTheDocument()
    expect(screen.getByText('252 trading days')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Re-estimate' })).toBeInTheDocument()
  })

  it('bottom-aligns so label-above boxes line up', () => {
    const { container } = render(
      <PaneHeader kind="fields">
        <Field label="Window" value="252" />
      </PaneHeader>
    )
    expect(container.querySelector('.pane-header-left')).toHaveClass('align-end')
  })
})

describe('controls', () => {
  it('takes arbitrary children rather than fixed slots', () => {
    render(
      <PaneHeader
        kind="document"
        title="TECH10"
        controls={
          <>
            <Button>Validate</Button>
            <Button>Revert</Button>
            <Button variant="accent">Save</Button>
            <Button>Fourth</Button>
            <Button>Fifth</Button>
          </>
        }
      />
    )

    // Figma caps at four pre-provisioned slots; React has no such limit.
    expect(screen.getAllByRole('button')).toHaveLength(5)
  })
})
