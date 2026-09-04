import { Suspense, lazy, type ReactElement } from 'react'

/**
 * Where `agentation-mcp` listens (BU-155).
 *
 * `127.0.0.1`, never `localhost`: the renderer's CSP names the loopback
 * ADDRESS in `connect-src`, and the two are different origins to a policy
 * even though they are the same machine. With the server down the toolbar
 * warns once per annotation and keeps them locally, so a dev session without
 * it is degraded rather than broken.
 */
const ENDPOINT = 'http://127.0.0.1:4747'

/*
 * Loaded only in development.
 *
 * Vite replaces `import.meta.env.DEV` with a literal `false` in a production
 * build, so this ternary collapses to `null` and the dynamic import goes with
 * it — which is the point. A visual-feedback toolbar in a shipped app is a
 * bug, and a guard that merely hid it would still ship the code.
 */
const Toolbar = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import('agentation')).Agentation }))
  : null

/**
 * The annotation toolbar: click an element, say what is wrong with it.
 *
 * What it sends is what makes it worth having — the selector, the React
 * component path, the source file and the computed styles, rather than a
 * sentence describing where on the screen the thing is. `endpoint` puts each
 * annotation in a session the MCP server can hand to an agent directly; the
 * copy-to-markdown button still works when nothing is listening.
 */
export function Annotations(): ReactElement | null {
  if (Toolbar === null) return null

  return (
    <Suspense fallback={null}>
      <Toolbar endpoint={ENDPOINT} />
    </Suspense>
  )
}
