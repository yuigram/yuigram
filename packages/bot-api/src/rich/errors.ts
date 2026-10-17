// SPDX-License-Identifier: MIT

/**
 * What goes wrong with a rich message.
 *
 * In a module of their own, so the readers and the `Rich` envelope can both
 * raise them without importing each other.
 */

import { ValidationError } from '@yuigram/core'

/** Raised for a rich message that cannot be what it was asked to be. */
export class RichError extends ValidationError {}

/** Rich markup that could not be read, and where. */
export class RichParseError extends RichError {
  constructor(
    message: string,
    /** Where in the source, in UTF-16 code units. */
    readonly offset: number,
    readonly source: string,
  ) {
    super(`${message} (at ${offset}: ${JSON.stringify(source.slice(offset, offset + 24))})`)
  }
}
