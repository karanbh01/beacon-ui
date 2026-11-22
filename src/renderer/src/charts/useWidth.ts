import { useEffect, useState } from 'react'

/** The element's width, kept as it resizes: for the visx charts, which draw to a size. */
export function useWidth(host: { current: HTMLElement | null }): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = host.current
    if (element === null) return undefined
    const watcher = new ResizeObserver(() => {
      setWidth(element.clientWidth)
    })
    watcher.observe(element)
    setWidth(element.clientWidth)
    return () => {
      watcher.disconnect()
    }
  }, [host])
  return width
}
