import type { ReactElement, ReactNode } from 'react'
import { LineChartIcon } from '../icons/generated'
import './blocks.css'

/** Figma 164:12. The user's own turn, in primary text. */
export function UserMessage({ children }: { children: ReactNode }): ReactElement {
  return <p className="ai-user">{children}</p>
}

/** Figma 170:2. Collapsed reasoning summary. */
export function Thinking({ seconds }: { seconds: number }): ReactElement {
  return (
    <p className="ai-thinking">
      <span aria-hidden="true">▸</span>
      <em>Thought for {seconds}s</em>
    </p>
  )
}

export type ToolStatus = 'ok' | 'running' | 'failed'

export interface ToolCallProps {
  name: string
  args?: string
  result?: string
  status?: ToolStatus
}

/** Figma 170:5. One tool invocation, its arguments and its outcome. */
export function ToolCall({ name, args, result, status = 'ok' }: ToolCallProps): ReactElement {
  const mark = status === 'ok' ? '✓' : status === 'running' ? '↻' : '✕'
  return (
    <div className="ai-tool">
      <span className="ai-tool-left">
        <LineChartIcon size={12} className="ai-tool-icon" />
        <span className="ai-tool-name">{name}</span>
        {args !== undefined && <span className="ai-tool-args">{args}</span>}
      </span>
      <span className="ai-tool-right">
        {result !== undefined && <span className="ai-tool-result">{result}</span>}
        <span className={`ai-mark ai-mark-${status}`} aria-hidden="true">
          {mark}
        </span>
      </span>
    </div>
  )
}

/** Figma 164:14. Assistant prose, in secondary text at 1.45 line height. */
export function AssistantMessage({ children }: { children: ReactNode }): ReactElement {
  return <div className="ai-assistant">{children}</div>
}

/** Figma 164:20. Suggested follow-ups, rendered as accent links. */
export function Actions({ actions }: { actions: readonly string[] }): ReactElement {
  return (
    <div className="ai-actions">
      {actions.map((action) => (
        <button key={action} type="button" className="ai-action">
          {action}
        </button>
      ))}
    </div>
  )
}

export interface MiniTableProps {
  columns: readonly { key: string; label: string; width: number; align?: 'right' }[]
  rows: readonly Record<string, string>[]
}

/**
 * Figma 178:14. A compressed table inside a message — its own grammar, not
 * the pane Table: 9.5px head, 0.5px rules, no card shell.
 */
export function MiniTable({ columns, rows }: MiniTableProps): ReactElement {
  return (
    <div className="ai-mini">
      <div className="ai-mini-head">
        {columns.map((column) => (
          <span
            key={column.key}
            className={column.align === 'right' ? 'ai-mini-cell ai-right' : 'ai-mini-cell'}
            style={{ width: column.width }}
          >
            {column.label}
          </span>
        ))}
      </div>
      {rows.map((row, index) => (
        <div className="ai-mini-row" key={`${row[columns[0]?.key ?? ''] ?? ''}-${String(index)}`}>
          {columns.map((column, columnIndex) => (
            <span
              key={column.key}
              className={[
                'ai-mini-cell',
                column.align === 'right' && 'ai-right',
                columnIndex === 0 && 'ai-mini-lead'
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ width: column.width }}
            >
              {row[column.key]}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Figma 178:40. Hands off to a real view — the assistant's exit hatch. */
export function OpenLink({ label }: { label: string }): ReactElement {
  return (
    <button type="button" className="ai-open">
      {label} <span aria-hidden="true">↗</span>
    </button>
  )
}

/** Figma 181:7. */
export function SpawnLine({ count }: { count: number }): ReactElement {
  return (
    <p className="ai-spawn">
      <span className="ai-diamond" aria-hidden="true">
        ◆
      </span>
      Spawned {count} sub-agents
    </p>
  )
}

export interface SubAgentProps {
  name: string
  task: string
  meta: string
  status: 'running' | 'done' | 'failed'
  statusLabel: string
}

/** Figma 181:10. A delegated unit of work with its own status. */
export function SubAgent({ name, task, meta, status, statusLabel }: SubAgentProps): ReactElement {
  return (
    <div className="ai-subagent">
      <div className="ai-subagent-head">
        <span className="ai-subagent-name">
          <span className="ai-diamond" aria-hidden="true">
            ◆
          </span>
          {name}
        </span>
        <span className={`ai-subagent-status ai-status-${status}`}>{statusLabel}</span>
      </div>
      <p className="ai-subagent-task">{task}</p>
      <p className="ai-subagent-meta">{meta}</p>
    </div>
  )
}

/** Figma 181:26. */
export function WaitingLine({ children }: { children: ReactNode }): ReactElement {
  return <p className="ai-waiting">{children}</p>
}
