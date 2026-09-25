/**
 * The last segment of a path, on either separator — Windows sends `\`.
 *
 * Shared because both sides name a folder by it: the renderer when a reader
 * opens one, and main when it hands the engine a store saved by an older
 * build (BU-215). Two copies would be two answers for the same folder.
 */
export function folderName(path: string): string {
  const segments = path.split(/[\\/]/).filter((segment) => segment !== '')
  return segments.at(-1) ?? path
}

/**
 * A path in a form two spellings of the same folder agree on.
 *
 * Windows paths are case-insensitive and accept either separator, so
 * `D:\Data\` and `d:/data` are one folder. Only for comparing — never for
 * handing to anything that opens the path.
 */
export function comparablePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
}
