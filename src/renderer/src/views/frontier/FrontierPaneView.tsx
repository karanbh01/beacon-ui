import { useMemo, useState, type ReactElement } from 'react'
import { FrontierChart, type FrontierDot, type Marker } from '../../charts/FrontierChart'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Select } from '../../components/Select/Select'
import { Stat, StatStrip } from '../../components/Stat/Stat'
import { useThemeMode } from '../../state/theme'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { percent, signedPercent } from '../shared/indexMetrics'
import { useFrontier } from '../shared/optimiseQueries'
import './FrontierPaneView.css'

const RATES = ['0', '0.02', '0.04', '0.05'].map((rate) => ({
  value: rate,
  label: `${(Number(rate) * 100).toFixed(2)}%`
}))

/**
 * Optimiser → Frontier. Figma 234:7462.
 *
 * The scatter is visx (ADR-0002): no time axis, tens of points, and a capital
 * market line that no financial-charting library draws. Binding points are
 * marked differently from unconstrained ones — where a constraint bound, the
 * shape of the frontier is the constraint's doing rather than the risk
 * model's, and that is the single most useful thing this pane can say.
 */
export function FrontierPaneView({ subject }: ViewProps): ReactElement {
  const runId = subject ?? ''
  const [rate, setRate] = useState('0.04')
  const mode = useThemeMode()
  const frontier = useFrontier(runId, Number(rate))

  const points = useMemo<FrontierDot[]>(
    () =>
      (frontier.data?.points ?? []).map((point) => ({
        volatility: point.volatility,
        expectedReturn: point.expected_return ?? 0,
        binding: point.binding ?? [],
        heuristic: point.heuristic
      })),
    [frontier.data]
  )

  const markers = useMemo<Marker[]>(() => {
    const data = frontier.data
    if (data === undefined) return []
    return [
      {
        label: 'min var',
        volatility: data.minimum_variance.volatility,
        expectedReturn: data.minimum_variance.expected_return ?? 0
      },
      {
        label: 'tangency',
        volatility: data.tangency.volatility,
        expectedReturn: data.tangency.expected_return ?? 0
      }
    ]
  }, [frontier.data])

  const bound = useMemo(() => new Set(points.flatMap((point) => point.binding)), [points])

  return (
    <div className="frontier-view">
      <PaneHeader kind="fields" controls={<Button chevron>Export</Button>}>
        <Field label="Run" width={200} value={runId === '' ? '—' : runId} />
        <Field label="Risk-free" width={110}>
          <Select
            className="frontier-inline-select"
            options={RATES}
            value={rate}
            onChange={setRate}
            label="Risk-free"
          />
        </Field>
      </PaneHeader>

      {runId === '' && <ViewEmpty>Run an optimisation, then open its frontier.</ViewEmpty>}
      {frontier.isPending && runId !== '' && <ViewLoading what={runId} />}
      {frontier.isError && <ViewError error={frontier.error} />}

      {frontier.isSuccess && (
        <>
          <StatStrip>
            <Stat
              label="MAX SHARPE"
              value={frontier.data.tangency.sharpe_ratio?.toFixed(2) ?? '—'}
            />
            <Stat
              label="TANGENCY"
              value={`${signedPercent((frontier.data.tangency.expected_return ?? 0) * 100)} @ ${percent(frontier.data.tangency.volatility * 100)}`}
            />
            <Stat
              label="MIN-VAR VOL"
              value={percent(frontier.data.minimum_variance.volatility * 100)}
            />
            <Stat label="RISK-FREE" value={percent(frontier.data.risk_free_rate * 100, 2)} />
            <Stat label="POINTS" value={String(points.length)} />
            <Stat
              label="MONOTONIC"
              value={frontier.data.monotonic ? 'yes' : 'no'}
              tone={frontier.data.monotonic ? 'default' : 'negative'}
            />
          </StatStrip>

          {points.length > 0 && (
            <FrontierChart
              points={points}
              mode={mode}
              markers={markers}
              riskFreeRate={frontier.data.risk_free_rate}
              tangency={markers[1]}
              width={760}
              height={480}
            />
          )}

          <p className="frontier-footnote type-11">
            {String(points.length)} points ·{' '}
            {bound.size === 0
              ? 'no constraint bound anywhere on the grid'
              : `binding somewhere on the grid: ${[...bound].join(', ')}`}{' '}
            · larger dots are points where a constraint bound · faded dots were reached
            heuristically rather than solved exactly
          </p>
        </>
      )}
    </div>
  )
}
