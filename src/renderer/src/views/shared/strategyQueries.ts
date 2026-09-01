import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { components } from '@shared/api.generated'
import { parseRun } from '@shared/backtestRun'
import { ApiError } from '../../api/errors'
import { isDocumentId } from '../../api/ids'
import { keys } from '../../api/keys'
import { useBeacon } from '../../api/queryClient'

export type IndexDocument = components['schemas']['IndexDocument']
export type ValidationReport = components['schemas']['ValidationReport']
export type PreviewResponse = components['schemas']['PreviewResponse']

/**
 * Queries for the definitions the user authors.
 *
 * Kept apart from `queries.ts`, which serves market data: these are documents
 * with a save lifecycle, not cached observations, and mixing the two would
 * put a draft's preview behind the same invalidation a price sync triggers.
 */

export function useIndices() {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.strategy.indices(),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.indices.list(signal)
    },
    enabled: client !== null
  })
}

export function useIndex(indexId: string) {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.strategy.index(indexId),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.indices.get(indexId, signal)
    },
    // Not merely non-empty: py-beacon 422s an id it cannot address, and a
    // view that passed its own title here would ask for one.
    enabled: client !== null && isDocumentId(indexId)
  })
}

export function useUniverses() {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.strategy.universes(),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.universes.list(signal)
    },
    enabled: client !== null
  })
}

export function useUniverseMembers(universeId: string) {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.strategy.universeMembers(universeId),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.universes.members(universeId, signal)
    },
    enabled: client !== null && isDocumentId(universeId)
  })
}

/**
 * True when the engine predates BN-132's universe writes.
 *
 * The two repos ship independently, so an app can meet a server that has the
 * views but not the verbs. 404 and 405 are the two shapes that means — the
 * path is unknown, or it is known and does not take this method — and neither
 * should reach the user as a raw error.
 */
export function isUnsupported(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405)
}

/**
 * Create a universe (BN-132).
 *
 * No id in the body: the server derives one from the name, so two universes
 * whose names differ only in punctuation cannot become two documents that
 * look the same.
 */
export function useCreateUniverse() {
  const client = useBeacon()
  const queries = useQueryClient()

  return useMutation({
    mutationFn: (body: { name: string; description?: string | null; identifiers: string[] }) => {
      if (client === null) throw new Error('No engine')
      // `frozen` explicitly (BN-143). The engine now also takes a serialised
      // expression with `mode: 'live'`, re-resolved on every read — but this
      // builder resolves the membership here and sends a list, so what it
      // stores is a list. Saying so beats relying on a server default that
      // could reasonably change to `live`.
      return client.universes.create({ ...body, mode: 'frozen' })
    },
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: keys.strategy.universes() })
    }
  })
}

/**
 * Delete a universe (BU-144).
 *
 * Seeded ones refuse server-side, which is where the rule belongs — the
 * button being hidden is a courtesy, not the guarantee.
 */
export function useDeleteUniverse() {
  const client = useBeacon()
  const queries = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => {
      if (client === null) throw new Error('No engine')
      return client.universes.remove(id)
    },
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: keys.strategy.universes() })
    }
  })
}

/** Rename a universe or change its members. Seeded ones refuse server-side. */
export function useSaveUniverse() {
  const client = useBeacon()
  const queries = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      name: string
      description?: string | null
      identifiers?: string[]
    }) => {
      if (client === null) throw new Error('No engine')
      return client.universes.update(id, body)
    },
    onSuccess: (_result, variables) => {
      void queries.invalidateQueries({ queryKey: keys.strategy.universes() })
      void queries.invalidateQueries({
        queryKey: keys.strategy.universeMembers(variables.id)
      })
    }
  })
}

/**
 * Validate the draft, not the saved document.
 *
 * A mutation rather than a query because the thing being validated is the
 * editor's current state, which has no cache key — two drafts of the same
 * index are different inputs with the same id.
 */
export function useValidateIndex() {
  const client = useBeacon()

  return useMutation({
    mutationFn: (document: IndexDocument) => {
      if (client === null) throw new Error('No engine')
      return client.indices.validate(document)
    }
  })
}

/**
 * Resolve the pipeline against real data.
 *
 * Only the SAVED document can be previewed: py-beacon takes an index id, not
 * a body, so what comes back describes what is stored. The view says so
 * rather than letting the counts look like they follow the draft.
 */
/**
 * Preview a SAVED index by id.
 *
 * Right for a pane reading an index that exists — Constituent Preview opens
 * against a stored document and has no draft to resolve.
 */
export function usePreviewIndex() {
  const client = useBeacon()

  return useMutation({
    mutationFn: ({ indexId, asOf }: { indexId: string; asOf?: string }) => {
      if (client === null) throw new Error('No engine')
      return client.indices.preview(indexId, asOf === undefined ? {} : { as_of: asOf })
    }
  })
}

