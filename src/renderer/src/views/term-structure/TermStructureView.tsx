import { useMemo, useState, type ReactElement } from 'react'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { Group } from '@visx/group'
import { scaleLinear } from '@visx/scale'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table, type Column } from '../../components/Table/Table'
import { seriesColor } from '../../charts/theme'
import { COLORS } from '../../tokens/tokens'
import { useThemeMode } from '../../state/theme'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useRoll, useTermStructure } from '../shared/derivativesQueries'
import { money, rate } from '../futures/futures'
import { defaultExpiries, describeShape, parseExpiries, type CurvePoint } from './termStructure'
import './TermStructureView.css'

const MARGIN = { top: 16, right: 24, bottom: 40, left: 60 }

const COLUMNS: readonly Column<CurvePoint>[] = [
  {
    key: 'expiry',
    header: 'Expiry',
    width: 110,
    emphasis: true,
    render: (row) => row.expiry.slice(0, 10)
  },
  {
    key: 'tenor',
    header: 'Tenor',
    width: 80,
    align: 'right',
    render: (row) => `${row.timeToExpiry.toFixed(2)}y`
  },
  {
    key: 'theoretical',
    header: 'Theoretical',
    width: 110,
    align: 'right',
    render: (row) => money(row.theoretical)
  },
  {
    key: 'financing',
    header: 'Financing',
    width: 90,
    align: 'right',
    render: (row) => rate(row.financingRate)
  },
  {
    key: 'basis',
    header: 'vs spot',
    width: 100,
    align: 'right',
    render: (row) => (
      <span className={row.overSpot >= 0 ? 'tone-positive' : 'tone-negative'}>
        {row.overSpot >= 0 ? '+' : '−'}
        {money(Math.abs(row.overSpot))}
      </span>
    )
  }
]

/**
 * Derivatives → Term Structure and Roll. Figma 234:9686.
 *
 * The curve is a plain SVG line over visx scales — no time axis in the
 * lightweight-charts sense, since the x axis is tenor rather than calendar
 * time, and a handful of points rather than thousands.
 */
