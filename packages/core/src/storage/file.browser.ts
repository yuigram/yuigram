/**
 * What a filesystem-backed store is, where there is no filesystem.
 *
 * Substituted for `file.ts` by the `browser` field. A browser cannot open a
 * directory, and no adapter can pretend otherwise — so this is not a fallback,
 * it is the truth stated at the call rather than as a bundler failure.
 *
 * The surface is kept identical so that a program written for a server still
 * compiles for a browser, and the one line that has to change is the one
 * choosing a store. `web()` is what a browser has instead.
 */

import { ConfigError } from '../errors/errors.js'
import type { DescribedKV } from './types.js'

export type { FileOptions } from './file-options.js'

import type { FileOptions } from './file-options.js'

/** A store on disk, which this runtime has none of. */
export function file<V = unknown>(directory: string, options: FileOptions = {}): DescribedKV<V> {
  void options

  throw new ConfigError(
    `this runtime has no filesystem, so a store cannot be opened at '${directory}' — use \`web()\` or \`memory()\``,
  )
}
