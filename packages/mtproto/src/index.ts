/**
 * Telegram MTProto subsystem.
 *
 * Owns the protocol implementation: cryptography, the TL codec, transport
 * framing, the authorization handshake, the session layer, the datacenter
 * pool, peer resolution, file transfer and the updates manager.
 *
 * It may import from `@yuigram/core`. It must never import from
 * `@yuigram/bot-api`.
 */

export {
  Account,
  type AccountContext,
  type AccountOptions,
} from './account.js'
export type { MtprotoApi } from './api.js'
export type {
  DownloadOutcome,
  DownloadRequest,
  DownloadSink,
} from './files/download.js'
export type { DownloadMode } from './files/geometry.js'
export { documentFile, photoFile } from './files/media.js'
export type { UploadedFile, UploadRequest, UploadSource } from './files/upload.js'
export { TL_LAYER } from './generated/schema-info.js'
export type { BoundApi } from './here.js'
export type { LoginTokenState, SignInState } from './network/signin.js'
export type {
  MtprotoContext,
  MtprotoEventKind,
  NormalizedUpdate,
  PeerRef,
} from './normalize/index.js'
export type { PortableSession } from './session.js'
export type { TlValue } from './tl/index.js'

/** Package name, used by diagnostics and error messages. */
export const PACKAGE_NAME = '@yuigram/mtproto'
