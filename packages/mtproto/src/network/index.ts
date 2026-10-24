// SPDX-License-Identifier: MIT

/**
 * Datacenters and how to reach them.
 *
 * Addresses and the rule for choosing between them. Nothing here opens or holds
 * a connection: what is chosen is acted on by the layer that owns the socket.
 */

export {
  AUTH_KEY_NOT_FOUND,
  type Channel,
  type ChannelOptions,
  type ChannelState,
  type KnownAuthorization,
  openChannel,
  type StreamRequest,
  TransportError,
} from './channel.js'
export { connectStream } from './connect.js'
export {
  type BackoffOptions,
  type ConnectionInvokeOptions,
  type ConnectionState,
  type Connections,
  type ConnectionsOptions,
  type ConnectionTarget,
  type ManagedConnection,
  openConnections,
} from './connections.js'
export {
  type ConnectOptions,
  type Datacenters,
  type DatacentersOptions,
  openDatacenters,
} from './datacenters.js'
export {
  type DcAddress,
  type DcConfiguration,
  DcDirectory,
  type DcPurpose,
  type DcQuery,
  readDcConfiguration,
  readDcOption,
  sameConfiguration,
} from './dc.js'
export { Link, type LinkOptions, type LinkState } from './link.js'
export {
  type Callable,
  type ExportedAuthorization,
  exportAuthorization,
  importAuthorization,
  readExportedAuthorization,
  type TransferOptions,
  transferAuthorization,
} from './migration.js'
export {
  harvest,
  inputPeer,
  inputPeerFromMessage,
  readPeerReference,
  readPeers,
  resolveUsername,
} from './peers.js'
export {
  openPools,
  POOL_LIMITS,
  type PoolPurpose,
  type Pools,
  type PoolsOptions,
  type PoolTarget,
} from './pools.js'
export {
  type LoginTokenState,
  type Reach,
  requestLoginToken,
  resendCode,
  type SignInOptions,
  type SignInState,
  sendCode,
  signIn,
  signInAsBot,
  signInWithPassword,
  startTest,
} from './signin.js'

export type { ByteStream, Connector, StreamOptions } from './stream.js'
export { connectTcp, type TcpOptions } from './tcp.js'
export { connectWebSocket, type WebSocketOptions } from './websocket.js'
