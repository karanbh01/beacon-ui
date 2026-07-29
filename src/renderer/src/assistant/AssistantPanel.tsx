import type { ReactElement, ReactNode } from 'react'
import { AttachmentIcon } from '../icons/generated'
import './AssistantPanel.css'

export const ASSISTANT_WIDTH = 380

export interface AssistantPanelProps {
  children: ReactNode
  onClose?: () => void
  /** Context chips above the composer, e.g. "TECH10 Backtest". */
  context?: readonly string[]
  onAddContext?: () => void
  model?: string
  mode?: string
  className?: string
}

/**
 * Figma 164:2. 380px rail: accent header, transcript, composer.
 *
 * Static by design — BU-18 is the shell and the block vocabulary only. There
 * is no backend to talk to until py-beacon grows one, and wiring a fake
 * conversation loop now would have to be torn out.
 *
 * The header background is left exactly as the frame has it. Taxonomy §11
 * item 6 records that the owner is experimenting with it manually, so it is
 * deliberately untouched.
 */
export function AssistantPanel({
  children,
  onClose,
  context = [],
  onAddContext,
  model = 'claude-sonnet · high',
  mode = 'agent',
  className
}: AssistantPanelProps): ReactElement {
  return (
    <section
      className={['assistant', className].filter(Boolean).join(' ')}
      aria-label="AI Assistant"
    >
      <header className="assistant-header">
        <h2 className="assistant-title">Assistant</h2>
        <button
          type="button"
          className="assistant-close"
          aria-label="Close assistant"
          onClick={onClose}
        >
          ✕
        </button>
      </header>

      <div className="assistant-conversation">{children}</div>

      <div className="assistant-input">
        <div className="assistant-context">
          {context.map((chip) => (
            <span key={chip} className="assistant-chip">
              <span aria-hidden="true">■</span> {chip}
            </span>
          ))}
          <button
            type="button"
            className="assistant-add-context"
            aria-label="Add context"
            onClick={onAddContext}
          >
            +
          </button>
        </div>

        <div className="assistant-box">
          <span className="assistant-placeholder">Ask Beacon…</span>
          <div className="assistant-box-foot">
            <span className="assistant-settings">
              <button type="button" className="assistant-attach" aria-label="Attach">
                <AttachmentIcon size={12} />
              </button>
              <span className="assistant-meta-chip">{model}</span>
              <span className="assistant-meta-chip">{mode}</span>
            </span>
            <button type="button" className="assistant-send" aria-label="Send" disabled>
              ↑
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
