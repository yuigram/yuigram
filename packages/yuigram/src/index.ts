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
  type AllStoriesOptions,
  addContact,
  answerCallback,
  answerInlineQuery,
  answerPrecheckout,
  answerShipping,
  areaFor,
  type BoostWalkOptions,
  type BoundApi,
  block,
  type CallbackAnswer,
  type ChatEventOptions,
  ChatEventView,
  type ChatForm,
  type ChatKind,
  type ChatlistPreview,
  type Chatting,
  ChatView,
  cancelRecoveryEmail,
  checkRecoveryCode,
  commonChats,
  confirmRecoveryEmail,
  type DialogForm,
  type DialogsOffset,
  DialogView,
  type DownloadMode,
  type DownloadOutcome,
  type DownloadRequest,
  type DownloadSink,
  decideJoinRequest,
  deleteContacts,
  deleteMessages,
  deleteProfilePhotos,
  documentFile,
  documentMedia,
  type EditOptions,
  editMessage,
  editProfile,
  type Folder,
  type FolderQuery,
  type FormattedText,
  ForumTopicView,
  type ForwardOptions,
  type FullChat,
  type FullProfile,
  findByPhone,
  forwardMessages,
  fromHtml,
  fromMarkdown,
  type GiftWalkOptions,
  getMessages,
  type HistoryRemoval,
  type ImporterWalkOptions,
  type ImportOutcome,
  type InlineAnswer,
  InviteImporterView,
  type InviteLinkEdit,
  InviteLinkView,
  type InvitePreview,
  type InviteWalkOptions,
  importContacts,
  inputChannel,
  inputPeerFromMessage,
  knows,
  type LoginTokenState,
  type Markup,
  type MediaKind,
  MediaView,
  type MemberOptions,
  type MemberStanding,
  MemberView,
  type MessageBody,
  type MessageForm,
  MessageView,
  type MtprotoApi,
  type MtprotoContext,
  type MtprotoEventKind,
  messageTtl,
  myUsername,
  type NewChat,
  type NewContact,
  type NewFolder,
  type NewInviteLink,
  type NewPassword,
  type NotAdded,
  nextDialogs,
  type Paging,
  type PasswordStatus,
  type PeerBearing,
  PeerIndex,
  type PeerKind,
  type PeerRecord,
  type PeerRef,
  type PeerStore,
  PeerStoriesView,
  type PeerView,
  type PhoneContact,
  type PhotoThumbnail,
  type ProfileEdit,
  type Profiling,
  passwordStatus,
  peerSettings,
  photoFile,
  photoMedia,
  pinMessage,
  profilePhoto,
  type ReactionIdentity,
  type ReactionInput,
  type ReactionKind,
  ReactionView,
  type ReactionWalkOptions,
  type Restrictions,
  react,
  readBlocked,
  readChat,
  readContacts,
  readDialog,
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
  type SearchOptions,
  type Securing,
  type Sending,
  type SendOptions,
  type SentMessage,
  type ShippingAnswer,
  type SignInState,
  type StarsWalkOptions,
  StorageOwnershipError,
  type StoryForm,
  StoryView,
  StoryViewerView,
  type StoryWalkOptions,
  sameMessage,
  savedMusic,
  saveMusic,
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
  type TlValue,
  type TopicWalkOptions,
  thumbnail,
  thumbnailFile,
  thumbnails,
  toHtml,
  toMarkdown,
  type UploadedDocumentOptions,
  type UploadedFile,
  type UploadRequest,
  type UploadSource,
  UserView,
  unblock,
  uploadedDocument,
  uploadedPhoto,
  type ViewerKind,
  type ViewerWalkOptions,
  type WalkOptions,
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
  walkProfilePhotos,
  walkProfileStories,
  walkReactions,
  walkSavedGifts,
  walkSearch,
  walkStarsTransactions,
  walkStoryViewers,
  whoAmI,
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
