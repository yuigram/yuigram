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
export type { AdminRights, ChatKind, Chatting, Restrictions } from './chats/common.js'
export type { Folder, NewFolder } from './chats/folders.js'
export type {
  ChatlistPreview,
  InviteLinkEdit,
  InvitePreview,
  NewInviteLink,
} from './chats/invites.js'
export type { HistoryRemoval, NewChat } from './chats/lifecycle.js'
export type { FullChat } from './chats/lookup.js'
export type { AddOptions, NotAdded } from './chats/members.js'
export type { FolderQuery, PeerView } from './chats/peers.js'
export {
  ChatEventView,
  ForumTopicView,
  InviteImporterView,
  InviteLinkView,
  readForumTopic,
} from './entities/chat.js'
export { type DialogForm, DialogView, readDialog } from './entities/dialog.js'
export { type MediaKind, MediaView, readMedia } from './entities/media.js'
export { type MemberStanding, MemberView, readMember } from './entities/member.js'
export {
  type MessageForm,
  MessageView,
  type ReactionIdentity,
  type ReactionKind,
  ReactionView,
  readMessage,
  readReaction,
  sameMessage,
} from './entities/message.js'
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
export {
  PeerStoriesView,
  readStory,
  type StoryForm,
  StoryView,
  StoryViewerView,
  type ViewerKind,
} from './entities/story.js'
export type {
  DownloadOutcome,
  DownloadRequest,
  DownloadSink,
} from './files/download.js'
export type { DownloadMode } from './files/geometry.js'
export type {
  FileIdentity,
  FileKind,
  FileWhere,
  PhotoSource,
} from './files/identifier.js'
export {
  FileIdError,
  fileFor,
  fileIdOfDocument,
  fileIdOfPhoto,
  locationOf,
  looksLikeFileId,
  readFileId,
  uniqueFileId,
  webLocationOf,
  writeFileId,
} from './files/identifier.js'
export type { UploadedDocumentOptions } from './files/media.js'
export {
  documentFile,
  documentMedia,
  type PhotoThumbnail,
  photoFile,
  photoMedia,
  thumbnail,
  thumbnailFile,
  thumbnails,
  uploadedDocument,
  uploadedPhoto,
} from './files/media.js'
export type { UploadedFile, UploadRequest, UploadSource } from './files/upload.js'
export { fromHtml, toHtml } from './format/html.js'
export { fromMarkdown, toMarkdown } from './format/markdown.js'
export type { FormattedText, Markup } from './format/text.js'
export type {
  ForumSettings,
  NewTopic,
  TopicEdit,
  TopicIcon,
  TopicRef,
} from './forums/topics.js'
export { TL_LAYER } from './generated/schema-info.js'
export type {
  GiftNote,
  GiftOffer,
  GiftRef,
  GiftVerdict,
  NewGift,
  ResaleAttributes,
  ResalePage,
  ResaleQuery,
  StarsPrice,
  UpgradeOptions,
} from './gifts/gifts.js'
export type { BoundApi } from './here.js'
export type {
  AlbumItem,
  AlbumOptions,
  CopyOptions,
  Discussion,
  SentScheduled,
} from './messaging/compose.js'
export type {
  CallbackAnswer,
  EditOptions,
  ForwardOptions,
  InlineAnswer,
  MessageBody,
  Quote,
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
  quoteOf,
  react,
  readHistory,
  sameTopic,
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
export type {
  AllStoriesFilter,
  AllStoriesOptions,
  AllStoriesPage,
  BoostFilter,
  BoostPage,
  BoostWalkOptions,
  ChatEventFilter,
  ChatEventOptions,
  ChatEventPage,
  DialogFilter,
  DialogOptions,
  DialogPage,
  GiftFilter,
  GiftPage,
  GiftWalkOptions,
  GlobalSearchFilter,
  GlobalSearchOptions,
  HistoryFilter,
  HistoryOptions,
  ImporterFilter,
  ImporterWalkOptions,
  InviteFilter,
  InviteLinkPage,
  InviteMemberPage,
  InviteWalkOptions,
  MemberFilter,
  MemberOptions,
  MemberPage,
  MessagePage,
  MusicPage,
  PageOf,
  PageOptions,
  PageTotal,
  Paging,
  PeeredPage,
  PhotoPage,
  PostPage,
  PostSearchFilter,
  PostSearchOptions,
  ProfileStoriesPage,
  ReactionFilter,
  ReactionPage,
  ReactionWalkOptions,
  SearchFilter,
  SearchOptions,
  SimilarChannelsPage,
  StarsFilter,
  StarsPage,
  StarsWalkOptions,
  StoryFilter,
  StoryViewerPage,
  StoryWalkOptions,
  TopicFilter,
  TopicPage,
  TopicWalkOptions,
  TotalPrecision,
  ViewerFilter,
  ViewerWalkOptions,
  WalkOptions,
} from './paging/walk.js'
export {
  allStoriesPage,
  boostsPage,
  CursorError,
  chatEventsPage,
  dialogsPage,
  forumTopicsPage,
  hashtagPage,
  historyPage,
  inviteLinksPage,
  inviteMembersPage,
  membersPage,
  postSearchPage,
  profilePhotosPage,
  profileStoriesPage,
  reactionsPage,
  savedGiftsPage,
  savedMusicPage,
  searchGlobalPage,
  searchPage,
  similarChannelsPage,
  starsTransactionsPage,
  storyViewersPage,
  walkAllStories,
  walkBoosts,
  walkChatEvents,
  walkDialogs,
  walkForumTopics,
  walkGlobalSearch,
  walkHashtagSearch,
  walkHistory,
  walkInviteLinks,
  walkInviteMembers,
  walkMembers,
  walkPostSearch,
  walkProfilePhotos,
  walkProfileStories,
  walkReactions,
  walkSavedGifts,
  walkSavedMusic,
  walkSearch,
  walkStarsTransactions,
  walkStoryViewers,
} from './paging/walk.js'
export type {
  BoostChance,
  BusinessIntro,
  LinkMessage,
  OpenHours,
  WorkHours,
} from './premium/premium.js'
export type { NewPassword, PasswordStatus, Securing } from './security/index.js'
export {
  cancelRecoveryEmail,
  checkRecoveryCode,
  confirmRecoveryEmail,
  passwordStatus,
  removePassword,
  requestPasswordRecovery,
  resendRecoveryEmail,
  setPassword,
} from './security/index.js'
export type { PortableSession } from './session.js'
export { areaFor, StorageOwnershipError } from './storage/ownership.js'
export type { PeerKind, PeerRecord, PeerStore } from './storage/peers.js'
export type {
  NewStory,
  StoryAllowance,
  StoryCaption,
  StoryEdit,
  StoryReaction,
} from './stories/stories.js'
export type { TlValue } from './tl/index.js'
export type {
  BlockedPeer,
  FullProfile,
  ImportOutcome,
  NewContact,
  PhoneContact,
  ProfileEdit,
  Profiling,
} from './users/profile.js'
export {
  addContact,
  block,
  commonChats,
  deleteContacts,
  deleteProfilePhotos,
  editProfile,
  findByPhone,
  importContacts,
  knows,
  messageTtl,
  myUsername,
  peerSettings,
  profilePhoto,
  readBlocked,
  readContacts,
  readProfile,
  readUsers,
  resolveMany,
  savedMusic,
  saveMusic,
  setBirthday,
  setCloseFriends,
  setContactNote,
  setEmojiStatus,
  setMessageTtl,
  setOnline,
  setProfilePhoto,
  setUsername,
  unblock,
  whoAmI,
} from './users/profile.js'

/** Package name, used by diagnostics and error messages. */
export const PACKAGE_NAME = '@yuigram/mtproto'
