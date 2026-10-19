import type { components } from '@shared/api.generated'
import { parseValue, type ParameterSpec } from '../index-definition/ruleCatalogue'
import type { BacktestOptions, StrategyBacktestRequest } from '../shared/strategyDocuments'

type Preset = components['schemas']['VehiclePreset']

/** Field values by parameter name, as typed: absent or '' is "not set". */
export type Values = Record<string, string>

/** One share class, its fields named by `/backtest/options` share_class_settings. */
export interface ClassDraft {
  /** React's key; a class's name is editable, so it cannot be one. */
  key: string
  values: Values
  /** Its own capital, in its own currency. */
  capital: string
}

/** One dated amount of a DatedFlows. */
export interface DatedAmount {
  date: string
  amount: string
}

/** One flow model, from `/backtest/options` flows. */
export interface FlowDraft {
  key: string
  type: string
  /** The class it applies to, or '' for the fund as a whole. */
  shareClass: string
  values: Values
  /** DatedFlows only: its amounts, as rows rather than a JSON object. */
  dated: DatedAmount[]
  /** Which of an either/or pair is used, before a value is typed (a fixed amount or a share). */
  sizedBy?: string
}

/**
 * Everything the Backtest tab collects for a stored strategy (BU-174, 0.9.0).
 *
 * The strategy and its implementation are the stored strategy's, and a body
 * carrying either is refused — so this holds only what a run adds: the
 * vehicle, its classes, the money in and out, the period, the costs and
 * what the run takes as given.
 *
 * Numbers stay strings because they are INPUTS: a half-typed "1_0" is a
 * state the form has to hold, and parsing on every keystroke turns an empty
 * box into a zero. A blank date is not missing either — py-beacon starts at
 * the index base date and ends at its last observation.
 */
export interface BacktestSetup {
  start: string
  end: string
  costBps: string
  /** The fund's capital without share classes; each class has its own. */
  initialCapital: string
  /** An index id or a market-data identifier, or '' for none. */
  benchmark: string
  benchmarkKind: 'index' | 'identifier'
  /** The book's currency, or '' for the index's. */
  currency: string
  dividends: string
  /** A preset key, or '' for a plain backtest with no vehicle and no fee. */
  preset: string
  /** Changes to the preset, by vehicle setting. Only these are sent. */
  vehicle: Values
  classes: ClassDraft[]
  flows: FlowDraft[]
  /** Modelling assumptions; unset ones take the engine's default. */
  assumptions: Values
}

/** py-beacon's own defaults, restated so the form shows what it will send. */
export const DEFAULT_SETUP: BacktestSetup = {
  start: '',
  end: '',
  costBps: '5',
  initialCapital: '1000000',
  benchmark: '',
  benchmarkKind: 'index',
  currency: '',
  dividends: 'reinvest',
  preset: '',
  vehicle: {},
  classes: [],
  flows: [],
  assumptions: {}
}

/**
 * The vehicle settings this preset takes, as fields.
 *
 * A setting with `applies_to` belongs to those archetypes only — creation
 * units are an ETF's — and the JSON-valued ones (pricing, limits, an ETF's
 * market model) are the preset's to carry: a free-text JSON box is not a
 * form, and the preset already names a sensible one.
 */
export function vehicleFields(
  options: BacktestOptions | undefined,
  preset: Preset | undefined
): ParameterSpec[] {
  if (preset === undefined) return []
  return (options?.vehicle_settings ?? []).filter(
    (param) =>
      param.type !== 'json' &&
      (param.applies_to == null || param.applies_to.includes(preset.archetype))
  )
}

/** What the field shows: what was typed, else the preset's own value. */
export function vehicleValue(
  setup: BacktestSetup,
  preset: Preset | undefined,
  name: string
): string {
  const typed = setup.vehicle[name]
  if (typed !== undefined) return typed
  const own = preset?.settings[name]
  if (own === null || own === undefined) return ''
  return typeof own === 'string' ? own : JSON.stringify(own)
}

/** The request, built once on the way out. */
export function toRequest(
  setup: BacktestSetup,
  options: BacktestOptions | undefined
): StrategyBacktestRequest {
  const preset = options?.presets.find((entry) => entry.key === setup.preset)
  const classes = setup.classes.map((draft) => classSpec(draft, options))

  return {
    ...(setup.start === '' ? {} : { start: setup.start }),
    ...(setup.end === '' ? {} : { end: setup.end }),
    transaction_cost_bps: Number(setup.costBps),
    initial_capital:
      classes.length === 0
        ? Number(setup.initialCapital)
        : Object.fromEntries(
            setup.classes.map((draft) => [className(draft), Number(draft.capital)])
          ),
    dividends: setup.dividends,
    ...(setup.currency === '' ? {} : { currency: setup.currency.toUpperCase() }),
    ...(setup.benchmark === ''
      ? {}
      : // CLOSE is the engine's own default; the generated type asks for it.
        { benchmark: { id: setup.benchmark, kind: setup.benchmarkKind, price_column: 'CLOSE' } }),
    ...(preset === undefined
      ? {}
      : { vehicle: { preset: preset.key, settings: vehicleChanges(setup, preset, options) } }),
    ...(classes.length === 0 ? {} : { share_classes: classes }),
    ...flowsOf(setup, options),
    ...assumptionsOf(setup, options)
  }
}

