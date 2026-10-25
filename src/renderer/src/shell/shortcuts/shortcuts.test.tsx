import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useShortcuts } from '../../state/shortcuts'
import { clashesOf, comboOf, SHORTCUT_ACTIONS, shortcutOf, shortcutText } from './catalogue'
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog'

/** Settings → Keyboard shortcuts (Karan): what each action is on, and changing it. */
const row = (action: string): HTMLElement => {
  const found = screen
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByText(action, { exact: true }) !== null)
  if (found === undefined) throw new Error(`no row for ${action}`)
  return found
}

const record = async (action: string, keys: string): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: `New shortcut for ${action}` }))
  await userEvent.keyboard(keys)
}

describe('keyboard shortcuts', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    onClose.mockClear()
    useShortcuts.setState({ assigned: {} })
    render(<KeyboardShortcutsDialog onClose={onClose} />)
  })

  it('reads a key press as a combination, and waits while only modifiers are down', () => {
    expect(comboOf({ key: 't', ctrlKey: true, altKey: false, shiftKey: true })).toEqual([
      'Ctrl',
      'Shift',
      'T'
    ])
    expect(comboOf({ key: 'Control', ctrlKey: true, altKey: false, shiftKey: false })).toBe(
      undefined
    )
    const search = (other: (typeof SHORTCUT_ACTIONS)[number]) => shortcutOf({}, other)
    expect(clashesOf(['Ctrl', 'K'], 'tab-close', search).map((action) => action.label)).toEqual([
      'Go to search',
      'Seek',
      'Persistent seek'
    ])
  })

  it('saves a new shortcut once one is pressed, and resets it', async () => {
    const save = screen.getByRole('button', { name: 'Save the shortcut for New tab' })
    expect(save).toBeDisabled()
    // On every row, waiting for a change to undo (Karan).
    expect(screen.getByRole('button', { name: 'Reset the shortcut for New tab' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset the shortcut for Copy' })).toBeDisabled()

    await record('New tab', '{Control>}{Shift>}n{/Shift}{/Control}')
    expect(save).toBeEnabled()
    await userEvent.click(save)
    expect(shortcutText(useShortcuts.getState().assigned['tab-new'] ?? [])).toBe('Ctrl+Shift+N')
    expect(within(row('New tab')).getByRole('img', { name: 'Ctrl+Shift+N' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reset the shortcut for New tab' }))
    expect(useShortcuts.getState().assigned['tab-new']).toBeUndefined()
    expect(within(row('New tab')).getByRole('img', { name: 'Ctrl+T' })).toBeInTheDocument()
  })

  it('warns that a taken shortcut will be dropped, and takes it on Save (Karan)', async () => {
    await record('Close tab', '{Control>}k{/Control}')
    expect(
      screen.getByText('Used by Go to search, Seek and Persistent seek. Saving takes it from them.')
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save the shortcut for Close tab' }))
    expect(within(row('Go to search')).getByText('None')).toBeInTheDocument()
    expect(within(row('Seek')).getByText('None')).toBeInTheDocument()

    // Go to search's Reset takes Ctrl+K back from Close tab.
    await userEvent.click(
      screen.getByRole('button', { name: 'Reset the shortcut for Go to search' })
    )
    expect(within(row('Go to search')).getByRole('img', { name: 'Ctrl+K' })).toBeInTheDocument()
    expect(within(row('Close tab')).getByText('None')).toBeInTheDocument()
  })

  it('will not take a system command’s shortcut', async () => {
    await record('New tab', '{Control>}c{/Control}')
    expect(screen.getByText('Used by Copy, which cannot be changed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save the shortcut for New tab' })).toBeDisabled()
  })

  it('stops listening on Escape without closing the pop-up', async () => {
    await record('New tab', '{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save the shortcut for New tab' })).toBeDisabled()
  })
})
