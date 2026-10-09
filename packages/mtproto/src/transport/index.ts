// SPDX-License-Identifier: MIT

/**
 * Transport framing and obfuscation.
 *
 * The byte-level layer between a stream and an MTProto payload. It owns frame
 * boundaries, the transport's own error reports, and the optional obfuscation
 * that hides the connection's shape. It owns no socket: what carries the bytes
 * is decided by the layer that opens the connection.
 */

export { crc32 } from './crc32.js'
export {
  AbridgedFraming,
  type Frame,
  FrameBuffer,
  type Framing,
  FramingError,
  type FramingName,
  FullFraming,
  IntermediateFraming,
  PaddedIntermediateFraming,
} from './framing.js'
export {
  createObfuscation,
  type Obfuscation,
  type ObfuscationOptions,
} from './obfuscation.js'
