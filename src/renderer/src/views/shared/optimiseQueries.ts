import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { components } from '@shared/api.generated'
import { useBeacon } from '../../api/queryClient'

export type ConstraintSet = components['schemas']['ConstraintSet']
export type ConstraintRow = components['schemas']['ConstraintRow']
export type ConstraintTypes = components['schemas']['ConstraintTypes']
export type FrontierView = components['schemas']['FrontierView']
export type ExposuresView = components['schemas']['ExposuresView']
export type RiskModelView = components['schemas']['RiskModelView']
export type RiskModelSummary = components['schemas']['RiskModelSummary']

/**
 * Optimiser reads and writes.
 *
 * Its own module because the optimiser is the one domain that publishes a
 * TYPE CATALOGUE (`/optimise/constraint-types`), which changes what an editor
 * can be: constraints render real named fields where index rules cannot (#43).
 */

const keys = {
  all: () => ['optimise'] as const,
  sets: () => ['optimise', 'constraint-sets'] as const,
  set: (id: string) => ['optimise', 'constraint-set', id] as const,
  types: () => ['optimise', 'constraint-types'] as const,
  frontier: (runId: string, rf: number) => ['optimise', 'frontier', runId, rf] as const,
  exposures: (runId: string) => ['optimise', 'exposures', runId] as const,
  models: () => ['optimise', 'risk-models'] as const,
  model: (id: string) => ['optimise', 'risk-model', id] as const
}

export { keys as optimiseKeys }

export function useConstraintTypes() {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.types(),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/optimise/constraint-types', { signal })
    },
    enabled: client !== null,
    // A catalogue of classes the running engine supports. It cannot change
    // without the engine restarting, which rebuilds the client anyway.
    staleTime: Infinity
  })
}

export function useConstraintSets() {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.sets(),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/optimise/constraint-sets', { signal })
    },
    enabled: client !== null
  })
}

export function useConstraintSet(setId: string) {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.set(setId),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/optimise/constraint-sets/{set_id}', {
        params: { set_id: setId },
        signal
      })
    },
    enabled: client !== null && setId !== ''
  })
}

export function useSaveConstraintSet() {
  const client = useBeacon()
  const queries = useQueryClient()

  return useMutation({
    mutationFn: (set: ConstraintSet) => {
      if (client === null) throw new Error('No engine')
      return client.write('put', '/optimise/constraint-sets/{set_id}', {
        params: { set_id: set.id },
        body: set
      })
    },
    onSuccess: (result) => {
      // Same reason as the index editor: the dirty flag compares against the
      // cache, so a refetch round trip would show "unsaved" after a success.
      queries.setQueryData(keys.set(result.constraint_set.id), result.constraint_set)
      void queries.invalidateQueries({ queryKey: keys.sets() })
    }
  })
}

export function useValidateConstraintSet() {
  const client = useBeacon()

  return useMutation({
    mutationFn: (set: ConstraintSet) => {
      if (client === null) throw new Error('No engine')
      return client.write('post', '/optimise/constraint-sets/validate', { body: set })
    }
  })
}

export interface RunOptions {
  indexId: string
  constraintSetId: string
  riskFreeRate: number
  asOf?: string
}

/** Submits an optimisation and returns the job to follow on the event feed. */
export function useRunOptimisation() {
  const client = useBeacon()

  return useMutation({
    mutationFn: (options: RunOptions) => {
      if (client === null) throw new Error('No engine')
      return client.write('post', '/optimise/runs', {
        body: {
          index_id: options.indexId,
          constraint_set_id: options.constraintSetId,
          risk_free_rate: options.riskFreeRate,
          ...(options.asOf === undefined || options.asOf === '' ? {} : { as_of: options.asOf })
        }
      })
    }
  })
}

export function useFrontier(runId: string, riskFreeRate: number) {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.frontier(runId, riskFreeRate),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/optimise/runs/{run_id}/frontier', {
        params: { run_id: runId },
        query: { risk_free_rate: riskFreeRate },
        signal
      })
    },
    enabled: client !== null && runId !== ''
  })
}

export function useExposures(runId: string) {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.exposures(runId),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/optimise/runs/{run_id}/exposures', {
        params: { run_id: runId },
        signal
      })
    },
    enabled: client !== null && runId !== ''
  })
}

export function useRiskModels() {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.models(),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/risk-models', { signal })
    },
    enabled: client !== null
  })
}

export function useRiskModel(modelId: string) {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.model(modelId),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.get('/risk-models/{model_id}', { params: { model_id: modelId }, signal })
    },
    enabled: client !== null && modelId !== ''
  })
}

/** Re-estimation is a job, like a sync or a backtest. */
export function useEstimateRiskModel() {
  const client = useBeacon()

  return useMutation({
    mutationFn: ({ modelId, intensity }: { modelId: string; intensity?: number }) => {
      if (client === null) throw new Error('No engine')
      return client.write('post', '/risk-models/{model_id}/estimate', {
        params: { model_id: modelId },
        body: {
          // `repair` clips negative eigenvalues, which silently shifts the
          // variances — py-beacon defaults it off and so does this.
          repair: false,
          target: 'constant_correlation',
          ...(intensity === undefined ? {} : { intensity })
        }
      })
    }
  })
}
