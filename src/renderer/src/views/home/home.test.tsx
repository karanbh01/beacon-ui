import { render, screen } from '@testing-library/react'
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

  it('puts the section labels in the serif, which is why it is bundled', () => {
    // Home is the only view that uses Source Serif Pro (#50). If these stop
    // carrying the class, the face becomes dead weight in the bundle again.
    const { container } = render(<HomeView {...props} onQuickstart={vi.fn()} />)
    expect(container.querySelectorAll('.type-section-label')).toHaveLength(4)
    expect(container.querySelector('.type-page-title')).not.toBeNull()
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

  it('marks the running build in the changelog', () => {
    render(<HomeView {...props} onQuickstart={vi.fn()} />)

    expect(screen.getByText('v0.0.2')).toBeInTheDocument()
    expect(screen.getByText('current')).toBeInTheDocument()
  })
})
