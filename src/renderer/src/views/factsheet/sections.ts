export interface Section {
  id: string
  label: string
}

/**
 * The factsheet's sections, from Figma 377:1240.
 *
 * A CLIENT-SIDE checklist, and the pane says so. py-beacon renders a built-in
 * template from code — `ReportTemplateCollection.built_in` describes those as
 * "code, not documents" — so it takes a template id and nothing about which
 * sections to include. Ticking a box changes the preview, not the PDF.
 *
 * A stored template can be edited section by section; that is what the
 * Template Editor is for, and why the pane offers a route to it.
 */
export const FACTSHEET_SECTIONS: readonly Section[] = [
  { id: 'cover', label: 'Cover & description' },
  { id: 'key-facts', label: 'Key facts' },
  { id: 'performance', label: 'Performance chart' },
  { id: 'calendar', label: 'Calendar returns' },
  { id: 'holdings', label: 'Top 10 holdings' },
  { id: 'risk', label: 'Risk metrics' },
  { id: 'methodology', label: 'Methodology summary' },
  { id: 'disclaimer', label: 'Disclaimer' }
]

export function toggle(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id]
}

/** Sections in the order the design lists them, not the order they were ticked. */
export function orderedSelection(selected: readonly string[]): Section[] {
  return FACTSHEET_SECTIONS.filter((section) => selected.includes(section.id))
}

/** A filename the OS will accept and a person can recognise. */
export function renderFilename(templateId: string, indexId: string, now: Date): string {
  const stamp = now.toISOString().slice(0, 10)
  const parts = [indexId, templateId, stamp].filter((part) => part !== '')
  return `${parts.join('-')}.pdf`
}
