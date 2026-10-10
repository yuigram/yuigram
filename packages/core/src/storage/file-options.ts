// SPDX-License-Identifier: MIT

/**
 * How a filesystem-backed store is configured.
 *
 * On its own so that the runtime without a filesystem can name the same shape:
 * the surface has to match for a program written for a server to compile for a
 * browser, and the two implementations cannot import each other because one
 * replaces the other.
 */

import type { Logger } from '../log/logger.js'

/** Options for {@link file}. */
export interface FileOptions {
  /** Clock source, injectable so TTL behaviour is testable without waiting. */
  readonly now?: () => number
  /**
   * Where a warning about the directory's permissions goes.
   *
   * The store says nothing without one. It is the caller's logger rather than
   * one of this module's making, so a warning about session state lands
   * wherever that application's records land and is redacted by whatever it
   * redacts with.
   */
  readonly log?: Logger
  /**
   * How the store learns a path's permission bits.
   *
   * Injectable because the answer is not the same everywhere: a filesystem
   * without POSIX modes reports whatever it likes, and the default declines to
   * guess rather than warning every user on such a platform about a mode that
   * means nothing. Returning `undefined` disables the check.
   */
  readonly permissions?: (path: string) => Promise<number | undefined>
}
