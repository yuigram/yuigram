/**
 * Reaching Telegram through something in between.
 *
 * An account connects straight to a datacenter unless it is given a route.
 * A route — an MTProxy, from `yuigram/mtproxy` — decides three things for every
 * connection the account makes: which envelope it uses, which secret its
 * obfuscation is bound to, and where its bytes actually go. The datacenter it
 * was meant for still travels with it, inside the obfuscation, so the proxy can
 * forward it.
 *
 * Only the shape lives here. The implementation is in an entry point of its
 * own, so an account that connects directly never loads it.
 */

import type { StreamRequest } from './channel.js'
import type { ByteStream } from './stream.js'

/** The datacenter a connection is for, as a route needs to know it. */
export interface RoutedDatacenter {
  readonly id: number
  /** A connection for file transfers only. */
  readonly mediaOnly: boolean
  /** Telegram's test environment rather than production. */
  readonly testMode: boolean
}

/** How one connection travels by a route. */
export interface RoutedConnection {
  /** The envelope messages travel in. */
  readonly framing: 'intermediate' | 'padded-intermediate'
  /** What the obfuscation keys are bound to. */
  readonly secret: Uint8Array
  /** The datacenter as the intermediary is told it, written into the obfuscation. */
  readonly dcId: number
  /** The intermediary, as `initConnection` tells Telegram of it. */
  readonly proxy?: { readonly address: string; readonly port: number }
  /**
   * Open the byte stream, using `connector` to reach the intermediary.
   *
   * Resolves once the stream can carry the connection's first bytes. Honours
   * the request's signal and connect timeout for everything it does before
   * then, and closes whatever it opened when it fails.
   */
  open(
    request: StreamRequest,
    connector: (request: StreamRequest) => Promise<ByteStream>,
  ): Promise<ByteStream>
}

/**
 * A way to reach Telegram other than directly.
 *
 * Made by `mtproxy()` and handed to an account as its `proxy`; an account calls
 * {@link ConnectionRoute.connection} for each connection it opens.
 */
export interface ConnectionRoute {
  /** What the route is, for a log line. Never carries a credential. */
  readonly description: string
  /** How a connection to this datacenter travels. Called by the account. */
  connection(datacenter: RoutedDatacenter): RoutedConnection
}
