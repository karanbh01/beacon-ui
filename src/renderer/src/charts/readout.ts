// The hover popup's data: which series it reads, and where it opens.
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, Time } from 'lightweight-charts'

/** A series the popup reads a value off, and how it names and prints it. */
export interface ReadoutEntry {
  api: ISeriesApi<SeriesType>
  label: string
  colour: string
  format: (value: number) => string
}

interface ReadoutRow {
  key: string
  label: string
  colour: string
  value: string
}

export interface Readout {
  x: number
  y: number
  /** Which side of the pointer it opens on, so it never runs off the chart. */
  flipX: boolean
  flipY: boolean
  date: string
  rows: ReadoutRow[]
}

/** Two decimals with thousands separators: a level, a volume, a drawdown. */
export function plainFigure(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * The popup under the pointer, as py-beacon's interactive charts draw it
 * (beacon/plot/interactive/popup.py), which is itself the app's popover:
 * a glass fill blurring what is behind it, a half-pixel edge, a 2px radius
 * and a soft shadow. The date heads it; each series is a row of swatch,
 * name and value.
 *
 * Fed by the chart's crosshair, and placed from the pointer rather than the
 * crosshair's own point, whose origin moves with the pane it is over.
 */
export function useReadout(
  chart: RefObject<IChartApi | null>,
  entries: RefObject<readonly ReadoutEntry[]>,
  plot: RefObject<HTMLDivElement | null>
): Readout | null {
  const [readout, setReadout] = useState<Readout | null>(null)
  const pointer = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const created = chart.current
    const area = plot.current
    if (created === null || area === null) return undefined

    const track = (event: PointerEvent): void => {
      const box = area.getBoundingClientRect()
      pointer.current = { x: event.clientX - box.left, y: event.clientY - box.top }
    }
    const hide = (): void => {
      setReadout(null)
    }
    const move = (param: MouseEventParams): void => {
      if (param.time === undefined || param.point === undefined) {
        setReadout(null)
        return
      }
      const rows = rowsAt(param, entries.current ?? [])
      if (rows.length === 0) {
        setReadout(null)
        return
      }
      const { x, y } = pointer.current
      setReadout({
        x,
        y,
        flipX: x > area.clientWidth / 2,
        flipY: y > area.clientHeight / 2,
        date: dateOf(param.time),
        rows
      })
    }

    area.addEventListener('pointermove', track)
    area.addEventListener('pointerleave', hide)
    created.subscribeCrosshairMove(move)
    return () => {
      area.removeEventListener('pointermove', track)
      area.removeEventListener('pointerleave', hide)
      if (gone(chart)) return
      created.unsubscribeCrosshairMove(move)
    }
  }, [chart, entries, plot])

  return readout
}

function rowsAt(param: MouseEventParams, entries: readonly ReadoutEntry[]): ReadoutRow[] {
  return entries.flatMap((entry, index) => {
    const data = param.seriesData.get(entry.api)
    if (data === undefined || !('value' in data)) return []
    return [
      {
        key: `${String(index)}-${entry.label}`,
        label: entry.label,
        colour: entry.colour,
        value: entry.format(data.value)
      }
    ]
  })
}

/** The day as the tables write it: 21 Feb 2026. */
function dateOf(time: Time): string {
  const day =
    typeof time === 'number'
      ? new Date(time * 1000)
      : typeof time === 'string'
        ? new Date(`${time}T00:00:00Z`)
        : new Date(Date.UTC(time.year, time.month - 1, time.day))
  return day.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

/**
 * Whether the chart has been removed: on unmount its own cleanup runs first,
 * and unsubscribing from a removed chart throws.
 */
function gone(chart: RefObject<IChartApi | null>): boolean {
  return chart.current === null
}
