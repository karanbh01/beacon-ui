import type { components } from '@shared/api.generated'

export type CorporateAction = components['schemas']['CorporateAction']
export type CorporateActionsResponse = components['schemas']['CorporateActionsResponse']

/**
 * Action types whose `value` is a share-count multiplier rather than cash.
 *
 * py-beacon documents `value` as "cash amount per share for cash actions; a
 * share-count multiplier for ratio actions", and does not say which types are
 * which. Guessing from the type string is the only option available, so the
 * match is deliberately loose and anything unrecognised is treated as cash —
 * the common case by a wide margin.
 */
const RATIO_TYPES = ['split', 'reverse', 'bonus', 'consolidation', 'subdivision']

export function isRatio(type: string): boolean {
  const lower = type.toLowerCase()
  return RATIO_TYPES.some((word) => lower.includes(word))
}

/** "DIVIDEND" → "Dividend", "REVERSE_SPLIT" → "Reverse split". */
export function typeLabel(type: string): string {
  const words = type.replace(/[_-]+/g, ' ').trim().toLowerCase()
  if (words === '') return type
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function trim(value: number, dp: number): string {
  return value.toFixed(dp).replace(/\.?0+$/, '')
}

/**
 * A ratio multiplier as the ratio a reader recognises.
 *
 * 2 → "2:1", 0.1 → "1:10". Non-integer ratios keep two decimals rather than
 * being forced into whole numbers, since a 3-for-2 arrives as 1.5 and
 * rounding it to "2:1" would state the wrong split.
 */
export function ratioLabel(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value >= 1) return `${trim(value, 2)}:1`
  return `1:${trim(1 / value, 2)}`
}

/** The "Details" column: what the action did, in words. */
export function describeAction(action: CorporateAction): string {
  if (isRatio(action.type)) return `${ratioLabel(action.value)} ${typeLabel(action.type)}`
  return `${typeLabel(action.type)}, ${action.value.toFixed(4).replace(/0+$/, '')} per share`
}

/** The "Amount" column: cash to two decimals, ratios as ×n. */
export function amountLabel(action: CorporateAction): string {
  if (isRatio(action.type)) return `×${trim(action.value, 4)}`
  return action.value.toFixed(2)
}

export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10)
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Distinct types present, for the filter control. Stable order: as seen. */
export function typesIn(actions: readonly CorporateAction[]): string[] {
  const seen: string[] = []
  for (const action of actions) {
    if (!seen.includes(action.type)) seen.push(action.type)
  }
  return seen
}

export function filterByType(
  actions: readonly CorporateAction[],
  type: string | undefined
): CorporateAction[] {
  if (type === undefined) return [...actions]
  return actions.filter((action) => action.type === type)
}

/** Newest first — a corporate-actions table is read from the present back. */
export function sortNewestFirst(actions: readonly CorporateAction[]): CorporateAction[] {
  return [...actions].sort((a, b) => b.ex_date.localeCompare(a.ex_date))
}

/**
 * The first ex-date still ahead of `today`, if the engine sent one.
 *
 * Not requested with a future `end`: py-beacon computes the trailing dividend
 * over the twelve months ending at the as-of date, so pushing the window
 * forward would move that window off the present and report a figure that is
 * not the trailing yield at all. The next ex-date therefore appears only when
 * the source already carries an announced future action, and reads "—"
 * otherwise rather than being manufactured.
 */
export function nextExDate(
  actions: readonly CorporateAction[],
  today: string
): CorporateAction | undefined {
  return sortNewestFirst(actions)
    .filter((action) => action.ex_date.slice(0, 10) > today)
    .pop()
}

export function percent(value: number | null | undefined, dp = 2): string {
  if (value === null || value === undefined) return '—'
  // py-beacon returns the yield as a fraction, e.g. 0.0049 for 0.49%.
  return `${(value * 100).toFixed(dp)}%`
}