/** Only what differs from the preset, which is all the engine asks for. */
function vehicleChanges(
  setup: BacktestSetup,
  preset: Preset,
  options: BacktestOptions | undefined
): Record<string, unknown> {
  const changes: Record<string, unknown> = {}
  for (const param of vehicleFields(options, preset)) {
    const typed = setup.vehicle[param.name]
    if (typed === undefined) continue
    const value = parseValue(param, typed)
    if (JSON.stringify(value) !== JSON.stringify(preset.settings[param.name] ?? null)) {
      changes[param.name] = value
    }
  }
  return changes
}

/**
 * A class's fields, named and typed by the catalogue's share_class_settings.
 *
 * Cast because the fields come from the catalogue rather than this file:
 * what `ShareClassSpec` requires beyond them is a name, and `setupFindings`
 * refuses a class without one before this is built.
 */
function classSpec(
  draft: ClassDraft,
  options: BacktestOptions | undefined
): components['schemas']['ShareClassSpec'] {
  const spec = parsed(draft.values, options?.share_class_settings ?? [])
  return { ...spec, name: className(draft) } as components['schemas']['ShareClassSpec']
}

function className(draft: ClassDraft): string {
  return (draft.values.name ?? '').trim()
}

/** Typed values parsed to their catalogue type; blanks left out for the engine's default. */
function parsed(values: Values, params: readonly ParameterSpec[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const param of params) {
    const raw = values[param.name]
    if (raw === undefined) continue
    const value = parseValue(param, raw)
    if (value !== null) out[param.name] = value
  }
  return out
}

/**
 * The flows, added together: one list for the fund, or — with share
 * classes — a list per class, each in its class's currency.
 */
function flowsOf(
  setup: BacktestSetup,
  options: BacktestOptions | undefined
): Pick<StrategyBacktestRequest, 'flows'> {
  if (setup.flows.length === 0) return {}
  const specs = setup.flows.map((flow) => ({ flow, spec: flowSpec(flow, options) }))
  if (setup.classes.length === 0) return { flows: specs.map(({ spec }) => spec) }

  // A flow names its class; one left unnamed goes to the first, which is
  // what the form shows it as.
  const first = className(setup.classes[0] ?? emptyClass())
  const byClass: Record<string, components['schemas']['TypedSpec'][]> = {}
  for (const { flow, spec } of specs) {
    const target = flow.shareClass === '' ? first : flow.shareClass
    byClass[target] = [...(byClass[target] ?? []), spec]
  }
  return { flows: byClass }
}

function flowSpec(
  flow: FlowDraft,
  options: BacktestOptions | undefined
): components['schemas']['TypedSpec'] {
  if (flow.type === 'DatedFlows') {
    const amounts = Object.fromEntries(
      flow.dated
        .filter((row) => row.date !== '' && row.amount !== '')
        .map((row) => [row.date, Number(row.amount)])
    )
    return { type: flow.type, params: { amounts } }
  }
  const params = options?.flows.find((entry) => entry.name === flow.type)?.parameters ?? []
  return { type: flow.type, params: parsed(flow.values, params) }
}

function assumptionsOf(
  setup: BacktestSetup,
  options: BacktestOptions | undefined
): Pick<StrategyBacktestRequest, 'modelling_assumptions'> {
  const set = parsed(setup.assumptions, options?.modelling_assumptions ?? [])
  return Object.keys(set).length === 0 ? {} : { modelling_assumptions: set }
}

export function emptyClass(key = 'class-0'): ClassDraft {
  return { key, values: { name: '' }, capital: '1000000' }
}

/**
 * What stops this run, said here rather than fetched as a 422.
 *
 * Only what the form can know without the engine: a date order, money that
 * has to be positive, classes that need names of their own. The rest —
 * a preset's limits, a currency the data cannot price — is the engine's to
 * answer, and Validate asks it.
 */
export function setupFindings(setup: BacktestSetup, strategyId: string): string[] {
  const findings: string[] = []
  if (strategyId === '') findings.push('Choose a saved strategy to backtest.')
  if (setup.start !== '' && setup.end !== '' && setup.start > setup.end) {
    findings.push('The start date is after the end date.')
  }
  if (!nonNegative(setup.costBps)) findings.push('The trading cost can’t be negative.')
  if (setup.classes.length === 0 && !positive(setup.initialCapital)) {
    findings.push('The initial capital must be more than zero.')
  }
  return findings.concat(classFindings(setup))
}

function classFindings(setup: BacktestSetup): string[] {
  const findings: string[] = []
  const names = setup.classes.map(className)
  if (names.some((name) => name === '')) findings.push('Every share class needs a name.')
  if (new Set(names).size !== names.length)
    findings.push('Each share class needs a different name.')
  for (const draft of setup.classes) {
    if (!positive(draft.capital)) {
      findings.push(`Class ${className(draft) || '—'} needs initial capital of more than zero.`)
    }
    if (draft.values.hedged === 'true' && (draft.values.currency ?? '') === '') {
      findings.push(`Class ${className(draft) || '—'} is hedged, so it needs its own currency.`)
    }
  }
  return findings
}

function positive(raw: string): boolean {
  const value = Number(raw)
  return raw.trim() !== '' && Number.isFinite(value) && value > 0
}

function nonNegative(raw: string): boolean {
  const value = Number(raw)
  return raw.trim() !== '' && Number.isFinite(value) && value >= 0
}

/** A typed value, or the fallback when the field was left blank. */
export function filled(value: string | undefined, fallback: string): string {
  return value === undefined || value === '' ? fallback : value
}
