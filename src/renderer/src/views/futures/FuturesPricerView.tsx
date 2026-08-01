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
import { ViewError } from '../shared/ViewState'
import {
  useDebounced,
  useFuturesPrice,
  type FuturesPriceRequest
} from '../shared/derivativesQueries'
import { carryRows, money, rate } from './futures'
import './FuturesPricerView.css'

interface Inputs {
  spot: string
  riskFreeRate: string
  dividendYield: string
  borrowCost: string
  timeToExpiry: string
  contracts: string
  contractMultiplier: string
  marketPrice: string
}

const INITIAL: Inputs = {
  spot: '341.34',
  riskFreeRate: '4.00',
  dividendYield: '1.20',
  borrowCost: '0.00',
  timeToExpiry: '0.25',
  contracts: '1',
  contractMultiplier: '100',
  marketPrice: ''
}

function toRequest(inputs: Inputs): FuturesPriceRequest {
  const market = Number(inputs.marketPrice)
  return {
    spot: Number(inputs.spot),
    // The form works in percent because that is how a desk quotes; py-beacon
    // takes continuously compounded decimals, so the conversion happens once,
    // here, rather than in five places.
    risk_free_rate: Number(inputs.riskFreeRate) / 100,
    dividend_yield: Number(inputs.dividendYield) / 100,
    borrow_cost: Number(inputs.borrowCost) / 100,
    time_to_expiry: Number(inputs.timeToExpiry),
    contracts: Number(inputs.contracts),
    contract_multiplier: Number(inputs.contractMultiplier),
    // Null rather than the theoretical value: basis and implied repo would
    // otherwise be identically zero, which looks like an answer.
    ...(inputs.marketPrice.trim() === '' || !Number.isFinite(market)
      ? {}
      : { market_price: market })
  }
}

function valid(inputs: Inputs): boolean {
  return (
    Number.isFinite(Number(inputs.spot)) &&
    Number(inputs.spot) > 0 &&
    Number.isFinite(Number(inputs.timeToExpiry)) &&
    Number(inputs.timeToExpiry) > 0
  )
}

/**
 * Derivatives → Futures pricer. Figma 234:9686.
 *
 * The pricer grammar (taxonomy 8): a fixed label rail, fixed boxes, and
 * derived cells that never look like inputs. Every edit reprices — debounced,
 * so typing "212.50" is one request rather than five — and the carry
 * decomposition moves with it, which is BU-31's acceptance.
 */
export function FuturesPricerView(): ReactElement {
  const [inputs, setInputs] = useState<Inputs>(INITIAL)
  const settled = useDebounced(inputs)

  const request = useMemo(() => toRequest(settled), [settled])
  const price = useFuturesPrice(request, valid(settled))

  const set = (key: keyof Inputs) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target
    setInputs((current) => ({ ...current, [key]: value }))
  }

  const result = price.data
  const carry = result === undefined ? [] : carryRows(result.carry)

  return (
    <div className="futures-view">
      <PaneHeader
        kind="document"
        title="Futures"
        meta="Cost-of-carry · S·e^((r−q−b)T)"
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

      <div className="futures-main-row">
        <FieldGrid railWidth={118} boxWidth={175} className="futures-form">
          <FieldSection title="Contract" />
          <FieldRowGroup>
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
            <FieldRow label="Time to expiry">
              <input
                className="pricer-input"
                aria-label="Time to expiry"
                value={inputs.timeToExpiry}
                onChange={set('timeToExpiry')}
              />
            </FieldRow>
            <FieldRow label="Market price">
              <input
                className="pricer-input"
                aria-label="Market price"
                placeholder="not quoted"
                value={inputs.marketPrice}
                onChange={set('marketPrice')}
              />
            </FieldRow>
          </FieldRowGroup>

          <FieldSection title="Carry" />
          <FieldRowGroup>
            <FieldRow label="Financing (%)">
              <input
                className="pricer-input"
                aria-label="Financing"
                value={inputs.riskFreeRate}
                onChange={set('riskFreeRate')}
              />
            </FieldRow>
            <FieldRow label="Dividend (%)">
              <input
                className="pricer-input"
                aria-label="Dividend yield"
                value={inputs.dividendYield}
                onChange={set('dividendYield')}
              />
            </FieldRow>
          </FieldRowGroup>
          <FieldRowGroup>
            <FieldRow label="Borrow (%)">
              <input
                className="pricer-input"
                aria-label="Borrow cost"
                value={inputs.borrowCost}
                onChange={set('borrowCost')}
              />
            </FieldRow>
          </FieldRowGroup>

          <FieldSection title="Position" />
          <FieldRowGroup>
            <FieldRow label="Contracts">
              <input
                className="pricer-input"
                aria-label="Contracts"
                value={inputs.contracts}
                onChange={set('contracts')}
              />
            </FieldRow>
            <FieldRow label="Multiplier">
              <input
                className="pricer-input"
                aria-label="Contract multiplier"
                value={inputs.contractMultiplier}
                onChange={set('contractMultiplier')}
              />
            </FieldRow>
          </FieldRowGroup>

          <FieldSection title="Result" />
          <FieldRowGroup>
            <FieldRow label="Fair value" readOnly value={money(result?.fair_value)} />
            <FieldRow label="Contract value" readOnly value={money(result?.contract_value)} />
          </FieldRowGroup>
          <FieldRowGroup>
            <FieldRow
              label="Basis"
              readOnly
              value={result?.basis == null ? 'no quote' : money(result.basis)}
            />
            <FieldRow
              label="Implied repo"
              readOnly
              value={result?.implied_repo == null ? 'no quote' : rate(result.implied_repo)}
            />
          </FieldRowGroup>
        </FieldGrid>

        <div className="futures-carry">
          <h3 className="futures-carry-head">Carry decomposition</h3>
          {carry.map((row) => (
            <div className="futures-carry-row" key={row.label}>
              <span className="futures-carry-label">{row.label}</span>
              <span className={`futures-carry-value tone-${row.tone}`}>{money(row.value)}</span>
            </div>
          ))}
          {result !== undefined && (
            <p className="futures-carry-note type-11">
              Fair value minus spot, split three ways. The residual is the compounding the
              decomposition cannot attribute — it is not an error term.
            </p>
          )}
        </div>
      </div>

      {result !== undefined && (
        <SummaryLine
          items={[
            { label: 'financing rate used', value: rate(result.financing_rate) },
            { label: 'time to expiry', value: `${result.time_to_expiry.toFixed(4)}y` },
            { label: 'carry total', value: money(result.carry.total) },
            {
              label: 'repricing',
              value: price.isFetching ? 'in flight' : 'settled'
            }
          ]}
        />
      )}

      <p className="futures-footnote type-11">
        Rates are entered as percentages and sent as continuously compounded decimals · basis and
        implied repo stay empty without a quoted price rather than being computed against the
        theoretical value, which would make both identically zero
      </p>
    </div>
  )
}
