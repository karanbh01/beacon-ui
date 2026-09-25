import type { EngineState } from '@shared/ipc'

export interface SplashProgress {
  /** 0–1, for the bar's filled portion. */
  fraction: number
  /** What is happening, in words. Figma's frame just says "Loading…". */
  label: string
  /** True once the app can take over; the splash gives way. */
  ready: boolean
  /** Set when startup failed, so the splash stops pretending to progress. */
  failed: boolean
}

/**
 * The engine's real startup, rather than a bar animated to look busy.
 *
 * Nothing at all until Start is pressed, which is the point of pressing it.
 *
 * The stages are inferred from what `EngineState` already carries rather than
 * from a new channel: `baseUrl` appears only once the server has announced
 * its port, which is what separates "spawning" from "waiting for it to
 * answer". There was a stage for generating synthetic data before the engine
 * started (BU-57); the engine generates on request now, after it is up, and
 * the footer reports that instead (BU-215).
 */
export function splashProgress(engine: EngineState): SplashProgress | undefined {
  // Nothing has been asked of the engine yet, so there is nothing to report
  // and no bar to draw (BU-115). A bar at zero still says "started, at zero".
  if (engine.status === 'idle') return undefined

  if (engine.status === 'connected') {
    return { fraction: 1, label: 'Ready', ready: true, failed: false }
  }

  if (engine.status === 'stopped') {
    return {
      fraction: 1,
      label: engine.detail ?? 'The engine could not be started',
      ready: false,
      failed: true
    }
  }

  if (engine.status === 'degraded') {
    return { fraction: 0.75, label: 'Reconnecting to the engine…', ready: false, failed: false }
  }

  if (engine.baseUrl !== undefined) {
    return { fraction: 0.8, label: 'Waiting for the engine…', ready: false, failed: false }
  }

  return { fraction: 0.2, label: 'Starting the engine…', ready: false, failed: false }
}
