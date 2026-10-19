import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Table, VIRTUALIZE_ABOVE } from './Table'
import { WeightBar } from './cells'
import { WEIGHTS_COLUMNS } from './weightsColumns'
import { CONSTITUENTS, syntheticConstituents } from '../../mocks/tech10'

const getRowId = (row: { ticker: string }): string => row.ticker

function renderWeights(props: Record<string, unknown> = {}) {
  return render(
    <Table columns={WEIGHTS_COLUMNS} rows={CONSTITUENTS} getRowId={getRowId} {...props} />
  )
}

describe('Weights table (BU-12 acceptance)', () => {
  it('renders every constituent', () => {
    const { container } = renderWeights()
    // getAllByText, not getByText: IBM is both a ticker and a company name,
    // so the ticker string legitimately appears twice in its row.
    for (const row of CONSTITUENTS) {
      expect(screen.getAllByText(row.ticker).length).toBeGreaterThan(0)
    }
    expect(container.querySelectorAll('.tbl-row')).toHaveLength(CONSTITUENTS.length)
  })

  it('right-aligns numeric columns and leaves text columns alone', () => {
    const { container } = renderWeights()
    const headers = container.querySelectorAll('[role="columnheader"]')

    expect(headers[0]).not.toHaveClass('tbl-right') // Ticker
    expect(headers[3]).toHaveClass('tbl-right') // Weight
    expect(headers[6]).toHaveClass('tbl-right') // Weight Drift
  })

  it('colours signed drift, leaving zero neutral', () => {
    const { container } = renderWeights()

    // AVGO +0.42 is positive, CRM -0.81 negative, NVDA 0.00 neither.
    expect(container.querySelector('.num-pos')).not.toBeNull()
    expect(container.querySelector('.num-neg')).not.toBeNull()
    expect(screen.getAllByText('0.00').length).toBeGreaterThan(0)
  })

  it('draws no stripes: rows are ruled, in the py-beacon lines style', () => {
    const { container } = renderWeights()
    const rows = container.querySelectorAll('.tbl-row')

    expect(rows[1]).not.toHaveClass('tbl-zebra')
  })

  it('renders a top-divided total row', () => {
    const { container } = renderWeights({
      totalRow: { ticker: 'Total', weight: '100.00%', delta: '0.00' }
    })

    const total = container.querySelector('.tbl-total')
    expect(total).not.toBeNull()
    expect(total?.textContent).toContain('100.00%')
  })
})

describe('selection', () => {
  it('washes the whole row', () => {
    const { container } = renderWeights({ selectedId: 'MSFT', onSelectRow: vi.fn() })
    const rows = container.querySelectorAll('.tbl-row')

    expect(rows[1]).toHaveClass('tbl-selected')
  })

  it('reports the clicked row', async () => {
    const onSelectRow = vi.fn()
    renderWeights({ onSelectRow })

    await userEvent.click(screen.getByText('ORCL'))

    expect(onSelectRow).toHaveBeenCalledWith(expect.objectContaining({ ticker: 'ORCL' }))
  })

  it('is not interactive without a select handler', () => {
    const { container } = renderWeights()
    expect(container.querySelector('.tbl-clickable')).toBeNull()
    expect(container.querySelector('[aria-selected]')).toBeNull()
  })
})

describe('virtualisation', () => {
  it('renders every row below the threshold', () => {
    const rows = syntheticConstituents(VIRTUALIZE_ABOVE)
    const { container } = render(
      <Table columns={WEIGHTS_COLUMNS} rows={rows} getRowId={getRowId} maxBodyHeight={300} />
    )

    expect(container.querySelectorAll('.tbl-row')).toHaveLength(VIRTUALIZE_ABOVE)
  })

  it('keeps the DOM small at 10k rows', () => {
    // The point of the acceptance criterion: smoothness is not measurable in
    // jsdom, but "10k rows must not mean 10k nodes" is, and it is the actual
    // mechanism that makes the scroll smooth.
    const rows = syntheticConstituents(10_000)
    const { container } = render(
      <Table columns={WEIGHTS_COLUMNS} rows={rows} getRowId={getRowId} maxBodyHeight={420} />
    )

    const rendered = container.querySelectorAll('.tbl-row').length
    expect(rendered).toBeLessThan(200)
  })
})

