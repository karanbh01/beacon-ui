import type { BeaconBridge } from '@shared/ipc'

declare global {
  interface Window {
    beacon: BeaconBridge
  }
}

export {}
