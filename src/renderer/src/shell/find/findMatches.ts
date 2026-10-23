/**
 * Ctrl+F's search (BU-283): every place the text appears in the open
 * windows, as DOM ranges, painted with the CSS Custom Highlight API.
 *
 * Highlights rather than wrapped spans: wrapping would rewrite React's DOM
 * under it, and a highlight is paint only, so nothing moves or re-renders.
 */

/** Where to look: the windows of the page showing, and nothing else in the shell. */
const WINDOWS = '.pane-host .pane-body'

/** Parts of a window that are not text a reader sees. */
const SKIP = 'script, style, svg, [aria-hidden="true"], [hidden]'

export const FIND_ALL = 'beacon-find'
export const FIND_CURRENT = 'beacon-find-current'

/** Every match of `query` in the open windows, in reading order, ignoring case. */
export function findRanges(query: string, root: ParentNode = document): Range[] {
  const needle = query.trim().toLocaleLowerCase()
  if (needle === '') return []

  const ranges: Range[] = []
  for (const body of root.querySelectorAll(WINDOWS)) {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (readable(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    })
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = (node.nodeValue ?? '').toLocaleLowerCase()
      for (
        let at = text.indexOf(needle);
        at !== -1;
        at = text.indexOf(needle, at + needle.length)
      ) {
        const range = document.createRange()
        range.setStart(node, at)
        range.setEnd(node, at + needle.length)
        ranges.push(range)
      }
    }
  }
  return ranges
}

function readable(node: Node): boolean {
  const parent = node.parentElement
  if (parent?.closest(SKIP) !== null) return false
  // Not every engine has it; one that does knows what is laid out and shown.
  return typeof parent.checkVisibility !== 'function' || parent.checkVisibility()
}

/** Paints the matches, the current one apart; no-ops where highlights are not supported. */
export function paint(ranges: readonly Range[], current: number): void {
  const highlights = registry()
  if (highlights === undefined) return
  const now = ranges[current]
  highlights.set(FIND_ALL, new Highlight(...ranges.filter((_, at) => at !== current)))
  highlights.set(FIND_CURRENT, now === undefined ? new Highlight() : new Highlight(now))
}

export function clearPaint(): void {
  const highlights = registry()
  highlights?.delete(FIND_ALL)
  highlights?.delete(FIND_CURRENT)
}

/** The current match brought into view, in whichever window scrolls to it. */
export function reveal(range: Range | undefined): void {
  range?.startContainer.parentElement?.scrollIntoView({ block: 'center', inline: 'nearest' })
}

function registry(): HighlightRegistry | undefined {
  return typeof CSS !== 'undefined' && 'highlights' in CSS ? CSS.highlights : undefined
}
