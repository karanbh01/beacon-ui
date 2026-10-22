import type { ParameterSpec } from '../index-definition/ruleCatalogue'
import type { BacktestOptions } from '../shared/strategyDocuments'
import {
  DEFAULT_SETUP,
  type BacktestSetup,
  type ClassDraft,
  type FlowDraft,
  type Values
} from './setup'

type Settings = Record<string, unknown>

/**
 * The form as a run left it (BN-322, py-beacon 0.9.1).
 *
 * A run's resolved `settings` carry everything its request did, defaults
 * filled in — dates it actually ran over, capital, cost, benchmark, vehicle,
 * classes, flows, assumptions — so the runs list can open a strategy ready
 * to run again rather than on a blank form. The strategy and implementation
 * are left behind: those are the stored strategy's, not the run's.
 *
 * Read defensively, because `settings` is an open object: a field this does
 * not recognise is skipped, and the form keeps its own default for it.
 */
export function setupFromRun(
  settings: Settings,
  options: BacktestOptions | undefined
): BacktestSetup {
  const preset = text(record(settings.vehicle)?.preset)
  const classes = list(settings.share_classes).map((row, at) =>
    classFrom(row, at, settings.initial_capital, options?.share_class_settings ?? [])
  )
  const benchmark = record(settings.benchmark)

  return {
    ...DEFAULT_SETUP,
    start: day(settings.start),
    end: day(settings.end),
    costBps: number(settings.transaction_cost_bps) ?? DEFAULT_SETUP.costBps,
    initialCapital:
      classes.length === 0
        ? (number(settings.initial_capital) ?? DEFAULT_SETUP.initialCapital)
        : DEFAULT_SETUP.initialCapital,
    benchmark: text(benchmark?.id),
    benchmarkKind: benchmark?.kind === 'identifier' ? 'identifier' : 'index',
    currency: text(settings.currency),
    dividends: text(settings.dividends) || DEFAULT_SETUP.dividends,
    // A run before 0.9.6 reinvested across the holdings; it says nothing, so
    // it opens on today's default rather than claiming to know.
    reinvestInto: text(settings.reinvest_into) || DEFAULT_SETUP.reinvestInto,
    preset,
    vehicle: vehicleChanges(record(record(settings.vehicle)?.settings), preset, options),
    classes,
    flows: flowsFrom(settings.flows),
    assumptions: changed(
      record(settings.modelling_assumptions),
      options?.modelling_assumptions ?? [],
      (param) => param.default
    )
  }
}

/** The vehicle settings that differ from the preset's, which is all the form holds. */
function vehicleChanges(
  settings: Settings | undefined,
  preset: string,
  options: BacktestOptions | undefined
): Values {
  const own = options?.presets.find((entry) => entry.key === preset)?.settings ?? {}
  return changed(
    settings,
    (options?.vehicle_settings ?? []).filter((param) => param.type !== 'json'),
    (param) => own[param.name]
  )
}

/** Each catalogue field whose value is not its baseline, as the text a field shows. */
function changed(
  values: Settings | undefined,
  params: readonly ParameterSpec[],
  baseline: (param: ParameterSpec) => unknown
): Values {
  const out: Values = {}
  for (const param of params) {
    const value = values?.[param.name]
    if (value === undefined || value === null) continue
    if (JSON.stringify(value) === JSON.stringify(baseline(param) ?? null)) continue
    out[param.name] = shown(value)
  }
  return out
}

function classFrom(
  row: Settings,
  at: number,
  capital: unknown,
  params: readonly ParameterSpec[]
): ClassDraft {
  const values: Values = {}
  for (const param of params) {
    const value = row[param.name]
    if (value !== undefined && value !== null) values[param.name] = shown(value)
  }
  const name = text(row.name)
  return {
    key: `run-class-${String(at)}`,
    values: { ...values, name },
    capital: number(record(capital)?.[name]) ?? DEFAULT_SETUP.initialCapital
  }
}

/** Flows as one list for the fund, or a list per class. */
function flowsFrom(flows: unknown): FlowDraft[] {
  if (Array.isArray(flows)) return flows.flatMap((spec, at) => flowFrom(spec, '', at))
  const byClass = record(flows)
  if (byClass === undefined) return []
  return Object.entries(byClass).flatMap(([shareClass, specs]) =>
    list(specs).flatMap((spec, at) => flowFrom(spec, shareClass, at))
  )
}

function flowFrom(spec: unknown, shareClass: string, at: number): FlowDraft[] {
  const typed = record(spec)
  const type = text(typed?.type)
  if (type === '') return []
  const params = record(typed?.params) ?? {}
  const key = `run-flow-${shareClass}-${String(at)}`
  if (type === 'DatedFlows') {
    const amounts = Object.entries(record(params.amounts) ?? {})
    return [
      {
        key,
        type,
        shareClass,
        values: {},
        dated: amounts.map(([date, amount]) => ({ date, amount: shown(amount) }))
      }
    ]
  }
  const values = Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([name, value]) => [name, shown(value)])
  )
  return [{ key, type, shareClass, values, dated: [] }]
}

function record(value: unknown): Settings | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Settings)
    : undefined
}

function list(value: unknown): Settings[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry: unknown) => {
    const row = record(entry)
    return row === undefined ? [] : [row]
  })
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function number(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined
}

/** A date as the date field takes it; a timestamp loses its time. */
function day(value: unknown): string {
  return text(value).slice(0, 10)
}

function shown(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}
