import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Suggestion } from '../../components/TickerField/suggestions'
import type { components } from '@shared/api.generated'
import { parseRun } from '@shared/backtestRun'
import { ApiError } from '../../api/errors'
import { isDocumentId } from '../../api/ids'
import { keys } from '../../api/keys'
import type { ConstraintRow } from './optimiseQueries'
import { useBeacon } from '../../api/queryClient'
import { workKey } from '../../api/work'
import type { Skipped } from './pickers'

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
 * Delete an index definition (BU-151).
 *
 * Since py-beacon 0.9.0 runs belong to strategies, and an index a strategy
 * holds is refused with 409 IN_USE naming them, so nothing but indices goes.
 */
export function useDeleteIndex() {
  const client = useBeacon()
  const queries = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => {
      if (client === null) throw new Error('No engine')
      return client.indices.remove(id)
    },
    onSuccess: () => {
      // The list AND anything read off that index: its overview, its
      // weights, its comparison rows. Invalidating the branch is cheaper to
      // reason about than naming them.
      void queries.invalidateQueries({ queryKey: keys.strategy.all() })
      void queries.invalidateQueries({ queryKey: keys.beacon.all() })
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
/**
 * How far back to ask for rebalances (BN-195).
 *
 * The engine caps `limit` at 512, which it chose to clear any schedule a
 * real index can produce — over forty years of monthly rebalances — rather
 * than to ration anything. So this asks for all of it: a dropdown offering
 * the four most recent dates of twenty-seven is a list a reader cannot tell
 * is short.
 */
export const SCHEDULE_LIMIT = 512

/**
 * When an index rebalances.
 *
 * Computed by the engine from the frequency, the calendar and the day rule.
 * Deriving it here would mean reimplementing `THIRD_FRIDAY` resolution and
 * holiday roll-back against a Python original — right for most dates, and so
 * wrong in a way nobody notices for months.
 */
export function useSchedule(indexId: string) {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.strategy.schedule(indexId, SCHEDULE_LIMIT),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.indices.schedule(indexId, SCHEDULE_LIMIT, signal)
    },
    enabled: client !== null && indexId !== ''
  })
}

