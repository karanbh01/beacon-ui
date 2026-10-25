import type { KeyCombo, Shortcut } from '../../state/shortcuts'

/**
 * Every action the app gives a shortcut, as Settings → Keyboard shortcuts
 * lists them (Karan). A shortcut is a sequence of key combinations, each a
 * list of keys: Ctrl+K then Alt is [['Ctrl', 'K'], ['Alt']].
 */
export type { KeyCombo, Shortcut }

export interface ShortcutAction {
  id: string
  group: string
  label: string
  keys: Shortcut
  /** Not the app's to change: Chromium's own editing commands. */
  fixed?: boolean
}

const combo = (text: string): KeyCombo => text.split('+')
const keys = (...combos: string[]): Shortcut => combos.map(combo)

export const SHORTCUT_ACTIONS: readonly ShortcutAction[] = [
  { id: 'section-up', group: 'Moving around', label: 'Section above', keys: keys('Ctrl+ArrowUp') },
  {
    id: 'section-down',
    group: 'Moving around',
    label: 'Section below',
    keys: keys('Ctrl+ArrowDown')
  },
  {
    id: 'tab-previous',
    group: 'Moving around',
    label: 'Previous tab',
    keys: keys('Ctrl+ArrowLeft')
  },
  { id: 'tab-next', group: 'Moving around', label: 'Next tab', keys: keys('Ctrl+ArrowRight') },
  {
    id: 'window-left',
    group: 'Moving around',
    label: 'Window to the left',
    keys: keys('Ctrl+Shift+ArrowLeft')
  },
  {
    id: 'window-right',
    group: 'Moving around',
    label: 'Window to the right',
    keys: keys('Ctrl+Shift+ArrowRight')
  },
  {
    id: 'window-up',
    group: 'Moving around',
    label: 'Window above',
    keys: keys('Ctrl+Shift+ArrowUp')
  },
  {
    id: 'window-down',
    group: 'Moving around',
    label: 'Window below',
    keys: keys('Ctrl+Shift+ArrowDown')
  },
  { id: 'tab-new', group: 'Tabs', label: 'New tab', keys: keys('Ctrl+T') },
  { id: 'tab-close', group: 'Tabs', label: 'Close tab', keys: keys('Ctrl+W') },
  { id: 'tab-reopen', group: 'Tabs', label: 'Reopen closed tab', keys: keys('Ctrl+Shift+T') },
  { id: 'tab-move-left', group: 'Tabs', label: 'Move tab left', keys: keys('Alt+ArrowLeft') },
  { id: 'tab-move-right', group: 'Tabs', label: 'Move tab right', keys: keys('Alt+ArrowRight') },
  {
    id: 'tab-carry-left',
    group: 'Tabs',
    label: 'Move tab to the window on the left',
    keys: keys('Alt+Shift+ArrowLeft')
  },
  {
    id: 'tab-carry-right',
    group: 'Tabs',
    label: 'Move tab to the window on the right',
    keys: keys('Alt+Shift+ArrowRight')
  },
  {
    id: 'tab-carry-up',
    group: 'Tabs',
    label: 'Move tab to the window above',
    keys: keys('Alt+Shift+ArrowUp')
  },
  {
    id: 'tab-carry-down',
    group: 'Tabs',
    label: 'Move tab to the window below',
    keys: keys('Alt+Shift+ArrowDown')
  },
  { id: 'find', group: 'Finding', label: 'Find in windows', keys: keys('Ctrl+F') },
  { id: 'search', group: 'Finding', label: 'Go to search', keys: keys('Ctrl+K') },
  { id: 'seek', group: 'Finding', label: 'Seek', keys: keys('Ctrl+K', 'Alt') },
  {
    id: 'seek-held',
    group: 'Finding',
    label: 'Persistent seek',
    keys: keys('Ctrl+K', 'Alt', 'Alt')
  },
  { id: 'presets', group: 'Windows', label: 'Presets', keys: keys('Ctrl+Shift+P') },
  { id: 'window-reset', group: 'Windows', label: 'Reset window', keys: keys('Ctrl+Shift+R') },
  { id: 'undo', group: 'Editing', label: 'Undo', keys: keys('Ctrl+Z'), fixed: true },
  { id: 'redo', group: 'Editing', label: 'Redo', keys: keys('Ctrl+Y'), fixed: true },
  { id: 'cut', group: 'Editing', label: 'Cut', keys: keys('Ctrl+X'), fixed: true },
  { id: 'copy', group: 'Editing', label: 'Copy', keys: keys('Ctrl+C'), fixed: true },
  { id: 'paste', group: 'Editing', label: 'Paste', keys: keys('Ctrl+V'), fixed: true }
]

/** The groups, in the order the list shows them. */
export const SHORTCUT_GROUPS = [...new Set(SHORTCUT_ACTIONS.map((action) => action.group))]

const MODIFIERS = ['Ctrl', 'Alt', 'Shift']

/** A key press as a combination, or undefined while only modifiers are held. */
export function comboOf(event: {
  key: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}): KeyCombo | undefined {
  const held = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift'].filter(
    (key): key is string => key !== false
  )
  if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(event.key)) return undefined
  return [...held, keyName(event.key)]
}

/** The modifiers held so far, to show while a combination is being pressed. */
export function heldOf(event: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): KeyCombo {
  return MODIFIERS.filter(
    (key) =>
      (key === 'Ctrl' && event.ctrlKey) ||
      (key === 'Alt' && event.altKey) ||
      (key === 'Shift' && event.shiftKey)
  )
}

function keyName(key: string): string {
  if (key === ' ') return 'Space'
  return key.length === 1 ? key.toUpperCase() : key
}

/** "Ctrl+K, Alt": a shortcut in words, for titles and messages. */
export function shortcutText(shortcut: Shortcut): string {
  return shortcut.map((step) => step.map(keyLabel).join('+')).join(', ')
}

/** How a key is written on its cap. */
export function keyLabel(key: string): string {
  return ARROWS[key] ?? (key === 'Escape' ? 'Esc' : key)
}

const ARROWS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→'
}

/**
 * The actions other than `self` whose shortcuts start with `combo`. Several
 * can: Ctrl+K starts Go to search and both seeks.
 */
export function clashesOf(
  combo: KeyCombo,
  self: string,
  shortcutOf: (action: ShortcutAction) => Shortcut
): ShortcutAction[] {
  const same = (other: KeyCombo | undefined): boolean =>
    other?.length === combo.length && other.every((key, at) => key === combo[at])
  return SHORTCUT_ACTIONS.filter((action) => action.id !== self && same(shortcutOf(action)[0]))
}

/** "Go to search, Seek and Persistent seek". */
export function namesOf(actions: readonly ShortcutAction[]): string {
  const names = actions.map((action) => action.label)
  if (names.length < 2) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`
}

/** An action's shortcut: the one assigned, else its own. */
export function shortcutOf(assigned: Record<string, Shortcut>, action: ShortcutAction): Shortcut {
  return assigned[action.id] ?? action.keys
}
