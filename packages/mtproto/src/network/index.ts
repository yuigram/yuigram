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
export { type ByteStream, connectTcp, type TcpOptions } from './tcp.js'
