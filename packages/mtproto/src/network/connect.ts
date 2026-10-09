// SPDX-License-Identifier: MPL-2.0

/**
 * How this runtime opens a connection.
 *
 * A server opens a TCP socket. A browser has no such interface and opens a
 * WebSocket instead. Which is available is a property of the runtime rather
 * than of the protocol, so the protocol names this module and the package
 * substitutes `connect.browser.ts` for it when a bundler targets a browser —
 * the same mechanism, and the same `browser` field, that chooses the
 * cryptography.
 *
 * A caller that wants the other one, or something else entirely, passes its own
 * connector: every layer above takes one as an option and this is only the
 * default.
 */

import type { Connector } from './stream.js'
import { connectTcp } from './tcp.js'

/** The connector this runtime provides. */
export const connectStream: Connector = connectTcp
