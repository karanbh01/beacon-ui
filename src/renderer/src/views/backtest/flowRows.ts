import type { BacktestOptions } from '../shared/strategyDocuments'
import type { BacktestSetup, FlowDraft } from './setup'

/** One line of the money a run will see: its capital, then each flow. */
export interface FlowRow {
  key: string
  /** The share class it belongs to, or '' for the fund as a whole. */
  shareClass: string
  flow: string
  when: string
  amount: string
}

/**
 * The capital and flows as the page lists them (Karan, 2026-10-17).
 *
 * The settings live in a pop-up; what they add up to stays on the page, a
 * row per thing that happens to the money — the starting capital, each
 * dated amount, each repeating model — so a run is read before it is sent.
 */
export function flowRows(setup: BacktestSetup, options: BacktestOptions | undefined): FlowRow[] {
  const firstClass = className(setup.classes[0]?.values.name)
  const opening = setup.start === '' ? 'At the start' : setup.start

  const capital: FlowRow[] =
    setup.classes.length === 0
      ? [row('capital', '', 'Initial capital', opening, money(setup.initialCapital))]
      : setup.classes.map((draft) =>
          row(
            `capital-${draft.key}`,
            className(draft.values.name),
            'Initial capital',
            opening,
            money(draft.capital)
          )
        )

  const flows = setup.flows.flatMap((flow) =>
    flowLines(
      flow,
      flow.shareClass === '' && setup.classes.length > 0 ? firstClass : flow.shareClass,
      options
    )
  )
  return [...capital, ...flows]
}

function flowLines(
  flow: FlowDraft,
  shareClass: string,
  options: BacktestOptions | undefined
): FlowRow[] {
  const label = options?.flows.find((model) => model.name === flow.type)?.label ?? flow.type
  if (flow.type === 'DatedFlows') {
    return flow.dated
      .filter((entry) => entry.date !== '' || entry.amount !== '')
      .map((entry, at) =>
        row(`${flow.key}-${String(at)}`, shareClass, label, entry.date || '—', money(entry.amount))
      )
  }

  const { frequency, amount, fraction, ...rest } = flow.values
  const how = [
    amount !== undefined && amount !== '' ? money(amount) : undefined,
    fraction !== undefined && fraction !== '' ? `${share(fraction)} of assets` : undefined,
    ...Object.entries(rest)
      .filter(([, value]) => value !== '')
      .map(([name, value]) => `${name.replace(/_/g, ' ')} ${value}`)
  ].filter((part) => part !== undefined)

  return [
    row(
      flow.key,
      shareClass,
      label,
      frequency === undefined || frequency === '' ? 'Every period' : `Every ${period(frequency)}`,
      how.length === 0 ? '—' : how.join(' · ')
    )
  ]
}

function row(key: string, shareClass: string, flow: string, when: string, amount: string): FlowRow {
  return { key, shareClass, flow, when, amount }
}

function className(name: string | undefined): string {
  return (name ?? '').trim()
}

/** As typed, grouped: 250000 → "250,000"; a sign says which way it went. */
function money(raw: string): string {
  const value = Number(raw)
  if (raw.trim() === '' || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function share(raw: string): string {
  const value = Number(raw)
  return Number.isFinite(value)
    ? `${(value * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
    : raw
}

const PERIOD_NAMES: Record<string, string> = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
  QUARTERLY: 'quarter',
  ANNUALLY: 'year'
}

function period(frequency: string): string {
  return PERIOD_NAMES[frequency] ?? frequency.toLowerCase()
}
