import type { ReportTemplate } from '../shared/reportQueries'

/**
 * One block of a report template, as the engine publishes it (BU-212).
 *
 * The KIND is a closed set now — `bar_chart`, `chart`, `header`,
 * `stat_grid`, `table`, `text` — and has been all along: py-beacon's block
 * model has used those names since BN-75. What changed at 0.1.0 is that the
 * schema says so. Before, `blocks` was "free-form objects that each carry a
 * `kind`", nothing published which kinds existed, and this editor guessed
 * `TextBlock` for a new one. The engine never accepted that name, so "Add
 * block" had been sending a kind it would reject for as long as it existed.
 *
 * Which is the rule this repo keeps relearning in another costume: when a
 * client has to infer something the server knows, the inference is where
 * the bug goes. Here the inference was a naming convention borrowed from
 * the index rules (`FilterRule`, `RankRule`), plausible and wrong.
 *
 * The FIELDS each kind takes are still not published, so everything past
 * `kind` stays generic and the pane says so.
 */
export type Block = NonNullable<ReportTemplate['blocks']>[number]
export type BlockKind = Block['kind']

export function kindOf(block: Block): BlockKind {
  return block.kind
}

/**
 * Every kind the engine accepts, in words.
 *
 * A Record rather than a list, so the compiler holds it to the published
 * set in BOTH directions: a kind py-beacon removes is a type error on its
 * key, and a kind it adds is a type error for the one missing. A plain array
 * would catch only the first, and an added kind would simply never be
 * offered — silently, which is the failure this whole editor started from.
 */
export const BLOCK_KINDS: Record<BlockKind, string> = {
  header: 'Header',
  text: 'Text',
  stat_grid: 'Stat grid',
  chart: 'Chart',
  bar_chart: 'Bar chart',
  table: 'Table'
}

/** Whether a string from a control is one of the kinds, without a cast. */
export function isBlockKind(value: string): value is BlockKind {
  return Object.hasOwn(BLOCK_KINDS, value)
}

/** "Index name, description, as-of date" — the block's other fields, in words. */
export function describeBlock(block: Block): string {
  const entries = Object.entries(block).filter(
    ([key, value]) => key !== 'kind' && value !== null && value !== undefined && value !== ''
  )
  if (entries.length === 0) return 'no settings'
  return entries.map(([key, value]) => `${key.replace(/_/g, ' ')} ${format(value)}`).join(' · ')
}

function format(value: unknown): string {
  if (typeof value === 'number') return value.toLocaleString('en-US')
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return (value as unknown[]).map(format).join(', ')
  // A nested object has no one-line summary worth inventing, and String()
  // would render "[object Object]" in the row.
  return '…'
}

function withBlocks(template: ReportTemplate, blocks: Block[]): ReportTemplate {
  return { ...template, blocks }
}

/** Text, because it is the one block that asks nothing of the data. */
export function addBlock(template: ReportTemplate, kind: BlockKind = 'text'): ReportTemplate {
  return withBlocks(template, [...(template.blocks ?? []), { kind }])
}

export function removeBlock(template: ReportTemplate, index: number): ReportTemplate {
  return withBlocks(
    template,
    (template.blocks ?? []).filter((_block, at) => at !== index)
  )
}

export function replaceBlock(
  template: ReportTemplate,
  index: number,
  block: Block
): ReportTemplate {
  return withBlocks(
    template,
    (template.blocks ?? []).map((current, at) => (at === index ? block : current))
  )
}

/**
 * Move a block one place.
 *
 * Blocks are "drawn top to bottom", so order is the document — a real edit,
 * like an index pipeline and unlike a constraint set.
 */
export function moveBlock(template: ReportTemplate, index: number, delta: -1 | 1): ReportTemplate {
  const blocks = [...(template.blocks ?? [])]
  const to = index + delta
  if (index < 0 || to < 0 || to >= blocks.length) return template

  const moved = blocks[index]
  const displaced = blocks[to]
  if (moved === undefined || displaced === undefined) return template
  blocks[index] = displaced
  blocks[to] = moved

  return withBlocks(template, blocks)
}

export function isDirty(draft: ReportTemplate, saved: ReportTemplate | undefined): boolean {
  if (saved === undefined) return true
  return JSON.stringify(draft) !== JSON.stringify(saved)
}

/** Page setup as label/value rows; `page` is free-form too. */
export function pageRows(template: ReportTemplate): { key: string; value: string }[] {
  return Object.entries(template.page ?? {}).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value)
  }))
}
