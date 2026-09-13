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
  ChatForm,
  DialogForm,
  MediaKind,
  MemberStanding,
  MessageForm,
  PeerBearing,
} from './entities/index.js'
export {
  ChatView,
  DialogView,
  MediaView,
  MemberView,
  MessageView,
  PeerIndex,
  readChat,
  readDialog,
  readMedia,
  readMember,
  readMessage,
  readPeers,
  readUser,
  sameMessage,
  UserView,
} from './entities/index.js'
export type {
  DownloadOutcome,
  DownloadRequest,
  DownloadSink,
} from './files/download.js'
export type { DownloadMode } from './files/geometry.js'
export type { UploadedDocumentOptions } from './files/media.js'
export {
  documentFile,
  documentMedia,
  photoFile,
  photoMedia,
  uploadedDocument,
  uploadedPhoto,
} from './files/media.js'
export type { UploadedFile, UploadRequest, UploadSource } from './files/upload.js'
export type { FormattedText, Markup } from './format/index.js'
export { fromHtml, fromMarkdown, toHtml, toMarkdown } from './format/index.js'
export { TL_LAYER } from './generated/schema-info.js'
export type { BoundApi } from './here.js'
export type {
  EditOptions,
  ForwardOptions,
  MessageBody,
  ReactionInput,
  Sending,
  SendOptions,
} from './messaging/send.js'
export {
  deleteMessages,
  editMessage,
  forwardMessages,
  getMessages,
  pinMessage,
  react,
  readHistory,
  sendMedia,
  sendText,
  setTyping,
} from './messaging/send.js'
export { inputChannel, inputPeerFromMessage } from './network/peers.js'
export type { LoginTokenState, SignInState } from './network/signin.js'
export type {
  DialogsOffset,
  MtprotoContext,
  MtprotoEventKind,
  NormalizedUpdate,
  PeerRef,
  SentMessage,
} from './normalize/index.js'
export { nextDialogs, sentMessage } from './normalize/index.js'
export type { MemberOptions, Paging, SearchOptions, WalkOptions } from './paging/walk.js'
export {
  walkDialogs,
  walkGlobalSearch,
  walkHistory,
  walkMembers,
  walkSearch,
} from './paging/walk.js'
export type { NewPassword, PasswordStatus, Securing } from './security/password.js'
export {
  cancelRecoveryEmail,
  checkRecoveryCode,
  confirmRecoveryEmail,
  passwordStatus,
  removePassword,
  requestPasswordRecovery,
  resendRecoveryEmail,
  setPassword,
} from './security/password.js'
export type { PortableSession } from './session.js'
export type { PeerKind, PeerRecord, PeerStore } from './storage/peers.js'
export type { TlValue } from './tl/index.js'

/** Package name, used by diagnostics and error messages. */
export const PACKAGE_NAME = '@yuigram/mtproto'
