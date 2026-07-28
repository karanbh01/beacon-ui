# ADR-0001: Electron over Tauri

- **Status:** Accepted
- **Date:** 2026-07-28
- **Issue:** BU-1

## Context

beacon-ui is a desktop frontend for `py-beacon`. Two properties dominate the
choice of shell:

1. **Rendering consistency for dense surfaces.** The design is built around
   tight tables (10k-row virtualised scroll, 4px scrollbars, zebra fills,
   hairline dividers) and chart canvases that must land pixel-true against
   Figma frames in both themes. Sub-pixel and font-rendering differences
   between platform webviews would show up directly as design drift.
2. **Managing a Python child process.** The app spawns and supervises
   `python -m py_beacon.server` (BU-19): parse a port from stdout, hold a
   bearer token, health-poll, restart with backoff, kill cleanly on quit.

## Decision

Use **Electron** (with electron-vite, React 18, TypeScript strict).

Electron ships a fixed Chromium, so rendering is identical on macOS and
Windows and matches what the design was authored against. Its main process is
Node, which makes `child_process` supervision of the Python server ordinary
work rather than a bridge exercise.

Tauri's advantages are real but orthogonal to this app: much smaller bundles
and lower idle memory. Neither is a binding constraint for an internal
analytics tool that already ships a Python runtime alongside it (BU-33) —
the Python payload dominates the bundle either way, which erases most of
Tauri's size win.

## Consequences

- Bundle size and idle memory are meaningfully worse than Tauri's. Accepted.
- The renderer must be treated as hostile: `contextIsolation: true`,
  `nodeIntegration: false`, a CSP on `index.html`, and a single typed preload
  bridge (`src/shared/ipc.ts`) as the only surface. Established in BU-1.
- Electron's release cadence means regular major-version bumps to stay on a
  supported Chromium.

## Revisit criteria

Reopen this decision if any of these hold:

- Python stops being bundled (BU-33 lands on system-python), removing the
  bundle-size floor that currently makes Electron's overhead moot.
- Measured idle memory becomes a user-visible complaint on target hardware.
- Tauri gains a fixed-Chromium rendering mode, removing the consistency gap.
