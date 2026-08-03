/**
 * Tab geometry, read structurally out of Figma rather than off a screenshot.
 *
 * Source: Tab component set `118:6`, variants `118:2` (active) and `118:4`
 * (inactive) — autolayout padding, gap and height, plus the chip's own
 * padding and stroke. Tab.css declares the same numbers as custom properties
 * and `tab.geometry.test.ts` fails if the two disagree.
 *
 * Note what is NOT here: a close button. The Figma tab is padding, label,
 * optional chip, optional dirty dot, padding — nothing else. Ours is drawn
 * over the trailing padding so the row still measures what the mock does.
 */
export const TAB_GEOMETRY = {
  height: 34,
  paddingX: 14,
  gap: 6,
  /** Reserved on every tab, so activating one does not shift the row. */
  underline: 2,
  dirtySize: 5,
  labelFontSize: 12
} as const

/**
 * Rendered widths of the archetype row, Figma frame `229:4264`.
 *
 * These are the regression checkpoints: a tab that hugs its content the way
 * the component does lands on these numbers, and the ±2px tolerance is for
 * text rasterisation, not for slack in the layout. Verified against the real
 * app rather than jsdom — jsdom does no layout, so a width assertion there
 * would pass against anything.
 */
export const TAB_WIDTH_CHECKPOINTS = [
  { node: '229:4265', label: 'TECH10', archetype: 'active document', width: 74 },
  { node: '229:4272', label: 'GLOBAL-EQ', archetype: 'dirty document', width: 107 },
  { node: '229:4279', label: 'Frontier', archetype: 'pinned view', width: 143 },
  { node: '229:4286', label: 'Data Coverage', archetype: 'global tool', width: 113 },
  { node: '255:161', label: 'Prices', archetype: 'query view', width: 108 },
  { node: '279:28', label: 'Charting', archetype: 'linked query', width: 136 }
] as const

/** How far a rendered tab may sit from its Figma width. */
export const TAB_WIDTH_TOLERANCE = 2