export function TermStructureView({ tab, subject }: ViewProps): ReactElement {
  const indexId = subject ?? tab.pinnedDoc ?? ''
  const mode = useThemeMode()

  const [expiryText, setExpiryText] = useState(() => defaultExpiries(new Date()).join(', '))
  const [rateText, setRateText] = useState('4.00')
  const [yieldText, setYieldText] = useState('1.20')

  const options = useMemo(
    () => ({
      expiries: parseExpiries(expiryText),
      riskFreeRate: Number(rateText) / 100,
      dividendYield: Number(yieldText) / 100
    }),
    [expiryText, rateText, yieldText]
  )

  const curve = useTermStructure(indexId, options)
  const roll = useRoll(indexId, options)

  const points = useMemo<CurvePoint[]>(() => {
    const data = curve.data
    if (data === undefined) return []
    return data.entries.map((entry) => ({
      expiry: entry.expiry,
      timeToExpiry: entry.time_to_expiry,
      theoretical: entry.theoretical,
      financingRate: entry.financing_rate,
      overSpot: entry.theoretical - data.spot
    }))
  }, [curve.data])

  const width = 640
  const height = 320
  const innerWidth = width - MARGIN.left - MARGIN.right
  const innerHeight = height - MARGIN.top - MARGIN.bottom
  const token = COLORS[mode]

  const { x, y } = useMemo(() => {
    const tenors = points.map((point) => point.timeToExpiry)
    const prices = points.map((point) => point.theoretical)
    if (curve.data !== undefined) prices.push(curve.data.spot)

    return {
      x: scaleLinear<number>({
        domain: [0, Math.max(...tenors, 1)],
        range: [0, innerWidth],
        nice: true
      }),
      y: scaleLinear<number>({
        domain: [Math.min(...prices, 0), Math.max(...prices, 1)],
        range: [innerHeight, 0],
        nice: true
      })
    }
  }, [points, curve.data, innerWidth, innerHeight])

  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${String(x(point.timeToExpiry))},${String(y(point.theoretical))}`
    )
    .join(' ')

  return (
    <div className="term-structure-view">
      <PaneHeader kind="fields" controls={<Button chevron>Export</Button>}>
        <Field label="Index" width={160} value={indexId === '' ? '—' : indexId} />
        <Field label="Spot" width={110} value={money(curve.data?.spot)} />
        <Field label="Expiries" width={280}>
          <input
            className="curve-input"
            aria-label="Expiries"
            value={expiryText}
            onChange={(event) => {
              setExpiryText(event.target.value)
            }}
          />
        </Field>
        <Field label="Financing (%)" width={100}>
          <input
            className="curve-input"
            aria-label="Financing"
            value={rateText}
            onChange={(event) => {
              setRateText(event.target.value)
            }}
          />
        </Field>
        <Field label="Dividend (%)" width={100}>
          <input
            className="curve-input"
            aria-label="Dividend yield"
            value={yieldText}
            onChange={(event) => {
              setYieldText(event.target.value)
            }}
          />
        </Field>
      </PaneHeader>

      {indexId === '' && <ViewEmpty>Pin this pane to an index.</ViewEmpty>}
      {indexId !== '' && options.expiries.length === 0 && (
        <ViewEmpty>
          Name at least one contract expiry — py-beacon prices contracts, so there is no curve
          without them.
        </ViewEmpty>
      )}
      {curve.isPending && indexId !== '' && <ViewLoading what={indexId} />}
      {curve.isError && <ViewError error={curve.error} />}

      {roll.isSuccess && (
        <SummaryLine
          items={[
            {
              label: 'front',
              value: `${roll.data.front_expiry.slice(0, 10)} ${money(roll.data.front_price)}`
            },
            {
              label: 'back',
              value: `${roll.data.back_expiry.slice(0, 10)} ${money(roll.data.back_price)}`
            },
            { label: 'roll cost', value: money(roll.data.roll_cost) },
            {
              label: 'annualised roll',
              value: rate(roll.data.annualised_roll),
              // Positive in backwardation, negative in contango — py-beacon's
              // own convention, carried through rather than re-signed.
              tone: roll.data.annualised_roll >= 0 ? 'positive' : 'negative'
            },
            { label: 'shape', value: describeShape(roll.data.annualised_roll) }
          ]}
        />
      )}

      {curve.isSuccess && points.length === 0 && (
        <ViewEmpty>This index publishes no futures curve.</ViewEmpty>
      )}

      {points.length > 0 && (
        <>
          <svg
            className="curve-chart"
            width={width}
            height={height}
            role="img"
            aria-label="Futures term structure"
          >
            <Group left={MARGIN.left} top={MARGIN.top}>
              <AxisLeft
                scale={y}
                numTicks={5}
                stroke={token.divider}
                tickStroke={token.divider}
                tickLabelProps={() => ({
                  fill: token['text-muted'],
                  fontSize: 10,
                  textAnchor: 'end',
                  dx: -4,
                  dy: 3
                })}
              />
              <AxisBottom
                top={innerHeight}
                scale={x}
                numTicks={5}
                stroke={token.divider}
                tickStroke={token.divider}
                tickFormat={(value) => `${Number(value).toFixed(2)}y`}
                tickLabelProps={() => ({
                  fill: token['text-muted'],
                  fontSize: 10,
                  textAnchor: 'middle',
                  dy: 2
                })}
              />

              {/* Spot as a reference line: the curve's shape is relative to it. */}
              {curve.data !== undefined && (
                <line
                  x1={0}
                  x2={innerWidth}
                  y1={y(curve.data.spot)}
                  y2={y(curve.data.spot)}
                  stroke={token['text-muted']}
                  strokeDasharray="3 3"
                />
              )}

              <path d={path} fill="none" stroke={seriesColor(mode, 0)} strokeWidth={1.5} />
              {points.map((point) => (
                <circle
                  key={point.expiry}
                  cx={x(point.timeToExpiry)}
                  cy={y(point.theoretical)}
                  r={2.5}
                  fill={seriesColor(mode, 0)}
                />
              ))}
            </Group>
          </svg>

          <Table
            columns={COLUMNS}
            rows={points}
            getRowId={(row) => row.expiry}
            maxBodyHeight={320}
          />

          <p className="curve-footnote type-11">
            as of {curve.data?.as_of.slice(0, 10) ?? '—'} · the dashed line is spot · a curve above
            it is contango, below it backwardation · annualised roll is positive in backwardation,
            which is py-beacon&rsquo;s convention and is carried through unchanged · expiries
            default to quarter-ends because the engine publishes no contract calendar · roll is
            measured between the first two
          </p>
        </>
      )}
    </div>
  )
}
