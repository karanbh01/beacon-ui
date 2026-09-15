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
