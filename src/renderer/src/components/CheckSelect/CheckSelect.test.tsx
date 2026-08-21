import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { CheckSelect } from './CheckSelect'

const OPTIONS = ['Energy', 'Financials', 'Health Care']

/** Controlled, as every caller uses it. */
function Harness({ initial = [] }: { initial?: string[] }): React.ReactElement {
  const [value, setValue] = useState<string[]>(initial)
  return <CheckSelect label="Sector" options={OPTIONS} value={value} onChange={setValue} />
}

describe('CheckSelect', () => {
  it('adds to the selection rather than replacing it', async () => {
    // The whole reason this exists instead of `<select multiple>`: there, a
    // plain click silently discards what was already chosen, and nothing on
    // screen says ctrl-click is the way to keep it.
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Sector' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Energy' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Health Care' }))

    expect(screen.getByRole('checkbox', { name: 'Energy' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Health Care' })).toBeChecked()
  })

  it('unticks what was ticked', async () => {
    render(<Harness initial={['Energy']} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sector' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Energy' }))

    expect(screen.getByRole('checkbox', { name: 'Energy' })).not.toBeChecked()
  })

  it('names one choice and counts several, since 33 sub industries will not fit', async () => {
    render(<Harness />)
    const box = screen.getByRole('button', { name: 'Sector' })
    await userEvent.click(box)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Energy' }))
    expect(box).toHaveTextContent('Energy')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Financials' }))
    expect(box).toHaveTextContent('2 selected')
  })

  it('says so when nothing is chosen, rather than showing an empty box', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Sector' })).toHaveTextContent('Choose…')
  })

  it('closes on Escape', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Sector' }))
    expect(screen.getByRole('checkbox', { name: 'Energy' })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('checkbox', { name: 'Energy' })).toBeNull()
  })

  it('closes on a click outside, which is where the next click usually lands', async () => {
    render(
      <div>
        <Harness />
        <button type="button">elsewhere</button>
      </div>
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sector' }))
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }))

    expect(screen.queryByRole('checkbox', { name: 'Energy' })).toBeNull()
  })

  it('stays open while the user is still ticking', async () => {
    // A panel that closed on every tick would make choosing three values
    // three round trips through the control.
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Sector' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Energy' }))

    expect(screen.getByRole('checkbox', { name: 'Financials' })).toBeInTheDocument()
  })
})
