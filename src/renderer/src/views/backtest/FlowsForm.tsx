import type { ReactElement } from 'react'
import { AddSlot } from '../../components/AddSlot/AddSlot'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { Select } from '../../components/Select/Select'
import { FormattedInput } from '../../components/FormattedInput/FormattedInput'
import { Table, type Column } from '../../components/Table/Table'
import { ParamField } from '../index-definition/ParamField'
import { fieldValue, type ParameterSpec } from '../index-definition/ruleCatalogue'
import type { SectionProps } from './fields'
import { filled, type DatedAmount, type FlowDraft } from './setup'
import '../index-definition/Methodology.css'

/**
 * The money, as the Capital and flows pop-up edits it: what the fund
 * starts with and what arrives and leaves.
 *
 * With share classes each class has its own capital, and each flow names
 * its class, since amounts are in that class's currency. Flows add
 * together, so a dated subscription and a steady 2% a quarter are two rows
 * rather than one model.
 */
export function FlowsForm({ setup, onChange, options }: SectionProps): ReactElement {
  const models = options?.flows ?? []
  const classNames = setup.classes
    .map((draft) => draft.values.name ?? '')
    .filter((name) => name !== '')

  const update = (key: string, patch: (flow: FlowDraft) => FlowDraft): void => {
    onChange((current) => ({
      ...current,
      flows: current.flows.map((flow) => (flow.key === key ? patch(flow) : flow))
    }))
  }

  return (
    <div className="backtest-flows-form">
      <CapitalTable setup={setup} onChange={onChange} />

      <h4 className="section-title">Flows</h4>

      {setup.flows.map((flow) => (
        <div key={flow.key} className="backtest-flow">
          {/* Always the same first line: what it is, whose it is, and a way out. */}
          <div className="backtest-form-row">
            <Field label="Type" width={200}>
              <Select
                label="Flow type"
                options={models.map((model) => ({ value: model.name, label: model.label }))}
                value={flow.type}
                onChange={(type) => {
                  update(flow.key, (old) => ({ ...old, type, values: {} }))
                }}
              />
            </Field>
            {classNames.length > 0 && (
              <Field label="Share class" width={140}>
                <Select
                  label="Flow share class"
                  options={classNames.map((name) => ({ value: name, label: name }))}
                  value={flow.shareClass === '' ? (classNames[0] ?? '') : flow.shareClass}
                  onChange={(shareClass) => {
                    update(flow.key, (old) => ({ ...old, shareClass }))
                  }}
                />
              </Field>
            )}
            <Button
              onClick={() => {
                onChange((current) => ({
                  ...current,
                  flows: current.flows.filter((entry) => entry.key !== flow.key)
                }))
              }}
            >
              Remove
            </Button>
          </div>

          {flow.type === 'DatedFlows' ? (
            <DatedRows
              rows={flow.dated}
              onChange={(dated) => {
                update(flow.key, (old) => ({ ...old, dated }))
              }}
            />
          ) : (
            <FlowSettings
              flow={flow}
              params={models.find((model) => model.name === flow.type)?.parameters ?? []}
              onChange={(patch) => {
                update(flow.key, patch)
              }}
            />
          )}

          <p className="backtest-note type-11">
            {describeFlow(flow.type, models.find((model) => model.name === flow.type)?.summary)}
          </p>
        </div>
      ))}

      <AddSlot
        label="Add flows"
        onClick={() => {
          onChange((current) => ({
            ...current,
            flows: [
              ...current.flows,
              {
                key: `flow-${String(Date.now())}`,
                type: 'DatedFlows',
                shareClass: '',
                values: {},
                dated: [{ date: '', amount: '' }]
              }
            ]
          }))
        }}
      />
    </div>
  )
}

/** One row of the capital table: the fund, or a share class. */
interface CapitalRow {
  key: string
  name: string
  currency: string
  capital: string
}

/**
 * The starting capital, a row per class (Karan, 2026-10-18): side by side
 * did not scale past a few classes. Without classes, one row for the fund.
 */
