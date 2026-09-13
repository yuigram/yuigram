/**
 * How a browser opens a connection.
 *
 * Substituted for `connect.ts` by the `browser` field. A browser cannot open a
 * socket, so this is not a lesser default — it is the only one there is.
 *
 * The datacenter list a browser program is given has to name endpoints a
 * WebSocket can reach; `connectWebSocket` documents what it builds from an
 * address and what to pass to change it.
 */

import type { Connector } from './stream.js'
import { connectWebSocket } from './websocket.js'

/** The connector this runtime provides. */
export const connectStream: Connector = connectWebSocket
