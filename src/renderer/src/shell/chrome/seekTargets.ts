/**
 * Seek mode's reach (BU-285): the controls in a window, what each is called,
 * and how well a typed name fits it.
 */

/** Anything a person could press or type into. */
const CONTROLS = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="button"]',
  '[role="tab"]',
  '[role="radio"]',
  '[role="checkbox"]',
  '[role="option"]',
  '[role="menuitem"]',
  '[role="combobox"]'
].join(', ')

export interface SeekTarget {
  element: HTMLElement
  label: string
  /** 0 is the whole name, 1 its start, 2 a word's start, 3 anywhere in it. */
  fit: number
}

/** The window's controls whose name holds `query`, best fit first, then in reading order. */
export function seekTargets(window: ParentNode, query: string): SeekTarget[] {
  const needle = squash(query)
  if (needle === '') return []
  const found: SeekTarget[] = []
  for (const element of window.querySelectorAll<HTMLElement>(CONTROLS)) {
    if (!usable(element)) continue
    const label = labelOf(element)
    const fit = fitOf(squash(label), needle)
    if (fit !== undefined) found.push({ element, label, fit })
  }
  // Stable, so equal fits keep the order they are read in.
  return found.sort((a, b) => a.fit - b.fit)
}

/** What a control is called: its accessible label, else its visible words. */
export function labelOf(element: HTMLElement): string {
  const named = element.getAttribute('aria-label')
  if (named !== null && named.trim() !== '') return named.trim()
  const field = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
  const labelled = field ? element.labels?.[0]?.textContent : undefined
  if (labelled != null && labelled.trim() !== '') return labelled.trim()
  if (field && element.placeholder !== '') return element.placeholder
  return element.textContent.replace(/\s+/g, ' ').trim()
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

/** A field takes the caret; anything else is pressed. */
export function takesTyping(element: HTMLElement): boolean {
  return (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element.getAttribute('role') === 'combobox' ||
    (element instanceof HTMLInputElement &&
      !['button', 'submit', 'reset', 'checkbox', 'radio'].includes(element.type))
  )
}
