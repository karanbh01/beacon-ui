import { useShortcuts, type Shortcut } from '../../state/shortcuts'
import { SHORTCUT_ACTIONS, comboOf, shortcutOf, shortcutText, type KeyCombo } from './catalogue'

/**
 * Key presses to actions, by the shortcuts as Settings has them (BU-291):
 * each action's own, or the one assigned in its place. Every handler asks
 * here rather than naming keys, so a shortcut changed in Settings is the
 * one that works everywhere at once.
 */
export function actionOfKey(
  event: { key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
  assigned: Record<string, Shortcut> = useShortcuts.getState().assigned
): string | undefined {
  const pressed = comboOf(event)
  if (pressed === undefined) return undefined
  // Only one-step shortcuts are pressed in one go; a sequence such as seek's
  // is Go to search's key, then Alt in the search bar.
  return SHORTCUT_ACTIONS.find((action) => {
    if (action.fixed === true) return false
    const shortcut = shortcutOf(assigned, action)
    return shortcut.length === 1 && sameCombo(shortcut[0], pressed)
  })?.id
}

/**
 * Whether a field would use this combination itself: the arrows and the
 * like move the caret, and anything without Ctrl types or edits. Such a
 * shortcut is left to the field while it is being typed in.
 */
export function typingWouldUse(event: {
  key: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}): boolean {
  if (!event.ctrlKey) return true
  return CARET_KEYS.has(event.key)
}

const CARET_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Backspace',
  'Delete'
])

/** Whether a key press is a field's to use: typed into one, with keys it would use. */
export function leftToField(event: {
  target: EventTarget | null
  key: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}): boolean {
  const target = event.target
  if (!(target instanceof HTMLElement)) return false
  const field =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  return field && typingWouldUse(event)
}

/** An action's shortcut in words for a menu, or undefined when it has none. */
export function hintOf(id: string, assigned: Record<string, Shortcut>): string | undefined {
  const action = SHORTCUT_ACTIONS.find((candidate) => candidate.id === id)
  if (action === undefined) return undefined
  const shortcut = shortcutOf(assigned, action)
  return shortcut.length === 0 ? undefined : shortcutText(shortcut)
}

function sameCombo(a: KeyCombo | undefined, b: KeyCombo): boolean {
  return a?.length === b.length && a.every((key, at) => key === b[at])
}
