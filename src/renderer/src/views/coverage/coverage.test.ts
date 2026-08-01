import { describe, expect, it } from 'vitest'
import {
  datasetLabel,
  datasetOptions,
  describeAge,
  describeSpan,
  filterByDataset,
  statusLabel,
  statusOf,
  summarise,
  type DatasetCoverage
} from './coverage'

function row(overrides: Partial<DatasetCoverage> = {}): DatasetCoverage {
  return {
    dataset: 'market',
    configured: true,
    identifiers: 12_847,
    start: '1962-01-02',
    end: '2026-07-28',
    cache_age: 7_200,
    last_refreshed: '2026-07-28T06:00:00Z',
    ...overrides
  }
}

describe('statusOf', () => {
  it('separates "not loaded" from "loaded and never synced"', () => {
    // py-beacon draws this distinction deliberately, and it decides what the
    // user should do: configure a source, or press sync.
    expect(statusOf(row({ configured: false }))).toBe('absent')
    expect(statusOf(row({ cache_age: null }))).toBe('never')
  })

  it('calls a dataset stale past its own refresh interval, not a global one', () => {
    const twoDays = 2 * 24 * 3600
    expect(statusOf(row({ dataset: 'market', cache_age: twoDays }))).toBe('stale')
    // Reference data is static; two days old is not stale for it.
    expect(statusOf(row({ dataset: 'reference', cache_age: twoDays }))).toBe('ok')
  })

  it('gives an unknown dataset the daily threshold', () => {
    // Calling something stale a day early is a nudge; calling it fresh for a
    // week is a lie.
    expect(statusOf(row({ dataset: 'mystery', cache_age: 2 * 24 * 3600 }))).toBe('stale')
    expect(statusOf(row({ dataset: 'mystery', cache_age: 3600 }))).toBe('ok')
  })

  it('names each state in words', () => {
    expect(statusLabel('ok')).toBe('OK')
    expect(statusLabel('never')).toBe('Never synced')
    expect(statusLabel('absent')).toBe('Not loaded')
  })
})

describe('describeAge', () => {
  it('coarsens as the age grows', () => {
    expect(describeAge(30)).toBe('just now')
    expect(describeAge(1_800)).toBe('30m ago')
    expect(describeAge(7_200)).toBe('2h ago')
    expect(describeAge(93_600)).toBe('26h ago')
    expect(describeAge(5 * 86_400)).toBe('5d ago')
  })

  it('says nothing for a dataset that was never loaded', () => {
    expect(describeAge(null)).toBe('—')
    expect(describeAge(undefined)).toBe('—')
  })
})

describe('describeSpan', () => {
  it('renders the two ends as years', () => {
    expect(describeSpan(row())).toBe('1962 → 2026')
  })

  it('collapses a single-year span', () => {
    expect(describeSpan(row({ start: '2025-01-02', end: '2025-12-31' }))).toBe('2025')
  })

  it('does not invent an end it was not given', () => {
    expect(describeSpan(row({ end: null }))).toBe('1962 → ?')
    expect(describeSpan(row({ start: null, end: null }))).toBe('—')
  })
})

describe('summarise', () => {
  const rows = [
    row({ dataset: 'market', identifiers: 12_847, cache_age: 7_200 }),
    row({ dataset: 'reference', identifiers: 12_000, cache_age: 3_600 }),
    row({ dataset: 'fundamentals', configured: false, identifiers: 0, cache_age: null })
  ]

  it('reports the largest dataset, never a sum', () => {
    // Summing would double-count every instrument that has both prices and
    // reference data, which is most of them.
    expect(summarise(rows).largest).toBe(12_847)
  })

  it('counts what is configured against what exists', () => {
    const summary = summarise(rows)
    expect(summary.datasets).toBe(3)
    expect(summary.configured).toBe(2)
  })

  it('takes the freshest age, not the oldest', () => {
    expect(summarise(rows).newestAge).toBe(3_600)
  })

  it('does not count an unloaded dataset as stale', () => {
    // "Not loaded" is a setup problem, not a freshness one — mixing them
    // would make the stale count unactionable.
    expect(summarise(rows).stale).toBe(0)
  })

  it('survives an engine that reports nothing', () => {
    expect(summarise([])).toEqual({
      datasets: 0,
      configured: 0,
      largest: 0,
      stale: 0,
      newestAge: undefined
    })
  })
})

describe('filters', () => {
  const rows = [row({ dataset: 'market' }), row({ dataset: 'reference' })]

  it('offers All plus whatever the engine reported', () => {
    expect(datasetOptions(rows)).toEqual([
      { value: '', label: 'All datasets' },
      { value: 'market', label: 'Market' },
      { value: 'reference', label: 'Reference' }
    ])
  })

  it('shows everything when nothing is chosen', () => {
    expect(filterByDataset(rows, '')).toHaveLength(2)
  })

  it('narrows to one dataset', () => {
    expect(filterByDataset(rows, 'reference').map((r) => r.dataset)).toEqual(['reference'])
  })

  it('titles an engine identifier without inventing words', () => {
    expect(datasetLabel('corporate_actions')).toBe('Corporate actions')
  })
})
