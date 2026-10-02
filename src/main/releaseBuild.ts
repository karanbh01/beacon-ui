import { app } from 'electron'
import { RELEASE_BUILD_ARG } from '@shared/ipc'

/**
 * Whether this is a release build (BU-209).
 *
 * `app.isPackaged` is the question — did this come out of electron-builder —
 * and only main can answer it. Not `import.meta.env.DEV` in the renderer,
 * which is wrong in exactly one case: a production build run from a
 * checkout, which is how the e2e suite runs.
 *
 * BEACON_RELEASE_BUILD=1 makes an unpackaged run behave as a release, so
 * the e2e suite can check what a release withholds. It can only withhold:
 * nothing it sets reveals anything a packaged build would hide.
 */
export function isReleaseBuild(packaged: boolean, env: NodeJS.ProcessEnv): boolean {
  return packaged || env.BEACON_RELEASE_BUILD === '1'
}

/** The preload's launch arguments for this build. */
export function releaseArguments(): string[] {
  return isReleaseBuild(app.isPackaged, process.env) ? [RELEASE_BUILD_ARG] : []
}
