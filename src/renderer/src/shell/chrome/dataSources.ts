import type { EngineStatus } from '@shared/ipc'

export interface SourceRow {
  name: string
  status: string
  tone: 'success' | 'muted'
}

/**
 * What the data sources panel can truthfully say right now.
 *
 * The mock (145:3460) shows Yahoo Finance and Local Store as `connected`.
 * They are not, and cannot be: a spawned server has no way to acquire a data
 * source at all (#40), and the coverage response carries no `source` field to
 * name one with even when it does (#42). So the local store follows the
 * engine — which is real — and the upstream providers report what is actually
 * the case rather than what the frame hopes for.
 *
 * When #40 lands this becomes a read of the coverage response instead of a
 * fixed list, and the panel starts saying something worth opening it for.
 */
export function sourceRows(engine: EngineStatus): SourceRow[] {
  const local: SourceRow =
    engine === 'connected'
      ? { name: 'Local Store', status: 'connected', tone: 'success' }
      : { name: 'Local Store', status: 'unavailable', tone: 'muted' }

  return [
    { name: 'Yahoo Finance', status: 'not configured', tone: 'muted' },
    local,
    { name: 'Bloomberg', status: 'not configured', tone: 'muted' }
  ]
}
