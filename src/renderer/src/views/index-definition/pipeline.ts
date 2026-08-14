import type { components } from '@shared/api.generated'

export type IndexDocument = components['schemas']['IndexDocument']
export type RuleSpec = components['schemas']['RuleSpec']
export type WeightingSpec = components['schemas']['WeightingSpec']
export type PreviewStep = components['schemas']['PreviewStep']
export type Finding = components['schemas']['Finding']

/**
 * The three groups Figma draws (322:1553), each with its own add slot.
 *
 * The frame puts an "+ Add rule…" under all three (325:1617, 325:1614,
 * 325:1611) and the pane now draws all three, but they cannot all mean the
 * same thing — py-beacon does not model them the same way:
 *
 *   selection  a real list of RuleSpec; append one
 *   weighting  ONE WeightingSpec whose cap is a nullable FIELD, so the only
 *              thing to add is the cap, and only while there is not one
 *   treatment  ONE TreatmentSpec with one supported value, so there is
 *              genuinely nothing to add
 *
 * The slot is therefore rendered in all three places and inert where the
 * document has nowhere to put anything, saying why. Drawing an enabled
 * button that silently does nothing would match the frame more exactly and
 * be worse.
 */
export type GroupId = 'selection' | 'weighting' | 'treatment'

export const GROUPS: readonly { id: GroupId; label: string; addLabel: string }[] = [
  { id: 'selection', label: 'Selection', addLabel: 'Add rule…' },
  { id: 'weighting', label: 'Weighting & caps', addLabel: 'Add cap…' },
  { id: 'treatment', label: 'Treatment', addLabel: 'Add rule…' }
]

/** Why this group's add slot is inert, or undefined when it works. */
export function addBlockedReason(group: GroupId, document: IndexDocument): string | undefined {
  if (group === 'selection') return undefined
  if (group === 'weighting') {
    return document.pipeline.weighting.max_weight == null
      ? undefined
      : 'Already capped — edit the cap rule rather than adding a second'
  }
  return 'py-beacon supports one treatment, ADJUST_DIVISOR — nothing to add'
}

/** A row in the methodology list, whatever group it came from. */
export interface PipelineRow {
  group: GroupId
  /** Rule id, or the synthetic id of a fixed-shape row. */
  id: string
  /** Badge text — the py-beacon class name. */
  type: string
  /** What it does, in words. */
  summary: string
  /** Right-aligned outcome: "24 pass", "Σw = 100%". */
  outcome: string | undefined
  /** Fixed-shape rows cannot be removed or reordered. */
  fixed: boolean
}

const RULE_WORDS: Record<string, string> = {
  MarketCapRule: 'market capitalisation',
  FreeFloatMarketCapRule: 'free-float market capitalisation',
  LiquidityRule: 'liquidity',
  SectorRule: 'GICS sector',
  CountryRule: 'country'
}

/**
 * "FilterRule" → "Filter rule", "min_cap" → "Min cap".
 *
 * Rule types are py-beacon class names and parameter keys are snake_case, so
 * both shapes have to split — a label reading "min_cap" would be the schema
 * leaking through into the pane.
 */
