import { useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Card } from '../../components/Card/Card'
import { Field } from '../../components/Field/Field'
import { Select } from '../../components/Select/Select'
import type { Suggestion } from '../../components/TickerField/suggestions'
import '../index-definition/IndexOverview.css'

/**
 * "New backtest…", as Index Definition's "New index…" (Karan, 0.2.1): a
 * backtest starts from a saved strategy chosen here rather than typed into a
 * query bar, and opens on its setup.
 */
export function NewBacktest({
  strategies,
  onStart
}: {
  strategies: readonly Suggestion[]
  onStart: (strategyId: string) => void
}): ReactElement {
  const [choosing, setChoosing] = useState(false)
  const [chosen, setChosen] = useState('')

  const close = (): void => {
    setChoosing(false)
    setChosen('')
  }

  if (!choosing) {
    return (
      <Button
        variant="accent"
        onClick={() => {
          setChoosing(true)
        }}
      >
        New backtest…
      </Button>
    )
  }

  return (
    <Card title="New backtest" className="index-overview-new">
      <Field label="Strategy" width={320}>
        <Select
          label="Strategy"
          options={strategies.map((strategy) => ({
            value: strategy.identifier,
            label:
              strategy.name === undefined
                ? strategy.identifier
                : `${strategy.identifier} · ${strategy.name}`
          }))}
          value={chosen}
          placeholder="Choose…"
          disabled={strategies.length === 0}
          onChange={setChosen}
        />
      </Field>
      <p className="index-overview-hint type-11">
        {strategies.length === 0
          ? 'No strategies yet. Write one in Strategy Builder first.'
          : 'The saved strategy to backtest. If it has run before, its last settings come with it.'}
      </p>
      <div className="index-overview-actions">
        <Button
          variant="accent"
          disabled={chosen === ''}
          onClick={() => {
            onStart(chosen)
            close()
          }}
        >
          Set up
        </Button>
        <Button onClick={close}>Cancel</Button>
      </div>
    </Card>
  )
}
