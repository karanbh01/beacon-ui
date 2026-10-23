import type { ReactElement } from 'react'
import { Button } from '../components/Button/Button'
import { Dialog } from '../components/Dialog/Dialog'
import { useModellingDefaults } from '../state/modellingDefaults'
import { AssumptionsForm } from '../views/backtest/AssumptionsForm'
import { useBacktestOptions } from '../views/shared/strategyDocuments'
import './ModellingAssumptionsDialog.css'

/**
 * Analysis → Modelling assumptions (BU-272): the defaults every new backtest
 * starts from. The same grouped form Backtest's own pop-up shows, so a value
 * reads the same in both places; a run can still change it for itself.
 */
export function ModellingAssumptionsDialog({ onClose }: { onClose: () => void }): ReactElement {
  const options = useBacktestOptions()
  const assumptions = useModellingDefaults((state) => state.assumptions)
  const setAssumption = useModellingDefaults((state) => state.setAssumption)
  const reset = useModellingDefaults((state) => state.reset)
  const changed = Object.keys(assumptions).length

  return (
    <Dialog
      title="Modelling assumptions"
      note="Every new backtest starts with these. A backtest can still change them for its own run."
      width={640}
      onClose={onClose}
    >
      {options.isError ? (
        <p className="type-11">These are read from the engine, and it did not answer.</p>
      ) : (
        <AssumptionsForm values={assumptions} onChange={setAssumption} options={options.data} />
      )}
      <div className="assumptions-defaults">
        <Button disabled={changed === 0} onClick={reset}>
          Use the engine’s defaults
        </Button>
      </div>
    </Dialog>
  )
}
