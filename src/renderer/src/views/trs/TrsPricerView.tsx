import { useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import {
  FieldGrid,
  FieldRow,
  FieldRowGroup,
  FieldSection
} from '../../components/FieldRow/FieldRow'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { SummaryLine } from '../../components/SummaryLine/SummaryLine'
import { Table, type Column } from '../../components/Table/Table'
import { Select } from '../../components/Select/Select'
import { ViewError } from '../shared/ViewState'
import { useDebounced, useTrsPrice, type TrsPriceRequest } from '../shared/derivativesQueries'
import { money, rate } from '../futures/futures'
import './TrsPricerView.css'

interface Accrual {
  start: string
  end: string
  days: number
  accrual_fraction: number
  rate: number
  amount: number
}

interface Inputs {
  notional: string
  initialPrice: string
  spot: string
  referenceRate: string
  spreadBps: string
  dividendYield: string
  endDate: string
  resetType: string
}

const INITIAL: Inputs = {
  notional: '10000000',
  initialPrice: '320.00',
  spot: '341.34',
  referenceRate: '4.85',
  spreadBps: '35',
  dividendYield: '1.20',
  endDate: '2027-06-30',
  resetType: 'UNFUNDED'
}

const RESET_TYPES = [
  { value: 'UNFUNDED', label: 'Unfunded (reference + spread)' },
  { value: 'FUNDED', label: 'Funded (spread only)' }
]

const SCHEDULE_COLUMNS: readonly Column<Accrual>[] = [
  {
    key: 'start',
    header: 'Start',
    width: 100,
    emphasis: true,
    render: (row) => row.start.slice(0, 10)
  },
  { key: 'end', header: 'End', width: 100, render: (row) => row.end.slice(0, 10) },
  { key: 'days', header: 'Days', width: 60, align: 'right', render: (row) => String(row.days) },
  {
    key: 'rate',
    header: 'Rate',
    width: 80,
    align: 'right',
    render: (row) => rate(row.rate)
  },
  {
    key: 'amount',
    header: 'Amount',
    width: 120,
    align: 'right',
    render: (row) => money(row.amount)
  }
]

function toRequest(inputs: Inputs): TrsPriceRequest {
  return {
    notional: Number(inputs.notional),
    initial_price: Number(inputs.initialPrice),
    spot: Number(inputs.spot),
    reference_rate: 'SOFR',
    reference_rate_value: Number(inputs.referenceRate) / 100,
    spread_bps: Number(inputs.spreadBps),
    dividend_yield: Number(inputs.dividendYield) / 100,
    end_date: inputs.endDate,
    reset_type: inputs.resetType,
    payment_frequency: 'QUARTERLY',
    currency: 'USD'
  } as TrsPriceRequest
}

function valid(inputs: Inputs): boolean {
  return (
    Number(inputs.notional) > 0 &&
    Number(inputs.initialPrice) > 0 &&
    Number(inputs.spot) > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(inputs.endDate)
  )
}

/**
 * Derivatives → TRS pricer.
 *
 * Same grammar as the futures pricer, and the same live reprice. The one
 * behaviour worth knowing: on a FUNDED swap only the spread accrues, so
 * py-beacon reports a DV01 of exactly zero — that is a fact about the trade,
 * not a missing number, and the pane says so rather than showing a dash.
 */
export function TrsPricerView(): ReactElement {
  const [inputs, setInputs] = useState<Inputs>(INITIAL)
  const settled = useDebounced(inputs)

  const request = useMemo(() => toRequest(settled), [settled])
  const price = useTrsPrice(request, valid(settled))
  const result = price.data

  const set = (key: keyof Inputs) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target
    setInputs((current) => ({ ...current, [key]: value }))
  }

  const schedule = (result?.schedule ?? []) as Accrual[]
  const funded = settled.resetType === 'FUNDED'

  return (
    <div className="trs-view">
      <PaneHeader
        kind="document"
        title="Total return swap"
        meta="Total return leg minus accrued financing, receiver's side"
        controls={
          <Button
            onClick={() => {
              setInputs(INITIAL)
            }}
          >
            Reset
          </Button>
        }
      />

      {price.isError && <ViewError error={price.error} />}

      <div className="trs-main-row">
        <FieldGrid railWidth={122} boxWidth={170} className="trs-form">
          <FieldSection title="Trade" />
          <FieldRowGroup>
            <FieldRow label="Notional">
              <input
                className="pricer-input"
                aria-label="Notional"
                value={inputs.notional}
                onChange={set('notional')}
              />
            </FieldRow>
            <FieldRow label="End date">
              <input
                className="pricer-input"
                type="date"
                aria-label="End date"
                value={inputs.endDate}
                onChange={set('endDate')}
              />
            </FieldRow>
          </FieldRowGroup>
          <FieldRowGroup>
            <FieldRow label="Reset type">
              <Select
                className="pricer-inline-select"
                options={RESET_TYPES}
                value={inputs.resetType}
                onChange={(value) => {
                  setInputs((current) => ({ ...current, resetType: value }))
                }}
                label="Reset type"
              />
            </FieldRow>
          </FieldRowGroup>

          <FieldSection title="Underlying" />
          <FieldRowGroup>
            <FieldRow label="Initial price">
              <input
                className="pricer-input"
                aria-label="Initial price"
                value={inputs.initialPrice}
                onChange={set('initialPrice')}
              />
            </FieldRow>
            <FieldRow label="Spot">
              <input
                className="pricer-input"
                aria-label="Spot"
                value={inputs.spot}
                onChange={set('spot')}
              />
            </FieldRow>
          </FieldRowGroup>
          <FieldRowGroup>
            <FieldRow label="Dividend (%)">
              <input
                className="pricer-input"
                aria-label="Dividend yield"
                value={inputs.dividendYield}
                onChange={set('dividendYield')}
              />
            </FieldRow>
          </FieldRowGroup>

          <FieldSection title="Financing" />
          <FieldRowGroup>
            <FieldRow label="SOFR (%)">
              <input
                className="pricer-input"
                aria-label="Reference rate"
                value={inputs.referenceRate}
                onChange={set('referenceRate')}
              />
            </FieldRow>
            <FieldRow label="Spread (bps)">
              <input
                className="pricer-input"
                aria-label="Spread"
                value={inputs.spreadBps}
                onChange={set('spreadBps')}
              />
            </FieldRow>
          </FieldRowGroup>

          <FieldSection title="Result" />
          <FieldRowGroup>
            <FieldRow label="Present value" readOnly value={money(result?.present_value)} />
            <FieldRow label="Total return leg" readOnly value={money(result?.total_return_leg)} />
          </FieldRowGroup>
          <FieldRowGroup>
            <FieldRow label="Financing leg" readOnly value={money(result?.financing_leg)} />
            <FieldRow
              label="DV01"
              readOnly
              value={result === undefined ? '—' : funded ? '0.00 · funded' : money(result.dv01)}
            />
          </FieldRowGroup>
          <FieldRowGroup>
            <FieldRow
              label="Fair spread"
              readOnly
              value={
                result?.fair_spread_bps == null
                  ? 'nothing accrued'
                  : `${result.fair_spread_bps.toFixed(1)} bps`
              }
            />
          </FieldRowGroup>
        </FieldGrid>

        <div className="trs-schedule">
          <h3 className="trs-schedule-head">Accrual schedule</h3>
          {schedule.length === 0 && <p className="type-11 trs-empty">No periods yet.</p>}
          {schedule.length > 0 && (
            <Table
              columns={SCHEDULE_COLUMNS}
              rows={schedule}
              getRowId={(row) => row.start}
              maxBodyHeight={340}
            />
          )}
        </div>
      </div>

      {result !== undefined && (
        <SummaryLine
          items={[
            { label: 'valuation date', value: result.valuation_date.slice(0, 10) },
            { label: 'accrued', value: `${String(result.accrual_days)} days` },
            { label: 'accrual fraction', value: result.accrual_fraction.toFixed(4) },
            { label: 'repricing', value: price.isFetching ? 'in flight' : 'settled' }
          ]}
        />
      )}

      <p className="trs-footnote type-11">
        Rates are entered as percentages and the spread in basis points · a funded swap accrues only
        the spread, so its DV01 is exactly zero rather than unknown · the current period accrues at
        the rate fixed at its reset; later periods use the curve&rsquo;s forward
      </p>
    </div>
  )
}
