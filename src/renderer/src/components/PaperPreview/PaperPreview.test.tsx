import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PAGE_HEIGHT, PAGE_WIDTH, PaperPreview, PaperRow, PaperSection } from './PaperPreview'
import { RAW } from '../../tokens/tokens'

const CSS = readFileSync(resolve(__dirname, 'PaperPreview.css'), 'utf-8')

describe('theme independence (BU-14 acceptance)', () => {
  /**
   * The acceptance is "renders identically in both themes". jsdom cannot
   * compare rendered pixels, but the mechanism is checkable: if nothing
   * inside the page reads a CSS custom property, there is nothing for a
   * theme flip to change.
   */
  it('uses no themed custom property inside the page', () => {
    // Split at .paper-desk, the one deliberately themed rule.
    const pageRules = CSS.split('.paper-desk')[1] ?? ''
    const themed = pageRules.match(/var\(--(?!paper-scale|font-)[a-z-]+\)/g)

    expect(themed, `page rules must not read theme tokens: ${String(themed)}`).toBeNull()
  })

  it('themes only the desk the page sits on', () => {
    const desk = CSS.slice(CSS.indexOf('.paper-desk'), CSS.indexOf('.paper {'))
    expect(desk).toContain('var(--canvas)')
  })

  it('keeps the CSS literals in step with the exported raw paper tokens', () => {
    // Chart code paints onto the page from RAW; the CSS paints the page
    // furniture. They describe the same ink and must not drift apart.
    for (const [key, value] of Object.entries(RAW)) {
      if (!key.startsWith('paper')) continue
      expect(CSS.toLowerCase(), `${key} missing from PaperPreview.css`).toContain(
        value.toLowerCase()
      )
    }
  })
})

describe('page geometry', () => {
  it('renders at the fixed 540x764 by default', () => {
    const { container } = render(<PaperPreview>body</PaperPreview>)

    expect(container.querySelector('.paper')).toHaveStyle({
      width: `${String(PAGE_WIDTH)}px`,
      height: `${String(PAGE_HEIGHT)}px`
    })
  })

  it('preserves the ratio when scaled', () => {
    const { container } = render(<PaperPreview width={270}>body</PaperPreview>)
    const paper = container.querySelector('.paper')

    // 270 is half of 540, so height must be half of 764.
    expect(paper).toHaveStyle({ width: '270px', height: '382px' })
  })

  it('scales content as a unit rather than restyling it', () => {
    const { container } = render(<PaperPreview width={270}>body</PaperPreview>)
    expect(container.querySelector('.paper')).toHaveStyle({ '--paper-scale': '0.5' })
  })
})

describe('page furniture', () => {
  it('omits both rules when neither is asked for', () => {
    const { container } = render(<PaperPreview>body</PaperPreview>)

    expect(container.querySelector('.paper-header')).toBeNull()
    expect(container.querySelector('.paper-footer')).toBeNull()
  })

  it('renders a running header', () => {
    render(<PaperPreview header="Beacon · TECH10 factsheet">body</PaperPreview>)
    expect(screen.getByText('Beacon · TECH10 factsheet')).toBeInTheDocument()
  })

  it('renders page n of m', () => {
    render(
      <PaperPreview footer="py-beacon 0.4.2" page={2} pageCount={4}>
        body
      </PaperPreview>
    )
    expect(screen.getByText('Page 2 of 4')).toBeInTheDocument()
  })

  it('drops the "of m" when the total is unknown', () => {
    render(<PaperPreview page={2}>body</PaperPreview>)
    expect(screen.getByText('Page 2')).toBeInTheDocument()
  })

  it('shows a footer for provenance alone, with no page number', () => {
    const { container } = render(<PaperPreview footer="py-beacon 0.4.2">body</PaperPreview>)

    expect(container.querySelector('.paper-footer')).not.toBeNull()
    expect(screen.queryByText(/^Page/)).toBeNull()
  })
})

describe('report content helpers', () => {
  it('renders a titled section', () => {
    render(
      <PaperPreview>
        <PaperSection title="Performance">
          <PaperRow label="Index level" value="341.34" />
        </PaperSection>
      </PaperPreview>
    )

    expect(screen.getByRole('heading', { name: 'Performance' })).toBeInTheDocument()
    expect(screen.getByText('341.34')).toBeInTheDocument()
  })
})