export function humanise(type: string): string {
  const spaced = type
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  if (spaced === '') return type
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

/**
 * A rule's parameters, rendered as the sentence Figma shows.
 *
 * `params` is a free-form object and py-beacon publishes no catalogue of rule
 * types or the arguments they take — unlike `/optimise/constraint-types`,
 * which does exactly that for constraints. So this reads the object generically
 * and falls back to `key: value` pairs. See issue #43.
 */
export function describeRule(rule: RuleSpec): string {
  const params = rule.params ?? {}
  const entries = Object.entries(params).filter(([, value]) => value !== null)
  if (entries.length === 0) return RULE_WORDS[rule.type] ?? humanise(rule.type)

  return entries.map(([key, value]) => `${humanise(key)} ${format(value)}`).join(' · ')
}

function format(value: unknown): string {
  if (typeof value === 'number') return value.toLocaleString('en-US')
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (Array.isArray(value)) return (value as unknown[]).map(format).join(', ')
  return String(value)
}

export function describeWeighting(weighting: WeightingSpec): string {
  const scheme = humanise(weighting.scheme)
  const params = Object.entries(weighting.params ?? {})
  if (params.length === 0) return scheme
  return `${scheme} · ${params.map(([key, value]) => `${humanise(key)} ${format(value)}`).join(' · ')}`
}

/** A percentage, from py-beacon's fractions. `0.2` → "20%". */
export function asPercent(fraction: number | null | undefined, dp = 1): string {
  if (fraction === null || fraction === undefined) return '—'
  return `${(fraction * 100).toFixed(dp)}%`
}

/**
 * Every methodology row, in the order Figma lists them.
 *
 * `steps` comes from a preview of the SAVED document, so the outcome column
 * is attached by rule id rather than by position — a draft that has added a
 * rule must not shift last preview's counts onto the wrong rows.
 */
export function pipelineRows(
  document: IndexDocument,
  steps: readonly PreviewStep[] = []
): PipelineRow[] {
  const byRule = new Map(steps.filter((step) => step.rule_id != null).map((s) => [s.rule_id, s]))

  const selection = (document.pipeline.selection ?? []).map((rule) => ({
    group: 'selection' as const,
    id: rule.id,
    type: rule.type,
    summary: describeRule(rule),
    outcome: outcomeFor(byRule.get(rule.id)),
    fixed: false
  }))

  const weighting = document.pipeline.weighting
  const rows: PipelineRow[] = [
    ...selection,
    {
      group: 'weighting',
      id: weighting.id,
      type: weighting.scheme,
      summary: describeWeighting(weighting),
      outcome: 'Σw = 100%',
      fixed: true
    }
  ]

  if (weighting.max_weight != null) {
    rows.push({
      group: 'weighting',
      id: `${weighting.id}-cap`,
      type: 'Cap',
      summary: `Single-constituent cap ${asPercent(weighting.max_weight)}`,
      outcome: 'redistributed pro-rata',
      fixed: true
    })
  }

  rows.push({
    group: 'treatment',
    id: 'treatment',
    type: 'CorporateActions',
    summary: humanise(document.pipeline.treatment?.corporate_actions ?? 'ADJUST_DIVISOR'),
    outcome: 'automatic',
    fixed: true
  })

  return rows
}

function outcomeFor(step: PreviewStep | undefined): string | undefined {
  if (step === undefined) return undefined
  return `${step.remaining.toLocaleString('en-US')} pass`
}

/* ── draft transitions ──────────────────────────────────────────────────── */

/** Unique within the pipeline, which is all py-beacon requires of a rule id. */
export function nextRuleId(document: IndexDocument): string {
  const taken = new Set((document.pipeline.selection ?? []).map((rule) => rule.id))
  for (let n = 1; ; n++) {
    const candidate = `rule-${String(n)}`
    if (!taken.has(candidate)) return candidate
  }
}

export function addRule(document: IndexDocument, type = 'FilterRule'): IndexDocument {
  const rule: RuleSpec = { id: nextRuleId(document), type, params: {} }
  return withSelection(document, [...(document.pipeline.selection ?? []), rule])
}

/**
 * Cap the index, which is what "add" means in the weighting group.
 *
 * 20% matches the frame and is a real default rather than a placeholder: an
 * uncapped index that someone has just decided to cap wants a number they can
 * see and edit, not an empty field that fails validation.
 */
export function addCap(document: IndexDocument, max = 0.2): IndexDocument {
  return setWeighting(document, { ...document.pipeline.weighting, max_weight: max })
}

export function removeRule(document: IndexDocument, id: string): IndexDocument {
  return withSelection(
    document,
    (document.pipeline.selection ?? []).filter((rule) => rule.id !== id)
  )
}

export function replaceRule(document: IndexDocument, rule: RuleSpec): IndexDocument {
  return withSelection(
    document,
    (document.pipeline.selection ?? []).map((current) => (current.id === rule.id ? rule : current))
  )
}

/**
 * Move a rule one place.
 *
 * Order is the pipeline's meaning — filter then rank then select produces a
 * different index from select then filter — so this is a real edit, not a
 * display preference.
 */
export function moveRule(document: IndexDocument, id: string, delta: -1 | 1): IndexDocument {
  const rules = [...(document.pipeline.selection ?? [])]
  const from = rules.findIndex((rule) => rule.id === id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= rules.length) return document

  const moved = rules[from]
  const displaced = rules[to]
  if (moved === undefined || displaced === undefined) return document
  rules[from] = displaced
  rules[to] = moved

  return withSelection(document, rules)
}

function withSelection(document: IndexDocument, selection: RuleSpec[]): IndexDocument {
  return { ...document, pipeline: { ...document.pipeline, selection } }
}

export function setWeighting(document: IndexDocument, weighting: WeightingSpec): IndexDocument {
  return { ...document, pipeline: { ...document.pipeline, weighting } }
}

/** Field-by-field, so a draft can be compared with what the engine holds. */
export function isDirty(draft: IndexDocument, saved: IndexDocument | undefined): boolean {
  if (saved === undefined) return true
  return JSON.stringify(draft) !== JSON.stringify(saved)
}

export function errorsOf(findings: readonly Finding[]): Finding[] {
  return findings.filter((finding) => finding.severity === 'error')
}

export function warningsOf(findings: readonly Finding[]): Finding[] {
  return findings.filter((finding) => finding.severity !== 'error')
}

/**
 * A new, empty index.
 *
 * Seeded when the engine has no document under this id, so a tab opened for
 * a name that does not exist becomes the editor for creating it rather than
 * a dead end. Every field is a value py-beacon will accept; the pipeline
 * starts with no selection rules, which validate will report as a finding —
 * that is the correct first thing to tell someone.
 */
export function blankIndex(id: string): IndexDocument {
  return {
    id,
    name: id,
    description: '',
    currency: 'USD',
    base_date: '2020-01-01',
    base_value: 100,
    rebalancing_frequency: 'QUARTERLY',
    // py-beacon's own defaults for the metadata BN-121 and BN-125 added. A
    // new document has to carry them because the generated type makes a
    // defaulted field required — the server always sends one back.
    return_type: 'PRICE',
    rebalance_day_rule: 'FIRST_BUSINESS_DAY',
    effective_lag_sessions: 0,
    withholding_tax_rate: 0,
    universe: { universe_id: null },
    pipeline: {
      selection: [],
      weighting: { id: 'weighting', scheme: 'EqualWeighted', params: {} },
      treatment: { corporate_actions: 'ADJUST_DIVISOR' }
    }
  }
}
