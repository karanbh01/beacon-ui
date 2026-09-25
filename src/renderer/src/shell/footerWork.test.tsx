import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Footer } from './Footer'

/**
 * The background-work slot (BU-201).
 *
 * It replaces a per-pane elapsed counter, which could only ever speak for
 * the pane it sat in: work started in one tab was invisible from every
 * other, and a preview left running while the reader moved on looked like
 * nothing was happening.
 */

function dotOf(label: string): string {
  const row = screen.getByText(label, { exact: false }).closest('.footer-status')
  const dot = row?.querySelector('.footer-dot')
  return dot?.className ?? ''
}

describe('what the footer says about background work', () => {
  it('names the one thing running, so the reader knows which', () => {
    render(<Footer work={{ running: ['previewing'] }} />)
    expect(screen.getByText('previewing…')).toBeInTheDocument()
  })

  it('counts rather than listing once there are several', () => {
    // Two verbs run together read as one phrase; the job tray has the detail.
    render(<Footer work={{ running: ['validating', 'previewing'] }} />)
    expect(screen.getByText('2 background processes running')).toBeInTheDocument()
  })

  it('says nothing is running, rather than going blank', () => {
    /*
     * An empty list is an answer, not an absence. A slot that disappears
     * when nothing is running leaves a reader unable to tell "finished"
     * from "never started" — the distinction this whole item exists for.
     */
    render(<Footer work={{ running: [] }} />)
    expect(screen.getByText('all background processes complete')).toBeInTheDocument()
  })

  it('is absent only when the app never says, which is not the same as idle', () => {
    render(<Footer />)
    expect(screen.queryByText(/background processes/)).not.toBeInTheDocument()
  })
})

describe('the colour of the dot beside it', () => {
  it('is the working tone while something runs', () => {
    // Not accent — accent means "this is the active thing" — and not danger,
    // because nothing is wrong.
    render(<Footer work={{ running: ['backtest'] }} />)
    expect(dotOf('backtest…')).toContain('dot-working')
  })

  it('is success once everything has finished', () => {
    render(<Footer work={{ running: [] }} />)
    expect(dotOf('all background processes complete')).toContain('dot-success')
  })
})

describe('the data slot (BU-215)', () => {
  /*
   * Karan's placement: no new screen for "there is no data". The footer
   * already reports on data, so that is where it goes — red — and the Data
   * menu holds the ways to get some.
   */
  function slotDot(text: string): string {
    const row = screen.getByText(text, { exact: false }).closest('.footer-status')
    return row?.querySelector('.footer-dot')?.className ?? ''
  }

  it('goes red when the engine has nothing loaded, and says where to go', () => {
    render(<Footer dataUpdated="2m ago" data={{ loaded: false, loading: false }} />)
    expect(screen.getByText(/no data loaded/)).toBeInTheDocument()
    expect(screen.getByText(/Data menu/)).toBeInTheDocument()
    expect(slotDot('no data loaded')).toContain('dot-danger')
    // Not a stale "updated" beside it: there is nothing to have been updated.
    expect(screen.queryByText(/data updated/)).not.toBeInTheDocument()
  })

  it('reads as work while a store loads', () => {
    // The previous data is still served until the load finishes, so this is
    // progress rather than absence.
    render(<Footer data={{ loaded: false, loading: true }} />)
    expect(slotDot('loading data')).toContain('dot-working')
    expect(screen.queryByText(/no data loaded/)).not.toBeInTheDocument()
  })

  it('shows freshness once data is served, as it always did', () => {
    render(<Footer dataUpdated="2m ago" data={{ loaded: true, loading: false }} />)
    expect(screen.getByText('data updated · 2m ago')).toBeInTheDocument()
  })

  it('never goes red for an engine too old to say', () => {
    // Before py-beacon 0.1.2 there is no data state at all. Absent is not
    // "nothing loaded", and a red footer would report a version gap as
    // missing data.
    render(<Footer dataUpdated="2m ago" data={{}} />)
    expect(screen.queryByText(/no data loaded/)).not.toBeInTheDocument()
    expect(screen.getByText('data updated · 2m ago')).toBeInTheDocument()
  })
})
