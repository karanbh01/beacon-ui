import { useEffect, useRef } from 'react'

/** The menu bar's menus; everything else, the search field included, is fair game. */
const MENUS = '.menu-bar-menus'

/**
 * What the Edit menu acts on (BU-273): whatever had focus, and whatever was
 * selected, before a menu was opened.
 *
 * Clicking Edit moves focus to the menu, and an editing command acts on what
 * has focus, so Paste from the menu would paste into the menu. This keeps
 * the field and the selection from just before, and puts them back first.
 * A field keeps its own caret and selection while blurred; selected text
 * outside one, such as a table cell, is kept as ranges.
 */
export function useEditTarget(): () => void {
  const focused = useRef<HTMLElement | null>(null)
  const ranges = useRef<Range[]>([])

  useEffect(() => {
    // Captured on the way down, before the click can move focus or the
    // selection, and only on a menu's own button: by the press on one of its
    // items, focus has already gone to the menu. What has focus at that
    // moment is the field, if any; one left earlier for a table's text is
    // not.
    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Element) || event.target.closest('.menu-bar-menu') === null) {
        return
      }
      const active = document.activeElement
      if (!inMenus(active)) focused.current = isEditable(active) ? active : null

      const selection = window.getSelection()
      if (selection === null || selection.rangeCount === 0) return
      if (inMenus(selection.anchorNode)) return
      ranges.current = Array.from({ length: selection.rangeCount }, (_, at) =>
        selection.getRangeAt(at).cloneRange()
      )
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [])

  return () => {
    const field = focused.current
    if (field?.isConnected === true) {
      field.focus()
      return
    }
    const selection = window.getSelection()
    if (selection === null || ranges.current.length === 0) return
    selection.removeAllRanges()
    for (const range of ranges.current) selection.addRange(range)
  }
}

function inMenus(node: Node | null): boolean {
  const element = node instanceof Element ? node : (node?.parentElement ?? null)
  return element?.closest(MENUS) != null
}

function isEditable(element: Element | null): element is HTMLElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  )
}
