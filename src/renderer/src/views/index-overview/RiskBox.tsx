import type { ReactElement } from 'react'
import type { StatisticSpec, TableFrame } from '../../api/analytics'
import { percent } from '../shared/indexMetrics'
import { HoverTip } from './HoverTip'

const RATINGS = [1, 2, 3, 4, 5, 6, 7]
/** Top down: Unconstrained at the head of the box, Passive at its foot. */
const BANDS = ['unconstrained', 'active', 'enhanced', 'passive']
// Tight, beside the titles (Karan, 2026-11-20).
const WIDTH = 16
const HEIGHT = 14
const PLOT_WIDTH = WIDTH * RATINGS.length
const PLOT_HEIGHT = HEIGHT * BANDS.length
/** How far each cell's days spread round its centre, in px. */
const SPREAD = 19

interface Placed {
  rating: number
  band: string
  share: number
}

/**
 * Beside the backtest's titles (Karan, 2026-11-20): total risk across, the
 * 1 to 7 rating from fund factsheets, against active risk up, the tracking
 * band from Passive to Unconstrained. The whole run is the style box's
 * circle; behind it the days spent in each cell on rolling one-year figures
 * are blended from the pane to the accent, so it reads where the strategy
 * has lived as well as where it ended up. Both tables are provisional until
 * py-beacon names its own.
 */
export function RiskBox({
  rating,
  distribution,
  spec
}: {
  rating: TableFrame | undefined
  distribution: TableFrame | undefined
  spec: StatisticSpec | undefined
}): ReactElement {
  if (rating === undefined) return <p className="summary-profile-none type-11">Not worked out</p>
  const labelOf = (band: string): string =>
    spec?.columns?.find((column) => column.name === 'band')?.labels?.[band] ?? band
  const fund = fundOf(rating)
  const placed = distribution === undefined ? [] : placedOf(distribution)
  const most = Math.max(...placed.map((cell) => cell.share), 0.0001)
  const centre = (cell: { rating: number; band: string }): { x: number; y: number } => ({
    x: (cell.rating - 0.5) * WIDTH,
    y: (Math.max(BANDS.indexOf(cell.band), 0) + 0.5) * HEIGHT
  })

  return (
    <div className="risk-box">
      <span />
      <div className="risk-box-heads">
        {RATINGS.map((each) => (
          <span key={each}>{each}</span>
        ))}
      </div>
      <div className="risk-box-sides">
        {BANDS.map((band) => (
          <span key={band}>{labelOf(band)}</span>
        ))}
      </div>
      <HoverTip
        className="risk-box-plot"
        tip={<RiskTip fund={fund} placed={placed} labelOf={labelOf} />}
      >
        <svg width={PLOT_WIDTH} height={PLOT_HEIGHT} role="img" aria-label="Risk box">
          <defs>
            <clipPath id="risk-box-clip">
              <rect width={PLOT_WIDTH} height={PLOT_HEIGHT} />
            </clipPath>
            <radialGradient id="risk-box-glow">
              <stop offset="0" className="style-box-glow-core" />
              <stop offset="1" className="style-box-glow-edge" />
            </radialGradient>
          </defs>
          <g clipPath="url(#risk-box-clip)">
            {placed.map((cell) => {
              const at = centre(cell)
              return (
                <circle
                  key={`${String(cell.rating)}-${cell.band}`}
                  cx={at.x}
                  cy={at.y}
                  r={SPREAD}
                  fill="url(#risk-box-glow)"
                  opacity={Math.min(1, (cell.share / most) * 0.95)}
                />
              )
            })}
          </g>
          <rect className="style-box-outline" width={PLOT_WIDTH} height={PLOT_HEIGHT} />
          {fund !== undefined && (
            <circle className="style-box-fund" cx={centre(fund).x} cy={centre(fund).y} r={4.5} />
          )}
        </svg>
      </HoverTip>
      <span />
      <div className="risk-box-axis">
        <span>Lower risk</span>
        <span>Higher</span>
      </div>
    </div>
  )
}

interface Fund {
  rating: number
  band: string
  volatility: number | undefined
  trackingError: number | undefined
}

function fundOf(frame: TableFrame): Fund | undefined {
  const at = (name: string): number => frame.columns.indexOf(name)
  // `book` before py-beacon 0.11.0 (BN-463).
  const portfolio = frame.columns.includes('portfolio') ? at('portfolio') : at('book')
  const row = frame.data.find((cells) => cells[portfolio] === 'fund')
  const rating = row?.[at('rating')]
  const band = row?.[at('band')]
  if (typeof rating !== 'number' || typeof band !== 'string') return undefined
  const number = (value: unknown): number | undefined =>
    typeof value === 'number' ? value : undefined
  return {
    rating,
    band,
    volatility: number(row?.[at('volatility')]),
    trackingError: number(row?.[at('tracking_error')])
  }
}

function placedOf(frame: TableFrame): Placed[] {
  const at = (name: string): number => frame.columns.indexOf(name)
  return frame.data.flatMap((cells) => {
    const rating = cells[at('rating')]
    const band = cells[at('band')]
    const share = cells[at('share')]
    if (typeof rating !== 'number' || typeof band !== 'string' || typeof share !== 'number') {
      return []
    }
    return [{ rating, band, share }]
  })
}

function RiskTip({
  fund,
  placed,
  labelOf
}: {
  fund: Fund | undefined
  placed: readonly Placed[]
  labelOf: (band: string) => string
}): ReactElement {
  const ranked = [...placed].sort((one, other) => other.share - one.share).slice(0, 4)
  return (
    <>
      <div className="header-tip-title">
        {fund === undefined ? 'Risk' : `Risk ${String(fund.rating)} · ${labelOf(fund.band)}`}
      </div>
      <dl className="header-tip-params">
        {fund !== undefined && (
          <>
            <dt>Volatility</dt>
            <dd>{percent(fund.volatility === undefined ? undefined : fund.volatility * 100, 1)}</dd>
            <dt>Tracking error</dt>
            <dd>
              {percent(fund.trackingError === undefined ? undefined : fund.trackingError * 100, 2)}
            </dd>
          </>
        )}
        {ranked.map((cell) => (
          <FragmentRow
            key={`${String(cell.rating)}-${cell.band}`}
            name={`${String(cell.rating)} · ${labelOf(cell.band)}`}
            value={`${percent(cell.share * 100, 0)} of days`}
          />
        ))}
      </dl>
    </>
  )
}

function FragmentRow({ name, value }: { name: string; value: string }): ReactElement {
  return (
    <>
      <dt>{name}</dt>
      <dd>{value}</dd>
    </>
  )
}
