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
 * Four stages, because there are four and they are not instant.
 *
 * The engine already reports its own lifecycle, and BU-57 added a step that
 * genuinely takes a while on first run — generating 512 assets of synthetic
 * data. A bar animated to look busy would be lying about the one moment the
 * user actually waits.
 *
 * The stages are inferred from what `EngineState` already carries rather than
 * from a new channel: `detail` names the generation step, and `baseUrl`
 * appears only once the server has announced its port, which is what
 * separates "spawning" from "waiting for it to answer".
 */
export function splashProgress(engine: EngineState): SplashProgress {
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

  // `starting`. The detail is the only thing that distinguishes generation,
  // which is the slow one and the only stage worth naming specifically.
  if ((engine.detail ?? '').includes('synthetic')) {
    return { fraction: 0.5, label: 'Generating market data…', ready: false, failed: false }
  }

  if (engine.baseUrl !== undefined) {
    return { fraction: 0.8, label: 'Waiting for the engine…', ready: false, failed: false }
  }

  return { fraction: 0.2, label: 'Starting the engine…', ready: false, failed: false }
}
