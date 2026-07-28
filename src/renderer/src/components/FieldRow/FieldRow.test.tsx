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
  /**
   * The rule is "flush left at column width, never stretched". That is a
   * pure CSS property, and jsdom does not apply imported stylesheets — an
   * earlier version of this test asserted `flexGrow === '0'` and passed
   * vacuously, since 0 is the CSS default with no stylesheet at all.
   *
   * What unit tests can honestly guarantee is that a lone field produces the
   * same structure as a paired one, so it inherits the same fixed widths.
   * The visual rule is covered by the SingleFieldNeverStretches story and by
   * BU-35's screenshot diff.
   */
  it('gives a lone field the same structure as a paired one', () => {
    const { container } = render(
      <FieldGrid>
        <FieldRowGroup>
          <FieldRow label="Alone" value="x" />
        </FieldRowGroup>
        <FieldRowGroup>
          <FieldRow label="Paired" value="y" />
          <FieldRow label="Partner" value="z" />
        </FieldRowGroup>
      </FieldGrid>
    )

    const groups = container.querySelectorAll('.field-row-group')
    expect(groups).toHaveLength(2)

    // Same element shape in both, so both read the grid's fixed widths.
    expect(groups[0]?.querySelectorAll('.field-row')).toHaveLength(1)
    expect(groups[1]?.querySelectorAll('.field-row')).toHaveLength(2)
    for (const box of container.querySelectorAll('.field-row-box')) {
      expect(box.className).toBe('field-row-box')
    }
  })
})
