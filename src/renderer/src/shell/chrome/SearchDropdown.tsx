import { useEffect, useRef, type ReactElement } from 'react'
import { groupRows, type SearchRow } from './searchResults'
import './SearchDropdown.css'

export interface SearchDropdownProps {
  rows: readonly SearchRow[]
  /** Index into `rows`, or -1 for nothing highlighted. */
  activeIndex: number
  onActivate: (row: SearchRow) => void
  onHover: (index: number) => void
}

/**
 * Figma 147:13. Grouped rows under 10px tracked headings, primary label left
 * and a muted description right.
 *
 * The frame draws the search field inside the dropdown; here the real field
 * stays where it is and this hangs beneath it, sharing its border and radius.
 * Redrawing the field inside a panel would mean either moving the live input
 * into it or duplicating it — the first fights focus, the second lies.
 */
export function SearchDropdown({
  rows,
  activeIndex,
  onActivate,
  onHover
}: SearchDropdownProps): ReactElement {
  let index = -1
  const list = useRef<HTMLDivElement>(null)

  /*
   * Follow the highlight (BU-123).
   *
   * Five assets, the open tabs and the arrangements they could go into add up
   * to more rows than the panel is tall, and a highlight that walks off the
   * bottom is one the keyboard appears to have lost.
   */
  useEffect(() => {
    if (activeIndex < 0) return
    const rowsInDom = list.current?.querySelectorAll<HTMLElement>('[role="option"]')
    rowsInDom?.[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return (
    <div className="search-dropdown" role="listbox" aria-label="Search results" ref={list}>
      {groupRows(rows).map((group) => (
        <div key={group.group} className="search-dropdown-group">
          <p className="popover-heading">{group.group}</p>
          {group.rows.map((row) => {
            index += 1
            const rowIndex = index
            return (
              <button
                key={row.id}
                type="button"
                role="option"
                id={`search-row-${row.id}`}
                aria-selected={rowIndex === activeIndex}
                className={`popover-row search-dropdown-row${
                  rowIndex === activeIndex ? ' search-dropdown-row-active' : ''
                }`}
                // Mouse down would steal focus from the input and close the
                // panel before the click ever landed.
                onMouseDown={(event) => {
                  event.preventDefault()
                }}
                onMouseEnter={() => {
                  onHover(rowIndex)
                }}
                onClick={() => {
                  onActivate(row)
                }}
              >
                <span className="search-dropdown-label">{row.label}</span>
                <span
                  className={`popover-row-meta${
                    row.kind === 'action' ? ' popover-row-accent' : ''
                  }`}
                >
                  {row.meta}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