/**
 * Preview a DRAFT document (BN-120).
 *
 * The editor's version. Before `/indices/preview` took a body, it could only
 * describe what was saved, so the validation card had to caption its own
 * figures as belonging to the last save while the draft said something else.
 */
export function usePreviewDocument() {
  const client = useBeacon()

  return useMutation({
    mutationFn: ({ document, asOf }: { document: IndexDocument; asOf?: string }) => {
      if (client === null) throw new Error('No engine')
      return client.indices.previewDocument({
        document,
        ...(asOf === undefined ? {} : { as_of: asOf })
      })
    }
  })
}

export function useSaveIndex() {
  const client = useBeacon()
  const queries = useQueryClient()

  return useMutation({
    mutationFn: ({ document, isNew }: { document: IndexDocument; isNew: boolean }) => {
      if (client === null) throw new Error('No engine')
      return isNew ? client.indices.create(document) : client.indices.save(document.id, document)
    },
    onSuccess: (result) => {
      // Write the saved document into the cache rather than refetching it.
      // The editor's dirty flag compares the draft against this entry, so a
      // refetch round trip would leave the tab showing "unsaved changes" for
      // as long as it took — after the save had already succeeded.
      queries.setQueryData(keys.strategy.index(result.index.id), result.index)
      // The list is a different question: a rename or a create changes it.
      void queries.invalidateQueries({ queryKey: keys.strategy.indices() })
    }
  })
}

export type OverviewView = components['schemas']['OverviewView']
export type CompareView = components['schemas']['CompareView']

/**
 * The completed backtest, read back from the index rather than from the job.
 *
 * `JobStatus.result` is typed `unknown` — py-beacon does not publish its
 * shape — so the pane asks the endpoint that does: `/beacon/{id}/overview`
 * returns the level series and the metrics with a schema behind them. The job
 * is what tells us WHEN to ask.
 */
export function useIndexOverview(indexId: string, enabled: boolean) {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.beacon.overview(indexId),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/beacon/{index_id}/overview', { params: { index_id: indexId }, signal })
    },
    enabled: client !== null && indexId !== '' && enabled
  })
}

/** Two or more stored indices on one rebased scale. */
export function useCompare(indexIds: readonly string[]) {
  const client = useBeacon()
  const ids = [...indexIds].filter((id) => id !== '')

  return useQuery({
    queryKey: ['beacon', 'compare', ids.join(',')],
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/beacon/compare', { query: { ids }, signal })
    },
    enabled: client !== null && ids.length >= 2
  })
}

export interface BacktestOptions {
  indexId: string
  start?: string
  end?: string
  transactionCostBps: number
  benchmarkIndexId?: string
}

/**
 * The result of a finished backtest job (BU-137).
 *
 * Read from the job rather than from `/beacon/{id}/overview`, because they
 * answer different questions: the overview is the INDEX, recalculated, while
 * this is what the simulated portfolio actually did — the NAV, the tracked
 * index beside it, and whether a benchmark was measured at all.
 *
 * Enabled only once the job has finished, and never retried: a result that
 * is not there yet arrives on the event feed, not by asking again.
 */
export function useBacktestRun(jobId: string | undefined, ready: boolean) {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.jobs.one(jobId ?? ''),
    queryFn: async ({ signal }) => {
      if (client === null) throw new Error('No engine')
      if (jobId === undefined) throw new Error('No job')
      const status = await client.jobs.get(jobId, signal)
      return parseRun(status.result)
    },
    enabled: client !== null && jobId !== undefined && ready,
    retry: false
  })
}

/**
 * Submit a backtest and stop.
 *
 * The endpoint answers 202 with a job; progress arrives on the event feed and
 * BU-21's store renders it. Awaiting a result here would mean polling
 * something the socket already pushes.
 */
export function useRunBacktest() {
  const client = useBeacon()

  return useMutation({
    mutationFn: (options: BacktestOptions) => {
      if (client === null) throw new Error('No engine')
      return client.write('post', '/beacon/{index_id}/backtest', {
        params: { index_id: options.indexId },
        body: {
          ...(options.start === undefined ? {} : { start: options.start }),
          ...(options.end === undefined ? {} : { end: options.end }),
          initial_capital: 1_000_000,
          transaction_cost_bps: options.transactionCostBps,
          ...(options.benchmarkIndexId === undefined
            ? {}
            : {
                benchmark: {
                  id: options.benchmarkIndexId,
                  kind: 'index' as const,
                  price_column: 'CLOSE'
                }
              })
        }
      })
    }
  })
}

/**
 * The rule-type catalogue (BN-117).
 *
 * Static for the life of a server — it is derived from the classes py-beacon
 * ships — so it is cached hard rather than refetched per editor.
 */
export function useRuleTypes() {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.strategy.ruleTypes(),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.indices.ruleTypes(signal)
    },
    enabled: client !== null,
    staleTime: Infinity
  })
}
