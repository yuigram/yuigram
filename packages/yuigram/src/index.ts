/**
 * Yuigram — an independent TypeScript framework for the Telegram Bot API
 * and MTProto.
 *
 * This package is the façade users install. It re-exports the public surface
 * and contains almost no logic of its own: one import path, one thing to learn,
 * and no decision to make about which internal package a symbol lives in.
 *
 * ```ts
 * import { Bot } from 'yuigram'
 *
 * const bot = Bot.fromToken(process.env.BOT_TOKEN!)
 *
 * bot.onCommand('start', (message) => message.reply('Hello.'))
 *
 * await bot.poll()
 * ```
 *
 * **What is here today:** the Bot API subsystem, complete — clients, polling,
 * webhooks, routing, sessions, storage, files, errors and the testing harness.
 * The MTProto subsystem's account client. And `App`, which holds several
 * clients of either kind at once:
 *
 * ```ts
 * import { App, Account, Bot } from 'yuigram'
 *
 * const app = new App()
 *
 * app.add(Bot.fromToken(process.env.BOT_TOKEN!))
 * app.add(new Account({ name: 'me', ...credentials }))
 *
 * await app.start()
 * ```
 *
 * Neither subsystem imports the other — they meet here, and nowhere else.
 *
 * There is no single `Context` type to name, because registration decides what
 * a handler receives: `onCommand` hands you a message whose `text` is a
 * `string`, `onMessage` one whose `text` may be absent, and `on('poll_answer')`
 * something with neither. `Context` here is core's transport-agnostic base,
 * which is what generic middleware is written against.
 *
 * Extensions ride on a type parameter rather than a globally merged interface,
 * so an application names what plugins add, once:
 *
 * ```ts
 * const bot = Bot.fromToken<SessionFlavor<Cart>>(token)
 * ```
 *
 * Two bots in one program can then hold different state, which a merged
 * interface cannot express.
 *
 * **What is not:** the high-level MTProto surface — messages, chats, channels,
 * dialogs — which is demand-driven rather than stubbed; see `docs/roadmap.md`.
 * Nothing exported here is a placeholder.
 */

import { TL_LAYER } from '@yuigram/mtproto'

export * from '@yuigram/bot-api'
/**
 * The scheduler this façade exposes is the Bot API one.
 *
 * Both packages carry a `createScheduler`: the core package's is generic over
 * whatever a caller wants ordered, and the Bot API's supplies the chat as that
 * key. A bot reaching for one wants the second, so the ambiguity is resolved
 * here rather than left to whichever export happens to win.
 */
export { createScheduler } from '@yuigram/bot-api'
export * from '@yuigram/core'
/**
 * The MTProto subsystem, named rather than starred.
 *
 * The other two are re-exported wholesale because everything they publish is
 * meant for a user. This one is listed because two of its exports are not:
 * `PACKAGE_NAME` is a diagnostic that means nothing from here, and its
 * `NormalizedUpdate` shares a name with the Bot API's while describing a
 * different shape — starring both would leave neither reachable, silently. A
 * caller reads those fields off {@link MtprotoContext}, which is what a handler
 * is actually given.
 */
