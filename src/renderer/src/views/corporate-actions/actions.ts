import type { components } from '@shared/api.generated'

export type CorporateAction = components['schemas']['CorporateAction']
export type CorporateActionsResponse = components['schemas']['CorporateActionsResponse']

/**
 * What `value` means, straight from the engine (BN-118).
 *
 * This used to be inferred from the type string against a list of words —
 * split, reverse, bonus, consolidation, subdivision — because py-beacon
 * documented the two meanings and said nothing about which types had which. A
 * ratio action whose type was not in that list rendered as a cash amount:
 * confidently wrong, with nothing to flag it. `kind` states it.
 *
 * It also carries a third value the guess could not express. `structural` —
 * a rights issue, a spin-off, a merger — has no directly aggregable value and
 * must not be drawn as a quantity in either column.
 */
export function isRatio(action: CorporateAction): boolean {
  return action.kind === 'ratio'
}

export function isStructural(action: CorporateAction): boolean {
  return action.kind === 'structural'
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
  if (isStructural(action)) return typeLabel(action.type)
  if (isRatio(action)) return `${ratioLabel(action.value)} ${typeLabel(action.type)}`
  return `${typeLabel(action.type)}, ${action.value.toFixed(4).replace(/0+$/, '')} per share`
}

/**
 * The "Amount" column: cash to two decimals, ratios as ×n, structural blank.
 *
 * A structural action's `value` is not a quantity in either column's units.
 * Printing it would put a number under a heading that does not describe it.
 */
export function amountLabel(action: CorporateAction): string {
  if (isStructural(action)) return '—'
  if (isRatio(action)) return `×${trim(action.value, 4)}`
  return action.value.toFixed(2)
}

/** Figma 234:4958's Pay Date column. Absent until the action settles. */
export function payDateLabel(action: CorporateAction): string {
  return action.pay_date === null || action.pay_date === undefined
    ? '—'
    : formatDate(action.pay_date)
}

/** announced | paid | cancelled, title-cased. */
export function statusLabel(action: CorporateAction): string {
  return action.status === null || action.status === undefined ? '—' : typeLabel(action.status)
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
