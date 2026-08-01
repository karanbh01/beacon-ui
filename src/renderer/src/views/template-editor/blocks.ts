import type { ReportTemplate } from '../shared/reportQueries'

export type Block = Record<string, unknown>

/**
 * A block's kind, which is the one field py-beacon guarantees.
 *
 * `blocks` is a list of free-form objects that each "carry a `kind`" — and,
 * as with index rules (#43), nothing publishes which kinds exist or what
 * fields each takes. So the editor reads `kind` and treats the rest
 * generically, and the pane says so.
 */
export function kindOf(block: Block): string {
  const kind = block.kind
  return typeof kind === 'string' && kind !== '' ? kind : 'Block'
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

export function addBlock(template: ReportTemplate, kind = 'TextBlock'): ReportTemplate {
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
