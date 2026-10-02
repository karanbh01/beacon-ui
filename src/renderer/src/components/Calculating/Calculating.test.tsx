import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Calculating } from './Calculating'

describe('Calculating (BU-225)', () => {
  it('says what is being calculated, to a screen reader as a status', () => {
    render(<Calculating subject="TECH10" />)
    expect(screen.getByRole('status', { name: 'Calculating TECH10' })).toBeInTheDocument()
    expect(screen.getByText('Calculating…')).toBeInTheDocument()
  })

  it('keeps the orb out of the accessibility tree; the word carries it', () => {
    const { container } = render(<Calculating />)
    expect(container.querySelector('canvas')?.getAttribute('aria-hidden')).toBe('true')
  })
})
