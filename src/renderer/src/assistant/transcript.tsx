import type { ReactElement } from 'react'
import {
  Actions,
  AssistantMessage,
  MiniTable,
  OpenLink,
  SpawnLine,
  SubAgent,
  Thinking,
  ToolCall,
  UserMessage,
  WaitingLine
} from './blocks'

const COST_COLUMNS = [
  { key: 'asset', label: 'ASSET', width: 78 },
  { key: 'date', label: 'DATE', width: 84 },
  { key: 'side', label: 'SIDE', width: 56 },
  { key: 'cost', label: 'COST', width: 100, align: 'right' as const }
]

const COST_ROWS = [
  { asset: 'AAPL', date: '02 May', side: 'Sell', cost: '11.4 bps' },
  { asset: 'MSFT', date: '17 Jun', side: 'Buy', cost: '8.9 bps' },
  { asset: 'NVDA', date: '17 Jun', side: 'Buy', cost: '7.6 bps' },
  { asset: 'AMZN', date: '21 Jun', side: 'Sell', cost: '6.1 bps' }
]

/**
 * The static transcript from Figma 164:2, verbatim.
 *
 * It exercises every block the panel defines — message, thinking, tool call,
 * actions, mini table, spawn line, sub-agent, waiting — which is the point:
 * BU-18 delivers the vocabulary, and this proves each piece renders.
 */
export function MockTranscript(): ReactElement {
  return (
    <>
      <UserMessage>Why did tracking error increase in Q2?</UserMessage>
      <Thinking seconds={8} />
      <ToolCall name="get_tracking_error" args="period=Q2" result="28.4 bps" />
      <ToolCall name="get_transactions" args="range=Q2" result="47 trades" />

      <AssistantMessage>
        <p>Q2 tracking error rose from 12bps to 28bps annualised. Three drivers stand out:</p>
        <p>
          1. The 15 Apr rebalance executed 5 days late, leaving the portfolio drifted against the
          target weights.
        </p>
        <p>
          2. AAPL&apos;s special dividend on 2 May was applied to the index divisor but not matched
          in the portfolio.
        </p>
        <p>
          3. Turnover costs doubled — 42bps vs 18bps in Q1 — concentrated in the June
          reconstitution.
        </p>
        <p>Want me to re-run the backtest with corrected rebalance dates?</p>
      </AssistantMessage>
      <Actions actions={['Re-run backtest', 'Show trades']} />

      <UserMessage>Which trades drove the June costs?</UserMessage>
      <ToolCall name="get_transactions" args="sort=cost, top=4" result="4 rows" />

      <AssistantMessage>
        <p>The June reconstitution accounts for 31 of 42bps. The four largest:</p>
        <MiniTable columns={COST_COLUMNS} rows={COST_ROWS} />
        <OpenLink label="Open in Data Explorer" />
      </AssistantMessage>

      <UserMessage>Yes, re-run it — and check whether GLOBAL-EQ has the same issue.</UserMessage>
      <Thinking seconds={4} />
      <SpawnLine count={2} />
      <SubAgent
        name="backtest-runner"
        task="Re-run TECH10 backtest with corrected rebalance dates"
        meta="3 tool calls · running 41s"
        status="running"
        statusLabel="↻ running"
      />
      <SubAgent
        name="auditor"
        task="Audit GLOBAL-EQ Q2 for divisor ⁄ portfolio mismatches"
        meta="5 tool calls · 14s"
        status="done"
        statusLabel="✓ clean"
      />
      <WaitingLine>Waiting on backtest-runner…</WaitingLine>
    </>
  )
}
