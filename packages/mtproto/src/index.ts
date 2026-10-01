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
  type SessionImportOptions,
} from './account.js'
export type { MtprotoApi } from './api.js'
export { type ServerRsaKey, serverRsaKey } from './auth/keys.js'
export { serverKeysFromPem } from './auth/pem.js'
export type {
  BotInfo,
  BotInfoTarget,
  ButtonAnswer,
  CommandInfo,
  CommandScope,
  CommandsTarget,
  MenuButtonSetting,
  PreparedMessage,
  PreparedTarget,
  WebView,
  WebViewRequest,
  WebViewSource,
} from './bots/config.js'
export type { GameScore, Gaming, ScoreOptions } from './bots/games.js'
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
export type {
  Communing,
  CommunityLinkRequestView,
  CommunityPeerView,
  LinkRequestAction,
  LinkRequestsPage,
  NewCommunity,
  ParticipantChats,
} from './communities/communities.js'
export {
  type CallEndReason,
  readAction,
  type ServiceAction,
  type ServiceActionKind,
  type ServiceActionOf,
  type SharedPeer,
} from './entities/action.js'
export {
  ChatEventView,
  ForumTopicView,
  InviteImporterView,
  InviteLinkView,
  readForumTopic,
} from './entities/chat.js'
export { type DialogForm, DialogView, readDialog } from './entities/dialog.js'
export { type MediaKind, MediaView, readMedia } from './entities/media.js'
export {
  type GameDetails,
  type LocationDetails,
  type PollAnswerDetails,
  type PollDetails,
  readGame,
  readLocation,
  readPoll,
  readSticker,
  readTodo,
  readWebPage,
  type StickerDetails,
  type TodoDetails,
  type TodoItemDetails,
  type WebPageDetails,
} from './entities/media-details.js'
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
  type UserPresence,
  UserView,
} from './entities/peer.js'
export {
  readStickerSet,
  type StickerItem,
  type StickerSetValue,
  StickerSetView,
} from './entities/sticker-set.js'
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
  fileIdOfThumbnail,
  inputDocumentOf,
  inputPhotoOf,
  locationOf,
  looksLikeFileId,
  mediaOf,
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
  type Thumbnail,
  type ThumbnailAvailability,
  thumbnail,
  thumbnailFile,
  thumbnails,
  uploadedDocument,
  uploadedPhoto,
} from './files/media.js'
export type { NodeReadable, StreamOptions } from './files/streams.js'
export {
  detectMimeType,
  fileNameOf,
  inferMimeType,
  isProbablyText,
  mimeTypeOfName,
} from './files/types.js'
export type { UploadedFile, UploadRequest, UploadSource } from './files/upload.js'
export {
  fromHtml,
  type HtmlParseOptions,
  type HtmlReader,
  type HtmlWriteOptions,
  toHtml,
} from './format/html.js'
export {
  fromMarkdown,
  type MarkdownParseOptions,
  type MarkdownReader,
  toMarkdown,
} from './format/markdown.js'
export { type FormattedText, joinText, type Markup, type MarkupMode } from './format/text.js'
export type {
  ForumSettings,
  NewTopic,
  TopicEdit,
  TopicIcon,
  TopicRef,
} from './forums/topics.js'
export type { DocumentedErrorPattern, DocumentedErrorText } from './generated/errors.js'
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
  EditEphemeralOptions,
  Ephemeral,
  EphemeralButtonAnswer,
  EphemeralContent,
  EphemeralMessageView,
  EphemeralTarget,
  SendEphemeralOptions,
} from './messaging/ephemeral.js'
export type { MessageEffects } from './messaging/inspect.js'
export type {
  DraftOptions,
  InlineEditOptions,
  PaidReactionOptions,
  PollState,
  RichContent,
  RichFile,
  StreamingDraft,
  TextDraft,
  TranslateOptions,
  Translation,
} from './messaging/interact.js'
export {
  CALLBACK_DATA_LIMIT,
  callbackButton,
  inlineKeyboard,
  urlButton,
} from './messaging/keyboards.js'
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
export { type BootstrapAddress, bootstrapAt } from './network/address.js'
export type { DcAddress, DcConfiguration } from './network/dc.js'
export {
  inputChannel,
  inputPeer,
  inputPeerFromMessage,
  peerOfInput,
  readPeerReference,
  toInputChannel,
  toInputUser,
} from './network/peers.js'
export type { QrOptions, QrSteps } from './network/qr.js'
export type { LoginTokenState, SignInState } from './network/signin.js'
export type { MediaDownloadOptions } from './normalize/actions.js'
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
export { normalizePhone } from './phone.js'
export type {
  BoostChance,
  BusinessIntro,
  LinkMessage,
  OpenHours,
  WorkHours,
} from './premium/premium.js'
export { type AccountFilterContext, AccountRouter } from './router.js'
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
export {
  isRpcError,
  MigrationError,
  type MigrationKind,
  RpcError,
  type RpcErrorPattern,
  type RpcErrorText,
  type RpcErrorTextOf,
} from './session/errors.js'
export type {
  BoundCalls,
  CallDefaults,
  Calling,
  CollectibleInfo,
  CollectibleKind,
  Operating,
  TakeoutScope,
  TakeoutSession,
} from './session/operations.js'
export type { PortableSession } from './session.js'
export {
  readSession,
  type SessionAddress,
  type SessionFormat,
  type TransferredSession,
  writeSession,
} from './session.js'
export type {
  MaskPoint,
  MySetsPage,
  NewSticker,
  NewStickerSet,
  StickerRef,
  StickerSetContents,
  StickerSetKind,
  StickerSetRef,
} from './stickers/stickers.js'
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
