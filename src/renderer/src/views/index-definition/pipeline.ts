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
 * 325:1611), but they cannot all mean the same thing — py-beacon does not
 * model them the same way:
 *
 *   selection  a real list of RuleSpec; append one
 *   weighting  ONE WeightingSpec, whose scheme comes from the engine's own
 *              catalogue and whose cap is a nullable FIELD on it
 *   treatment  ONE optional TreatmentSpec with one supported value
 *
 * So the slot's LABEL changes with the document (BU-160): a group with
 * nothing in it offers the thing itself, and one that is full says why it is
 * inert rather than drawing an enabled button that does nothing.
 */
export type GroupId = 'selection' | 'weighting' | 'treatment'

export const GROUPS: readonly { id: GroupId; label: string }[] = [
  { id: 'selection', label: 'Selection' },
  { id: 'weighting', label: 'Weighting & caps' },
  { id: 'treatment', label: 'Treatment' }
]

export interface AddSlotSpec {
  label: string
  /** Why the slot is inert, or undefined when it works. */
  blocked?: string
}

/** What this group's add slot offers, given what the document already has. */
export function addSlotFor(group: GroupId, document: IndexDocument): AddSlotSpec {
  if (group === 'selection') return { label: 'Add rule…' }

  if (group === 'weighting') {
    if (!hasWeighting(document)) return { label: 'Add weighting…' }
    return document.pipeline.weighting.max_weight == null
      ? { label: 'Add cap…' }
      : { label: 'Add cap…', blocked: 'Already capped — edit the weighting to change it' }
  }

  return hasTreatment(document)
    ? {
        label: 'Add rule…',
        blocked: 'py-beacon supports one treatment, ADJUST_DIVISOR — nothing to add'
      }
    : { label: 'Add rule…' }
}

/**
 * Whether a scheme has been chosen (BU-160).
 *
 * `PipelineSpec` requires `weighting` and its `scheme` has `min_length: 1`,
 * so "none yet" cannot be expressed by leaving the object out — the empty
 * string is this app's word for it, and `draftFindings` is what stops one
 * ever being sent.
 */
export function hasWeighting(document: IndexDocument): boolean {
  return document.pipeline.weighting.scheme.trim() !== ''
}

export function hasTreatment(document: IndexDocument): boolean {
  return document.pipeline.treatment != null
}

/** A row in the methodology list, whatever group it came from. */
export interface PipelineRow {
  group: GroupId
  /** Rule id, or the synthetic id of a fixed-shape row. */
  id: string
  /**
   * What to call the row in a control's label.
   *
   * The id for a rule, because a validation finding names rules by id and
   * the button should be findable by the same word. For the rest it is the
   * thing itself — "Remove cap" rather than "Remove weighting-cap", which
   * reads as a leaked identifier and collides with the weighting's own.
   */
  name: string
  /** Badge text — the py-beacon class name. */
  type: string
  /** What it does, in words. */
  summary: string
  /** Right-aligned outcome: "24 pass", "Σw = 100%". */
  outcome: string | undefined
  /** Opens an editor when clicked. Treatment has one legal value to edit. */
  editable: boolean
  /** Everything the user put here can be taken out again (BU-160). */
  removable: boolean
  /** Order is the pipeline's meaning in selection, and nowhere else. */
  movable: boolean
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

  const rows: PipelineRow[] = (document.pipeline.selection ?? []).map((rule) => ({
    group: 'selection' as const,
    id: rule.id,
    name: rule.id,
    type: rule.type,
    summary: describeRule(rule),
    outcome: outcomeFor(byRule.get(rule.id)),
    editable: true,
    removable: true,
    movable: true
  }))

  /*
   * Nothing until it is chosen (BU-160).
   *
   * A new index used to arrive with EqualWeighted and ADJUST_DIVISOR already
   * in its pipeline and both rows fixed — the app's guesses, presented as
   * decisions the user had made and could not take back.
   */
  const weighting = document.pipeline.weighting
  if (hasWeighting(document)) {
    rows.push({
      group: 'weighting',
      id: weighting.id,
      name: 'weighting',
      type: weighting.scheme,
      summary: describeWeighting(weighting),
      outcome: 'Σw = 100%',
      editable: true,
      removable: true,
      movable: false
    })

    if (weighting.max_weight != null) {
      rows.push({
        group: 'weighting',
        id: capId(weighting),
        name: 'cap',
        type: 'Cap',
        summary: `Single-constituent cap ${asPercent(weighting.max_weight)}`,
        outcome: 'redistributed pro-rata',
        // `max_weight` is a field of the weighting spec, so the cap is edited
        // where it lives — clicking this opens the weighting's own editor.
        editable: true,
        removable: true,
        movable: false
      })
    }
  }

