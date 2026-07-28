import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChevronIcon, GridIcon, LogoBetaIcon } from './generated'
import { ICONS } from './registry'

function svgOf(element: HTMLElement): SVGSVGElement {
  const svg = element.querySelector('svg')
  expect(svg).not.toBeNull()
  return svg!
}

describe('icon geometry', () => {
  it('treats size as the OUTER box, matching what Figma quotes', () => {
    // BU-6 says "chevron (10px)". Figma's chevron box is 24 with a 9.99x5.49
    // glyph inside, so a 10px box shows a ~4.2px glyph. Rendering the glyph
    // itself at 10px makes it about four times too big.
    const { container } = render(<ChevronIcon size={10} />)
    const svg = svgOf(container)

    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.getAttribute('width')).toBe('10')
    expect(svg.getAttribute('height')).toBe('10')
  })

  it('keeps the glyph inset inside the box rather than filling it', () => {
    const { container } = render(<ChevronIcon size={24} />)
    const group = svgOf(container).querySelector('g')

    expect(group?.getAttribute('transform')).toContain('translate(7.0056 9.5064)')
  })

  it('widens non-square icons instead of squashing them', () => {
    // logo-beta's box is 55x47, so height 47 must give width 55.
    const { container } = render(<LogoBetaIcon size={47} />)
    const svg = svgOf(container)

    expect(svg.getAttribute('viewBox')).toBe('0 0 55 47')
    expect(Number(svg.getAttribute('width'))).toBeCloseTo(55, 1)
  })

  it('keeps square icons square', () => {
    const { container } = render(<GridIcon size={31} />)
    const svg = svgOf(container)

    expect(svg.getAttribute('width')).toBe('31')
    expect(svg.getAttribute('height')).toBe('31')
  })
})

describe('icon theming', () => {
  it('paints every glyph with currentColor, never a baked Figma literal', () => {
    for (const [name, Icon] of Object.entries(ICONS)) {
      const { container, unmount } = render(<Icon size={16} />)
      const markup = svgOf(container).innerHTML

      expect(markup, `${name} has a hardcoded colour`).not.toMatch(/#[0-9a-f]{6}/i)
      unmount()
    }
  })

  it('hides icons from assistive tech unless given a label', () => {
    const { container, rerender } = render(<GridIcon />)
    expect(svgOf(container).getAttribute('aria-hidden')).toBe('true')

    rerender(<GridIcon aria-label="Home" />)
    expect(svgOf(container).getAttribute('aria-hidden')).toBeNull()
  })
})
