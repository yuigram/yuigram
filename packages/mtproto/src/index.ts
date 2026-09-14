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
export { type DialogForm, DialogView, readDialog } from './entities/dialog.js'
export { type MediaKind, MediaView, readMedia } from './entities/media.js'
export { type MemberStanding, MemberView, readMember } from './entities/member.js'
export { type MessageForm, MessageView, readMessage, sameMessage } from './entities/message.js'
export {
  type ChatForm,
  ChatView,
  type PeerBearing,
  PeerIndex,
  readChat,
  readPeers,
  readUser,
  UserView,
} from './entities/peer.js'
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
export { fromHtml, toHtml } from './format/html.js'
export { fromMarkdown, toMarkdown } from './format/markdown.js'
export type { FormattedText, Markup } from './format/text.js'
export { TL_LAYER } from './generated/schema-info.js'
export type { BoundApi } from './here.js'
export type {
  CallbackAnswer,
  EditOptions,
  ForwardOptions,
  InlineAnswer,
  MessageBody,
  ReactionInput,
  Sending,
  SendOptions,
  ShippingAnswer,
} from './messaging/send.js'
export {
  answerCallback,
  answerInlineQuery,
  answerPrecheckout,
  answerShipping,
  decideJoinRequest,
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
export {
  type ContextOptions,
  contextFor,
  type MtprotoContext,
  mtprotoContext,
} from './normalize/context.js'
export {
  ACCOUNT_KINDS,
  MESSAGE_UPDATES,
  type MtprotoEventKind,
  RAW_KIND,
  SHARED_KINDS,
  SHORT_MESSAGE_UPDATES,
  UPDATE_EVENTS,
} from './normalize/events.js'
export { type NormalizedUpdate, normalizeUpdate, type PeerRef } from './normalize/normalize.js'
export { type DialogsOffset, nextDialogs } from './normalize/paging.js'
export { type SentMessage, sentMessage } from './normalize/sent.js'
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
