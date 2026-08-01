import { useMemo, type ReactElement } from 'react'
import { activeJobs, useJobs } from '../../api/jobs'
import { CorrelationHeatmap } from '../../charts/CorrelationHeatmap'
import { toRows } from '../../api/frame'
import { Button } from '../../components/Button/Button'
import { Card } from '../../components/Card/Card'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Select } from '../../components/Select/Select'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { percent } from '../shared/indexMetrics'
import { useEstimateRiskModel, useRiskModel, useRiskModels } from '../shared/optimiseQueries'
import './RiskModelPaneView.css'

/** How many names the matrix shows before it stops being readable. */
const MAX_ASSETS = 24

/**
 * Optimiser → Risk Model. Figma 234:7602.
 *
 * The heatmap uses the sanctioned raw-RGB colormap, which is deliberately
 * mode-independent: the colour IS the measurement, so a correlation of 0.8
 * must be the same colour in both themes (taxonomy 9, `charts/heatmap.ts`).
 *
 * The diagnostics line is the pane's real content. py-beacon publishes
 * condition number, PSD-ness and average correlation precisely because a
 * caller about to invert this matrix needs them, and an optimiser run on a
 * badly conditioned covariance amplifies estimation error rather than
 * reflecting it.
 */
export function RiskModelPaneView({ tab, subject }: ViewProps): ReactElement {
  const models = useRiskModels()
  const available = models.data?.risk_models ?? []
  const modelId = subject !== undefined && subject !== '' ? subject : (available[0]?.model_id ?? '')

  const model = useRiskModel(modelId)
  const estimate = useEstimateRiskModel()
  const jobs = useJobs((state) => state.jobs)
  const setSubject = useWorkspace((state) => state.setSubject)

  const running = activeJobs(jobs).find((job) => job.kind.toLowerCase().includes('risk'))

  const { assets, matrix } = useMemo(() => {
    const view = model.data
    if (view === undefined) return { assets: [] as string[], matrix: [] as (number | null)[][] }

    const shown = view.asset_ids.slice(0, MAX_ASSETS)
    const rows = toRows(view.correlation)
    return {
      assets: shown,
      matrix: shown.map((_asset, index) => {
        const row = rows[index]
        return shown.map((column) => {
          const value = row?.[column]
          return typeof value === 'number' && Number.isFinite(value) ? value : null
        })
      })
    }
  }, [model.data])

  const diagnostics = model.data?.diagnostics

  return (
    <div className="risk-model-view">
      <PaneHeader
        kind="fields"
        controls={
          <Button
            variant="accent"
            disabled={modelId === '' || running !== undefined || estimate.isPending}
            onClick={() => {
              estimate.mutate({ modelId })
            }}
          >
            {running === undefined ? 'Re-estimate' : 'Estimating…'}
          </Button>
        }
      >
        <Select
          options={available.map((summary) => ({
            value: summary.model_id,
            label: summary.model_id
          }))}
          value={modelId}
          placeholder="No risk models"
          label="Risk model"
          disabled={available.length === 0}
          onChange={(value) => {
            setSubject(tab.id, value)
          }}
        />
      </PaneHeader>

      {models.isPending && <ViewLoading what="risk models" />}
      {models.isError && <ViewError error={models.error} />}
      {model.isError && <ViewError error={model.error} />}
      {estimate.isError && <ViewError error={estimate.error} />}

      {models.isSuccess && available.length === 0 && (
        <ViewEmpty>This engine has no estimated risk models.</ViewEmpty>
      )}

      {model.isSuccess && diagnostics !== undefined && (
        <>
          <SummaryLine
            items={[
              { label: `${String(diagnostics.assets)} assets`, value: modelId },
              { label: 'shrinkage λ', value: diagnostics.intensity.toFixed(2) },
              { label: 'average correlation', value: diagnostics.average_correlation.toFixed(2) },
              { label: 'condition number', value: diagnostics.condition_number.toFixed(1) },
              {
                label: 'matrix',
                value: diagnostics.positive_semi_definite ? 'PSD' : 'NOT PSD',
                tone: diagnostics.positive_semi_definite ? 'default' : 'negative'
              },
              { label: 'observations', value: String(diagnostics.observations) }
            ]}
          />

          {!diagnostics.positive_semi_definite && (
            <div className="risk-warning">
              <p className="type-13">This covariance matrix is not positive semi-definite.</p>
              <p className="type-11">
                A portfolio variance computed from it can come out negative, and an optimiser that
                inverts it will produce weights that mean nothing. py-beacon computes this from the
                eigenvalues rather than asserting it, so the failure is real.
              </p>
            </div>
          )}

          <Card title="Correlation matrix" className="risk-matrix-card">
            <CorrelationHeatmap assets={assets} matrix={matrix} />
          </Card>

          <p className="risk-footnote type-11">
            {model.data.start?.slice(0, 10) ?? '—'} → {model.data.end?.slice(0, 10) ?? '—'} ·
            average correlation reads as a sanity check: a diversified equity universe sits around
            0.3–0.6{diagnostics.repaired && ' · negative eigenvalues were clipped'}
            {model.data.asset_ids.length > MAX_ASSETS &&
              ` · showing ${String(MAX_ASSETS)} of ${String(model.data.asset_ids.length)} assets`}{' '}
            · volatilities: {shortestVol(model.data.volatilities)}
          </p>
        </>
      )}
    </div>
  )
}

/** The tightest and widest names, which is what a reader scans for. */
function shortestVol(volatilities: Record<string, number>): string {
  const entries = Object.entries(volatilities).sort(([, a], [, b]) => a - b)
  const lowest = entries[0]
  const highest = entries[entries.length - 1]
  if (lowest === undefined || highest === undefined) return '—'
  return `${lowest[0]} ${percent(lowest[1] * 100)} → ${highest[0]} ${percent(highest[1] * 100)}`
}