  const treatment = document.pipeline.treatment
  if (treatment != null) {
    rows.push({
      group: 'treatment',
      id: TREATMENT_ID,
      name: 'treatment',
      type: 'CorporateActions',
      summary: humanise(treatment.corporate_actions),
      outcome: 'automatic',
      // One legal value, so there is nothing an editor could offer.
      editable: false,
      removable: true,
      movable: false
    })
  }

  return rows
}

/** The synthetic id of the cap row, which has no id of its own to carry. */
export function capId(weighting: WeightingSpec): string {
  return `${weighting.id}-cap`
}

export const TREATMENT_ID = 'treatment'

/** The only value py-beacon accepts, which its own findings say out loud. */
const DEFAULT_TREATMENT = 'ADJUST_DIVISOR'

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

/**
 * Take a row out, whichever kind it is (BU-160).
 *
 * The methodology list is one list to look at and four shapes underneath —
 * a rule, the weighting, its cap, the treatment — and the view should not
 * have to know which is which to answer a click on ×.
 */
export function removeRow(document: IndexDocument, id: string): IndexDocument {
  if (id === TREATMENT_ID) return removeTreatment(document)

  const weighting = document.pipeline.weighting
  if (id === weighting.id) return clearWeighting(document)
  if (id === capId(weighting)) return removeCap(document)
  return removeRule(document, id)
}

/**
 * Apply what an editor produced, whichever row it was opened on.
 *
 * The weighting travels through the editor as a rule (`weightingAsRule`), so
 * it comes back as one and has to be put back where it belongs — the caller
 * should not have to know which rows are rules and which only look like them.
 */
export function applyRow(document: IndexDocument, rule: RuleSpec): IndexDocument {
  if (rule.id !== document.pipeline.weighting.id) return replaceRule(document, rule)
  return setWeighting(document, weightingFromRule(rule, document.pipeline.weighting))
}

/** Back to nothing chosen, cap and parameters included: they were its own. */
export function clearWeighting(document: IndexDocument): IndexDocument {
  return setWeighting(document, {
    id: document.pipeline.weighting.id,
    scheme: '',
    params: {},
    max_weight: null
  })
}

export function removeCap(document: IndexDocument): IndexDocument {
  return setWeighting(document, { ...document.pipeline.weighting, max_weight: null })
}

export function addTreatment(document: IndexDocument): IndexDocument {
  return {
    ...document,
    pipeline: { ...document.pipeline, treatment: { corporate_actions: DEFAULT_TREATMENT } }
  }
}

/**
 * Omit it entirely rather than sending a null.
 *
 * `treatment` is optional in `PipelineSpec` and the engine applies its own
 * when it is absent — which is a different statement from "no treatment".
 */
export function removeTreatment(document: IndexDocument): IndexDocument {
  const pipeline = { ...document.pipeline }
  delete pipeline.treatment
  return { ...document, pipeline }
}

/**
 * The weighting as the editor's shape, cap included.
 *
 * `max_weight` rides in `params` for the trip because that is where the
 * editor keeps values; `weightingFromRule` lifts it back out. The editor
 * itself is given a synthetic parameter for it, since the catalogue
 * describes schemes and not the spec that holds one.
 */
export function weightingAsRule(weighting: WeightingSpec): RuleSpec {
  return {
    id: weighting.id,
    type: weighting.scheme,
    params: {
      ...(weighting.params ?? {}),
      ...(weighting.max_weight == null ? {} : { max_weight: weighting.max_weight })
    }
  }
}

export function weightingFromRule(rule: RuleSpec, current: WeightingSpec): WeightingSpec {
  const { max_weight: cap, ...params } = rule.params ?? {}
  return {
    id: current.id,
    scheme: rule.type,
    params,
    max_weight: typeof cap === 'number' ? cap : null
  }
}

/**
 * What this app can say before the engine is asked (BU-160).
 *
 * One thing, and it has to be said here: `pipeline.weighting.scheme` carries
 * `min_length: 1`, so a draft with nothing chosen comes back as a 422 from
 * the request schema — "String should have at least 1 character" against a
 * body path — rather than as a finding anybody would act on.
 */
export function draftFindings(document: IndexDocument): Finding[] {
  if (hasWeighting(document)) return []

  return [
    {
      path: 'pipeline.weighting.scheme',
      rule_id: null,
      severity: 'error',
      code: 'NO_WEIGHTING',
      message: 'Choose a weighting scheme — py-beacon needs one to build the index.'
    }
  ]
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
    /*
     * Empty on purpose (BU-160). No selection rules, no weighting scheme and
     * no treatment: the first two are choices only the author can make, and
     * the engine supplies the third when it is absent. Validate reports the
     * missing weighting, which is the correct first thing to say.
     */
    pipeline: {
      selection: [],
      weighting: { id: 'weighting', scheme: '', params: {} }
    }
  }
}
