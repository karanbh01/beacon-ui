import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StageTip } from './StageTip'

describe('the popup on a stage column (Karan, 2026-10-19)', () => {
  it('says what the stage is, what it does, its settings, and what it let through', () => {
    render(
      <StageTip
        stage={{
          label: 'Minimum price',
          kind: 'implementation_screen',
          type: 'MinimumPriceScreen',
          description: 'Drops names priced below 5 USD.',
          params: [{ label: 'Minimum price', value: '5.00 USD' }],
          remaining: 11,
          before: 13
        }}
      />
    )

    expect(screen.getByText('Implementation screen · MinimumPriceScreen')).toBeInTheDocument()
    expect(screen.getByText('Drops names priced below 5 USD.')).toBeInTheDocument()
    expect(screen.getByText('5.00 USD')).toBeInTheDocument()
    expect(screen.getByText('11 passed, 2 dropped')).toBeInTheDocument()
  })

  it('says only what passed when the count before it is not known', () => {
    render(<StageTip stage={{ label: 'Filter', remaining: 1200 }} />)
    expect(screen.getByText('1,200 passed')).toBeInTheDocument()
  })
})
