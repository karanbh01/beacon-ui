import { join } from 'node:path'
import { app } from 'electron'

/**
 * The window icon, in development only (BU-73).
 *
 * A packaged build takes its icon from the executable on Windows and the
 * bundle on macOS, and `build/` is not inside the app there — pointing at it
 * would be a path that resolves during `pnpm dev` and silently does not once
 * shipped. Unpackaged, Electron would otherwise show its own default icon in
 * the taskbar, which makes the dev window look like somebody else's app.
 *
 * Shared by both windows since BU-97: the splash is the first thing on the
 * taskbar, so it is the one that most needs to look like this app.
 */
export const devIcon = app.isPackaged ? {} : { icon: join(__dirname, '../../build/icon.png') }
