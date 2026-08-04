import { describe, expect, it } from 'vitest'
import {
  datasetLabel,
  datasetOptions,
  describeAge,
  describeSpan,
  filterByDataset,
  describeBytes,
  frequencyLabel,
  sourceLabel,
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
    // BN-119 added these; the engine publishes its own frequency now, so the
    // client no longer has to hold a staleness threshold on its behalf.
    frequency: 'Daily',
    field_count: 6,
    source: 'yfinance',
    stale_after_seconds: 24 * 3600,
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

  it('uses the interval the ENGINE publishes, not one held here', () => {
    // This is the BN-119 change: the thresholds used to be a table in
    // coverage.ts keyed by dataset name, which was a guess about how often
    // each source refreshes. The engine knows.
    const twoDays = 2 * 24 * 3600
    expect(statusOf(row({ cache_age: twoDays, stale_after_seconds: 24 * 3600 }))).toBe('stale')
    expect(statusOf(row({ cache_age: twoDays, stale_after_seconds: 7 * 24 * 3600 }))).toBe('ok')
  })

  it('falls back to a day when the engine sends no interval', () => {
    // Calling something stale a day early is a nudge; calling it fresh for a
    // week is a lie.
    const noInterval = { stale_after_seconds: null }
    expect(statusOf(row({ ...noInterval, cache_age: 2 * 24 * 3600 }))).toBe('stale')
    expect(statusOf(row({ ...noInterval, cache_age: 3600 }))).toBe('ok')
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

  it('takes the union the engine publishes, never a sum', () => {
    // Summing would double-count every instrument holding both prices and
    // reference data, which is most of them. BN-119 publishes the distinct
    // count; this is what ASSETS COVERED always meant.
    expect(summarise(rows, { identifiers_union: 13_002 }).assets).toBe(13_002)
  })

  it('falls back to the largest dataset when no union is sent', () => {
    // Still wrong, but wrong in the safe direction: an undercount rather than
    // a number bigger than the universe.
    expect(summarise(rows).assets).toBe(12_847)
  })

  it('counts distinct sources and sums the field counts', () => {
    const withSources = [
      row({ dataset: 'market', source: 'yfinance', field_count: 6 }),
      row({ dataset: 'reference', source: 'yfinance', field_count: 11 }),
      row({ dataset: 'rates', source: 'ECB', field_count: 2 })
    ]
    const summary = summarise(withSources)

    expect(summary.sources).toBe(2)
    expect(summary.fields).toBe(19)
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
      assets: 0,
      stale: 0,
      newestAge: undefined,
      sources: 0,
      fields: 0,
      cacheBytes: undefined
    })
  })
})

describe('describeBytes', () => {
  it('reads at a glance rather than to the byte', () => {
    expect(describeBytes(0)).toBe('0 B')
    expect(describeBytes(2048)).toBe('2.0 KB')
    expect(describeBytes(1_500_000_000)).toBe('1.4 GB')
  })

  it('says nothing when the engine reports no size', () => {
    expect(describeBytes(null)).toBe('—')
  })
})

describe('sourceLabel and frequencyLabel', () => {
  it('render what BN-119 added', () => {
    expect(sourceLabel('yfinance')).toBe('yfinance')
    expect(frequencyLabel('daily')).toBe('Daily')
  })

  it('say nothing rather than inventing a source', () => {
    expect(sourceLabel(null)).toBe('—')
    expect(frequencyLabel(undefined)).toBe('—')
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
