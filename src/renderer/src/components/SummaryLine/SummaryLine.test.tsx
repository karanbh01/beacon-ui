import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TECH10 } from '../../mocks/tech10'
import { SummaryLine } from './SummaryLine'

describe('SummaryLine', () => {
  it('puts a separator between pairs but not before the first', () => {
    const { container } = render(
      <SummaryLine
        items={[
          { label: 'A', value: '1' },
          { label: 'B', value: '2' },
          { label: 'C', value: '3' }
        ]}
      />
    )
    expect(container.querySelectorAll('.summary-sep')).toHaveLength(2)
  })

  it('renders no separator for a single pair', () => {
    const { container } = render(<SummaryLine items={[{ label: 'Rows', value: '1' }]} />)
    expect(container.querySelectorAll('.summary-sep')).toHaveLength(0)
  })

  it('hides separators from assistive tech, since they are rules not content', () => {
    const { container } = render(
      <SummaryLine
        items={[
          { label: 'A', value: '1' },
          { label: 'B', value: '2' }
        ]}
      />
    )
    expect(container.querySelector('.summary-sep')).toHaveAttribute('aria-hidden', 'true')
  })

  it('applies tone only to the value, never the label', () => {
    const { container } = render(
      <SummaryLine items={[{ label: 'YTD', value: '+14.20%', tone: 'positive' }]} />
    )
    expect(container.querySelector('.summary-value')).toHaveClass('tone-positive')
    expect(container.querySelector('.summary-label')).not.toHaveClass('tone-positive')
  })

  it('renders the Weights line from the sanctioned dataset', () => {
    render(
      <SummaryLine
        items={[
          { label: 'Constituents', value: String(TECH10.weights.constituents) },
          { label: 'Σ weight', value: TECH10.weights.sum.toFixed(2) }
        ]}
      />
    )
    expect(screen.getByText('100.00')).toBeInTheDocument()
  })
})

describe('mock dataset integrity (taxonomy 10)', () => {
  it('decomposes attribution exactly into the YTD figure', () => {
    const { gross, capDrag, costs, ytd } = TECH10.attribution
    expect(gross + capDrag + costs).toBeCloseTo(ytd, 2)
  })

  it('keeps tracking error and its square consistent', () => {
    expect(TECH10.risk.trackingError ** 2).toBeCloseTo(TECH10.risk.trackingErrorSq, 2)
  })
})
