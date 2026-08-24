import { useCallback, useState } from 'react'
import { fileStem, toCsv, toWorkbookRows, type Sheet } from './sheet'

export type ExportFormat = 'csv' | 'xlsx'

/** base64 without a FileReader round trip; the payloads here are small. */
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export interface ExportState {
  /** Writes the sheet, or does nothing if the user dismissed the dialog. */
  save: (sheet: Sheet, format: ExportFormat) => Promise<void>
  /** True while the dialog is open or the file is being written. */
  busy: boolean
  /** Set when the write itself failed — a cancel is not an error. */
  problem: string | undefined
}

/**
 * Export a table to disk (BU-106).
 *
 * The bytes are built here and main only asks where to put them: a renderer
 * cannot open a save dialog, and main has no idea what is on screen.
 *
 * `write-excel-file` is imported lazily. It is the one dependency added for
 * this, and loading it on app start to serve a button most sessions never
 * press would be paying for it every time.
 */
export function useExport(): ExportState {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | undefined>(undefined)

  const save = useCallback(async (sheet: Sheet, format: ExportFormat): Promise<void> => {
    const bridge = globalThis.window.beacon
    if (bridge === undefined) {
      // Storybook and a plain `vite dev` have no bridge. Saying so beats an
      // uncaught TypeError from a button that looks like it should work.
      setProblem('Saving files needs the desktop app.')
      return
    }

    setBusy(true)
    setProblem(undefined)
    try {
      const base64 = format === 'csv' ? await csvBytes(sheet) : await workbookBytes(sheet)
      await bridge.files.save({
        suggestedName: `${fileStem(sheet.name)}.${format}`,
        format,
        base64
      })
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [])

  return { save, busy, problem }
}

async function csvBytes(sheet: Sheet): Promise<string> {
  return Promise.resolve(toBase64(new TextEncoder().encode(toCsv(sheet))))
}

async function workbookBytes(sheet: Sheet): Promise<string> {
  // `/browser`, because this runs in Chromium — the package has no root
  // export and the node build reaches for `fs`. A sheet name is capped at 31
  // characters by the format itself, not by us.
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  // Not awaited: the browser build hands back { toBlob, toFile } rather than
  // a promise, and the work happens inside toBlob.
  const written = writeXlsxFile(toWorkbookRows(sheet) as never, {
    sheet: sheet.name.slice(0, 31)
  })
  const blob = await written.toBlob()
  return toBase64(new Uint8Array(await blob.arrayBuffer()))
}
