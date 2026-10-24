/**
 * A job's progress messages as the steps Home's timeline logs (BU-287).
 *
 * py-beacon's messages are written for a progress bar: "Calculating the
 * index 'TECH10'", "Simulating 2024-03-01, day 120 of 2,500". A log wants
 * them objective and named (Karan): "Calculated TECH10 index", "Simulated
 * TECH10". Each message is reshaped into what is being done, and the done
 * form follows from its verb. Messages that reshape alike are one step, which
 * is what folds a simulation's daily messages into one.
 */
export interface StepName {
  /** While it runs: "Simulating TECH10". */
  doing: string
  /** Once it has ended: "Simulated TECH10". */
  done: string
}

/** What is said but is not a step: the end itself, and a backtest's opening summary. */
const NOT_STEPS = [/^(complete|done)\.?$/i, /^calculating the index, .+ and simulating it/i]

/**
 * Messages that need reshaping before they read as a step. `subject` is
 * what the job is of: the strategy for a backtest, the store for a load.
 */
const RESHAPED: readonly [RegExp, (found: RegExpMatchArray, subject: string) => string][] = [
  [/^calculating the index '([^']+)'/i, (found) => `Calculating ${at(found, 1)} index`],
  [/^building the strategy's weights/i, (_found, subject) => `Building ${subject} weights`],
  [/^simulating \d{4}-\d{2}-\d{2}, day/i, (_found, subject) => `Simulating ${subject}`],
  [/^comparing against benchmark '([^']+)'/i, (found) => `Comparing with ${at(found, 1)}`],
  [/^assembling (the )?results?\b/i, () => 'Assembling results'],
  [/^saving the record/i, (_found, subject) => `Saving ${subject} record`],
  [/^solving\.?$/i, () => 'Solving optimisation'],
  [
    /^loading prices for ([\d,]+) identifier/i,
    (found) => `Loading prices for ${counted(at(found, 1), 'identifier')}`
  ],
  [/^rendering '([^']+)'/i, (found) => `Rendering ${at(found, 1)}`],
  [
    /^fetched \S+ \(\d+\/(\d+)\)/i,
    (found) => `Fetching prices for ${counted(at(found, 1), 'identifier')}`
  ],
  [/^reading '([^']+)'/i, (found) => `Reading store ${at(found, 1)}`],
  [/^(saving|reading) the store\b/i, (found, subject) => `${at(found, 1)} store ${subject}`],
  [/^carrying on (.+)/i, (found) => `Extending ${at(found, 1)}`]
]

/** -ing verbs whose past is not the stem plus "ed". */
const IRREGULAR: Record<string, string> = {
  Building: 'Built',
  Drawing: 'Drew',
  Finding: 'Found',
  Getting: 'Got',
  Making: 'Made',
  Reading: 'Read',
  Running: 'Ran',
  Sending: 'Sent',
  Setting: 'Set',
  Writing: 'Wrote'
}

/** The step a message names, or undefined for one that names none. */
export function stepOf(message: string, subject: string): StepName | undefined {
  const said = message.trim()
  if (said === '' || NOT_STEPS.some((pattern) => pattern.test(said))) return undefined

  const doing = tidy(reshape(said, subject))
  return { doing, done: pastOf(doing) }
}

function reshape(said: string, subject: string): string {
  for (const [pattern, shape] of RESHAPED) {
    const found = said.match(pattern)
    if (found !== null) return shape(found, subject)
  }
  return said
}

/** No trailing stop or ellipsis, no "the", one capital. */
function tidy(text: string): string {
  const plain = text
    .replace(/(\.{3}|…|\.)+$/, '')
    .replace(/\bthe\s+/gi, '')
    .trim()
  return plain.charAt(0).toUpperCase() + plain.slice(1)
}

/** "Simulating TECH10" → "Simulated TECH10"; a message with no -ing verb is left as it is. */
function pastOf(doing: string): string {
  const [verb = '', ...rest] = doing.split(' ')
  if (!verb.endsWith('ing') || verb.length < 5) return doing
  const past = IRREGULAR[verb] ?? pastOfRegular(verb.slice(0, -3))
  return [past, ...rest].join(' ')
}

/** "Simulat" → "Simulated", "Load" → "Loaded", "Stopp" → "Stopped". */
function pastOfRegular(stem: string): string {
  return stem.endsWith('e') ? `${stem}d` : `${stem}ed`
}

function counted(count: string, noun: string): string {
  return `${count} ${noun}${count === '1' ? '' : 's'}`
}

function at(found: RegExpMatchArray, group: number): string {
  return found[group] ?? ''
}
