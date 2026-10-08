import { render } from '@testing-library/react'
import { ViewEmpty } from '../../views/shared/ViewState'
import { EmptyFigure, type FigureKind } from './EmptyFigure'

const KINDS: readonly FigureKind[] = [
  'ticker',
  'calendar',
  'plot',
  'sieve',
  'drawer',
  'cardindex',
  'binders'
]

describe('EmptyFigure (BU-231)', () => {
  it.each(KINDS)('draws %s into an svg', (kind) => {
    const { container } = render(<EmptyFigure kind={kind} />)

    expect(container.querySelector('.empty-figure-stage svg')).not.toBeNull()
  })

  it('is hidden from assistive technology, since the message says what is empty', () => {
    const { container } = render(<EmptyFigure kind="cardindex" />)

    expect(container.querySelector('.empty-figure')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('writes no caption anywhere, by Karan’s call', () => {
    const { container } = render(<EmptyFigure kind="ticker" />)

    expect(container.textContent).toBe('')
  })

  it.each(KINDS)('leaves nothing behind when %s unmounts', (kind) => {
    const { container, unmount } = render(<EmptyFigure kind={kind} />)
    const stage = container.querySelector('.empty-figure-stage')
    unmount()

    expect(stage?.querySelector('svg') ?? null).toBeNull()
  })
})

describe('ViewEmpty', () => {
  it('stays the plain note it was when given no figure', () => {
    const { container } = render(<ViewEmpty>Nothing here.</ViewEmpty>)

    expect(container.querySelector('p.view-state')?.textContent).toBe('Nothing here.')
    expect(container.querySelector('.empty-figure')).toBeNull()
  })

  it('puts the message under its figure when given one', () => {
    const { container } = render(<ViewEmpty figure="plot">No rows in this range.</ViewEmpty>)

    expect(container.querySelector('.view-empty .empty-figure')).not.toBeNull()
    expect(container.querySelector('.view-empty-message')?.textContent).toBe(
      'No rows in this range.'
    )
  })
})
