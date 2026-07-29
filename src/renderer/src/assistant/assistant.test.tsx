import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ASSISTANT_WIDTH, AssistantPanel } from './AssistantPanel'
import { MiniTable, SubAgent, ToolCall } from './blocks'
import { MockTranscript } from './transcript'
import { AppShell } from '../shell/AppShell'

describe('AssistantPanel', () => {
  it('renders the transcript it is given', () => {
    render(
      <AssistantPanel>
        <MockTranscript />
      </AssistantPanel>
    )

    expect(screen.getByText('Why did tracking error increase in Q2?')).toBeInTheDocument()
    expect(screen.getByText(/Waiting on backtest-runner/)).toBeInTheDocument()
  })

  it('closes from the header', async () => {
    const onClose = vi.fn()
    render(<AssistantPanel onClose={onClose}>t</AssistantPanel>)

    await userEvent.click(screen.getByRole('button', { name: 'Close assistant' }))

    expect(onClose).toHaveBeenCalled()
  })

  it('renders context chips plus an add slot', () => {
    render(<AssistantPanel context={['TECH10 Backtest', 'Weights']}>t</AssistantPanel>)

    expect(screen.getByText(/TECH10 Backtest/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add context' })).toBeInTheDocument()
  })

  it('disables send — there is nothing to send to yet', () => {
    render(<AssistantPanel>t</AssistantPanel>)
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('exposes itself as a labelled region', () => {
    render(<AssistantPanel>t</AssistantPanel>)
    expect(screen.getByRole('region', { name: 'AI Assistant' })).toBeInTheDocument()
  })
})

describe('pane reflow (BU-18 acceptance)', () => {
  it('adds the rail only when the assistant is open', () => {
    const { container, rerender } = render(<AppShell>pane</AppShell>)
    expect(container.querySelector('.app-shell-assistant')).toBeNull()

    rerender(<AppShell assistant={<AssistantPanel>t</AssistantPanel>}>pane</AppShell>)
    expect(container.querySelector('.app-shell-assistant')).not.toBeNull()
  })

  it('leaves the pane 1002 wide on a 1440 window', () => {
    // 1440 − 58 sidebar − 380 rail = 1002, as BU-18 specifies.
    expect(1440 - 58 - ASSISTANT_WIDTH).toBe(1002)
  })
})

describe('transcript blocks', () => {
  it('marks a successful tool call distinctly from a running one', () => {
    const { container, rerender } = render(<ToolCall name="get_prices" result="ok" />)
    expect(container.querySelector('.ai-mark-ok')).not.toBeNull()

    rerender(<ToolCall name="get_prices" status="running" />)
    expect(container.querySelector('.ai-mark-running')).not.toBeNull()
  })

  it('omits args and result when a call has neither', () => {
    const { container } = render(<ToolCall name="ping" />)

    expect(container.querySelector('.ai-tool-args')).toBeNull()
    expect(container.querySelector('.ai-tool-result')).toBeNull()
  })

  it('tones sub-agent status by state', () => {
    const { container } = render(
      <SubAgent name="auditor" task="t" meta="m" status="done" statusLabel="✓ clean" />
    )
    expect(container.querySelector('.ai-status-done')).not.toBeNull()
  })

  it('right-aligns numeric mini-table columns', () => {
    const { container } = render(
      <MiniTable
        columns={[
          { key: 'a', label: 'ASSET', width: 78 },
          { key: 'c', label: 'COST', width: 100, align: 'right' }
        ]}
        rows={[{ a: 'AAPL', c: '11.4 bps' }]}
      />
    )

    const head = container.querySelectorAll('.ai-mini-head .ai-mini-cell')
    expect(head[0]).not.toHaveClass('ai-right')
    expect(head[1]).toHaveClass('ai-right')
  })

  it('renders every block kind in the mock transcript', () => {
    const { container } = render(
      <AssistantPanel>
        <MockTranscript />
      </AssistantPanel>
    )

    for (const selector of [
      '.ai-user',
      '.ai-thinking',
      '.ai-tool',
      '.ai-assistant',
      '.ai-actions',
      '.ai-mini',
      '.ai-spawn',
      '.ai-subagent',
      '.ai-waiting'
    ]) {
      expect(container.querySelector(selector), selector).not.toBeNull()
    }
  })
})
