import type { Analytics, TableFrame } from '../../api/analytics'

/** A table's cell as the engine sends it. */
export type Cell = string | number | boolean | null

/** A table-kind statistic's frame, when the run worked it out. */
export function frameOf(answer: Analytics | undefined, id: string): TableFrame | undefined {
  const value = answer?.statistics[id]
  return value?.kind === 'table' ? value.point : undefined
}

/** A table's few figures about itself (BN-429): how many names were measured, say. */
export function summaryOf(
  answer: Analytics | undefined,
  id: string
): Record<string, Cell> | undefined {
  const value = answer?.statistics[id]
  return value?.kind === 'table' ? value.summary : undefined
}

/** A figures-kind statistic's figures, by their compound names. */
export function figuresOf(
  answer: Analytics | undefined,
  id: string
): Record<string, number | null> | undefined {
  const value = answer?.statistics[id]
  return value?.kind === 'figures' ? value.point : undefined
}

/** A frame's rows, each keyed by column name. */
export function recordsOf(frame: TableFrame | undefined): Record<string, Cell>[] {
  if (frame === undefined) return []
  return frame.data.map((cells) =>
    Object.fromEntries(frame.columns.map((name, at) => [name, cells[at] ?? null]))
  )
}

/** A cell as a finite number, or undefined. */
export function numberOf(value: Cell | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** A cell as text, or undefined. */
export function textOf(value: Cell | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** Why a statistic was not worked out for this run, in the engine's words. */
export function reasonOf(answer: Analytics | undefined, id: string): string | undefined {
  return answer?.unavailable[id]?.reason
}
