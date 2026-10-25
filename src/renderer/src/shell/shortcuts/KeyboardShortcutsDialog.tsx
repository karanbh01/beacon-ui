import { useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Dialog } from '../../components/Dialog/Dialog'
import { Section } from '../../components/Section/Section'
import { useShortcuts } from '../../state/shortcuts'
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_GROUPS,
  clashesOf,
  namesOf,
  shortcutOf,
  shortcutText,
  type Shortcut,
  type ShortcutAction
} from './catalogue'
import { KeyShortcut } from './Keycap'
import { ShortcutRecorder } from './ShortcutRecorder'
import './KeyboardShortcutsDialog.css'

/**
 * Settings → Keyboard shortcuts (Karan): each action with a shortcut, its
 * keys drawn as keycaps, a place to press a new one, and a Save for that row
 * once one has been pressed. A new shortcut another action already starts
 * with is named as taken, and cannot be saved.
 */
export function KeyboardShortcutsDialog({ onClose }: { onClose: () => void }): ReactElement {
  return (
    <Dialog
      title="Keyboard shortcuts"
      note="Click beside an action and press its new keys, then save it."
      width={860}
      onClose={onClose}
    >
      <div className="shortcuts" role="table" aria-label="Keyboard shortcuts">
        <div className="shortcuts-row shortcuts-head" role="row">
          <span role="columnheader">Action</span>
          <span role="columnheader">Shortcut</span>
          <span role="columnheader">New shortcut</span>
          <span role="columnheader">
            <span hidden>Save</span>
          </span>
        </div>
        {SHORTCUT_GROUPS.map((group) => (
          <Section key={group} title={group}>
            <div role="rowgroup">
              {SHORTCUT_ACTIONS.filter((action) => action.group === group).map((action) => (
                <ShortcutRow key={action.id} action={action} />
              ))}
            </div>
          </Section>
        ))}
      </div>
    </Dialog>
  )
}

function ShortcutRow({ action }: { action: ShortcutAction }): ReactElement {
  const assigned = useShortcuts((state) => state.assigned)
  const assign = useShortcuts((state) => state.assign)
  const reset = useShortcuts((state) => state.reset)
  const [draft, setDraft] = useState<Shortcut | undefined>(undefined)

  const current = shortcutOf(assigned, action)
  const clashesWith = (shortcut: Shortcut | undefined): ShortcutAction[] => {
    const first = shortcut?.[0]
    if (first === undefined) return []
    return clashesOf(first, action.id, (other) => shortcutOf(assigned, other))
  }
  const clashes = clashesWith(draft)
  // A system command's shortcut cannot be taken; any other can, with warning.
  const blocked = clashes.filter((other) => other.fixed === true)
  const unchanged = draft !== undefined && shortcutText(draft) === shortcutText(current)
  const saveable = draft !== undefined && blocked.length === 0 && !unchanged

  const changed = assigned[action.id] !== undefined
  const resetClashes = changed ? clashesWith(action.keys) : []

  return (
    <div className="shortcuts-row" role="row">
      <span className="shortcuts-action" role="cell">
        {action.label}
      </span>
      <span role="cell">
        {current.length === 0 ? (
          <span className="shortcuts-none type-11">None</span>
        ) : (
          <KeyShortcut shortcut={current} />
        )}
      </span>
      <span className="shortcuts-new" role="cell">
        {action.fixed === true ? (
          <span className="shortcuts-fixed type-11">Set by the system</span>
        ) : (
          <ShortcutRecorder action={action.label} value={draft} onChange={setDraft} />
        )}
      </span>
      <span className="shortcuts-actions" role="cell">
        {/* Both on every row, so the column reads evenly (Karan); each is
            pressable only when it has something to do. */}
        <Button
          variant="accent"
          disabled={!saveable}
          aria-label={`Save the shortcut for ${action.label}`}
          onClick={() => {
            if (draft === undefined) return
            assign(
              action.id,
              draft,
              clashes.map((other) => other.id)
            )
            setDraft(undefined)
          }}
        >
          Save
        </Button>
        <Button
          disabled={!changed}
          aria-label={`Reset the shortcut for ${action.label}`}
          title={
            resetClashes.length === 0
              ? `Back to ${shortcutText(action.keys)}`
              : `Back to ${shortcutText(action.keys)}, taking it from ${namesOf(resetClashes)}`
          }
          onClick={() => {
            reset(
              action.id,
              resetClashes.map((other) => other.id)
            )
            setDraft(undefined)
          }}
        >
          Reset
        </Button>
      </span>
      {/* A line of its own under the row, so the box and its buttons stay level (Karan). */}
      {clashes.length > 0 && (
        <span
          className={
            blocked.length > 0
              ? 'shortcuts-clash shortcuts-clash-blocked type-11'
              : 'shortcuts-clash type-11'
          }
        >
          {blocked.length > 0
            ? `Used by ${namesOf(blocked)}, which cannot be changed.`
            : `Used by ${namesOf(clashes)}. Saving takes it from them.`}
        </span>
      )}
    </div>
  )
}
