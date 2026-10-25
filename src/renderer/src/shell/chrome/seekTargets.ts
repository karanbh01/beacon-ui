/**
 * Seek mode's reach (BU-285): the controls in a window, what each is called,
 * and how well a typed name fits it.
 */

/** Anything a person could press or type into (Karan: anything clickable in the window). */
const CONTROLS = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  // A release in the Changelog opens to its notes.
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="radio"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="option"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="menuitemcheckbox"]',
  '[role="treeitem"]',
  '[role="combobox"]',
  // A table row that can be chosen says whether it is (Table).
  '[role="row"][aria-selected]'
].join(', ')

export interface SeekTarget {
  element: HTMLElement
  label: string
  /** 0 is the whole name, 1 its start, 2 a word's start, 3 anywhere in it. */
  fit: number
}

/**
 * The controls in `within` whose names hold `query`, best fit first, then in
 * reading order. Several places are read as one, in the order given.
 */
export function seekTargets(
  within: ParentNode | readonly ParentNode[],
  query: string
): SeekTarget[] {
  const needle = squash(query)
  if (needle === '') return []
  const places: readonly ParentNode[] = 'querySelectorAll' in within ? [within] : within
  const found: SeekTarget[] = []
  for (const place of places) {
    for (const element of place.querySelectorAll<HTMLElement>(CONTROLS)) {
      if (!usable(element)) continue
      const best = bestName(namesOf(element), needle)
      if (best !== undefined) found.push({ element, ...best })
    }
  }
  // Stable, so equal fits keep the order they are read in.
  return found.sort((a, b) => a.fit - b.fit)
}

/** What a control is called: its accessible label, else its visible words. */
export function labelOf(element: HTMLElement): string {
  return namesOf(element)[0] ?? ''
}

/**
 * Every name a control goes by. A dropdown is labelled by its field,
 * "Prices", and shows its value, "Unadjusted": either should find it (Karan).
 */
function namesOf(element: HTMLElement): string[] {
  const field = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
  const names = [
    element.getAttribute('aria-label'),
    field ? element.labels?.[0]?.textContent : undefined,
    field ? element.placeholder : undefined,
    element.textContent.replace(/\s+/g, ' ')
  ]
  return [...new Set(names.map((name) => name?.trim() ?? '').filter((name) => name !== ''))]
}

function bestName(
  names: readonly string[],
  needle: string
): { label: string; fit: number } | undefined {
  let best: { label: string; fit: number } | undefined
  for (const label of names) {
    const fit = fitOf(squash(label), needle)
    if (fit !== undefined && (best === undefined || fit < best.fit)) best = { label, fit }
  }
  return best
}

/** How a name fits what was typed, or undefined when it does not hold it. */
export function fitOf(name: string, needle: string): number | undefined {
  if (name === needle) return 0
  if (name.startsWith(needle)) return 1
  if (name.split(' ').some((word) => word.startsWith(needle))) return 2
  return name.includes(needle) ? 3 : undefined
}

function squash(text: string): string {
  return text.toLocaleLowerCase().replace(/\s+/g, ' ').trim()
}

function usable(element: HTMLElement): boolean {
  if (element.matches(':disabled, [aria-disabled="true"]')) return false
  if (element.closest('[hidden], [aria-hidden="true"]') !== null) return false
  return typeof element.checkVisibility !== 'function' || element.checkVisibility()
}

/**
 * A field takes the caret; anything else is pressed. A dropdown drawn as a
 * button is pressed too, which opens it.
 */
export function takesTyping(element: HTMLElement): boolean {
  return (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element.getAttribute('role') === 'combobox' && !(element instanceof HTMLButtonElement)) ||
    (element instanceof HTMLInputElement &&
      !['button', 'submit', 'reset', 'checkbox', 'radio'].includes(element.type))
  )
}
