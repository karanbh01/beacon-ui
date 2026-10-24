import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TrackedJob } from '@/api/jobs'
import { HomeView } from './HomeView'
import type { ActivityEntry } from './ActivityTimeline'
import { relativeTime } from './activityRows'
import { useActivityLog, recordDocument } from '@/state/activityLog'
import { stepOf } from './jobSteps'
import { backtestOpens, followJob, formatDuration, inOrder, titleOfJob } from './jobActivity'
import { QUICKSTART, formatHomeDate } from './homeContent'

const TODAY = new Date('2026-07-16T12:00:00Z')

const ACTIVITY: ActivityEntry[] = [
  {
    id: 'bt',
    title: 'Backtest of TECH10',
    at: TODAY.getTime() - 2 * 3_600_000,
    status: 'done',
    detail: '43s',
    steps: [
      { label: 'Calculated TECH10 index', detail: '7s' },
      { label: 'Simulated TECH10', detail: '18s' }
    ],
    opens: backtestOpens('TECH10')
  },
  {
    id: 'gen',
    title: 'Store SYNTH-10Y generated',
    at: TODAY.getTime() - 26 * 3_600_000,
    status: 'done'
  }
]

function job(over: Partial<TrackedJob> & { jobId: string }): TrackedJob {
  return { kind: 'calculate', status: 'succeeded', progress: 1, message: '', heardAt: 0, ...over }
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

describe('the activity log (BU-287)', () => {
  const now = TODAY.getTime()

  it('follows a job: each step its messages name, the one before timed as it ends', () => {
    const running = (message: string, progress: number) =>
      job({ jobId: 'b', kind: 'backtest:TECH10', status: 'running', progress, message })

    // The opening summary is no step; the daily messages are one.
    let entry = followJob(
      undefined,
      running('Calculating the index, tracking the index and simulating it.', 0.05),
      now
    )
    entry = followJob(entry, running("Calculating the index 'TECH10'", 0.1), now + 1_000)
    entry = followJob(entry, running('Simulating 2024-03-01, day 1 of 500', 0.2), now + 8_000)
    entry = followJob(entry, running('Simulating 2024-03-04, day 2 of 500', 0.5), now + 9_000)

    expect(entry).toMatchObject({ title: 'Backtest of TECH10', status: 'running', detail: '50%' })
    expect(entry.steps?.map((step) => [step.label, step.doing, step.detail])).toEqual([
      ['Calculated TECH10 index', 'Calculating TECH10 index', '7s'],
      ['Simulated TECH10', 'Simulating TECH10', undefined]
    ])

    const done = followJob(
      entry,
      job({ jobId: 'b', kind: 'backtest:TECH10', settledAt: now + 43_000, message: 'Complete.' }),
      now + 43_000
    )
    expect(done).toMatchObject({ status: 'done', detail: '43s' })
    expect(done.steps).toHaveLength(2)
    expect(done.steps?.at(-1)?.detail).toBe('35s')
    expect(done.opens?.map((choice) => choice.label)).toEqual(['Details', 'Overview', 'Holdings'])
  })

  it('logs steps objectively, with what they are of (Karan)', () => {
    const done = (message: string, subject = 'TECH10') => stepOf(message, subject)?.done
    expect(done("Calculating the index 'EU-VALUE'")).toBe('Calculated EU-VALUE index')
    expect(done("Building the strategy's weights")).toBe('Built TECH10 weights')
    expect(done("Comparing against benchmark 'EU-VALUE'.")).toBe('Compared with EU-VALUE')
    expect(done('Assembling results.')).toBe('Assembled results')
    expect(done('Assembling the result.')).toBe('Assembled results')
    expect(done('Saving the record.')).toBe('Saved TECH10 record')
    expect(done('Estimating the risk model.')).toBe('Estimated risk model')
    expect(done('Solving.')).toBe('Solved optimisation')
    expect(done('Loading prices for 1 identifier(s).')).toBe('Loaded prices for 1 identifier')
    expect(done('Fetched CMP001 (3/120)')).toBe('Fetched prices for 120 identifiers')
    expect(done("Reading 'SYNTH-10Y'")).toBe('Read store SYNTH-10Y')
    expect(done('Saving the store', 'SYNTH-10Y')).toBe('Saved store SYNTH-10Y')
    expect(done('Building prices and corporate actions')).toBe('Built prices and corporate actions')
    expect(done('Writing profiles')).toBe('Wrote profiles')
    expect(done('Carrying on exchange rates')).toBe('Extended exchange rates')
    expect(done('Serving the new data')).toBe('Served new data')
    expect(done('Done')).toBeUndefined()
  })

  it('marks a failure on the step it happened in, in the engine’s words', () => {
    const failed = followJob(
      undefined,
      job({
        jobId: 'x',
        kind: 'generate:synthetic',
        status: 'failed',
        settledAt: now,
        message: 'Saving',
        error: { code: 'DATA_ERROR', message: 'No room on the disk' }
      }),
      now
    )
    expect(failed).toMatchObject({ status: 'failed', detail: 'Failed' })
    expect(failed.steps?.at(-1)).toMatchObject({ label: 'No room on the disk', failed: true })
  })

  it('names jobs in words, running and done', () => {
    expect(titleOfJob('generate:SYNTH-10Y', true)).toBe('Generating store SYNTH-10Y')
    expect(titleOfJob('generate:SYNTH-10Y', false)).toBe('Store SYNTH-10Y generated')
    expect(titleOfJob('something:new', false)).toBe('Something new')
    expect(formatDuration(64_000)).toBe('1m 04s')
    expect(formatDuration(7_500_000)).toBe('2h 05m')
  })

  it('records a document saved, and what it opens; a deleted one opens nothing', () => {
    useActivityLog.setState({ entries: [] })
    recordDocument('index', 'TECH10', 'created', now)
    recordDocument('index', 'OLD', 'deleted', now + 1)

    const [deleted, created] = useActivityLog.getState().entries
    expect(created).toMatchObject({ title: 'Index definition TECH10 created' })
    expect(created?.opens?.map((choice) => choice.label)).toEqual([
      'Definition',
      'Constituent preview'
    ])
    expect(deleted?.title).toBe('Index definition OLD deleted')
    expect(deleted?.opens).toBeUndefined()
  })

  it('puts running first, then newest first', () => {
    const entries = inOrder([
      { id: 'old', title: 'old', at: now - 3_600_000, status: 'done' },
      { id: 'live', title: 'live', at: now - 7_200_000, status: 'running' },
      { id: 'new', title: 'new', at: now - 60_000, status: 'done' }
    ])
    expect(entries.map((entry) => entry.id)).toEqual(['live', 'new', 'old'])
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

  it('draws activity as a timeline: a filled dot for what opens, hollow for its steps', () => {
    const { container } = render(
      <HomeView
        {...props}
        onQuickstart={vi.fn()}
        activity={ACTIVITY}
        now={TODAY.getTime()}
        onOpenActivity={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Backtest of TECH10' })).toBeInTheDocument()
    expect(screen.getByText('Simulated TECH10')).toBeInTheDocument()
    expect(screen.getByText('2h ago')).toBeInTheDocument()
    // Two activities, one with somewhere to go; the other and both steps are hollow.
    expect(container.querySelectorAll('.timeline-dot:not(.timeline-dot-hollow)')).toHaveLength(1)
    expect(container.querySelectorAll('.timeline-dot-hollow')).toHaveLength(3)
    expect(screen.queryByText(/Nothing has run yet/)).toBeNull()
    // Steps newest first, as the activities are.
    const steps = [...container.querySelectorAll('.timeline-step-label')].map(
      (step) => step.textContent
    )
    expect(steps).toEqual(['Simulated TECH10', 'Calculated TECH10 index'])
  })

  it('opens where an activity leads from its pop-up', async () => {
    const onOpenActivity = vi.fn()
    render(
      <HomeView
        {...props}
        onQuickstart={vi.fn()}
        activity={ACTIVITY}
        now={TODAY.getTime()}
        onOpenActivity={onOpenActivity}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Backtest of TECH10' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Holdings' }))

    expect(onOpenActivity).toHaveBeenCalledWith({ viewKind: 'weights', subject: 'TECH10' })
  })

  it('shows the whole timeline in a pop-up from the button by its title', async () => {
    render(<HomeView {...props} onQuickstart={vi.fn()} activity={ACTIVITY} now={TODAY.getTime()} />)

    await userEvent.click(screen.getByRole('button', { name: 'All recent activity' }))
    const whole = screen.getByRole('dialog', { name: 'Recent Activity' })
    expect(within(whole).getByText('Store SYNTH-10Y generated')).toBeInTheDocument()
    // Plain: no blurred edges in the pop-up.
    expect(whole.querySelector('.edge-scroll')).toBeNull()
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