function CapitalTable({ setup, onChange }: Omit<SectionProps, 'options'>): ReactElement {
  const rows: CapitalRow[] =
    setup.classes.length === 0
      ? [
          {
            key: 'fund',
            name: 'Fund',
            currency: filled(setup.currency, 'Base'),
            capital: setup.initialCapital
          }
        ]
      : setup.classes.map((draft) => ({
          key: draft.key,
          name: filled(draft.values.name, 'Unnamed class'),
          currency: filled(draft.values.currency, 'Base'),
          capital: draft.capital
        }))

  const setCapital = (key: string, capital: string): void => {
    onChange((current) =>
      key === 'fund'
        ? { ...current, initialCapital: capital }
        : {
            ...current,
            classes: current.classes.map((entry) =>
              entry.key === key ? { ...entry, capital } : entry
            )
          }
    )
  }

  const columns: Column<CapitalRow>[] = [
    {
      key: 'name',
      header: 'Initial capital',
      width: 180,
      emphasis: true,
      render: (row) => row.name
    },
    { key: 'currency', header: 'Currency', width: 100, render: (row) => row.currency },
    {
      key: 'capital',
      header: 'Amount',
      width: 180,
      align: 'right',
      render: (row) => (
        <CellInput
          label={row.key === 'fund' ? 'Initial capital' : `Capital of ${row.name}`}
          type="money"
          value={row.capital}
          onChange={(capital) => {
            setCapital(row.key, capital)
          }}
        />
      )
    }
  ]

  return <Table columns={columns} rows={rows} getRowId={(row) => row.key} />
}

/** A bare input filling a table cell, for a figure edited where it is read. */
function CellInput({
  label,
  value,
  onChange,
  type
}: {
  label: string
  value: string
  onChange: (next: string) => void
  type: 'money' | 'date'
}): ReactElement {
  if (type === 'money') {
    return (
      <FormattedInput
        className="backtest-cell-input backtest-cell-money"
        format="money"
        label={label}
        value={value}
        onChange={onChange}
      />
    )
  }
  return (
    <input
      className={`backtest-cell-input backtest-cell-${type}`}
      type={type}
      aria-label={label}
      value={value}
      onChange={(event) => {
        onChange(event.target.value)
      }}
    />
  )
}

/**
 * A dated flow's amounts as a table, a row a date (Karan, 2026-10-18):
 * a pair of boxed fields per date ate the pop-up after a handful of them.
 * A withdrawal is a negative amount.
 */
function DatedRows({
  rows,
  onChange
}: {
  rows: readonly DatedAmount[]
  onChange: (rows: DatedAmount[]) => void
}): ReactElement {
  const set = (at: number, patch: Partial<DatedAmount>): void => {
    onChange(rows.map((row, index) => (index === at ? { ...row, ...patch } : row)))
  }
  // Keyed by place: a row has no identity beyond it, and its date is editable.
  const indexed = rows.map((row, at) => ({ ...row, at }))

  const columns: Column<(typeof indexed)[number]>[] = [
    {
      key: 'date',
      header: 'Date',
      width: 150,
      render: (row) => (
        <CellInput
          label={`Flow date ${String(row.at + 1)}`}
          type="date"
          value={row.date}
          onChange={(date) => {
            set(row.at, { date })
          }}
        />
      )
    },
    {
      key: 'amount',
      header: 'Amount',
      width: 180,
      align: 'right',
      render: (row) => (
        <CellInput
          label={`Flow amount ${String(row.at + 1)}`}
          type="money"
          value={row.amount}
          onChange={(amount) => {
            set(row.at, { amount })
          }}
        />
      )
    },
    {
      key: 'remove',
      header: '',
      width: 44,
      align: 'right',
      render: (row) => (
        <button
          type="button"
          className="methodology-action"
          aria-label={`Remove flow date ${String(row.at + 1)}`}
          onClick={() => {
            onChange(rows.filter((_, index) => index !== row.at))
          }}
        >
          ×
        </button>
      )
    }
  ]

  return (
    <div className="backtest-dated">
      {rows.length > 0 && (
        <Table
          columns={columns}
          rows={indexed}
          getRowId={(row) => String(row.at)}
          maxBodyHeight={224}
        />
      )}
      <AddSlot
        label="Add a date"
        onClick={() => {
          onChange([...rows, { date: '', amount: '' }])
        }}
      />
    </div>
  )
}

/*
 * What each kind of flow does, in plain words (Karan, 2026-10-18). The
 * engine's own summaries are written for its catalogue, not for this form;
 * one it adds later still shows its own.
 */
