import { useState, type KeyboardEvent, type ReactElement } from 'react'
import { comboOf, heldOf, type KeyCombo, type Shortcut } from './catalogue'
import { KeyShortcut } from './Keycap'

export interface ShortcutRecorderProps {
  /** Which action it sets, for its accessible name. */
  action: string
  value: Shortcut | undefined
  onChange: (shortcut: Shortcut) => void
}

/**
 * Where a new shortcut is pressed (Karan). Pressed or clicked, it listens:
 * the keys held show as they go down, and the first full combination is the
 * new shortcut. Escape stops listening and keeps what was there; Tab still
 * moves on, so the keyboard is never caught here.
 *
 * Every key it takes is kept from the rest of the app, so pressing Ctrl+T
 * here records Ctrl+T rather than opening a tab.
 */
export function ShortcutRecorder({ action, value, onChange }: ShortcutRecorderProps): ReactElement {
  const [listening, setListening] = useState(false)
  const [held, setHeld] = useState<KeyCombo>([])

  const stop = (): void => {
    setListening(false)
    setHeld([])
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!listening) return
    const plain = !event.ctrlKey && !event.altKey && !event.shiftKey
    if (event.key === 'Tab' && plain) {
      stop()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape' && plain) {
      stop()
      return
    }
    const combo = comboOf(event)
    if (combo === undefined) {
      setHeld(heldOf(event))
      return
    }
    onChange([combo])
    stop()
  }

  const showing = listening && held.length > 0 ? [held] : listening ? undefined : value

  return (
    <button
      type="button"
      className={listening ? 'shortcut-recorder shortcut-recorder-listening' : 'shortcut-recorder'}
      aria-label={`New shortcut for ${action}`}
      onClick={() => {
        setListening(true)
      }}
      onKeyDown={onKeyDown}
      onKeyUp={(event) => {
        if (listening) setHeld(heldOf(event))
      }}
      onBlur={stop}
    >
      {showing !== undefined ? (
        <KeyShortcut shortcut={showing} />
      ) : (
        <span className="shortcut-recorder-prompt type-11">
          {listening ? 'Press the keys' : 'Click to set'}
        </span>
      )}
    </button>
  )
}
