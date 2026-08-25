import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WithQueries } from '../../../test/queries'
import { StaleStoreNotice } from './StaleStoreNotice'

const REASON = 'generated with py-beacon 0.6.0, and 0.7.0 is running now'

function mount(reason?: string): void {
  render(
    <WithQueries>
      <StaleStoreNotice {...(reason === undefined ? {} : { reason })} />
    </WithQueries>
  )
}

describe('StaleStoreNotice', () => {
  it('says nothing when the engine has no opinion', () => {
    // The store has no marker, or is the user's own: not ours to judge, and
    // silence is the whole guarantee.
    mount(undefined)
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('explains why, in the engine’s own words', () => {
    mount(REASON)
    // Asserted alongside the role the two negative tests look for, so their
    // `queryByRole` means "gone" rather than "never rendered".
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(REASON))).toBeInTheDocument()
  })

  it('offers rather than rebuilds', async () => {
    const regenerate = vi.fn().mockResolvedValue({ started: true })
    vi.stubGlobal('window', globalThis.window)
    Object.assign(globalThis.window, { beacon: { engine: { regenerate } } })

    mount(REASON)
    expect(regenerate).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Replace data…' }))
    expect(regenerate).toHaveBeenCalledTimes(1)
  })

  it('stays dismissed once dismissed', async () => {
    mount(REASON)
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('complementary')).toBeNull()
  })
})
