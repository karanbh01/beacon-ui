import { useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Dialog } from '../../components/Dialog/Dialog'
import { Field } from '../../components/Field/Field'
import { Section } from '../../components/Section/Section'
import { Select } from '../../components/Select/Select'
import { AssumptionsForm } from './AssumptionsForm'
import { TextInput, type SectionProps } from './fields'
import type { BacktestSetup } from './setup'

/** py-beacon 0.9.6's reinvestment targets, in words (BN-343). */
const REINVEST_LABELS: Record<string, string> = {
  payer: 'The stock that paid it',
  holdings: 'All holdings, by value'
}

/**
 * Period, costs, the benchmark, the book's currency and dividends — the
 * run's terms. What it takes as given (cash rate, FX policy, staleness…) is
 * in a pop-up behind Modelling assumptions: rarely changed, and a row of eight more
 * fields would bury the five that are.
 */
export function PeriodSection({ setup, onChange, options }: SectionProps): ReactElement {
  const [assumptions, setAssumptions] = useState(false)
  const set = (patch: Partial<BacktestSetup>): void => {
    onChange((current) => ({ ...current, ...patch }))
  }
  const dividends = options?.choices.dividends ?? ['reinvest', 'cash', 'distribute']
  const targets = options?.choices.reinvest_into ?? ['payer', 'holdings']
  const changed = Object.values(setup.assumptions).filter((value) => value !== '').length

  return (
    <Section
      title="Period and costs"
      className="backtest-section"
      aside={
        <Button
          onClick={() => {
            setAssumptions(true)
          }}
        >
          {changed === 0
            ? 'Modelling assumptions…'
            : `Modelling assumptions · ${String(changed)} changed…`}
        </Button>
      }
    >
      <div className="backtest-form-row">
        <Field label="Start" width={140}>
          <TextInput
            label="Start"
            type="date"
            value={setup.start}
            onChange={(start) => {
              set({ start })
            }}
          />
        </Field>
        <Field label="End" width={140}>
          <TextInput
            label="End"
            type="date"
            value={setup.end}
            onChange={(end) => {
              set({ end })
            }}
          />
        </Field>
        <Field label="Transaction cost (bps)" width={160}>
          <TextInput
            label="Transaction cost (bps)"
            type="number"
            value={setup.costBps}
            onChange={(costBps) => {
              set({ costBps })
            }}
          />
        </Field>
        <Field label="Dividends" width={130}>
          <Select
            label="Dividends"
            options={dividends.map((value) => ({ value, label: value }))}
            value={setup.dividends}
            onChange={(next) => {
              set({ dividends: next })
            }}
          />
        </Field>
        {setup.dividends === 'reinvest' && (
          <Field label="Reinvest in" width={200}>
            <Select
              label="Reinvest in"
              options={targets.map((value) => ({ value, label: REINVEST_LABELS[value] ?? value }))}
              value={setup.reinvestInto}
              onChange={(next) => {
                set({ reinvestInto: next })
              }}
            />
          </Field>
        )}
      </div>

      <div className="backtest-form-row">
        <Field label="Benchmark" width={180}>
          <TextInput
            label="Benchmark"
            value={setup.benchmark}
            placeholder="None"
            onChange={(benchmark) => {
              set({ benchmark })
            }}
          />
        </Field>
        <Field label="Benchmark type" width={160}>
          <Select
            label="Benchmark type"
            options={[
              { value: 'index', label: 'An index' },
              { value: 'identifier', label: 'A market price series' }
            ]}
            value={setup.benchmarkKind}
            onChange={(next) => {
              set({ benchmarkKind: next === 'identifier' ? 'identifier' : 'index' })
            }}
          />
        </Field>
        <Field label="Currency" width={130}>
          <TextInput
            label="Currency"
            value={setup.currency}
            placeholder="Same as the index"
            onChange={(currency) => {
              set({ currency })
            }}
          />
        </Field>
      </div>

      {/*
        Blank is not missing: py-beacon starts at the index base date and
        ends at the last observation it has, which beats a date this form
        could invent. Costs are bps per side, as the engine reads them.
      */}
      <p className="backtest-note type-11">
        Trading costs are charged on every buy and sell. Leave the dates blank to use the index’s
        full history. The benchmark is optional. The strategy is always compared with its index.
      </p>

      {assumptions && (
        <Dialog
          title="Modelling assumptions"
          note="These control how the backtest deals with missing data, cash and dividends, and how results are calculated. Most people can leave them as they are."
          width={640}
          onClose={() => {
            setAssumptions(false)
          }}
        >
          <AssumptionsForm setup={setup} onChange={onChange} options={options} />
        </Dialog>
      )}
    </Section>
  )
}