export function useValidateIndex() {
  const client = useBeacon()

  return useMutation({
    mutationKey: workKey('validating'),
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
/** How long a ran preview stays cached unseen (BU-227). */
const PREVIEW_KEPT_FOR = 30 * 60_000

export function usePreviewIndex() {
  const client = useBeacon()
  const queries = useQueryClient()

  return useMutation({
    mutationKey: workKey('previewing'),
    mutationFn: ({
      indexId,
      asOf,
      referenceFields = []
    }: {
      indexId: string
      asOf: string
      /** The reference columns its table shows, carried on each asset (BN-325). */
      referenceFields?: readonly string[]
    }) => {
      if (client === null) throw new Error('No engine')
      return client.indices.preview(indexId, { as_of: asOf }, referenceFields)
    },
    // Into the cache under its date, so the tab that ran it can show it again
    // after the reader has been elsewhere (BU-227).
    onSuccess: (result, { indexId, asOf }) => {
      // Kept half an hour whoever's defaults apply: a cache that dropped it
      // at once would leave the tab to fetch it again, a second run.
      queries.setQueryDefaults(['strategy', 'preview'], { gcTime: PREVIEW_KEPT_FOR })
      queries.setQueryData(keys.strategy.preview(indexId, asOf), result)
    }
  })
}

/**
 * A preview this tab already ran, read back from the cache (BU-227).
 *
 * Never fetched on its own account while the cached answer stands: a preview
 * is run, not loaded, and coming back to a tab is not a request to run it
 * again. It does fetch when that answer has gone — dropped after half an
 * hour unseen, or invalidated by a data load — since showing nothing would
 * lose the run, and showing the old answer would show the old data.
 */
export function useRanPreview(
  indexId: string,
  ran: string | undefined,
  referenceFields: readonly string[] = []
) {
  const client = useBeacon()

  return useQuery({
    // Not keyed by the columns: a changed column choice is not a request to
    // run the preview again. The next run carries it.
    queryKey: keys.strategy.preview(indexId, ran ?? ''),
    queryFn: () => {
      if (client === null || ran === undefined) throw new Error('No engine')
      return client.indices.preview(indexId, { as_of: ran }, referenceFields)
    },
    enabled: client !== null && indexId !== '' && ran !== undefined,
    staleTime: Infinity,
    gcTime: PREVIEW_KEPT_FOR,
    retry: false
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
    mutationKey: workKey('previewing'),
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

/**
 * The result of a finished backtest job (BU-137).
 *
 * Read from the job: it carries the run's whole payload, where the strategy's
 * overview carries the level and headline figures drawn from it.
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
      /*
       * The status travels with the run (BU-162).
       *
       * A failure reaches the app on the event feed, and the feed is a
       * socket: a dropped connection or a missed frame left a failed run
       * looking like one that never finished. This endpoint knows, and it is
       * already being called.
       */
      return {
        status: status.status,
        ...(status.error == null ? {} : { error: status.error }),
        run: parseRun(status.result)
      }
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
/**
 * The index catalogue as query-bar suggestions (BU-167).
 *
 * Three views name an index in that bar — Overview, Factsheet, Term Structure
 * — and none of them wants the identifier search behind it: an index is not
 * an instrument. The rows are the catalogue, named where the definition has
 * a name.
 */
export function useIndexCatalogue(): {
  rows: Suggestion[]
  loading: boolean
  /**
   * Indices the server could not read, so the bar's list is short (BN-174),
   * and why — the causes carry opposite remedies (BU-212).
   */
  skipped: Skipped
} {
  const indices = useIndices()

  const rows = useMemo(
    () =>
      (indices.data?.indices ?? []).map((index) => ({
        identifier: index.id,
        ...(index.name === '' ? {} : { name: index.name })
      })),
    [indices.data]
  )

  return {
    rows,
    loading: indices.isPending,
    skipped: {
      skipped: indices.data?.skipped ?? 0,
      skipped_causes: indices.data?.skipped_causes ?? null
    }
  }
}

/**
 * Derive an optimised index from a stored one (BU-174).
 *
 * Provenance is server-truth: the parent is the id in the URL, and the body
 * has no way to assert a parentage the engine did not create. What comes back
 * is a saved document like any other, which is why the catalogue is
 * invalidated rather than patched — it has a new member.
 */
export function useOptimiseIndex() {
  const client = useBeacon()
  const queries = useQueryClient()

  return useMutation({
    mutationKey: workKey('optimising'),
    mutationFn: (options: OptimiseOptions) => {
      if (client === null) throw new Error('No engine')
      return client.write('post', '/indices/{index_id}/optimise', {
        params: { index_id: options.indexId },
        body: {
          id: options.derivedId,
          name: options.derivedName,
          objective: options.objective,
          constraints: [...options.constraints]
        }
      })
    },
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: keys.strategy.indices() })
    }
  })
}

export interface OptimiseOptions {
  /** The parent, whose published weights the solve reallocates. */
  indexId: string
  derivedId: string
  derivedName: string
  objective: string
  constraints: readonly ConstraintRow[]
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

export type CalendarOption = components['schemas']['CalendarOption']

/**
 * Every trading calendar this server accepts (BN-180, BU-190).
 *
 * Read from the calendar package at request time rather than curated, so
 * the valid set and the list a client offers cannot drift apart — the same
 * reason `/indices/rule-types` exists. `calendar` is required on an index
 * and there is no server-side default, so a client that guessed a MIC
 * would produce a 422 the user could not diagnose from inside the app.
 */
export function useCalendars() {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.strategy.calendars(),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/indices/calendars', { signal })
    },
    enabled: client !== null
  })
}

export interface CalendarGroup {
  region: string
  options: CalendarOption[]
}

/**
 * Calendars by region, for a grouped picker.
 *
 * `region` is the timezone database's noun — "Europe", "America" — derived
 * server-side from the calendar's own timezone rather than curated, so a
 * region nobody anticipated arrives as a heading rather than as a gap.
 *
 * The two UTC calendars group under "UTC", which is not a region. That is
 * deliberate on both sides and it sorts last, because a heading that is
 * not a place should not sit between two that are.
 */
export function calendarGroups(calendars: readonly CalendarOption[]): CalendarGroup[] {
  const byRegion = new Map<string, CalendarOption[]>()
  for (const option of calendars) {
    const group = byRegion.get(option.region)
    if (group === undefined) byRegion.set(option.region, [option])
    else group.push(option)
  }

  return [...byRegion]
    .map(([region, options]) => ({
      region,
      options: [...options].sort((a, b) => a.name.localeCompare(b.name))
    }))
    .sort((a, b) => rank(a.region) - rank(b.region) || a.region.localeCompare(b.region))
}

/** Places before non-places; everything else alphabetical. */
function rank(region: string): number {
  return region === 'UTC' ? 1 : 0
}
