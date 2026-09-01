/**
 * Datacenters and how to reach them.
 *
 * Addresses and the rule for choosing between them. Nothing here opens or holds
 * a connection: what is chosen is acted on by the layer that owns the socket.
 */

export {
  type Channel,
  type ChannelOptions,
  type ChannelState,
  type KnownAuthorization,
  openChannel,
  type StreamRequest,
} from './channel.js'
export {
  type DcAddress,
  type DcConfiguration,
  DcDirectory,
  type DcPurpose,
  type DcQuery,
  readDcConfiguration,
  readDcOption,
} from './dc.js'
export { Link, type LinkOptions, type LinkState } from './link.js'
export { type ByteStream, connectTcp, type TcpOptions } from './tcp.js'
