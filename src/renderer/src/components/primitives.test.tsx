import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AddSlot } from './AddSlot/AddSlot'
import { Badge, StatusPill } from './Badge/Badge'
import { Card } from './Card/Card'
import { Checkbox } from './Checkbox/Checkbox'
import { KV, KVList } from './KV/KV'
import { SegmentedControl } from './SegmentedControl/SegmentedControl'

describe('Card', () => {
  it('omits the header entirely when there is nothing to put in it', () => {
    const { container } = render(<Card>body</Card>)
    expect(container.querySelector('.card-head')).toBeNull()
  })

  it('drops body padding when flush, so a Table keeps its own gutters', () => {
    const { container } = render(<Card flush>body</Card>)
    expect(container.querySelector('.card-body')).toHaveClass('card-flush')
  })

  it('renders title and aside together', () => {
    render(
      <Card title="Key facts" aside={<StatusPill status="done" />}>
        body
      </Card>
    )
    expect(screen.getByRole('heading', { name: 'Key facts' })).toBeInTheDocument()
    expect(screen.getByText('done')).toBeInTheDocument()
  })
})

describe('Badge and StatusPill', () => {
  it('renders a rule-type badge', () => {
    const { container } = render(<Badge>CapRule</Badge>)
    expect(container.querySelector('.badge')).toHaveTextContent('CapRule')
  })

  it('carries a class per status so each maps to its own token pair', () => {
    for (const status of ['done', 'running', 'failed', 'info'] as const) {
      const { container, unmount } = render(<StatusPill status={status} />)
      expect(container.querySelector('.pill')).toHaveClass(`pill-${status}`)
      unmount()
    }
  })

  it('defaults its text to the status name', () => {
    render(<StatusPill status="running" />)
    expect(screen.getByText('running')).toBeInTheDocument()
  })
})

describe('AddSlot', () => {
  it('is a real button, so it is keyboard reachable', async () => {
    const onClick = vi.fn()
    render(<AddSlot label="Add rule…" onClick={onClick} />)

    const button = screen.getByRole('button')
    button.focus()
    await userEvent.keyboard('{Enter}')

    expect(onClick).toHaveBeenCalled()
  })

  it('supplies the plus rather than making callers type it', () => {
    render(<AddSlot label="Add constraint…" />)
    // textContent, not toHaveTextContent: the latter normalises whitespace
    // and would hide the double space Figma specifies between + and label.
    expect(screen.getByRole('button').textContent).toBe('+  Add constraint…')
  })

  it('indents to align under a numbered row', () => {
    const { container } = render(<AddSlot label="Add rule…" indent={44} />)
    expect(container.querySelector('.add-slot-row')).toHaveStyle({ paddingLeft: '44px' })
  })
})

describe('SegmentedControl', () => {
  const RANGES = [
    { value: '1M', label: '1M' },
    { value: '1Y', label: '1Y' },
    { value: 'MAX', label: 'MAX' }
  ] as const

  it('marks exactly one segment active', () => {
    render(<SegmentedControl segments={RANGES} value="1Y" onChange={vi.fn()} />)

    expect(screen.getByRole('radio', { name: '1Y' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: '1M' })).toHaveAttribute('aria-checked', 'false')
  })

  it('reports the chosen value', async () => {
    const onChange = vi.fn()
    render(<SegmentedControl segments={RANGES} value="1Y" onChange={onChange} />)

    await userEvent.click(screen.getByRole('radio', { name: 'MAX' }))

    expect(onChange).toHaveBeenCalledWith('MAX')
  })

  it('exposes itself as a radiogroup, not a row of buttons', () => {
    render(<SegmentedControl segments={RANGES} value="1M" onChange={vi.fn()} label="Range" />)
    expect(screen.getByRole('radiogroup', { name: 'Range' })).toBeInTheDocument()
  })
})

describe('Checkbox', () => {
  it('ties label to input so clicking the text toggles it', async () => {
    const onChange = vi.fn()
    render(<Checkbox label="Index overview" checked={false} onChange={onChange} />)

    await userEvent.click(screen.getByText('Index overview'))

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('reports the new state, not the old one', async () => {
    const onChange = vi.fn()
    render(<Checkbox label="Weights" checked onChange={onChange} />)

    await userEvent.click(screen.getByRole('checkbox'))

    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('does not fire when disabled', async () => {
    const onChange = vi.fn()
    render(<Checkbox label="Risk" checked={false} onChange={onChange} disabled />)

    await userEvent.click(screen.getByRole('checkbox'))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('gives each instance a unique id so labels never cross-wire', () => {
    render(
      <>
        <Checkbox label="A" checked={false} onChange={vi.fn()} />
        <Checkbox label="B" checked={false} onChange={vi.fn()} />
      </>
    )
    const [a, b] = screen.getAllByRole('checkbox')
    expect(a?.id).not.toBe(b?.id)
  })
})

describe('KV', () => {
  it('tones only the value', () => {
    const { container } = render(<KV label="Σ weights" value="100.00%" tone="positive" />)

    expect(container.querySelector('.kv-value')).toHaveClass('tone-positive')
    expect(container.querySelector('.kv-label')).not.toHaveClass('tone-positive')
  })

  it('stacks rows in a list', () => {
    const { container } = render(
      <KVList>
        <KV label="A" value="1" />
        <KV label="B" value="2" />
      </KVList>
    )
    expect(container.querySelectorAll('.kv-list .kv')).toHaveLength(2)
  })
})
