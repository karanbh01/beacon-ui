import { useMemo, useState, type ReactElement } from 'react'
import type { Analytics } from '../../api/analytics'
import { DistributionChart, type DistributionBin } from '../../charts/DistributionChart'
import { Section } from '../../components/Section/Section'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import type { ThemeMode } from '../../tokens/tokens'
import { percent } from '../shared/indexMetrics'
import { figuresOf, frameOf, numberOf, reasonOf, recordsOf, type Cell } from './analyticsFrames'

type Level = '0.95' | '0.99'

const LEVELS: readonly { value: Level; label: string }[] = [
  { value: '0.95', label: '95%' },
  { value: '0.99', label: '99%' }
]
const HEIGHT = 300

/**
 * The fund's daily returns with value at risk drawn on them (Karan,
 * 2026-11-21; py-beacon BN-430): historical VaR and expected shortfall at
 * the chosen level, over a day, as the histogram is.
 */
export function ReturnDistribution({
  answer,
  mode,
  names
}: {
  answer: Analytics | undefined
  mode: ThemeMode
  names: { index: string; benchmark: string }
}): ReactElement {
  const [level, setLevel] = useState<Level>('0.95')
  const frame = frameOf(answer, 'return_distribution')
  const bins = useMemo(() => recordsOf(frame).flatMap(binOf), [frame])
  const valueAtRisk = numberOf(figuresOf(answer, 'value_at_risk')?.[`historical/${level}/1`])
  const shortfall = numberOf(figuresOf(answer, 'expected_shortfall')?.[`historical/${level}/1`])
  const share = LEVELS.find((each) => each.value === level)?.label ?? ''

  return (
    <Section
      title="Return distribution"
      aside={
        <SegmentedControl segments={LEVELS} value={level} onChange={setLevel} label="Confidence" />
      }
    >
      {frame === undefined ? (
        <p className="overview-note type-11">
          {reasonOf(answer, 'return_distribution') ?? 'Not worked out for this run.'}
        </p>
      ) : (
        <>
          <DistributionChart
            bins={bins}
            mode={mode}
            height={HEIGHT}
            valueAtRisk={valueAtRisk}
            expectedShortfall={shortfall}
            riskLabels={{
              valueAtRisk: `VaR ${share} · ${percent(fromLoss(valueAtRisk), 2)}`,
              expectedShortfall: `Shortfall · ${percent(fromLoss(shortfall), 2)}`
            }}
            names={{
              index: frame.columns.includes('index') ? names.index : undefined,
              benchmark: frame.columns.includes('benchmark') ? names.benchmark : undefined
            }}
            label="Distribution of the fund's daily returns"
          />
          <p className="overview-note type-11">
            Daily returns. On {share} of days the fund lost less than the VaR line; the dashed line
            is its average loss on the other days.
          </p>
        </>
      )}
    </Section>
  )
}

/** A loss as the engine sends it, positive, in percent. */
const fromLoss = (value: number | undefined): number | undefined =>
  value === undefined ? undefined : value * 100

function binOf(row: Record<string, Cell>): DistributionBin[] {
  const low = numberOf(row.low)
  const high = numberOf(row.high)
  const fund = numberOf(row.fund)
  if (low === undefined || high === undefined || fund === undefined) return []
  return [
    {
      low,
      high,
      fund,
      index: numberOf(row.index),
      benchmark: numberOf(row.benchmark),
      normal: numberOf(row.normal) ?? 0
    }
  ]
}
