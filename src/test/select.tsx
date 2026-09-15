import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Choose from a `Select` in a unit test (BU-196).
 *
 * The control draws its own list now rather than hiding a native
 * `<select>`, so `userEvent.selectOptions` no longer applies — it wants a
 * real `<select>` and there is not one. Opening and clicking is what a user
 * does, and it exercises the popup that replaced it.
 *
 * `name` is the control's accessible name; `value` the option's stored
 * value, so a call reads the same as the `selectOptions` it replaced.
 */
export async function choose(name: string, value: string, scope?: HTMLElement): Promise<void> {
  const root = scope === undefined ? screen : within(scope)
  await userEvent.click(root.getByRole('combobox', { name }))

  const list = root.getByRole('listbox', { name })
  const option = list.querySelector<HTMLElement>(`[data-value="${value}"]`)
  if (option === null) throw new Error(`no option "${value}" in the ${name} list`)
  await userEvent.click(option)
}

/**
 * The options a `Select` offers, by their visible text.
 *
 * Opens the list, reads it and closes it again — the options exist only
 * while it is open, where a native `<select>` carried them all the time.
 */
export async function optionsOf(name: string, scope?: HTMLElement): Promise<string[]> {
  const root = scope === undefined ? screen : within(scope)
  const trigger = root.getByRole('combobox', { name })

  await userEvent.click(trigger)
  const labels = [...root.getByRole('listbox', { name }).querySelectorAll('[role="option"]')].map(
    (option) => option.textContent
  )
  await userEvent.click(trigger)
  return labels
}
