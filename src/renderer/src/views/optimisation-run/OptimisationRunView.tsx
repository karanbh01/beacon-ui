import { useState, type ReactElement } from 'react'
import { activeJobs, useJobs } from '../../api/jobs'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Select } from '../../components/Select/Select'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table, type Column } from '../../components/Table/Table'
import { WeightBar } from '../../components/WeightBar/WeightBar'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError } from '../shared/ViewState'
import { useIndices } from '../shared/strategyQueries'
import { percent, signedPercent, weightRows, type WeightRow } from '../shared/indexMetrics'
import { useConstraintSets, useFrontier, useRunOptimisation } from '../shared/optimiseQueries'
import './OptimisationRunView.css'

const RATES = ['0', '0.02', '0.04', '0.05'].map((rate) => ({
  value: rate,
  label: `${(Number(rate) * 100).toFixed(2)}%`
}))

const COLUMNS: readonly Column<WeightRow>[] = [
  { key: 'rank', header: '#', width: 36, align: 'right', render: (row) => String(row.rank) },
  { key: 'ticker', header: 'Asset', width: 90, emphasis: true, render: (row) => row.ticker },
  {
    key: 'weight',
    header: 'Optimal w',
    width: 100,
    align: 'right',
    render: (row) => `${(row.weight * 100).toFixed(2)}%`
  },
  {
    key: 'bar',
    header: '',
    width: 200,
    render: (row) => <WeightBar share={row.share} label={row.ticker} />
  }
]

/**
 * Optimiser → Optimisation Run. Figma 234:7184.
 *
 * Submit is a job, like a backtest: `POST /optimise/runs` answers 202 and the
 * event feed reports progress. The solved weights are read back from the
 * run's frontier, whose tangency point IS the max-Sharpe portfolio.
 */
export function OptimisationRunView({ tab, subject }: ViewProps): ReactElement {
  const [indexId, setIndexId] = useState(subject ?? tab.pinnedDoc ?? '')
  const [constraintSetId, setConstraintSetId] = useState('')
  const [rate, setRate] = useState('0.04')
  const [runId, setRunId] = useState('')

  const indices = useIndices()
  const sets = useConstraintSets()
  const run = useRunOptimisation()
  const jobs = useJobs((state) => state.jobs)
  const frontier = useFrontier(runId, Number(rate))
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)

  const running = activeJobs(jobs).find((job) => job.kind.toLowerCase().includes('optimis'))
  const tangency = frontier.data?.tangency
  const rows = weightRows(tangency?.weights ?? {})

  const available = sets.data?.constraint_sets ?? []
  const chosenSet = constraintSetId !== '' ? constraintSetId : (available[0]?.id ?? '')

  return (
    <div className="optimisation-run-view">
      <PaneHeader
        kind="fields"
        controls={
          <>
            <Button
              disabled={runId === ''}
              onClick={() => {
                openOrRetarget({
                  page: tab.page,
                  viewKind: 'frontier',
                  title: 'Frontier',
                  subject: runId
                })
              }}
            >
              Open frontier
            </Button>
            <Button
              variant="accent"
              disabled={indexId === '' || chosenSet === '' || running !== undefined}
              onClick={() => {
                run.mutate(
                  { indexId, constraintSetId: chosenSet, riskFreeRate: Number(rate) },
                  {
                    onSuccess: (job) => {
                      // py-beacon's job id doubles as the run id: the frontier
                      // and exposures endpoints are keyed by it.
                      setRunId(job.job_id)
                    }
                  }
                )
              }}
            >
              {running === undefined ? 'Run' : 'Solving…'}
            </Button>
          </>
        }
      >
        <Field label="Index" width={160}>
          <Select
            className="run-inline-select"
            options={(indices.data?.indices ?? []).map((index) => ({
              value: index.id,
              label: index.id
            }))}
            value={indexId}
            onChange={setIndexId}
            label="Index"
            placeholder="No indices"
          />
        </Field>
        <Field label="Constraint set" width={180}>
          <Select
            className="run-inline-select"
            options={available.map((set) => ({ value: set.id, label: set.name }))}
            value={chosenSet}
            onChange={setConstraintSetId}
            label="Constraint set"
            placeholder="No constraint sets"
          />
        </Field>
        <Field label="Risk-free" width={110}>
          <Select
            className="run-inline-select"
            options={RATES}
            value={rate}
            onChange={setRate}
            label="Risk-free"
          />
        </Field>
      </PaneHeader>

      {run.isError && <ViewError error={run.error} />}
      {frontier.isError && <ViewError error={frontier.error} />}

      {running !== undefined && (
        <div className="run-progress">
          <div
            className="run-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(running.progress * 100)}
            aria-label="Optimisation progress"
          >
            <div className="run-fill" style={{ width: `${String(running.progress * 100)}%` }} />
          </div>
          <p className="type-11">{running.message === '' ? 'Solving…' : running.message}</p>
        </div>
      )}

      {runId === '' && running === undefined && (
        <ViewEmpty>No optimisation run yet in this session.</ViewEmpty>
      )}

      {frontier.isSuccess && tangency !== undefined && (
        <>
          <SummaryLine
            items={[
              { label: 'Sharpe', value: tangency.sharpe_ratio?.toFixed(2) ?? '—' },
              {
                label: 'expected return',
                value: signedPercent((tangency.expected_return ?? 0) * 100)
              },
              { label: 'ex-ante vol', value: percent(tangency.volatility * 100) },
              {
                label: 'binding constraints',
                value: String(tangency.binding?.length ?? 0)
              },
              {
                label: 'solve',
                value: tangency.heuristic ? 'heuristic' : 'exact'
              }
            ]}
          />

          {!frontier.data.monotonic && (
            <div className="run-warning">
              <p className="type-13">This frontier is not monotonic.</p>
              <p className="type-11">
                Risk should rise with return across the grid; py-beacon reports it does not, which
                means at least one point did not reach optimality. Treat the weights below as a
                candidate, not a solution.
              </p>
            </div>
          )}

          {rows.length > 0 && (
            <Table
              columns={COLUMNS}
              rows={rows}
              getRowId={(row) => row.ticker}
              maxBodyHeight={480}
            />
          )}

          <p className="run-footnote type-11">
            run {runId} · risk-free {(Number(rate) * 100).toFixed(2)}% · weights are the tangency
            portfolio · expected returns are annualised historical means, which py-beacon documents
            as a poor forecast and the only one derivable from what it holds
          </p>
        </>
      )}
    </div>
  )
}
