import type { BeaconBridge } from '@shared/ipc'

declare global {
  interface Window {
    /**
     * Optional on purpose. The bridge only exists when the renderer runs
     * inside Electron — in a browser (Storybook, `vite dev` opened directly)
     * it is undefined. Typing it as always-present hid exactly that case
     * until an uncaught throw blanked the whole app.
     */
    beacon?: BeaconBridge
  }
}

export {}
