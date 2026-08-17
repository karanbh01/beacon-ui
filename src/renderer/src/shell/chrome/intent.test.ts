import { describe, expect, it } from 'vitest'
import type { ViewOption } from '../viewRegistry'
import { namesView, parseIntent } from './intent'

const VIEWS: ViewOption[] = [
  { viewKind: 'prices', page: 'data-explorer', title: 'Prices', archetype: 'query' },
  { viewKind: 'coverage', page: 'data-explorer', title: 'Data Coverage', archetype: 'global' },
  { viewKind: 'backtest', page: 'strategy-builder', title: 'Backtest', archetype: 'pinned' },
  { viewKind: 'frontier', page: 'optimiser', title: 'Frontier', archetype: 'pinned' },
  {
    viewKind: 'index-definition',
    page: 'strategy-builder',
    title: 'Index Definition',
    archetype: 'document'
  }
]

const parse = (query: string): string =>
  (() => {
    const intent = parseIntent(query, VIEWS)
    return intent === undefined ? 'none' : `${intent.view.viewKind}|${intent.subject}`
  })()

/**
 * The parse table the issue asks for. Both orders, unknown halves, and the
 * cases where a query must NOT be read as an intent.
 */
describe('parseIntent', () => {
  it('reads <view> <subject>', () => {
    expect(parse('backtest TECH10')).toBe('backtest|TECH10')
  })

  it('reads <subject> <view>', () => {
    expect(parse('AAPL prices')).toBe('prices|AAPL')
  })

  it('reads a bare view name, with nothing pinned', () => {
    expect(parse('frontier')).toBe('frontier|')
  })

  it('keeps the subject verbatim — case is the user’s business', () => {
    expect(parse('prices aapl')).toBe('prices|aapl')
  })

  it('matches a multi-word view, and prefers the longer match', () => {
    // "index" alone would name Index Definition too; the two-word match wins
    // so the subject is not silently "definition TECH10".
    expect(parse('index definition TECH10')).toBe('index-definition|TECH10')
  })

  it('matches on word prefixes, which is what makes it typeable', () => {
    expect(parse('data cov')).toBe('coverage|')
    expect(parse('front TECH10')).toBe('frontier|TECH10')
  })

  it('requires the words in order, so a subject cannot name a view by accident', () => {
    expect(namesView('coverage data', VIEWS[1]!)).toBe(false)
  })

  it('degrades to nothing when no half names a view', () => {
    // "AAPL" alone is a perfectly good thing to have typed — it just is not
    // an intent, and the plain groups handle it.
    expect(parse('AAPL')).toBe('none')
    expect(parse('zzzz zzzz')).toBe('none')
  })

  it('degrades when the view half is unknown', () => {
    expect(parse('sideways TECH10')).toBe('none')
  })

  it('says nothing about an empty query', () => {
    expect(parse('')).toBe('none')
    expect(parse('   ')).toBe('none')
  })

  it('is not fuzzy — a fragment mid-word does not match', () => {
    expect(namesView('rices', VIEWS[0]!)).toBe(false)
    expect(namesView('ta', VIEWS[1]!)).toBe(false)
  })
})