export {
  Account,
  type AccountContext,
  type AccountOptions,
  type AddOptions,
  type AdminRights,
  type AlbumItem,
  type AlbumOptions,
  type AllStoriesFilter,
  type AllStoriesOptions,
  type AllStoriesPage,
  addContact,
  allStoriesPage,
  answerCallback,
  answerInlineQuery,
  answerPrecheckout,
  answerShipping,
  areaFor,
  type BoostChance,
  type BoostFilter,
  type BoostPage,
  type BoostWalkOptions,
  type BoundApi,
  type BusinessIntro,
  block,
  boostsPage,
  type CallbackAnswer,
  type ChatEventFilter,
  type ChatEventOptions,
  type ChatEventPage,
  ChatEventView,
  type ChatForm,
  type ChatKind,
  type ChatlistPreview,
  type Chatting,
  ChatView,
  type CopyOptions,
  CursorError,
  cancelRecoveryEmail,
  chatEventsPage,
  checkRecoveryCode,
  commonChats,
  confirmRecoveryEmail,
  type DialogFilter,
  type DialogForm,
  type DialogOptions,
  type DialogPage,
  type DialogsOffset,
  DialogView,
  type Discussion,
  type DownloadMode,
  type DownloadOutcome,
  type DownloadRequest,
  type DownloadSink,
  decideJoinRequest,
  deleteContacts,
  deleteMessages,
  deleteProfilePhotos,
  dialogsPage,
  documentFile,
  documentMedia,
  type EditOptions,
  editMessage,
  editProfile,
  FileIdError,
  type FileIdentity,
  type FileKind,
  type FileWhere,
  type Folder,
  type FolderQuery,
  type FormattedText,
  type ForumSettings,
  ForumTopicView,
  type ForwardOptions,
  type FullChat,
  type FullProfile,
  fileFor,
  fileIdOfDocument,
  fileIdOfPhoto,
  findByPhone,
  forumTopicsPage,
  forwardMessages,
  fromHtml,
  fromMarkdown,
  type GiftFilter,
  type GiftNote,
  type GiftOffer,
  type GiftPage,
  type GiftRef,
  type GiftVerdict,
  type GiftWalkOptions,
  type GlobalSearchFilter,
  type GlobalSearchOptions,
  getMessages,
  type HistoryFilter,
  type HistoryOptions,
  type HistoryRemoval,
  hashtagPage,
  historyPage,
  type ImporterFilter,
  type ImporterWalkOptions,
  type ImportOutcome,
  type InlineAnswer,
  type InviteFilter,
  InviteImporterView,
  type InviteLinkEdit,
  type InviteLinkPage,
  InviteLinkView,
  type InviteMemberPage,
  type InvitePreview,
  type InviteWalkOptions,
  importContacts,
  inputChannel,
  inputPeerFromMessage,
  inviteLinksPage,
  inviteMembersPage,
  knows,
  type LinkMessage,
  type LoginTokenState,
  locationOf,
  looksLikeFileId,
  type Markup,
  type MediaKind,
  MediaView,
  type MemberFilter,
  type MemberOptions,
  type MemberPage,
  type MemberStanding,
  MemberView,
  type MessageBody,
  type MessageForm,
  type MessagePage,
  MessageView,
  type MtprotoApi,
  type MtprotoContext,
  type MtprotoEventKind,
  type MusicPage,
  membersPage,
  messageTtl,
  myUsername,
  type NewChat,
  type NewContact,
  type NewFolder,
  type NewGift,
  type NewInviteLink,
  type NewPassword,
  type NewStory,
  type NewTopic,
  type NotAdded,
  nextDialogs,
  type OpenHours,
  type PageOf,
  type PageOptions,
  type PageTotal,
  type Paging,
  type PasswordStatus,
  type PeerBearing,
  type PeeredPage,
  PeerIndex,
  type PeerKind,
  type PeerRecord,
  type PeerRef,
  type PeerStore,
  PeerStoriesView,
  type PeerView,
  type PhoneContact,
  type PhotoPage,
  type PhotoSource,
  type PhotoThumbnail,
  type PostPage,
  type PostSearchFilter,
  type PostSearchOptions,
  type ProfileEdit,
  type ProfileStoriesPage,
  type Profiling,
  passwordStatus,
  peerSettings,
  photoFile,
  photoMedia,
  pinMessage,
  postSearchPage,
  profilePhoto,
  profilePhotosPage,
  profileStoriesPage,
  type Quote,
  quoteOf,
  type ReactionFilter,
  type ReactionIdentity,
  type ReactionInput,
  type ReactionKind,
  type ReactionPage,
  ReactionView,
  type ReactionWalkOptions,
  type ResalePage,
  type ResaleQuery,
  type Restrictions,
  react,
  reactionsPage,
  readBlocked,
  readChat,
  readContacts,
  readDialog,
  readFileId,
  readForumTopic,
  readHistory,
  readMedia,
  readMember,
  readMessage,
  readPeers,
  readProfile,
  readReaction,
  readStory,
  readUser,
  readUsers,
  removePassword,
  requestPasswordRecovery,
  resendRecoveryEmail,
  resolveMany,
  type SearchFilter,
  type SearchOptions,
  type Securing,
  type Sending,
  type SendOptions,
  type SentMessage,
  type SentScheduled,
  type ShippingAnswer,
  type SignInState,
  type SimilarChannelsPage,
  type StarsFilter,
  type StarsPage,
  type StarsPrice,
  type StarsWalkOptions,
  StorageOwnershipError,
  type StoryAllowance,
  type StoryCaption,
  type StoryEdit,
  type StoryFilter,
  type StoryForm,
  type StoryReaction,
  StoryView,
  type StoryViewerPage,
  StoryViewerView,
  type StoryWalkOptions,
  sameMessage,
  sameTopic,
  savedGiftsPage,
  savedMusic,
  savedMusicPage,
  saveMusic,
  searchGlobalPage,
  searchPage,
  sendMedia,
  sendText,
  sentMessage,
  setBirthday,
  setCloseFriends,
  setContactNote,
  setEmojiStatus,
  setMessageTtl,
  setOnline,
  setPassword,
  setProfilePhoto,
  setTyping,
  setUsername,
  similarChannelsPage,
  starsTransactionsPage,
  storyViewersPage,
  type TlValue,
  type TopicEdit,
  type TopicFilter,
  type TopicIcon,
  type TopicPage,
  type TopicRef,
  type TopicWalkOptions,
  type TotalPrecision,
  thumbnail,
  thumbnailFile,
  thumbnails,
  toHtml,
  toMarkdown,
  type UpgradeOptions,
  type UploadedDocumentOptions,
  type UploadedFile,
  type UploadRequest,
  type UploadSource,
  UserView,
  unblock,
  uniqueFileId,
  uploadedDocument,
  uploadedPhoto,
  type ViewerFilter,
  type ViewerKind,
  type ViewerWalkOptions,
  type WalkOptions,
  type WorkHours,
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
  webLocationOf,
  whoAmI,
  writeFileId,
} from '@yuigram/mtproto'

/**
 * Schema versions this build was generated against.
 *
 * Exposed because a bot that hits a method Telegram added after this build was
 * cut needs to know which version it is talking to, and `call()` is how it
 * reaches the method meanwhile.
 */
export const schemaInfo = {
  /** Telegram Bot API version the generated surface was emitted from. */
  botApi: '10.2',
  /** Telegram TL schema layer the generated MTProto surface was emitted from. */
  tlLayer: TL_LAYER,
} as const
