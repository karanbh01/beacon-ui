import { useMemo, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Stat, StatStrip } from '../../components/Stat/Stat'
import { Table, type Column } from '../../components/Table/Table'
import { DivergingBar } from '../../components/DivergingBar/DivergingBar'
import { useThemeMode } from '../../state/theme'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { percent, tone } from '../shared/indexMetrics'
import { useExposures } from '../shared/optimiseQueries'
import { exposureRows, largestTilt, type ExposureRow } from './exposures'
import './ExposuresPaneView.css'

/**
 * Optimiser → Factor Exposures. Figma 234:7742.
 *
 * The active column is the point of the pane, so it carries the diverging
 * bars: a portfolio's factor exposure only means something against the
 * benchmark's, and the two absolute columns are context for the difference.
 */
export function ExposuresPaneView({ subject }: ViewProps): ReactElement {
  const runId = subject ?? ''
  const mode = useThemeMode()
  const exposures = useExposures(runId)

  const rows = useMemo(
    () => (exposures.data === undefined ? [] : exposureRows(exposures.data)),
    [exposures.data]
  )
  const widest = Math.max(...rows.map((row) => Math.abs(row.active)), 0.0001)
  const tilt = largestTilt(rows)
  const risk = exposures.data?.risk

  const columns = useMemo<Column<ExposureRow>[]>(
    () => [
      { key: 'factor', header: 'Factor', width: 160, emphasis: true, render: (row) => row.factor },
      {
        key: 'portfolio',
        header: 'Portfolio',
        width: 90,
        align: 'right',
        render: (row) => row.portfolio.toFixed(2)
      },
      {
        key: 'benchmark',
        header: 'Benchmark',
        width: 100,
        align: 'right',
        render: (row) => row.benchmark.toFixed(2)
      },
      {
        key: 'active',
        header: 'Active',
        width: 90,
        align: 'right',
        render: (row) => (
          <span className={`tone-${tone(row.active)}`}>
            {row.active >= 0 ? '+' : '−'}
            {Math.abs(row.active).toFixed(2)}
          </span>
        )
      },
      {
        key: 'bar',
        header: 'active tilt',
        width: 200,
        render: (row) => <DivergingBar value={row.active} extent={widest} mode={mode} />
      }
    ],
    [widest, mode]
  )

  return (
    <div className="exposures-view">
      <PaneHeader kind="fields" controls={<Button chevron>Export</Button>}>
        <Field label="Run" width={200} value={runId === '' ? '—' : runId} />
      </PaneHeader>

      {runId === '' && <ViewEmpty>Run an optimisation, then open its exposures.</ViewEmpty>}
      {exposures.isPending && runId !== '' && <ViewLoading what={runId} />}
      {exposures.isError && <ViewError error={exposures.error} />}

      {exposures.isSuccess && risk !== undefined && (
        <>
          <StatStrip>
            <Stat label="ACTIVE RISK (TE)" value={percent(risk.tracking_error * 100)} />
            <Stat label="FACTOR SHARE" value={percent(risk.factor_share * 100, 0)} />
            <Stat label="SPECIFIC SHARE" value={percent((1 - risk.factor_share) * 100, 0)} />
            <Stat
              label="LARGEST TILT"
              value={
                tilt === undefined
                  ? '—'
                  : `${tilt.factor} ${tilt.active >= 0 ? '+' : '−'}${Math.abs(tilt.active).toFixed(2)}`
              }
            />
            <Stat label="MODEL R²" value={exposures.data.r_squared.toFixed(2)} />
            <Stat label="FACTORS" value={String(exposures.data.factors.length)} />
          </StatStrip>

          {!risk.reconciles && (
            <div className="exposures-warning">
              <p className="type-13">This risk decomposition does not reconcile.</p>
              <p className="type-11">
                Factor variance plus specific variance leaves a residual of{' '}
                {risk.residual.toExponential(2)} against a total of{' '}
                {risk.total_variance.toExponential(2)}. The shares above are shown, but they do not
                account for the whole.
              </p>
            </div>
          )}

          <Table columns={columns} rows={rows} getRowId={(row) => row.factor} maxBodyHeight={440} />

          <p className="exposures-footnote type-11">
            R² reads against a floor of roughly k/n, not against zero — fitting{' '}
            {String(exposures.data.factors.length)} factors to this cross-section explains about
            that much by construction · a negative contribution is a factor position that hedges
            another, which genuinely reduces risk
          </p>
        </>
      )}
    </div>
  )
}
