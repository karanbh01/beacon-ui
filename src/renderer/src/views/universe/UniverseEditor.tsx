import { useState, type ReactElement } from 'react'
import { AddValue } from '../../components/AddValue/AddValue'
import { Button } from '../../components/Button/Button'
import { Card } from '../../components/Card/Card'
import { Field } from '../../components/Field/Field'
import { addMember, draftProblem, parseMembers, removeMember, type DraftUniverse } from './members'
import './UniverseEditor.css'

export interface UniverseEditorProps {
  draft: DraftUniverse
  onChange: (next: DraftUniverse) => void
  onSave: () => void
  onCancel: () => void
  /** Disabled while the request is in flight. */
  saving?: boolean
  /** Whatever the engine said, rendered inline rather than as a raw error. */
  problem?: string | undefined
  /** "Create" vs "Save" — the same form serves both. */
  mode: 'create' | 'edit'
}

/**
 * Create or edit a universe (BU-78).
 *
 * One form for both, because they differ only in the verb on the button and
 * whether the name starts empty. Members arrive two ways and both end in
 * `members.ts`: one at a time through the same `AddValue` slot the watchlist
 * uses, or pasted in bulk — which is how anyone with a screener output or a
 * spreadsheet column actually builds one.
 *
 * The running count is the point of the header. A universe is a membership
 * list and its size is the single number that says whether you have built
 * what you meant to.
 */
export function UniverseEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  saving = false,
  problem,
  mode
}: UniverseEditorProps): ReactElement {
  const [paste, setPaste] = useState('')
  const blocked = draftProblem(draft)

  const applyPaste = (): void => {
    const parsed = parseMembers(paste)
    if (parsed.length === 0) return
    onChange({ ...draft, members: parsed.reduce(addMember, draft.members) })
    setPaste('')
  }

  return (
    <Card
      title={mode === 'create' ? 'New universe' : 'Edit universe'}
      className="universe-editor"
      aside={
        <span className="universe-editor-count type-11">
          {draft.members.length.toLocaleString('en-US')} member
          {draft.members.length === 1 ? '' : 's'}
        </span>
      }
    >
      <div className="universe-editor-fields">
        <Field label="Name" width={220}>
          <input
            className="universe-editor-input"
            value={draft.name}
            maxLength={64}
            aria-label="Universe name"
            onChange={(event) => {
              onChange({ ...draft, name: event.target.value })
            }}
          />
        </Field>
        <Field label="Description" width={380}>
          <input
            className="universe-editor-input"
            value={draft.description}
            aria-label="Universe description"
            onChange={(event) => {
              onChange({ ...draft, description: event.target.value })
            }}
          />
        </Field>
      </div>

      <div className="universe-editor-members">
        {draft.members.map((member) => (
          <span key={member} className="universe-chip">
            <span className="universe-chip-label">{member}</span>
            <button
              type="button"
              className="universe-chip-remove"
              aria-label={`Remove ${member}`}
              onClick={() => {
                onChange({ ...draft, members: removeMember(draft.members, member) })
              }}
            >
              &times;
            </button>
          </span>
        ))}
        <AddValue
          label="Add symbol…"
          onAdd={(value) => {
            onChange({ ...draft, members: addMember(draft.members, value) })
          }}
        />
      </div>

      <div className="universe-editor-paste">
        <textarea
          className="universe-editor-textarea"
          value={paste}
          rows={2}
          aria-label="Paste identifiers"
          placeholder="Paste a list — commas, spaces or one per line"
          onChange={(event) => {
            setPaste(event.target.value)
          }}
        />
        <Button onClick={applyPaste} disabled={paste.trim() === ''}>
          Add pasted
        </Button>
      </div>

      {/* The engine's own words when it refused, ours when it would. */}
      {(problem ?? blocked) !== undefined && (
        <p className="universe-editor-problem type-11">{problem ?? blocked}</p>
      )}

      <div className="universe-editor-actions">
        <Button variant="accent" onClick={onSave} disabled={saving || blocked !== undefined}>
          {mode === 'create' ? 'Create universe' : 'Save changes'}
        </Button>
        <Button onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </Card>
  )
}