const FLOW_HELP: Record<string, string> = {
  DatedFlows: 'Payments on specific dates. Use a minus sign for money taken out.',
  PeriodicFlows:
    'A regular payment, either a fixed amount or a percentage of the fund. Use a minus sign for money taken out.',
  PerformanceChasingFlows:
    'Each period, money moves in or out as a steady percentage of the fund plus an amount that follows the recent return. With a sensitivity of 0.1, a 10% gain brings in 1% of the fund.',
  RandomFlows:
    'Random payments in and out, sized as a percentage of the fund. The same seed gives the same payments each time.'
}

function describeFlow(type: string, summary: string | undefined): string {
  return FLOW_HELP[type] ?? summary ?? ''
}

/*
 * Settings where one of several is meant, not all of them (Karan,
 * 2026-10-18): a periodic flow is a fixed amount OR a share of the fund.
 * The engine lists both as separate optional fields; here the choice comes
 * first and one box takes the value.
 */
const EITHER: Record<
  string,
  { label: string; options: readonly { value: string; label: string }[] }
> = {
  PeriodicFlows: {
    label: 'Size',
    options: [
      { value: 'amount', label: 'Fixed amount' },
      { value: 'fraction', label: 'Share of the fund' }
    ]
  }
}

/*
 * The engine's labels where they leave the reader guessing (Karan,
 * 2026-10-18). A performance-chasing flow uses both of its sizes at once,
 * steady part plus the part that follows returns, and the labels say so.
 */
const FLOW_LABELS: Record<string, string> = {
  'PerformanceChasingFlows.base': 'Steady flow each period',
  'PerformanceChasingFlows.sensitivity': 'Sensitivity to recent return',
  'PerformanceChasingFlows.lookback_days': 'Recent return measured over',
  'RandomFlows.drift': 'Average net flow a year',
  'RandomFlows.volatility': 'Variability a year'
}

/** A random seed the engine accepts: a positive whole number. */
function newSeed(): string {
  return String(Math.floor(Math.random() * 2_147_483_646) + 1)
}

/** A flow model's own settings, under its first line. */
function FlowSettings({
  flow,
  params,
  onChange
}: {
  flow: FlowDraft
  params: readonly ParameterSpec[]
  onChange: (patch: (old: FlowDraft) => FlowDraft) => void
}): ReactElement {
  const either = EITHER[flow.type]
  const grouped = new Set(either?.options.map((option) => option.value) ?? [])
  // Whichever of the pair has a value, else the one chosen, else the first.
  const chosen =
    either?.options.find((option) => (flow.values[option.value] ?? '') !== '')?.value ??
    flow.sizedBy ??
    either?.options[0]?.value ??
    ''

  const set = (name: string, value: string): void => {
    onChange((old) => ({ ...old, values: { ...old.values, [name]: value } }))
  }

  const field = (param: ParameterSpec): ReactElement => (
    <ParamField
      key={param.name}
      param={{ ...param, label: FLOW_LABELS[`${flow.type}.${param.name}`] ?? param.label }}
      value={flow.values[param.name] ?? fieldValue(param, {})}
      onChange={(next) => {
        set(param.name, next)
      }}
    />
  )

  return (
    <div className="backtest-form-row">
      {either !== undefined && (
        <>
          <Field label={either.label} width={180}>
            <Select
              label={either.label}
              options={either.options}
              value={chosen}
              onChange={(next) => {
                // One of the pair at a time: the other is cleared, not sent.
                onChange((old) => ({
                  ...old,
                  sizedBy: next,
                  values: Object.fromEntries(
                    Object.entries(old.values).filter(([name]) => !grouped.has(name))
                  )
                }))
              }}
            />
          </Field>
          {params.filter((param) => param.name === chosen).map(field)}
        </>
      )}
      {params
        .filter((param) => !grouped.has(param.name))
        .map((param) =>
          flow.type === 'RandomFlows' && param.name === 'seed' ? (
            <div key={param.name} className="backtest-seed">
              {field(param)}
              <Button
                onClick={() => {
                  set('seed', newSeed())
                }}
              >
                Generate seed
              </Button>
            </div>
          ) : (
            field(param)
          )
        )}
    </div>
  )
}
