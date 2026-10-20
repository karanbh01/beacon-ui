import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TrackedJob } from '@/api/jobs'
import { HomeView } from './HomeView'
import { activityRows, relativeTime } from './activityRows'
import { QUICKSTART, formatHomeDate } from './homeContent'

const TODAY = new Date('2026-07-16T12:00:00Z')

function job(over: Partial<TrackedJob> & { jobId: string }): TrackedJob {
  return { kind: 'calculate', status: 'succeeded', progress: 1, message: '', ...over }
}

describe('formatHomeDate', () => {
  it('spells the date out the way the frame does', () => {
    expect(formatHomeDate(TODAY)).toBe('Thursday 16 July 2026')
  })
})

describe('relativeTime', () => {
  const now = TODAY.getTime()
  const ago = (ms: number): string => relativeTime(now - ms, now)

  it('uses the frame’s phrasing rather than a timestamp', () => {
    expect(ago(30_000)).toBe('just now')
    expect(ago(20 * 60_000)).toBe('20m ago')
    expect(ago(2 * 3_600_000)).toBe('2h ago')
    expect(ago(30 * 3_600_000)).toBe('yesterday')
    expect(ago(72 * 3_600_000)).toBe('3d ago')
  })
})

describe('activityRows', () => {
  const now = TODAY.getTime()

  it('says nothing when nothing has run', () => {
    expect(activityRows({}, now)).toEqual([])
  })

  it('puts running jobs first, whatever their age', () => {
    // Something in flight is the reason you looked; a job that finished two
    // minutes ago is not more interesting than one still going.
    const rows = activityRows(
      {
        old: job({ jobId: 'old', settledAt: now - 60_000, message: 'TECH10 calculation' }),
        live: job({ jobId: 'live', status: 'running', progress: 0.62, message: 'Price fetch' })
      },
      now
    )

    expect(rows.map((r) => r.id)).toEqual(['live', 'old'])
    expect(rows[0]).toMatchObject({ status: 'running', detail: '62%' })
  })

  it('orders settled jobs newest first', () => {
    const rows = activityRows(
      {
        a: job({ jobId: 'a', settledAt: now - 3 * 3_600_000 }),
        b: job({ jobId: 'b', settledAt: now - 1 * 3_600_000 }),
        c: job({ jobId: 'c', settledAt: now - 2 * 3_600_000 })
      },
      now
    )

    expect(rows.map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('maps a failure to the failed pill', () => {
    const rows = activityRows(
      { x: job({ jobId: 'x', status: 'failed', settledAt: now - 60_000 }) },
      now
    )
    expect(rows[0]?.status).toBe('failed')
  })

  it('falls back to the job kind when there is no message', () => {
    const rows = activityRows({ x: job({ jobId: 'x', settledAt: now, message: '' }) }, now)
    expect(rows[0]?.label).toBe('calculate')
  })

  it('caps the list so it stays scannable', () => {
    const many = Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [
        `j${String(i)}`,
        job({ jobId: `j${String(i)}`, settledAt: now - i * 1000 })
      ])
    )
    expect(activityRows(many, now)).toHaveLength(4)
  })
})

describe('HomeView', () => {
  const props = { today: TODAY, activity: [], onQuickstart: vi.fn() }

  it('renders the four sections from the frame', () => {
    render(<HomeView {...props} onQuickstart={vi.fn()} />)

    for (const label of ['Quickstart', 'Changelog', 'Recent Activity', 'Guides']) {
      expect(screen.getByRole('heading', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
    expect(screen.getByText('Thursday 16 July 2026')).toBeInTheDocument()
  })

  it('sets its section headers in the type scale rather than styling them locally', () => {
    // They were Source Serif Pro italic until BU-98. Only the header card's
    // words have a face of their own, the website's card face.
    const { container } = render(<HomeView {...props} onQuickstart={vi.fn()} />)
    expect(container.querySelectorAll('.type-section-label')).toHaveLength(4)
  })

  it('heads the page with a card holding Home and the date', () => {
    const { container } = render(<HomeView {...props} onQuickstart={vi.fn()} />)
    const banner = container.querySelector('.home-banner')
    expect(banner?.querySelector('h1')).toHaveTextContent('Home')
    expect(banner).toHaveTextContent('Thursday 16 July 2026')
  })

  it('opens the page and tab a quickstart item names', async () => {
    const onQuickstart = vi.fn()
    const user = userEvent.setup()
    render(<HomeView {...props} onQuickstart={onQuickstart} />)

    await user.click(screen.getByRole('button', { name: /Create Index/ }))

    expect(onQuickstart).toHaveBeenCalledWith('strategy-builder', 'seed-tech10')
  })

  it('offers every quickstart item as a control', () => {
    render(<HomeView {...props} onQuickstart={vi.fn()} />)
    for (const action of QUICKSTART) {
      expect(screen.getByRole('button', { name: action.label })).toBeInTheDocument()
    }
  })

  it('says the history is empty rather than inventing rows', () => {
    render(<HomeView {...props} onQuickstart={vi.fn()} />)

    expect(screen.getByText(/Nothing has run yet/)).toBeInTheDocument()
    expect(screen.queryByText('done')).toBeNull()
  })

  it('renders activity with its pill once there is any', () => {
    render(
      <HomeView
        {...props}
        onQuickstart={vi.fn()}
        activity={[
          { id: 'a', label: 'TECH10 calculation', when: '2h ago', status: 'done' },
          {
            id: 'b',
            label: 'Price fetch · 512 assets',
            when: 'running',
            status: 'running',
            detail: '62%'
          }
        ]}
      />
    )

    expect(screen.getByText('TECH10 calculation')).toBeInTheDocument()
    expect(screen.getByText('62%')).toBeInTheDocument()
    expect(screen.queryByText(/Nothing has run yet/)).toBeNull()
  })

  it("leads with each product's newest release, and has the rest in a pop-up", () => {
    // How many follow depends on the room, which jsdom does not lay out.
    const { container } = render(<HomeView {...props} onQuickstart={vi.fn()} />)
    const entries = [...container.querySelectorAll('.home-changelog-entry')]
    const products = entries.map(
      (entry) => entry.querySelector('.home-changelog-product')?.textContent
    )
    expect(products.slice(0, 2).sort()).toEqual(['Beacon', 'py-beacon'])
    expect(entries.some((entry) => entry.textContent.includes('unreleased'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Full changelog' }))
    const all = screen.getByRole('dialog', { name: 'Changelog' })
    expect(all.querySelectorAll('.home-changelog-entry').length).toBeGreaterThan(3)
  })

  it('lists both products’ releases, and marks what is running', () => {
    /*
     * BU-219. The list was two invented entries, one tagged "current" that
     * was true of nothing running. Both changelogs now, and `current` on the
     * engine's version only when the engine reports it.
     */
    render(<HomeView {...props} running={{ engine: '0.1.1' }} onQuickstart={vi.fn()} />)
    // Home shows the newest few; the full changelog is a click away.
    fireEvent.click(screen.getByRole('button', { name: 'Full changelog' }))

    expect(screen.getAllByText('Beacon').length).toBeGreaterThan(0)
    expect(screen.getAllByText('py-beacon').length).toBeGreaterThan(0)
    const all = screen.getByRole('dialog', { name: 'Changelog' })
    const current = within(all).getByText('current').closest('.home-changelog-version')
    expect(current?.textContent).toContain('py-beacon')
    expect(current?.textContent).toContain('v0.1.1')
    expect(screen.queryByText('v0.0.2')).toBeNull()
  })
})
