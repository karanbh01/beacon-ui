import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from '../../api/errors'
import { ViewError } from './ViewState'

/**
 * Which remedy an error state points at (BU-199).
 *
 * Every branch here exists because the generic wording sent a reader
 * somewhere that could not help them. The heading is the whole content of
 * that decision: the message beneath is py-beacon's and is not ours to
 * summarise.
 */

function apiError(status: number, code: string, message: string): ApiError {
  return new ApiError(status, { code, message })
}

describe('an engine that refused rather than failed', () => {
  const REFUSAL = apiError(
    500,
    'CALCULATION_ERROR',
    "Error in calculation 'MarketCapWeighted': no JPY/USD rate on or before 2025-06-30, so " +
      "JPCO's market cap cannot be expressed in USD. Load the pair, or drop the name from the " +
      'universe.'
  )

  it('says the engine refused, not that something could not load', () => {
    /*
     * py-beacon #204. It reached the data, understood it, and declined to
     * publish a number it cannot stand behind. "Could not load" reads as a
     * hiccup and invites a retry that will fail identically.
     */
    render(<ViewError error={REFUSAL} />)

    expect(screen.getByText('The engine refused to answer.')).toBeInTheDocument()
    expect(screen.queryByText('Could not load.')).not.toBeInTheDocument()
  })

  it('carries the engine’s reasoning verbatim, since that is the remedy', () => {
    // Which pair, which name, and what to do. Summarising it here would
    // leave a reader with a refusal and no way out of it.
    render(<ViewError error={REFUSAL} />)

    expect(screen.getByText(/no JPY\/USD rate on or before 2025-06-30/)).toBeInTheDocument()
    expect(screen.getByText(/Load the pair/)).toBeInTheDocument()
  })
})

describe('the states a refusal must not be confused with', () => {
  it('an unreachable engine points at the footer, not at the data', () => {
    render(<ViewError error={new NetworkError('down')} />)
    expect(screen.getByText('The Beacon engine is not reachable.')).toBeInTheDocument()
  })

  it('a 404 is a bad identifier, which is the reader’s to fix', () => {
    render(<ViewError error={apiError(404, 'DATA_NOT_FOUND', "index 'NOPE'")} />)
    expect(screen.getByText('Not found.')).toBeInTheDocument()
  })

  it('a 500 that is not a calculation keeps the generic wording', () => {
    // The branch is keyed on the CODE, not on the status: a reporting
    // failure at 500 is a fault, and telling a reader it was refused on
    // purpose would be a worse lie than the generic one.
    render(<ViewError error={apiError(500, 'REPORTING_ERROR', 'template missing')} />)
    expect(screen.queryByText('The engine refused to answer.')).not.toBeInTheDocument()
  })
})

describe('a crash wearing a calculation error', () => {
  /*
   * BN-194 / py-beacon #207. This block replaces a test that pinned the
   * WRONG behaviour on purpose: before the split, `calculator.py`'s bare
   * `except Exception` re-raised a crash as `CalculationError`, so a scheme
   * dividing by zero was headed "The engine refused to answer".
   *
   * The pinned test failing is how this change announced itself, which was
   * the point of writing it that way.
   */
  const CRASH = new ApiError(500, {
    code: 'UNEXPECTED_CALCULATION_FAILURE',
    message:
      "Calculation 'WeightingScheme-EqualWeighted' failed with an unexpected ZeroDivisionError: " +
      'division by zero. This is a fault rather than a refusal: there is nothing in the request ' +
      'to change, and it is worth reporting.',
    detail: {
      calculation_name: 'WeightingScheme-EqualWeighted',
      original_type: 'ZeroDivisionError'
    }
  })

  it('is headed as a fault, so nobody hunts for a remedy that is not there', () => {
    render(<ViewError error={CRASH} />)

    expect(screen.getByText('The engine broke on this calculation.')).toBeInTheDocument()
    expect(screen.queryByText('The engine refused to answer.')).not.toBeInTheDocument()
  })

  it('names the exception class, which is the difference between two reports', () => {
    render(<ViewError error={CRASH} />)
    expect(screen.getByText(/Raised a ZeroDivisionError/)).toBeInTheDocument()
  })

  it('still renders without one, since detail is optional on the envelope', () => {
    const bare = new ApiError(500, {
      code: 'UNEXPECTED_CALCULATION_FAILURE',
      message: "Calculation 'X' failed with an unexpected KeyError: 'k'."
    })
    render(<ViewError error={bare} />)

    expect(screen.getByText('The engine broke on this calculation.')).toBeInTheDocument()
    expect(screen.queryByText(/Raised a/)).not.toBeInTheDocument()
  })

  it('does not lean on the calculation name, which is not a signal', () => {
    /*
     * The `WeightingScheme-` prefix was the only wire-level separator before
     * the split, and branching on it was the tempting shortcut. py-beacon
     * now has a test proving a refusal and a crash can carry the SAME name,
     * so a client keying on it would see nothing. This is that from the
     * other side: the identical name, headed as a refusal, because the code
     * says so.
     */
    const refusalWithCrashLookingName = apiError(
      500,
      'CALCULATION_ERROR',
      "Error in calculation 'WeightingScheme-EqualWeighted': no JPY/USD rate on or before " +
        '2025-06-30. Load the pair, or define the index in JPY.'
    )
    render(<ViewError error={refusalWithCrashLookingName} />)

    expect(screen.getByText('The engine refused to answer.')).toBeInTheDocument()
  })
})

describe('a refusal that names what is wrong (BU-212)', () => {
  /*
   * Since BN-221 one error class refuses a pipeline, a universe, a feature
   * import and a constraint set, with every problem in `detail.findings` and
   * a message that no longer lists them. A renderer showing only the message
   * showed that something was wrong and not what.
   */
  const REFUSED = new ApiError(422, {
    code: 'INVALID_RULE',
    message: 'Invalid rule: constraint set. Reason: it has errors',
    detail: {
      rule_description: 'constraint set',
      reason: 'it has errors',
      findings: [
        { code: 'BOUND', path: 'constraints.0.max', message: 'must exceed min', severity: 'error' },
        { code: 'UNKNOWN', path: 'constraints.2.type', message: 'unknown type', severity: 'error' }
      ]
    }
  })

  it('lists every finding under the message', () => {
    render(<ViewError error={REFUSED} />)
    expect(screen.getByText('constraints.0.max')).toBeInTheDocument()
    expect(screen.getByText(/must exceed min/)).toBeInTheDocument()
    expect(screen.getByText(/unknown type/)).toBeInTheDocument()
  })

  it('heads it as the input being refused, since the remedy is in the input', () => {
    render(<ViewError error={REFUSED} />)
    expect(screen.getByText('The engine rejected this as written.')).toBeInTheDocument()
    expect(screen.queryByText('Could not load.')).not.toBeInTheDocument()
  })

  it('skips an entry that is not a finding rather than drawing undefined', () => {
    const odd = new ApiError(422, {
      code: 'INVALID_RULE',
      message: 'Invalid rule',
      detail: { findings: [42, null, { path: 'a' }, { message: 'real one' }] }
    })
    render(<ViewError error={odd} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText(/real one/)).toBeInTheDocument()
  })
})