describe('WeightBar', () => {
  it('runs to 95% of the lane at the column maximum', () => {
    const { container } = render(<WeightBar value={20} max={20} width={200} />)
    expect(container.querySelector('.tbl-bar-fill')).toHaveStyle({ width: '190px' })
  })

  it('matches the Figma measurement for AVGO', () => {
    // 16.62 / 20 * 190 = 157.89px in the 200px lane.
    const { container } = render(<WeightBar value={16.62} max={20} width={200} />)
    const fill = container.querySelector('.tbl-bar-fill')

    expect(Number.parseFloat((fill as HTMLElement).style.width)).toBeCloseTo(157.89, 1)
  })

  it('clamps rather than overflowing when a value exceeds the max', () => {
    const { container } = render(<WeightBar value={40} max={20} width={200} />)
    expect(container.querySelector('.tbl-bar-fill')).toHaveStyle({ width: '190px' })
  })

  it('is hidden from assistive tech, since the number is already in the row', () => {
    const { container } = render(<WeightBar value={10} max={20} />)
    expect(container.querySelector('.tbl-bar')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('mock dataset integrity (taxonomy 10)', () => {
  it('sums constituent weights to exactly 100.00', () => {
    const sum = CONSTITUENTS.reduce((total, row) => total + row.weight, 0)
    expect(sum).toBeCloseTo(100.0, 2)
  })

  it('caps exactly three names at 20%', () => {
    const capped = CONSTITUENTS.filter((row) => row.capped)
    expect(capped).toHaveLength(3)
    for (const row of capped) expect(row.weight).toBe(20)
  })

  it('nets drift to zero across the index', () => {
    const drift = CONSTITUENTS.reduce((total, row) => total + row.delta, 0)
    expect(drift).toBeCloseTo(0, 2)
  })

  it('derives HHI and effective N from the weights it publishes', () => {
    const hhi = CONSTITUENTS.reduce((total, row) => total + (row.weight / 100) ** 2, 0)
    expect(hhi).toBeCloseTo(0.158, 3)
    expect(1 / hhi).toBeCloseTo(6.3, 1)
  })
})

describe('a table that fills its pane (BU-153)', () => {
  it('will not shrink past the columns it promises to keep', () => {
    const { container } = renderWeights({ fillHeight: true, fillWidth: true, minColumns: 3 })
    const card = container.querySelector<HTMLElement>('.tbl')!

    // Three columns, the two gaps between them and the card's own padding.
    const three = WEIGHTS_COLUMNS.slice(0, 3).reduce((sum, column) => sum + column.width, 0)
    expect(card.style.width).toBe('100%')
    expect(card.style.minWidth).toBe(`${String(three + 8 + 20)}px`)
  })

  it('asks for room for every column when no floor is named', () => {
    const { container } = renderWeights({ fillWidth: true })
    const card = container.querySelector<HTMLElement>('.tbl')!
    const all = WEIGHTS_COLUMNS.reduce((sum, column) => sum + column.width, 0)

    expect(card.style.minWidth).toBe(`${String(all + 8 + (WEIGHTS_COLUMNS.length - 1) * 10)}px`)
  })

  it('carries the head sideways with the body, or the labels lie', () => {
    const { container } = renderWeights({ fillHeight: true, fillWidth: true, minColumns: 3 })
    const body = container.querySelector<HTMLElement>('.tbl-body')!
    const head = container.querySelector<HTMLElement>('.tbl-head')!

    // jsdom has no layout, so the scroll offset is stated rather than made.
    Object.defineProperty(body, 'scrollLeft', { value: 120, configurable: true })
    fireEvent.scroll(body)

    expect(head.style.transform).toBe('translateX(-120px)')
  })
})

describe('column groups, as py-beacon heads them (Karan, 2026-10-19)', () => {
  interface Stat {
    name: string
    own: string
    rel: string
  }
  const figure = (key: keyof Stat, header: string, group?: string) => ({
    key,
    header,
    width: 100,
    align: 'right' as const,
    ...(group === undefined ? {} : { group }),
    render: (row: Stat) => row[key]
  })
  const columns = [
    figure('name', 'Statistic'),
    figure('own', 'Performance', 'Index'),
    figure('rel', 'Rel. Performance', 'Index'),
    figure('own', 'Performance', 'Benchmark'),
    figure('rel', 'Rel. Performance', 'Benchmark')
  ].map((column, index) => ({ ...column, key: `${column.key}-${String(index)}` }))
  const rows = [{ name: 'Total return', own: '+45.57%', rel: '+3.10%' }]

  it('puts one heading over each run of neighbouring columns in a group', () => {
    const { container } = render(
      <Table columns={columns} rows={rows} getRowId={(row) => row.name} />
    )
    const named = [...container.querySelectorAll('.tbl-group-named')].map(
      (cell) => cell.textContent
    )

    expect(named).toEqual(['Index', 'Benchmark'])
    // The ungrouped first column still has its place, so the headings line up.
    expect(container.querySelectorAll('.tbl-group')).toHaveLength(3)
  })

  it('spans a heading across its columns and the gap between them', () => {
    const { container } = render(
      <Table columns={columns} rows={rows} getRowId={(row) => row.name} />
    )
    const index = container.querySelector<HTMLElement>('.tbl-group-named')!

    expect(index.style.width).toBe('210px')
  })

  it('adds no heading row to a table without groups', () => {
    const { container } = renderWeights()

    expect(container.querySelector('.tbl-groups')).toBeNull()
  })
})

describe('a queryable table (Karan, 2026-10-19)', () => {
  interface Name {
    ticker: string
    weight: number
  }
  const columns = [
    {
      key: 'ticker',
      header: 'Ticker',
      width: 80,
      render: (row: Name) => row.ticker,
      value: (row: Name) => row.ticker
    },
    {
      key: 'weight',
      header: 'Weight',
      width: 80,
      align: 'right' as const,
      render: (row: Name) => `${String(row.weight)}%`,
      value: (row: Name) => row.weight
    }
  ]
  const rows: Name[] = [
    { ticker: 'AAA', weight: 4 },
    { ticker: 'BBB', weight: 12 },
    { ticker: 'CCC', weight: 8 }
  ]
  const shown = (container: HTMLElement): string[] =>
    [...container.querySelectorAll('.tbl-body .tbl-row')].map(
      (row) => row.querySelector('[role="cell"]')?.textContent ?? ''
    )

  it('sorts from the column name, and says it is sorting', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <Table columns={columns} rows={rows} getRowId={(row) => row.ticker} queryable />
    )

    await user.click(screen.getByRole('button', { name: 'Sort and filter Weight' }))
    await user.click(screen.getByRole('button', { name: 'Sort descending' }))

    expect(shown(container)).toEqual(['BBB', 'CCC', 'AAA'])
    expect(screen.getByRole('button', { name: 'Sort and filter Weight' }).textContent).toContain(
      '▼'
    )
  })

  it('filters a number column by range, and says how many rows it shows', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <Table columns={columns} rows={rows} getRowId={(row) => row.ticker} queryable />
    )

    await user.click(screen.getByRole('button', { name: 'Sort and filter Weight' }))
    await user.type(screen.getByRole('textbox', { name: 'At least' }), '5')

    expect(shown(container)).toEqual(['BBB', 'CCC'])
    expect(screen.getByText(/2 of 3 rows/)).toBeInTheDocument()
    // A filtered column's name is in italics, with no mark beside it.
    const name = screen.getByRole('button', { name: 'Sort and filter Weight' })
    expect(name).toHaveClass('tbl-head-filtered')
    expect(name.textContent).toBe('Weight')

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(shown(container)).toHaveLength(3)
  })

  it("clears a column's filter and its sort together from the menu", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <Table columns={columns} rows={rows} getRowId={(row) => row.ticker} queryable />
    )

    await user.click(screen.getByRole('button', { name: 'Sort and filter Weight' }))
    await user.click(screen.getByRole('button', { name: 'Sort descending' }))
    await user.type(screen.getByRole('textbox', { name: 'At least' }), '5')
    expect(shown(container)).toEqual(['BBB', 'CCC'])

    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(shown(container)).toEqual(['AAA', 'BBB', 'CCC'])
    expect(screen.getByRole('textbox', { name: 'At least' })).toHaveValue('')
    expect(screen.queryByText(/of 3 rows/)).toBeNull()
  })

  it('offers no menu on a table that is not queryable', () => {
    render(<Table columns={columns} rows={rows} getRowId={(row) => row.ticker} />)
    expect(screen.queryByRole('button', { name: 'Sort and filter Weight' })).toBeNull()
  })
})
