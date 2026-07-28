import { render, screen } from '@testing-library/react'
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
    expect(headers[6]).toHaveClass('tbl-right') // Δ since rebal
  })

  it('colours signed drift, leaving zero neutral', () => {
    const { container } = renderWeights()

    // AVGO +0.42 is positive, CRM -0.81 negative, NVDA 0.00 neither.
    expect(container.querySelector('.num-pos')).not.toBeNull()
    expect(container.querySelector('.num-neg')).not.toBeNull()
    expect(screen.getAllByText('0.00').length).toBeGreaterThan(0)
  })

  it('zebras alternate rows via canvas', () => {
    const { container } = renderWeights()
    const rows = container.querySelectorAll('.tbl-row')

    expect(rows[0]).not.toHaveClass('tbl-zebra')
    expect(rows[1]).toHaveClass('tbl-zebra')
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
  it('washes the whole row, and beats the zebra fill', () => {
    const { container } = renderWeights({ selectedId: 'MSFT', onSelectRow: vi.fn() })
    const rows = container.querySelectorAll('.tbl-row')

    // MSFT is index 1, which is also a zebra row.
    expect(rows[1]).toHaveClass('tbl-selected')
    expect(rows[1]).toHaveClass('tbl-zebra')
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
