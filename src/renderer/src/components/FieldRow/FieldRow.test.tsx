import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FieldGrid, FieldRow, FieldRowGroup } from './FieldRow'

describe('FieldRow', () => {
  it('marks derived cells so they read as output, not input', () => {
    const { container } = render(<FieldRow label="Term" value="1.00 y" readOnly />)
    expect(container.querySelector('.field-row')).toHaveClass('field-row-readonly')
  })

  it('drops the chevron on read-only cells, which cannot be opened', () => {
    const { container } = render(<FieldRow label="Term" value="1.00 y" readOnly chevron />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('prefers children over value, so views can supply a real input', () => {
    render(
      <FieldRow label="Spot">
        <input defaultValue="5412.30" aria-label="Spot" />
      </FieldRow>
    )
    expect(screen.getByLabelText('Spot')).toHaveValue('5412.30')
  })
})

describe('FieldGrid', () => {
  it('publishes both fixed widths for rows to consume', () => {
    const { container } = render(
      <FieldGrid railWidth={122} boxWidth={170}>
        <FieldRow label="Notional" value="250,000,000" />
      </FieldGrid>
    )

    const grid = container.querySelector('.field-grid')
    expect(grid).toHaveStyle({ '--rail-width': '122px', '--box-width': '170px' })
  })

  it('defaults to the futures pricer geometry from taxonomy 8', () => {
    const { container } = render(
      <FieldGrid>
        <FieldRow label="Spot" value="1" />
      </FieldGrid>
    )

    expect(container.querySelector('.field-grid')).toHaveStyle({
      '--rail-width': '118px',
      '--box-width': '175px'
    })
  })
})

describe('single-field rows (taxonomy 8)', () => {
  it('never lets a lone field grow to fill its row', () => {
    // The rule is "flush left at column width, never stretched". Growth would
    // come from flex-grow on the row or the box, so assert neither is set.
    const { container } = render(
      <FieldGrid>
        <FieldRowGroup>
          <FieldRow label="Alone" value="x" />
        </FieldRowGroup>
      </FieldGrid>
    )

    const row = container.querySelector('.field-row')
    const box = container.querySelector('.field-row-box')
    expect(row).not.toBeNull()
    expect(box).not.toBeNull()

    for (const element of [row!, box!]) {
      expect(getComputedStyle(element).flexGrow).toBe('0')
    }
  })
})
