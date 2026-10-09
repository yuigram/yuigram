// SPDX-License-Identifier: MIT

/**
 * An account, as a caller holds one.
 *
 * The protocol subsystems underneath this are each complete and each owns
 * something: the datacenters own authorizations, the connections own channels,
 * the pools decide which connection carries what, the updates manager owns the
 * sequence, the peer store owns access hashes. None of them is a client, and
 * assembling them is what a caller would otherwise have to do.
 *
 * ```
 *   Account ─┬─ Datacenters   authorizations, addresses, migration
 *            ├─ Connections   one channel each, reopened as needed
 *            ├─ Pools         which connection a call travels on
 *            ├─ Updates       the sequence, and catching it up
 *            └─ Dispatcher    normalized events, middleware, handlers
 * ```
 *
 * **It owns the assembly and nothing else.** Every piece of protocol state
 * belongs to the subsystem that already owned it, and this holds references
 * rather than copies: there is no second key store, no second connection
 * registry, no second view of how far the update sequence has got. What is
 * genuinely new here is a name, a lifecycle, a place to register handlers, and
 * the wiring between updates arriving and handlers running.
 *
 * **Connecting and signing in are separate verbs**, because they fail
 * differently. A network that cannot be reached and a code that was mistyped
 * are not the same problem, and a session resumed from disk is already
 * authorized — so its sign-in callbacks are never reached rather than being
 * asked for values nobody needs.
 */

import type { Guard, KV } from '@yuigram/core'
import { type MtprotoApi, rawApi } from './api.js'
import type { ServerRsaKey } from './auth/keys.js'
import type {
  BotInfo,
  BotInfoTarget,
  ButtonAnswer,
  CommandInfo,
  CommandsTarget,
  Configuring,
  MenuButtonSetting,
  PreparedMessage,
  PreparedTarget,
  WebView,
  WebViewRequest,
} from './bots/config.js'
import type { GameScore, ScoreOptions } from './bots/games.js'
import type { AdminRights, Restrictions } from './chats/common.js'
import type { Folder, NewFolder } from './chats/folders.js'
import type {
  ChatlistPreview,
  InviteLinkEdit,
  InvitePreview,
  NewInviteLink,
} from './chats/invites.js'
import type { HistoryRemoval, NewChat } from './chats/lifecycle.js'
import type { FullChat } from './chats/lookup.js'
import type { AddOptions, NotAdded } from './chats/members.js'
import type { FolderQuery, PeerView } from './chats/peers.js'
import type {
  LinkRequestAction,
  LinkRequestsPage,
  NewCommunity,
  ParticipantChats,
} from './communities/communities.js'
import {
  type AfterHook,
  type BeforeHook,
  type CustomEvent,
  createCustomEvent,
  createLogger,
  type Dependencies,
  type Dispatchable,
  Dispatcher,
  type ErrorHandler,
  type EventAddress,
  type EventDefinition,
  type FilterMeta,
  file,
  type Handler,
  type HostObserver,
  isEventDefinition,
  Lifecycle,
  LifecycleError,
  type Logger,
  type Middleware,
  type MiddlewareHost,
  NetworkError,
  namespaced,
  type OnOptions,
  PeerError,
  type Plugin,
  PluginRegistry,
  SessionError,
  type StopOptions,
  TelegramError,
  type UseOptions,
  ValidationError,
} from './core.js'
import { toHex } from './crypto/encoding.js'
import { randomBytes } from './crypto/random.js'
import type {
  ChatEventView,
  ForumTopicView,
  InviteImporterView,
  InviteLinkView,
} from './entities/chat.js'
import type { DialogView } from './entities/dialog.js'
import type { MemberView } from './entities/member.js'
import type { MessageView, ReactionView } from './entities/message.js'
import type { ChatView, UserView } from './entities/peer.js'
import type { StickerSetView } from './entities/sticker-set.js'
import type { PeerStoriesView, StoryView, StoryViewerView } from './entities/story.js'
import type { DownloadOutcome, DownloadRequest, DownloadSink } from './files/download.js'
import type { NodeReadable, StreamOptions } from './files/streams.js'
import type { UploadedFile, UploadRequest } from './files/upload.js'
import type { Foruming, ForumSettings, NewTopic, TopicEdit, TopicRef } from './forums/topics.js'
import type {
  Boost,
  Photo,
  SavedStarGift,
  StarsTransaction,
  TypeBotBusinessConnection,
  TypeBusinessChatLink,
  TypeDocument,
  TypeEmojiStatus,
  TypeFactCheck,
  TypeInputBotInlineMessageID,
  TypeInputBotInlineResult,
  TypeInputDocument,
  TypeInputMedia,
  TypeInputPeer,
  TypeMessage,
  TypeMessageEntity,
  TypeMessageMedia,
  TypeMessageReactions,
  TypeMyBoost,
  TypePeerColor,
  TypeSavedStarGift,
  TypeSendMessageAction,
  TypeStarGift,
  TypeStoriesStealthMode,
  TypeStoryViews,
} from './generated/api/types/index.js'
import type {
  Gifting,
  GiftOffer,
  GiftRef,
  GiftVerdict,
  NewGift,
  ResalePage,
  ResaleQuery,
  StarsPrice,
  UpgradeOptions,
} from './gifts/gifts.js'
import type {
  AlbumItem,
  AlbumOptions,
  CopyOptions,
  Discussion,
  SentScheduled,
} from './messaging/compose.js'
import type {
  EditEphemeralOptions,
  EphemeralButtonAnswer,
  EphemeralMessageView,
  EphemeralTarget,
  SendEphemeralOptions,
} from './messaging/ephemeral.js'
import type { MessageEffects } from './messaging/inspect.js'
import type {
  DraftOptions,
  InlineEditOptions,
  Interacting,
  PaidReactionOptions,
  PollState,
  RichContent,
  StreamingDraft,
  TextDraft,
  TranslateOptions,
  Translation,
} from './messaging/interact.js'
import { addressMentions } from './messaging/mentions.js'
import type {
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
import {
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
import type { ConnectionState, Connections, ManagedConnection } from './network/connections.js'
import type { Datacenters, DatacentersOptions } from './network/datacenters.js'
import type { DcAddress, DcConfiguration, DcDirectory } from './network/dc.js'
import type { Callable } from './network/migration.js'
import { harvest, inputPeer, resolveUsername } from './network/peers.js'
import type { Pools } from './network/pools.js'
import type { QrOptions } from './network/qr.js'
import type { ConnectionRoute } from './network/route.js'
import type { LoginTokenState, Reach, SignInOptions, SignInState } from './network/signin.js'
import { contextFor, type MtprotoContext } from './normalize/context.js'
import {
  ACCOUNT_KINDS,
  isUpdateSource,
  type MtprotoEventKind,
  SHARED_KINDS,
  UPDATE_CONTAINERS,
} from './normalize/events.js'
import { type NormalizedUpdate, normalizeUpdate, type PeerRef } from './normalize/normalize.js'
import type { SentMessage } from './normalize/sent.js'
import type {
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
  PageOptions,
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
  ViewerFilter,
  ViewerWalkOptions,
  WalkOptions,
} from './paging/walk.js'
import {
  allStoriesPage,
  boostsPage,
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
import type { BoostChance, BusinessIntro, LinkMessage, WorkHours } from './premium/premium.js'
import {
  type AccountFilterContext,
  AccountRouter,
  type AccountRunnable,
  dispatcherOf,
  register,
} from './router.js'
import type { NewPassword, PasswordStatus, Securing } from './security/index.js'
import {
  cancelRecoveryEmail,
  checkRecoveryCode,
  confirmRecoveryEmail,
  passwordStatus,
  removePassword,
  requestPasswordRecovery,
  resendRecoveryEmail,
  setPassword,
} from './security/index.js'
import type { ClientInfo } from './session/connection.js'
import type {
  BoundCalls,
  CallDefaults,
  CollectibleInfo,
  CollectibleKind,
  TakeoutScope,
  TakeoutSession,
} from './session/operations.js'
import { withParams } from './session/operations.js'
import {
  readSession,
  type SessionFormat,
  type TransferredSession,
  writeSession,
} from './session.js'
import type {
  MySetsPage,
  NewSticker,
  NewStickerSet,
  StickerRef,
  StickerSetRef,
} from './stickers/stickers.js'
import { type AuthorizationStore, authorizationStore } from './storage/authorization.js'
import { type DatacenterStore, datacenterStore } from './storage/datacenters.js'
import { type AreaLease, areaFor, claimArea } from './storage/ownership.js'
import { type PeerStore, peerStore } from './storage/peers.js'
import { type UpdateStore, updateStore } from './storage/updates.js'
import type {
  NewStory,
  StoryAllowance,
  StoryEdit,
  Storying,
  StoryReaction,
} from './stories/stories.js'
import type { TlValue } from './tl/index.js'
import type { Updates } from './updates/manager.js'
import { UpdateState } from './updates/state.js'
import type {
  FullProfile,
  ImportOutcome,
  NewContact,
  PhoneContact,
  ProfileEdit,
} from './users/profile.js'
import {
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
  profilePhoto,
  readContacts,
  readProfile,
  readUsers,
  resolveMany,
  setBirthday,
  setCloseFriends,
  setContactNote,
  setEmojiStatus,
  setMessageTtl,
  setOnline,
  setUsername,
  unblock,
  whoAmI,
} from './users/profile.js'

/**
 * Redirections one call will follow.
 *
 * A client cannot legitimately be sent to more datacenters than there are, so a
 * chain longer than this is datacenters pointing at each other and no number of
 * further attempts resolves it.
 */
const MAX_MIGRATIONS = 5

/**
 * What to call the system this is running on.
 *
 * Telegram shows this to the person in their list of active sessions, so it
 * should say something true. Every runtime names itself differently and a
 * browser does not name itself at all, so what cannot be determined is reported
 * as not determined rather than guessed at — and nothing about the page is read
 * to fill the gap, because the server does not need it and the person did not
 * offer it.
 *
 * Read through `globalThis` and never at module scope: `process` is simply
 * absent in a browser, and naming it directly made importing this module throw
 * before anything had a chance to run.
 */
function systemVersion(): string {
  const runtime = globalThis as {
    process?: { version?: string; versions?: { bun?: string } }
    Deno?: { version?: { deno?: string } }
  }

  const bun = runtime.process?.versions?.bun
  if (bun !== undefined) return `Bun ${bun}`

  const deno = runtime.Deno?.version?.deno
  if (deno !== undefined) return `Deno ${deno}`

  const node = runtime.process?.version
  if (node !== undefined) return `Node ${node}`

  return 'web'
}

/** How the update manager's reports read in a log. */
const PROGRESS = {
  baseline: 'took the starting position from Telegram',
  continuing: 'a long catch-up continues in a further attempt',
} as const

/** What the server is told about this client when nothing else is said. */
const DEVICE: Omit<ClientInfo, 'apiId'> = {
  deviceModel: 'Yuigram',
  systemVersion: systemVersion(),
  appVersion: '0.0.0',
  systemLangCode: 'en',
  langPack: '',
  langCode: 'en',
}

/** How an account is built. */
/**
 * Where an account's link to Telegram stands, as a reader of its updates sees it.
 *
 * - `offline`: not started, stopped, or the connection carrying its updates was
 *   lost and the next attempt is waiting.
 * - `connecting`: that connection is being opened.
 * - `updating`: connected, and asking what was missed while it was not.
 * - `connected`: connected, and nothing is known to be missing.
 */
export type ConnectionStatus = 'offline' | 'connecting' | 'updating' | 'connected'

export interface AccountOptions {
  /** The application this client is registered as. */
  readonly apiId: number
  /** The secret that goes with it. */
  readonly apiHash: string
  /**
   * Where everything that must survive a restart is kept.
   *
   * One store, divided here. Authorizations, the datacenter list, peers and the
   * place this account has reached in the update stream each live under their
   * own prefix, so there is one place a caller points at and one owner for each
   * kind of state inside it.
   *
   * The place in the stream is written once per batch the account absorbs,
   * which is what makes a restart resume rather than start again. What is
   * stored is a position and nothing else: the updates themselves arrive again
   * from the difference the position is used to ask for.
   *
   * **One area per account name.** All of it lives under
   * `accounts:<name>:`, using {@link AccountOptions.name}, so accounts with
   * different names can share one store. Two with the same name — the default
   * `'account'` included — land in the same area, and the second to start is
   * refused with `StorageOwnershipError` where that can be detected: within this
   * process, within a browser origin, and across processes over a store that
   * leases areas (`@yuigram/sqlite`, `@yuigram/redis`). Over a plain directory
   * shared by two processes, only a run that starts after the other's claim is
   * written is refused; two that start together both proceed. Give each account
   * a name of its own.
   */
  readonly storage: KV<unknown>
  /**
   * Take an area a previous run left open.
   *
   * An account records that it holds its area of the store while it is running,
   * and gives that up when it stops. A run that ends without stopping — a
   * crash, a process killed — leaves the record behind. Where the guard or the
   * store covers every possible holder — a browser origin, a leasing store, an
   * in-memory one — the next run adopts it unasked. Over any other persistent
   * store the next run cannot tell it from another program running right now,
   * so it refuses, and this is how a caller that knows better says otherwise.
   *
   * It does not let one account take another's area. That is not a claim left
   * behind, it is the wrong store, and no flag here makes it the right one.
   */
  readonly takeOverStorage?: boolean
  /**
   * What holds this account's name while it owns its storage area.
   *
   * Defaults to the strongest primitive the runtime offers: the Web Locks API
   * in a browser, which excludes every page of the origin, and a registry over
   * this process everywhere else. Supplied by a caller that has something
   * better — a database advisory lock, a lock file — than the runtime knows
   * about.
   *
   * Whatever is supplied must report its reach honestly. An account decides
   * whether a claim left behind can be adopted without being asked from exactly
   * that, and a guard claiming more than it excludes turns a refusal into two
   * runs writing one area.
   *
   * A store that leases areas itself — `@yuigram/sqlite` and `@yuigram/redis`
   * do — needs nothing here: its lease covers every process that reaches the
   * same database, and the store refuses a superseded run's writes.
   */
  readonly storageGuard?: Guard
  /**
   * How long this account's lease on a store that leases areas outlives a run
   * that stopped without releasing it, in milliseconds. 30 seconds unless
   * given; renewed every third of that while the account runs.
   *
   * The time a crashed run keeps the next one waiting, and nothing more: a run
   * paused for longer — a debugger, a machine asleep — finds its writes refused
   * by the store and stops, rather than writing over its successor.
   */
  readonly storageLeaseMs?: number
  /**
   * The server keys a first key exchange may be answered with.
   *
   * Supplied rather than compiled in, and checked by fingerprint when a
   * datacenter answers. Needed only until every datacenter this client reaches
   * has an authorization stored.
   */
  readonly keys: readonly ServerRsaKey[]
  /**
   * The addresses to use until the server has published its own.
   *
   * Fetching the list needs an address and the address comes from the list, so
   * the first one is supplied. Which network an account belongs to — test or
   * production — is a property of this rather than of the account.
   */
  readonly bootstrap: DcConfiguration
  /** What this client is called in logs and in an application's lookup. */
  readonly name?: string
  /** What the server is told this client is. */
  readonly device?: Partial<Omit<ClientInfo, 'apiId'>>
  readonly log?: Logger
  /** Hide the shape of connections. Defaults to hiding them. */
  readonly obfuscated?: boolean
  /**
   * Connect through an MTProxy, made by `mtproxy()` from `yuigram/mtproxy`.
   *
   * Every connection — to this account's datacenter, to another for a file, in
   * the test environment as in production — goes to the proxy, which forwards
   * it. None falls back to a direct connection. Connections through a proxy
   * are always obfuscated, so `obfuscated: false` beside one is refused.
   */
  readonly proxy?: ConnectionRoute
  /**
   * Open the byte stream a connection travels over.
   *
   * The network, and only the network. Everything above it — the handshake, the
   * authorization, the channel, the session, the sequence — runs exactly as it
   * does against Telegram, which is what makes a test of an account a test of
   * the account rather than of something standing in for one.
   */
  readonly open?: DatacentersOptions['open']
  /**
   * Assemble a channel.
   *
   * A coarser seam than {@link AccountOptions.open}: it replaces the handshake
   * along with the socket, so it suits a case about what an account does with a
   * channel rather than about how one comes to exist.
   */
  readonly openChannel?: DatacentersOptions['openChannel']
  /** Milliseconds since the epoch. Replaced only to make a test deterministic. */
  readonly now?: () => number
  /** Randomness for nonces, session identifiers and padding. */
  readonly random?: (length: number) => Uint8Array
  /** Run something later, and return the way to cancel it. */
  readonly schedule?: (run: () => void, delayMs: number) => () => void
  /**
   * How long to wait after an album's latest part before handling it whole,
   * in milliseconds. 250 unless given.
   *
   * Telegram sends an album as separate messages sharing a group, with nothing
   * saying which is the last. So the album is handled once no further part has
   * arrived for this long — longer delays a handler, shorter risks splitting an
   * album whose parts arrive slowly. Nothing is gathered unless a handler could
   * take `mtproto:album`.
   */
  readonly albumWindow?: number
}

/** What an account is once it has connected. */
interface Network {
  readonly datacenters: Datacenters
  readonly connections: Connections
  readonly pools: Pools
  readonly updates: Updates
}

/**
 * One Telegram account.
 *
 * Satisfies the contract an application holds clients through — a name, a
 * lifecycle, and a way to be surrounded — without that contract knowing what
 * MTProto is.
 */
/**
 * The methods a delivery node may be asked.
 *
 * A node holds file ranges and an authorization negotiated with it alone. It is
 * not Telegram, and nothing about this account has any business travelling
 * there — so what may be sent is a list rather than a convention, checked here
 * instead of relying on the node to refuse what it should never have been
 * offered.
 */
const DELIVERY_METHODS: ReadonlySet<string> = new Set([
  'upload.getCdnFile',
  'upload.getCdnFileHashes',
])

/**
 * A connection to a delivery node, which will carry nothing else.
 *
 * The refusal is this client's rather than the node's. A guarantee that depends
 * on the far end declining is not one — `docs/security.md` §5.
 */
function delivery(connection: Callable): Callable {
  return {
    invoke: async (query: TlValue) => {
      if (!DELIVERY_METHODS.has(query._)) {
        throw new ValidationError(`a delivery node may not be asked '${query._}'`)
      }

      return await connection.invoke(query)
    },
  }
}

export class Account<Ext = unknown> {
  /** What this client is called. */
  readonly name: string

  /**
   * This account's own area of the store it was given.
   *
   * Everything an account keeps goes here rather than at the root, so two
   * accounts pointed at one store do not write to the same keys.
   *
   * Plain until this account opens and fenced afterwards. The unfenced view is
   * what a closed account reads and writes through — exporting a session, and
   * the peers it was built with — and the fenced one refuses writes the moment
   * another run takes the area over. Everything downstream reaches it through
   * {@link Account.#through}, so the swap reaches them without being passed
   * around.
   */
  #area: KV<unknown>

  /**
   * The area this run owns, for as long as it owns it.
   *
   * Absent until the account has opened, so that releasing before opening does
   * nothing rather than clearing somebody else's.
   */
  #lease: AreaLease | undefined

  /** What this run writes into the claim, distinguishing it from another. */
  #holder: string | undefined

  /** How to stop saying this account is online, while it is saying so. */
  #stopPresence: (() => void) | undefined
  /** Mini apps being kept open, each closed when the account stops. */
  readonly #held = new Set<() => void>()
  /**
   * Who to tell when Telegram says a login token was approved.
   *
   * Only a QR sign-in subscribes, and only while it is waiting. The update
   * carries nothing worth reading — it is a prompt to ask again.
   */
  readonly #loginTokenWatchers = new Set<() => void>()

  /**
   * Which user this account is, once it has found out.
   *
   * Kept in the area rather than only in memory, so a restart can answer a
   * question about local state without a call. Learned from a sign-in and from
   * {@link Account.me}, which are the two moments Telegram says who this is.
   */
  #selfId: bigint | undefined

  readonly #options: AccountOptions
  readonly #log: Logger
  readonly #dispatcher: Dispatcher<MtprotoContext & Ext>
  readonly #lifecycle: Lifecycle
  readonly #peers: PeerStore
  readonly #api: MtprotoApi = rawApi(async (query) => await this.#invoke(query))
  #state = new UpdateState()
  #updates: UpdateStore | undefined

  /** Everything that exists only while connected. */
  #network: Network | undefined
  /** The state of the connection carrying this account's updates. */
  #link: ConnectionState = 'idle'
  /** Catch-ups under way. */
  #catchingUp = 0
  #status: ConnectionStatus = 'offline'
  readonly #statusListeners = new Set<(status: ConnectionStatus) => void>()
  /** Installed by an application that holds this account. */
  #surrounding: Middleware<MtprotoContext & Ext> | undefined
  /** Plugins given to {@link Account.extend}, installed when the account starts. */
  readonly #plugins = new PluginRegistry<Account<Ext>>()
  /** One installation at a time; see {@link Account.#installPlugins}. */
  #pluginWork: Promise<unknown> = Promise.resolve()
  /** Told when this account starts and when it begins to stop. */
  readonly #observers = new Set<HostObserver>()
  /** Albums being gathered, until no further part arrives for a while. */
  readonly #albums = new Map<string, Album>()
  /**
   * A session this account was built from, until it has been written down.
   *
   * Held rather than applied because reading a session is immediate and writing
   * one is not: a caller finds out that a string is malformed where they passed
   * it, and the store learns about it on the way up, before anything reads an
   * authorization.
   */
  #importing: (TransferredSession & { readonly replace: boolean }) | undefined

  constructor(options: AccountOptions) {
    // Said where the account is made rather than on its first connection: a
    // proxy is reached obfuscated or not at all, and neither is a choice to
    // make silently on the caller's behalf.
    if (options.proxy !== undefined && options.obfuscated === false) {
      throw new ValidationError('an account that connects through a proxy is always obfuscated')
    }
    this.#options = options
    this.name = options.name ?? 'account'
    this.#log = options.log ?? createLogger()
    this.#dispatcher = new Dispatcher<MtprotoContext & Ext>({
      onUnhandled: (error, context) => {
        // Updates are dispatched off the back of the connection and nobody
        // awaits them, so with no error handler registered this is the only
        // trace a failing handler leaves.
        this.#log.error('unhandled error while dispatching an update', {
          kind: context.kind,
          error,
        })
      },
    })
    this.#area = namespaced(options.storage, areaFor(this.name))
    this.#peers = peerStore(namespaced(this.#through(), 'peers:'))
    this.#lifecycle = new Lifecycle({
      onStart: async () => {
        // Before anything is claimed, so a plugin that throws fails the start
        // with nothing to give back.
        await this.#installPlugins()
        await this.#open()
        await this.#tell('started')
      },
      // Before in-flight work is waited for: a handler suspended on a
      // conversation's next message only finishes once whatever holds it lets
      // go, and the drain would otherwise spend the whole deadline on it.
      onStopping: async () => {
        // An album still gathering is handled now, so the drain waits for it
        // rather than the stop discarding parts that already arrived.
        this.#flushAlbums()
        await this.#tell('stopping')
      },
      onStop: async () => {
        this.#stopPresence?.()
        for (const close of [...this.#held]) close()
        this.#close()
        // After the network is down, so nothing can write to the area between
        // giving up the claim and the last write landing.
        await this.#release()
      },
    })
  }

  /**
   * An account whose state lives in a directory.
   *
   * The directory holds everything that must survive a restart, which is what
   * makes a second run of the same program the same account rather than a new
   * one asking to sign in again. Named for what a caller has: a session on
   * disk, rather than an options object they have to assemble correctly.
   */
  static fromSession<Ext = unknown>(
    directory: string,
    options: Omit<AccountOptions, 'storage'>,
  ): Account<Ext> {
    // The account's own logger, so a warning that the directory is readable
    // beyond its owner lands where the rest of this account's records do. This
    // is the one place the framework knows a directory holds authorization
    // material rather than ordinary state.
    const storage = file(directory, options.log === undefined ? {} : { log: options.log })

    return new Account<Ext>({ ...options, storage })
  }

  /**
   * An account carried in a string.
   *
   * For somewhere with nowhere to write: the authorization travels as
   * configuration and the account is assembled around it. The string **is** a
   * logged-in account — see {@link Account.exportSession}.
   *
   * A store is supplied rather than made here. An account needs one to run at
   * all, not merely to survive a restart: a key with a lifetime, the peers it
   * learns and the addresses it is told are all written while it works. What a
   * caller wants when there is nowhere to write is `memory()`, said out loud,
   * rather than an account quietly holding a store nobody can see.
   *
   * ```ts
   * const me = Account.fromString(process.env.SESSION!, {
   *   apiId,
   *   apiHash,
   *   keys,
   *   bootstrap,
   *   storage: memory(),
   * })
   * ```
   *
   * The string is read here and now, so a malformed one fails where it was
   * passed rather than at the first connection.
   */
  static fromString<Ext = unknown>(
    session: string,
    options: AccountOptions & SessionImportOptions,
  ): Account<Ext> {
    const { format, replace, ...accountOptions } = options
    const imported = readSession(session, format === undefined ? {} : { format })

    if (imported.testMode !== options.bootstrap.testMode) {
      // Addresses for one network and a key from the other cannot be made to
      // work, and the failure they produce says nothing about why.
      throw new SessionError(
        `a session for the ${imported.testMode ? 'test' : 'production'} network cannot be used ` +
          `with addresses for the ${options.bootstrap.testMode ? 'test' : 'production'} network`,
      )
    }

    const account = new Account<Ext>({
      ...accountOptions,
      // The session names the datacenter its key belongs to, which is this
      // account's own. A bootstrap says where to start looking, not whose key
      // this is; where the session also says where that datacenter is, the
      // address is added unless the bootstrap already has one for it.
      bootstrap: {
        ...options.bootstrap,
        thisDc: imported.dcId,
        options: withSessionAddresses(options.bootstrap.options, imported),
      },
    })
    account.#importing = { ...imported, replace: replace === true }

    return account
  }

  /**
   * Write this account out as a string.
   *
   * The long-lived key for the datacenter this account belongs to, and enough
   * to place it. Nothing that is obtained again rather than carried: no key with
   * a lifetime, no salt, no peers, no update sequence, and neither of the
   * application's credentials.
   *
   * **The result is a logged-in account.** Anyone who has it is signed in as
   * this account until the authorization is revoked. It is not a configuration
   * value: it does not belong in a repository, in a bug report, or in a message
   * to somebody helping with a problem.
   *
   * Reads what has been written down rather than what is in flight, so it needs
   * no connection, changes nothing, and gives the same answer twice.
   */
  async exportSession(options: { readonly format?: SessionFormat } = {}): Promise<string> {
    const storage = this.#area
    const authorization = authorizationStore(namespaced(storage, 'auth:'))
    const configuration = await datacenterStore(namespaced(storage, 'dcs:')).load()
    const dcId = configuration?.thisDc ?? this.#options.bootstrap.thisDc

    const key = await authorization.key(dcId)
    if (key === undefined) {
      throw new SessionError(
        `the account '${this.name}' has no authorization for datacenter ${dcId} to export`,
      )
    }

    const known = [...(configuration?.options ?? []), ...this.#options.bootstrap.options].filter(
      (address) => address.id === dcId && !address.cdn,
    )
    const selfId = await readSelfId(storage)
    const selfBot = await storage.get(SELF_BOT)

    return writeSession(
      {
        dcId,
        testMode: configuration?.testMode ?? this.#options.bootstrap.testMode,
        authKey: key,
        addresses: known.map(({ id, host, port, ipv6, mediaOnly }) => ({
          id,
          host,
          port,
          ipv6,
          mediaOnly,
        })),
        // Only when both are known: the layout records whether the account is
        // a bot beside who it is, and a guess would be carried as a fact.
        ...(selfId !== undefined && typeof selfBot === 'boolean'
          ? { self: { id: selfId, isBot: selfBot } }
          : {}),
      },
      { format: options.format ?? 'portable' },
    )
  }

  /** How far through its lifecycle this account has got. */
  get state(): string {
    return this.#lifecycle.state
  }

  /** Whether this account is connected. */
  get connected(): boolean {
    return this.#network !== undefined
  }

  /** Where this account's link to Telegram stands now. */
  get connectionStatus(): ConnectionStatus {
    return this.#status
  }

  /**
   * Be told each time {@link Account.connectionStatus} changes.
   *
   * Told once per change, in the order the changes happen, and never told the
   * status it already had. A listener that throws is logged and does not stop
   * the others. Returns the way to stop listening.
   */
  onConnectionStatus(listener: (status: ConnectionStatus) => void): () => void {
    this.#statusListeners.add(listener)

    return () => {
      this.#statusListeners.delete(listener)
    }
  }

  /** Recompute the status, and tell the listeners if it changed. */
  #observeStatus(): void {
    const status = this.#statusNow()
    if (status === this.#status) return
    this.#status = status

    for (const listener of [...this.#statusListeners]) {
      try {
        listener(status)
      } catch (error) {
        this.#log.error('a connection status listener failed', { error })
      }
    }
  }

  #statusNow(): ConnectionStatus {
    if (this.#network === undefined) return 'offline'
    if (this.#link === 'connecting') return 'connecting'
    if (this.#link !== 'ready') return 'offline'

    return this.#catchingUp > 0 ? 'updating' : 'connected'
  }

  /**
   * Reach a datacenter.
   *
   * The pools decide which connection carries a call, so this is a view onto
   * them rather than a registry of its own. Throws while disconnected: a caller
   * holding a reach that silently did nothing would find out at the first
   * answer that never came.
   */
  get reach(): Reach {
    return (dcId: number) => {
      const { datacenters, pools } = this.#require()

      // A delivery node is not a datacenter an account has anything to say to.
      // It holds no authorization of this account's, it answers none of the
      // methods that would need one, and the escape hatch pointing at one would
      // be a call waiting for an address that serves ordinary traffic there —
      // which is a thing the list says does not exist.
      if (datacenters.directory.candidates({ id: dcId, purpose: 'cdn' }).length > 0) {
        throw new NetworkError(`datacenter ${dcId} is a delivery node and answers no calls`)
      }

      return pools.get({ id: dcId })
    }
  }

  /**
   * Fetch a file and hand it back whole.
   *
   * What names the file comes from whatever mentioned it — a document or a
   * photo on a message says which datacenter holds it and carries the reference
   * that names it — so this takes that location rather than deriving one, and a
   * caller reads it off the payload the event carried.
   *
   * ```ts
   * const media = event.message?._ === 'message' ? event.message.media : undefined
   * if (media?._ === 'messageMediaDocument' && media.document?._ === 'document') {
   *   const bytes = await account.download({
   *     dcId: media.document.dc_id,
   *     size: Number(media.document.size),
   *     location: {
   *       _: 'inputDocumentFileLocation',
   *       id: media.document.id,
   *       access_hash: media.document.access_hash,
   *       file_reference: media.document.file_reference,
   *       thumb_size: '',
   *     },
   *   })
   * }
   * ```
   *
   * For files small enough to hold. Anything larger belongs in
   * {@link Account.downloadTo}, which hands each range over as it arrives
   * instead of keeping the whole file in memory.
   *
   * The transfer layer is loaded here rather than imported at the top of this
   * file, for the reason the stack is: it reaches the session layer and the
   * cipher a delivery node needs, and a program that never fetches a file
   * should not evaluate either. Importing it eagerly costs a third of the
   * startup budget, which `pnpm bench` reports. A download is asynchronous and
   * needs a connection anyway, so loading it here costs the call nothing.
   */
  async download(request: DownloadRequest): Promise<Uint8Array> {
    const reach = this.#transfers(await this.#allowance(request))
    const { download } = await import('./files/download.js')

    return await download({ ...request, reach })
  }

  /**
   * Fetch a file, handing each range to a sink in the order it belongs in.
   *
   * The destination is the caller's, always. A filename that arrived from
   * Telegram is attacker-chosen — `docs/security.md` §7 — so nothing here turns
   * one into a path, and a caller writing to disk decides where.
   *
   * The sink is called with the offset each run of bytes starts at and in file
   * order, so appending to a stream needs nothing kept on the side.
   */
  async downloadTo(
    request: DownloadRequest & { readonly write: DownloadSink },
  ): Promise<DownloadOutcome> {
    const reach = this.#transfers(await this.#allowance(request))
    const { downloadTo } = await import('./files/download.js')

    return await downloadTo({ ...request, reach })
  }

  /**
   * Send a file, and hand back what names it.
   *
   * The bytes come from a source the caller owns: something that can hand over
   * a run of them, and that says its length when it has one. A source that
   * reports a length is read at whatever offsets its parts sit at, so they go
   * out together; one that does not is read in order. `api-decisions.md`
   * Decision 13 settles that shape and what it leaves to the caller.
   *
   * ```ts
   * const { file } = await account.upload({
   *   source: { size: bytes.length, read: async (at, n) => bytes.subarray(at, at + n) },
   *   name: 'report.pdf',
   * })
   *
   * await account.api.messages.sendMedia({
   *   peer,
   *   media: { _: 'inputMediaUploadedDocument', file, mime_type: 'application/pdf', attributes: [] },
   *   message: '',
   *   random_id: id,
   * })
   * ```
   *
   * Unlike a download, nothing names a datacenter: a file being sent has no
   * location yet, so it goes to the one this account belongs to. `name` is a
   * hint Telegram records against the file and never a path — nothing here
   * reads a filesystem, and a caller that wants to send something on disk opens
   * it themselves.
   *
   * Loaded on demand, for the reason a download is.
   */
  async upload(request: UploadRequest): Promise<UploadedFile> {
    const reach = this.#transfers('upload')
    const dcId = this.#require().datacenters.directory.thisDc
    const { upload } = await import('./files/upload.js')

    return await upload({
      ...request,
      dcId,
      reach,
      ...(this.#options.random === undefined ? {} : { random: this.#options.random }),
    })
  }

  /**
   * Which allowance a fetch belongs in.
   *
   * A datacenter serves a file a megabyte at a time, so a file no larger than
   * one is a single request and can never occupy more than one connection
   * however many a transfer is allowed. Those have their own smaller allowance
   * — a thumbnail is worth a connection but not eight of them — and keeping
   * them there leaves the bulk connections for the transfers that can actually
   * use several.
   *
   * A length nobody knows is not small. Such a transfer is read in order until
   * it ends, which is also one connection, but it may be any size at all and
   * two of them would fill the smaller allowance and leave nothing for the
   * traffic it exists for.
   */
  async #allowance(request: DownloadRequest): Promise<'download' | 'download-small'> {
    const { fitsOneRange } = await import('./files/geometry.js')

    return fitsOneRange(request.size) ? 'download-small' : 'download'
  }

  /**
   * How a transfer reaches a datacenter.
   *
   * Not {@link Account.reach}, which asks for the connection that carries
   * ordinary calls. A file moves in ranges asked for several at a time, and a
   * transfer sharing the connection the update stream and every RPC use would
   * put an interactive call behind a megabyte of somebody's video. The pools
   * already keep a separate set for this and already know it belongs at the
   * media address, so choosing it is all this does.
   *
   * Resolved per range rather than once, so a transfer running while the
   * account is stopped fails saying the account is not connected instead of
   * going on against connections nothing owns any more.
   */
  #transfers(purpose: 'download' | 'download-small' | 'upload'): (dcId: number) => Callable {
    this.#require()

    return (dcId: number) => {
      const { datacenters, pools } = this.#require()
      const directory = datacenters.directory

      // A node is recognised by the address list rather than by whatever
      // redirected to it. A redirection is a claim somebody else made; the flag
      // is Telegram's own statement about which machines it does not operate.
      if (directory.candidates({ id: dcId, purpose: 'cdn' }).length > 0) {
        return delivery(pools.get({ id: dcId, purpose: 'cdn' }))
      }

      if (directory.candidates({ id: dcId, purpose: 'media' }).length > 0) {
        return pools.get({ id: dcId, purpose })
      }

      // Said here rather than discovered later. A transfer told to go somewhere
      // the list does not describe has nothing to try: the connection layer
      // would keep attempting an address it does not have, and a caller would
      // wait for an answer that was never going to come.
      throw new NetworkError(`no address is known for datacenter ${dcId}`)
    }
  }

  /**
   * Call a method this build does not model.
   *
   * The escape hatch `docs/architecture.md` §7 gives both transports, so that a
   * method Telegram shipped after this build was cut is reachable rather than
   * being a reason to wait for a release. The pools decide which datacenter
   * carries it; {@link Account.reach} is for the case where the caller must.
   *
   * ```ts
   * const config = await account.api.call({ _: 'help.getConfig' })
   * ```
   */
  get api(): MtprotoApi {
    return this.#api
  }

  /** Where peers learned along the way are written down. */
  get peers(): PeerStore {
    return this.#peers
  }

  /**
   * Turn a name or a reference into something a call can carry.
   *
   * MTProto names a peer by an identifier and a hash that is per-account and
   * cannot be derived, so an account that has never met somebody cannot address
   * them. `docs/unified-model.md` §3 makes that difference explicit rather than
   * hiding it behind a signature that works on a bot and fails unpredictably
   * here: resolution is a thing a caller does, and it can fail.
   *
   * ```ts
   * const peer = await account.resolve('@someone')
   * await account.api.messages.sendMessage({ peer, message: 'hi', random_id })
   * ```
   *
   * A name is answered from what has already been harvested where possible, and
   * asked of Telegram only when nothing usable is known — so resolving a peer
   * this account has already seen costs nothing and works while disconnected.
   * The answer is harvested whole before the peer asked for is picked out of it,
   * because a name usually resolves to a peer whose answer names others.
   *
   * A reference — what an event carries as its chat or its sender — is answered
   * from the store alone.
   *
   * Raises `PeerError` when a name resolves to nothing this account can reach,
   * when a reference names a peer it has never seen, and when the peer is one it
   * only saw in passing: such a peer carries a hash that means something only
   * where it arrived, and naming it on its own is a request Telegram refuses as
   * a problem with the call rather than with the peer.
   */
  async resolve(peer: string | PeerRef): Promise<TypeInputPeer> {
    if (typeof peer !== 'string') {
      const known = await this.#peers.byId(peer.kind, peer.id)
      if (known === undefined) {
        throw new PeerError(`this account has not seen ${peer.kind} ${peer.id}`)
      }

      return inputPeer(known)
    }

    // Built here rather than passed in, so a name already harvested is answered
    // without a connection: nothing reaches the network until something asks it
    // to.
    const record = await resolveUsername({
      store: this.#peers,
      peer: { invoke: async (query) => await this.#invoke(query) },
      username: peer,
    })

    return inputPeer(record)
  }

  /**
   * Walk this account's conversations, most recent first.
   *
   * ```ts
   * for await (const dialog of account.dialogs({ limit: 50 })) {
   *   console.log(dialog.peer, dialog.unreadCount)
   * }
   * ```
   *
   * One request per page, made when the loop asks for the next item rather than
   * up front, so stopping the loop stops the fetching. An account with a long
   * list is many requests and Telegram limits accounts that make many: how fast
   * to walk stays the caller's, which is what leaving it a generator preserves.
   */
  dialogs(options?: DialogOptions): AsyncGenerator<DialogView, void, undefined> {
    return walkDialogs(this, options)
  }

  /**
   * Walk a conversation's messages, most recent first.
   *
   * ```ts
   * for await (const message of account.history('@someone', { limit: 200 })) {
   *   if (!message.isService) console.log(message.text)
   * }
   * ```
   *
   * The peer is resolved once, by the same rules as {@link Account.resolve}: a
   * name is asked of Telegram where nothing is known, and a reference has to be
   * one this account has already seen.
   */
  history(
    peer: string | PeerRef,
    options?: HistoryOptions,
  ): AsyncGenerator<MessageView, void, undefined> {
    return walkHistory(this, peer, options)
  }

  /**
   * Walk the messages in one conversation that match a search.
   *
   * ```ts
   * for await (const found of account.search(chat, 'invoice', { limit: 20 })) {
   *   console.log(found.id, found.text)
   * }
   * ```
   *
   * A filtered search returns fewer than it was asked for without that meaning
   * the end, so a short page does not stop the walk — a cursor that fails to
   * advance does.
   */
  search(
    peer: string | PeerRef,
    query: string,
    options?: SearchOptions,
  ): AsyncGenerator<MessageView, void, undefined> {
    return walkSearch(this, peer, query, options)
  }

  /**
   * Walk messages matching a search across every conversation.
   *
   * Continued differently from the others: a message number means nothing
   * across conversations, so Telegram returns a rate with each page and expects
   * it back with the last message's conversation and number.
   */
  searchGlobal(
    query: string,
    options?: GlobalSearchOptions,
  ): AsyncGenerator<MessageView, void, undefined> {
    return walkGlobalSearch(this, query, options)
  }

  /**
   * Walk the members of a channel or supergroup.
   *
   * Counted into rather than keyed, so somebody joining or leaving mid-walk
   * shifts every later position: an entry can be seen twice or missed. That is
   * what counting into a live list means, and no snapshot is claimed.
   */
  members(
    peer: string | PeerRef,
    options?: MemberOptions,
  ): AsyncGenerator<MemberView, void, undefined> {
    return walkMembers(this, peer, options)
  }

  /**
   * Walk the public posts carrying a hashtag, across every channel.
   *
   * ```ts
   * for await (const post of account.searchHashtag('telegram', { limit: 50 })) {
   *   console.log(post.chat, post.text)
   * }
   * ```
   *
   * Continued like the global search, because the results are spread the same
   * way — but a page of this one may carry no rate to continue from without
   * being the last, so the date of its last message is what continues it.
   */
  searchHashtag(
    hashtag: string,
    options?: PostSearchOptions,
  ): AsyncGenerator<MessageView, void, undefined> {
    return walkHashtagSearch(this, hashtag, options)
  }

  /**
   * Walk the topics of a forum.
   *
   * ```ts
   * for await (const topic of account.forumTopics('@forum')) {
   *   console.log(topic.id, topic.title)
   * }
   * ```
   *
   * Continued by three fields that have to agree, one of which depends on how
   * the forum is ordered — by when topics were created, or by activity. Which
   * of those applies is in the answer rather than in the request.
   */
  forumTopics(
    peer: string | PeerRef,
    options?: TopicWalkOptions,
  ): AsyncGenerator<ForumTopicView, void, undefined> {
    return walkForumTopics(this, peer, options)
  }

  /**
   * Walk a channel's administration log, newest first.
   *
   * ```ts
   * for await (const event of account.chatEvents('@channel', { limit: 100 })) {
   *   console.log(event.kind, event.userId)
   * }
   * ```
   *
   * Only somebody who can see the log may read it, which the server decides.
   */
  chatEvents(
    peer: string | PeerRef,
    options?: ChatEventOptions,
  ): AsyncGenerator<ChatEventView, void, undefined> {
    return walkChatEvents(this, peer, options)
  }

  /**
   * Walk the invite links of a conversation.
   *
   * ```ts
   * for await (const link of account.inviteLinks(chat)) {
   *   if (!link.isRevoked) console.log(link.link, link.usage)
   * }
   * ```
   *
   * An invite link is a credential: whoever holds it can join what it opens.
   * `docs/security.md` §2 says what follows about logging one.
   */
  inviteLinks(
    peer: string | PeerRef,
    options?: InviteWalkOptions,
  ): AsyncGenerator<InviteLinkView, void, undefined> {
    return walkInviteLinks(this, peer, options)
  }

  /**
   * Walk the accounts that joined a conversation through an invite link.
   *
   * ```ts
   * for await (const member of account.inviteMembers(chat, { link })) {
   *   console.log(member.userId, member.date)
   * }
   * ```
   */
  inviteMembers(
    peer: string | PeerRef,
    options?: ImporterWalkOptions,
  ): AsyncGenerator<InviteImporterView, void, undefined> {
    return walkInviteMembers(this, peer, options)
  }

  /**
   * Walk the accounts that reacted to a message.
   *
   * ```ts
   * for await (const who of account.reactions(chat, 123, { limit: 50 })) {
   *   console.log(who.peer, who.identity.emoji)
   * }
   * ```
   *
   * One entry per account per reaction, so somebody who reacted twice appears
   * twice — which is what the list is rather than a duplicate.
   */
  reactions(
    peer: string | PeerRef,
    messageId: number,
    options?: ReactionWalkOptions,
  ): AsyncGenerator<ReactionView, void, undefined> {
    return walkReactions(this, peer, messageId, options)
  }

  /**
   * Walk somebody's profile photos, newest first.
   *
   * ```ts
   * for await (const photo of account.profilePhotos('@someone')) {
   *   console.log(photo.id)
   * }
   * ```
   *
   * Counted into rather than keyed, like the member list, with the same
   * consequence: a photo added or removed mid-walk shifts every later position.
   */
  profilePhotos(
    user: string | PeerRef,
    options?: WalkOptions,
  ): AsyncGenerator<Photo, void, undefined> {
    return walkProfilePhotos(this, user, options)
  }

  /**
   * Walk the stories on somebody's profile, newest first.
   *
   * ```ts
   * for await (const story of account.profileStories('@someone')) {
   *   console.log(story.id, story.caption)
   * }
   * ```
   *
   * Pass `archived` for this account's own archive. Somebody else's is refused
   * by the server, which is where that rule belongs.
   */
  profileStories(
    peer: string | PeerRef,
    options?: StoryWalkOptions,
  ): AsyncGenerator<StoryView, void, undefined> {
    return walkProfileStories(this, peer, options)
  }

  /**
   * Walk the stories of the accounts this one follows, one account at a time.
   *
   * ```ts
   * for await (const entry of account.allStories()) {
   *   console.log(entry.peer, entry.stories.length)
   * }
   * ```
   *
   * The only walk here with no page size to ask for: the server decides how
   * much a page holds, and `limit` counts the accounts rather than the stories.
   */
  allStories(options?: AllStoriesOptions): AsyncGenerator<PeerStoriesView, void, undefined> {
    return walkAllStories(this, options)
  }

  /**
   * Walk the accounts that have seen a story.
   *
   * ```ts
   * for await (const viewer of account.storyViewers('me', 7)) {
   *   console.log(viewer.kind, viewer.peer)
   * }
   * ```
   *
   * Only the account that posted a story may read this.
   */
  storyViewers(
    peer: string | PeerRef,
    storyId: number,
    options?: ViewerWalkOptions,
  ): AsyncGenerator<StoryViewerView, void, undefined> {
    return walkStoryViewers(this, peer, storyId, options)
  }

  /**
   * Walk the boosts a channel has been given.
   *
   * ```ts
   * for await (const boost of account.boosts('@channel')) {
   *   console.log(boost.user_id, boost.expires)
   * }
   * ```
   */
  boosts(
    peer: string | PeerRef,
    options?: BoostWalkOptions,
  ): AsyncGenerator<Boost, void, undefined> {
    return walkBoosts(this, peer, options)
  }

  /**
   * Walk an account's star transactions.
   *
   * ```ts
   * for await (const entry of account.starsTransactions('me', { limit: 20 })) {
   *   console.log(entry.id, entry.stars)
   * }
   * ```
   *
   * The balance the answer also carries is one value rather than a sequence, so
   * it is read through `api.payments.getStarsTransactions` instead.
   */
  starsTransactions(
    peer: string | PeerRef,
    options?: StarsWalkOptions,
  ): AsyncGenerator<StarsTransaction, void, undefined> {
    return walkStarsTransactions(this, peer, options)
  }

  /**
   * Walk the gifts an account is keeping.
   *
   * ```ts
   * for await (const gift of account.savedGifts('me')) {
   *   console.log(gift.date)
   * }
   * ```
   */
  savedGifts(
    owner: string | PeerRef,
    options?: GiftWalkOptions,
  ): AsyncGenerator<SavedStarGift, void, undefined> {
    return walkSavedGifts(this, owner, options)
  }

  /**
   * Walk public posts matching text, across every channel.
   *
   * Telegram meters this search; a page read reports where the allowance
   * stands. See {@link Account.searchPostsPage}.
   */
  searchPosts(
    query: string,
    options?: PostSearchOptions,
  ): AsyncGenerator<MessageView, void, undefined> {
    return walkPostSearch(this, query, options)
  }

  /** Walk the music on somebody's profile. */
  savedMusicWalk(
    user: string | PeerRef,
    options?: WalkOptions,
  ): AsyncGenerator<TypeDocument, void, undefined> {
    return walkSavedMusic(this, user, options)
  }

  /**
   * One page of this account's conversations, with the total and a cursor.
   *
   * ```ts
   * const page = await account.dialogsPage({ size: 20 })
   * console.log(page.total?.count, page.items.length)
   * const more = page.next === undefined ? undefined : await account.dialogsPage({ cursor: page.next })
   * ```
   *
   * The page reads beside every walk share this shape: `items`, the `total`
   * Telegram reported (or `undefined` where it reported none), `next` (or
   * `undefined` at the end), and the `peers` the answer described. A cursor
   * continues only the list and filters that produced it.
   */
  async dialogsPage(options?: PageOptions & DialogFilter): Promise<DialogPage> {
    return await dialogsPage(this, options)
  }

  /** One page of a conversation's messages, newest or oldest first. */
  async historyPage(
    peer: string | PeerRef,
    options?: PageOptions & HistoryFilter,
  ): Promise<MessagePage> {
    return await historyPage(this, peer, options)
  }

  /** One page of a search in one conversation. */
  async searchPage(
    peer: string | PeerRef,
    query: string,
    options?: PageOptions & SearchFilter,
  ): Promise<MessagePage> {
    return await searchPage(this, peer, query, options)
  }

  /** One page of a search across every conversation. */
  async searchGlobalPage(
    query: string,
    options?: PageOptions & GlobalSearchFilter,
  ): Promise<MessagePage> {
    return await searchGlobalPage(this, query, options)
  }

  /** One page of public posts carrying a hashtag. */
  async searchHashtagPage(
    hashtag: string,
    options?: PageOptions & PostSearchFilter,
  ): Promise<PostPage> {
    return await hashtagPage(this, hashtag, options)
  }

  /** One page of public posts matching text, with the search allowance. */
  async searchPostsPage(
    query: string,
    options?: PageOptions & PostSearchFilter,
  ): Promise<PostPage> {
    return await postSearchPage(this, query, options)
  }

  /** One page of a group's, supergroup's or channel's members. */
  async membersPage(
    peer: string | PeerRef,
    options?: PageOptions & MemberFilter,
  ): Promise<MemberPage> {
    return await membersPage(this, peer, options)
  }

  /** One page of a channel's administration log. */
  async chatEventsPage(
    peer: string | PeerRef,
    options?: PageOptions & ChatEventFilter,
  ): Promise<ChatEventPage> {
    return await chatEventsPage(this, peer, options)
  }

  /** One page of a conversation's invite links. */
  async inviteLinksPage(
    peer: string | PeerRef,
    options?: PageOptions & InviteFilter,
  ): Promise<InviteLinkPage> {
    return await inviteLinksPage(this, peer, options)
  }

  /** One page of the accounts that came through invite links. */
  async inviteMembersPage(
    peer: string | PeerRef,
    options?: PageOptions & ImporterFilter,
  ): Promise<InviteMemberPage> {
    return await inviteMembersPage(this, peer, options)
  }

  /** One page of the accounts that reacted to a message. */
  async reactionsPage(
    peer: string | PeerRef,
    messageId: number,
    options?: PageOptions & ReactionFilter,
  ): Promise<ReactionPage> {
    return await reactionsPage(this, peer, messageId, options)
  }

  /** One page of somebody's profile photos. */
  async profilePhotosPage(user: string | PeerRef, options?: PageOptions): Promise<PhotoPage> {
    return await profilePhotosPage(this, user, options)
  }

  /** One page of the music on somebody's profile, with the total. */
  async savedMusicPage(user: string | PeerRef, options?: PageOptions): Promise<MusicPage> {
    return await savedMusicPage(this, user, options)
  }

  /** The channels recommended alongside one, with the count Telegram gave. */
  async similarChannelsPage(
    chat: string | PeerRef,
    options?: Pick<PageOptions, 'signal'>,
  ): Promise<SimilarChannelsPage> {
    return await similarChannelsPage(this, chat, options)
  }

  /** One page of a forum's topics, with how the forum orders them. */
  async forumTopicsPage(
    peer: string | PeerRef,
    options?: PageOptions & TopicFilter,
  ): Promise<TopicPage> {
    return await forumTopicsPage(this, peer, options)
  }

  /** One page of the stories on a profile, with which are pinned to the top. */
  async profileStoriesPage(
    peer: string | PeerRef,
    options?: PageOptions & StoryFilter,
  ): Promise<ProfileStoriesPage> {
    return await profileStoriesPage(this, peer, options)
  }

  /** One page of the stories of the accounts this one follows, with stealth mode. */
  async allStoriesPage(
    options?: Omit<PageOptions, 'size'> & AllStoriesFilter,
  ): Promise<AllStoriesPage> {
    return await allStoriesPage(this, options)
  }

  /** One page of a story's viewers, with its view, forward and reaction counts. */
  async storyViewersPage(
    peer: string | PeerRef,
    storyId: number,
    options?: PageOptions & ViewerFilter,
  ): Promise<StoryViewerPage> {
    return await storyViewersPage(this, peer, storyId, options)
  }

  /** One page of a channel's boosts. */
  async boostsPage(
    peer: string | PeerRef,
    options?: PageOptions & BoostFilter,
  ): Promise<BoostPage> {
    return await boostsPage(this, peer, options)
  }

  /** One page of star or TON transactions, with the balance. */
  async starsTransactionsPage(
    peer: string | PeerRef,
    options?: PageOptions & StarsFilter,
  ): Promise<StarsPage> {
    return await starsTransactionsPage(this, peer, options)
  }

  /** One page of the gifts an account or channel keeps. */
  async savedGiftsPage(
    owner: string | PeerRef,
    options?: PageOptions & GiftFilter,
  ): Promise<GiftPage> {
    return await savedGiftsPage(this, owner, options)
  }

  /**
   * What the operations below need from this account.
   *
   * Assembled rather than making the randomness public: it is the account's,
   * and nothing outside should be drawing from it.
   */
  get #sending(): Sending {
    return {
      api: this.#api,
      resolve: async (peer) => await this.resolve(peer),
      random: this.#options.random ?? randomBytes,
    }
  }

  /**
   * Register something for the account to undo when it stops.
   *
   * The same set the mini apps use: whatever is registered here is run once on
   * stop, and the returned function takes it back out for a caller that
   * finished first.
   */
  #holdOpen(close: () => void): () => void {
    this.#held.add(close)

    return () => {
      this.#held.delete(close)
    }
  }

  /**
   * The same, for the bot surface, whose mini apps have to be kept open.
   *
   * What is kept open is the account's: it is held in a set the account empties
   * when it stops, so a mini app never outlives the account that opened it.
   */
  get #configuring(): Configuring {
    return {
      api: this.#api,
      resolve: async (peer) => await this.resolve(peer),
      random: this.#options.random ?? randomBytes,
      schedule: this.#options.schedule ?? defaultSchedule,
      hold: (close) => {
        this.#held.add(close)

        return () => {
          this.#held.delete(close)
        }
      },
      warn: (message, error) => {
        this.#log.warn(message, { error })
      },
    }
  }

  /**
   * The same, for acting on a message that already exists.
   *
   * Those operations hand the account what their answers carried, so a vote or
   * an edit made here reaches this account's own handlers, and one of them — an
   * inline message's edit — has to be made on the datacenter the message lives
   * on rather than wherever the pools would send it.
   */
  get #interacting(): Interacting {
    return {
      api: this.#api,
      resolve: async (peer) => await this.resolve(peer),
      random: this.#options.random ?? randomBytes,
      feed: async (value) => {
        await this.feed(value)
      },
      at: async (dcId, query) => await this.#onDatacenter(dcId, query),
      ...(this.#options.now === undefined ? {} : { now: this.#options.now }),
    }
  }

  /**
   * Make a call on a particular datacenter, introducing the account there first
   * if it has never been.
   *
   * An account is signed in on one datacenter. Another one knows nothing about
   * it until the first issues a credential and the second accepts it, which is
   * what a refusal naming an unregistered key means here — so it is answered
   * once, by making the introduction, and the call is repeated. Any other
   * refusal is the call's own.
   */
  async #onDatacenter(dcId: number, query: TlValue): Promise<TlValue> {
    const { datacenters, pools } = this.#require()
    const home = datacenters.directory.thisDc

    if (dcId === home) return await this.#invoke(query)

    const there = this.reach(dcId)
    let answer: TlValue

    try {
      answer = await there.invoke(query)
    } catch (error) {
      const unknown =
        error instanceof TelegramError && error.message.startsWith('AUTH_KEY_UNREGISTERED (')
      if (!unknown) throw error

      const { transferAuthorization } = await import('./network/migration.js')
      await transferAuthorization({ from: pools.get({ id: home }), to: there, dcId })
      answer = await there.invoke(query)
    }

    await this.#learn(answer)

    return answer
  }

  /**
   * The same, for the families that both change a conversation and post into one.
   *
   * Topics, stories and gifts all need what operating on a conversation needs
   * *and* a deduplication key, because each of them sends something Telegram
   * deduplicates. Assembled here for the same reason {@link Account.#sending}
   * is: the randomness is the account's, and nothing outside should draw from
   * it.
   */
  get #posting(): Foruming & Gifting & Storying {
    return {
      api: this.#api,
      resolve: async (peer) => await this.resolve(peer),
      feed: async (value) => {
        await this.feed(value)
      },
      random: this.#options.random ?? randomBytes,
    }
  }

  /**
   * Say something in a conversation.
   *
   * ```ts
   * await account.sendText('@someone', 'hello')
   * await account.sendText(chat, fromHtml`<b>hello</b>`, { replyTo: 42 })
   * ```
   *
   * Takes formatted text as readily as plain, so writing a bold message is one
   * call rather than a string and a list of ranges kept in step by hand.
   */
  async sendText(
    peer: string | PeerRef,
    body: MessageBody,
    options?: SendOptions,
  ): Promise<SentMessage> {
    return await sendText(this.#sending, peer, body, options)
  }

  /**
   * Send something that is not only text.
   *
   * The media comes from the helpers in this package — one already on Telegram,
   * or one {@link Account.upload} put there first.
   */
  async sendMedia(
    peer: string | PeerRef,
    media: TypeInputMedia,
    body?: MessageBody,
    options?: SendOptions,
  ): Promise<SentMessage> {
    return await sendMedia(this.#sending, peer, media, body, options)
  }

  /** Change a message already sent. */
  async editMessage(
    peer: string | PeerRef,
    id: number,
    body?: MessageBody,
    options?: EditOptions,
  ): Promise<SentMessage> {
    return await editMessage(this.#sending, peer, id, body, options)
  }

  /**
   * Remove messages, for everybody unless told otherwise.
   *
   * Telegram addresses this differently for a channel than for anything else.
   * Which of the two is a property of the conversation rather than of the
   * request, so it is worked out here.
   */
  async deleteMessages(
    peer: string | PeerRef,
    ids: readonly number[],
    options?: { readonly revoke?: boolean },
  ): Promise<void> {
    await deleteMessages(this.#sending, peer, ids, options)
  }

  /** Copy messages from one conversation into another. */
  async forwardMessages(
    request: {
      readonly from: string | PeerRef
      readonly to: string | PeerRef
      readonly ids: readonly number[]
    },
    options?: ForwardOptions,
  ): Promise<void> {
    await forwardMessages(this.#sending, request, options)
  }

  /**
   * Send several media as one album.
   *
   * ```ts
   * const sent = await account.sendAlbum(chat, [
   *   { media: uploadedPhoto(first), caption: 'before' },
   *   { media: uploadedPhoto(second), caption: 'after' },
   * ])
   * ```
   *
   * Uploaded media is handed to Telegram first, one item at a time, because an
   * album cannot carry bytes; the answers come back one per item, in order.
   */
  async sendAlbum(
    peer: string | PeerRef,
    items: readonly AlbumItem[],
    options?: AlbumOptions,
  ): Promise<readonly SentMessage[]> {
    return await (await import('./messaging/compose.js')).sendAlbum(
      this.#sending,
      peer,
      items,
      options,
    )
  }

  /**
   * Hand media to Telegram without sending it, so it can be sent by reference.
   *
   * What an album needs for each uploaded item, and what sending the same
   * upload to several conversations saves repeating.
   */
  async uploadMedia(peer: string | PeerRef, media: TypeInputMedia): Promise<TypeInputMedia> {
    return await (await import('./messaging/compose.js')).uploadMedia(this.#sending, peer, media)
  }

  /**
   * Send a message again as a new message, rather than forwarding it.
   *
   * The caption can change and buttons can be added, which a forward cannot do.
   * A file reference that expired on the way is put right by reading the
   * message again, once.
   */
  async copyMessage(
    request: {
      readonly from: string | PeerRef
      readonly id: number
      readonly to: string | PeerRef
    },
    options?: CopyOptions,
  ): Promise<SentMessage> {
    return await (await import('./messaging/compose.js')).copyMessage(
      this.#sending,
      request,
      options,
    )
  }

  /** Send an album again as a new album, each item with its own caption. */
  async copyAlbum(
    request: {
      readonly from: string | PeerRef
      readonly ids: readonly number[]
      readonly to: string | PeerRef
    },
    options?: AlbumOptions,
  ): Promise<readonly SentMessage[]> {
    return await (await import('./messaging/compose.js')).copyAlbum(this.#sending, request, options)
  }

  /**
   * Find a channel post's comment section.
   *
   * Sending a comment needs only `commentOn`; this is for reading the thread,
   * whose messages are in the discussion group under {@link Discussion.thread}.
   */
  async discussion(chat: string | PeerRef, post: number): Promise<Discussion> {
    return await (await import('./messaging/compose.js')).discussionOf(this.#sending, chat, post)
  }

  /** Every message waiting to be sent in a conversation. */
  async scheduledMessages(peer: string | PeerRef): Promise<readonly MessageView[]> {
    return await (await import('./messaging/compose.js')).scheduledMessages(this.#sending, peer)
  }

  /** Scheduled messages by number, with a gap where a number names none. */
  async getScheduledMessages(
    peer: string | PeerRef,
    ids: readonly number[],
  ): Promise<readonly (MessageView | undefined)[]> {
    return await (await import('./messaging/compose.js')).getScheduledMessages(
      this.#sending,
      peer,
      ids,
    )
  }

  /** Take messages off the schedule, so they are never sent. */
  async deleteScheduledMessages(peer: string | PeerRef, ids: readonly number[]): Promise<void> {
    await (await import('./messaging/compose.js')).deleteScheduledMessages(this.#sending, peer, ids)
  }

  /** Send scheduled messages now, and say which message each became. */
  async sendScheduledMessages(
    peer: string | PeerRef,
    ids: readonly number[],
  ): Promise<readonly SentScheduled[]> {
    return await (await import('./messaging/compose.js')).sendScheduledMessages(
      this.#sending,
      peer,
      ids,
    )
  }

  /**
   * The communities this account has joined.
   *
   * A community holds conversations rather than being one; `ChatView.isCommunity`
   * is what tells the two apart once a caller has a chat in hand.
   */
  async getJoinedCommunities(): Promise<readonly ChatView[]> {
    return await (await import('./communities/communities.js')).getJoinedCommunities(this)
  }

  /** Make a community around a chat, which it starts with already linked. */
  async createCommunity(community: NewCommunity): Promise<ChatView> {
    return await (await import('./communities/communities.js')).createCommunity(this, community)
  }

  /** Show or hide a community in this account's own conversation list. */
  async toggleCommunityCollapsed(community: string | PeerRef, collapsed: boolean): Promise<void> {
    await (await import('./communities/communities.js')).toggleCommunityCollapsed(
      this,
      community,
      collapsed,
    )
  }

  /** The chats asking to be listed in a community, a page at a time. */
  async getCommunityLinkRequests(
    community: string | PeerRef,
    options?: { readonly from?: string; readonly limit?: number },
  ): Promise<LinkRequestsPage> {
    return await (await import('./communities/communities.js')).getCommunityLinkRequests(
      this,
      community,
      options,
    )
  }

  /** Which of a community's chats a participant has created or joined. */
  async getCommunityParticipantChats(
    community: string | PeerRef,
    participant: string | PeerRef,
  ): Promise<ParticipantChats> {
    return await (await import('./communities/communities.js')).getCommunityParticipantChats(
      this,
      community,
      participant,
    )
  }

  /** List a chat in a community, or change whether the community shows it. */
  async linkCommunityPeer(
    community: string | PeerRef,
    peer: string | PeerRef,
    options?: { readonly hidden?: boolean },
  ): Promise<void> {
    await (await import('./communities/communities.js')).linkCommunityPeer(
      this,
      community,
      peer,
      options,
    )
  }

  /** Take a chat out of a community. */
  async unlinkCommunityPeer(community: string | PeerRef, peer: string | PeerRef): Promise<void> {
    await (await import('./communities/communities.js')).unlinkCommunityPeer(this, community, peer)
  }

  /** Accept or turn down one chat's request to be listed in a community. */
  async hideCommunityLinkRequest(
    community: string | PeerRef,
    peer: string | PeerRef,
    action: LinkRequestAction,
  ): Promise<void> {
    await (await import('./communities/communities.js')).hideCommunityLinkRequest(
      this,
      community,
      peer,
      action,
    )
  }

  /** Answer every pending request to be listed in a community, the same way. */
  async hideAllCommunityLinkRequests(
    community: string | PeerRef,
    action: LinkRequestAction,
  ): Promise<void> {
    await (await import('./communities/communities.js')).hideAllCommunityLinkRequests(
      this,
      community,
      action,
    )
  }

  /** Ban somebody from a community. */
  async banCommunityParticipant(
    community: string | PeerRef,
    participant: string | PeerRef,
  ): Promise<void> {
    await (await import('./communities/communities.js')).banCommunityParticipant(
      this,
      community,
      participant,
    )
  }

  /** Let somebody back into a community. */
  async unbanCommunityParticipant(
    community: string | PeerRef,
    participant: string | PeerRef,
  ): Promise<void> {
    await (await import('./communities/communities.js')).unbanCommunityParticipant(
      this,
      community,
      participant,
    )
  }

  /**
   * Send a message only one person in a conversation can see.
   *
   * It never joins the conversation's history, so nothing here can read it
   * back. Acting on it later means naming the same chat, receiver and number —
   * which is what {@link EphemeralTarget} carries.
   */
  async sendEphemeralMessage(
    target: EphemeralTarget,
    body: MessageBody,
    options?: SendEphemeralOptions,
  ): Promise<EphemeralMessageView> {
    return await (await import('./messaging/ephemeral.js')).sendEphemeralMessage(
      this.#sending,
      target,
      body,
      options,
    )
  }

  /** Change an ephemeral message this account sent. */
  async editEphemeralMessage(
    target: EphemeralTarget,
    messageId: number,
    change: EditEphemeralOptions,
  ): Promise<EphemeralMessageView> {
    return await (await import('./messaging/ephemeral.js')).editEphemeralMessage(
      this.#sending,
      target,
      messageId,
      change,
    )
  }

  /** Take back an ephemeral message, which removes the whole of it. */
  async deleteEphemeralMessage(target: EphemeralTarget, messageId: number): Promise<void> {
    await (await import('./messaging/ephemeral.js')).deleteEphemeralMessage(
      this.#sending,
      target,
      messageId,
    )
  }

  /** Press a button on an ephemeral message, as the person shown it. */
  async getEphemeralCallbackAnswer(
    chat: string | PeerRef,
    messageId: number,
    data?: Uint8Array | string,
  ): Promise<EphemeralButtonAnswer> {
    return await (await import('./messaging/ephemeral.js')).getEphemeralCallbackAnswer(
      this.#sending,
      chat,
      messageId,
      data,
    )
  }

  /** The welcome templates a chat shows people as they arrive. */
  async getWelcomeMessages(chat: string | PeerRef): Promise<readonly EphemeralMessageView[]> {
    return await (await import('./messaging/ephemeral.js')).getWelcomeMessages(this.#sending, chat)
  }

  /** Remove one of a chat's welcome templates. */
  async deleteWelcomeMessage(chat: string | PeerRef, messageId: number): Promise<void> {
    await (await import('./messaging/ephemeral.js')).deleteWelcomeMessage(
      this.#sending,
      chat,
      messageId,
    )
  }

  /** Remove every welcome template a chat has. */
  async deleteAllWelcomeMessages(chat: string | PeerRef): Promise<void> {
    await (await import('./messaging/ephemeral.js')).deleteAllWelcomeMessages(this.#sending, chat)
  }

  /** Set a player's score in a game sent to a conversation. */
  async setGameScore(
    chat: string | PeerRef,
    messageId: number,
    user: string | PeerRef,
    score: number,
    options?: ScoreOptions,
  ): Promise<MessageView | undefined> {
    return await (await import('./bots/games.js')).setGameScore(
      this.#interacting,
      chat,
      messageId,
      user,
      score,
      options,
    )
  }

  /** Set a player's score in a game sent through inline mode. */
  async setInlineGameScore(
    message: string | TypeInputBotInlineMessageID,
    user: string | PeerRef,
    score: number,
    options?: ScoreOptions,
  ): Promise<void> {
    await (await import('./bots/games.js')).setInlineGameScore(
      this.#interacting,
      message,
      user,
      score,
      options,
    )
  }

  /** The score table of a game in a conversation, built around one player. */
  async getGameHighScores(
    chat: string | PeerRef,
    messageId: number,
    user: string | PeerRef,
  ): Promise<readonly GameScore[]> {
    return await (await import('./bots/games.js')).getGameHighScores(
      this.#interacting,
      chat,
      messageId,
      user,
    )
  }

  /** The score table of a game sent through inline mode. */
  async getInlineGameHighScores(
    message: string | TypeInputBotInlineMessageID,
    user: string | PeerRef,
  ): Promise<readonly GameScore[]> {
    return await (await import('./bots/games.js')).getInlineGameHighScores(
      this.#interacting,
      message,
      user,
    )
  }

  /**
   * Begin exporting this account's data.
   *
   * A takeout is a scope laid over this authorization rather than a second one:
   * calls made through it do not mark anything as seen. Ending it closes the
   * export and nothing else — this account stays signed in either way.
   */
  async initTakeoutSession(scope?: TakeoutScope): Promise<TakeoutSession> {
    return await (await import('./session/operations.js')).initTakeoutSession(this, scope)
  }

  /**
   * This account with call options applied unless a call overrides them.
   *
   * A view, not a copy: the connection, the session and the peer store are this
   * account's, and stopping the account stops calls made through it.
   */
  withParams(defaults: CallDefaults): BoundCalls {
    return withParams(
      { call: async (query, options) => await this.#invoke(query, options) },
      defaults,
    )
  }

  /**
   * Whether a peer is this account.
   *
   * Answered from what the account already knows wherever it can be, so the
   * common cases — `'me'`, a user reference, `inputPeerSelf` — cost nothing.
   */
  async isSelfPeer(peer: string | PeerRef): Promise<boolean> {
    return await (await import('./session/operations.js')).isSelfPeer(
      {
        api: this.#api,
        resolve: async (one) => await this.resolve(one),
        selfId: async () => this.#selfId ?? (await this.me()).id,
      },
      peer,
    )
  }

  /** What a collectible username or phone number sold for. Public information. */
  async getCollectibleInfo(kind: CollectibleKind, item: string): Promise<CollectibleInfo> {
    return await (await import('./session/operations.js')).getCollectibleInfo(this, kind, item)
  }

  /**
   * Fetch one range of a file, at exactly the offset asked for.
   *
   * The whole-file transfers plan their ranges on the grid the protocol
   * prefers, which is what makes them fast and what makes them useless for
   * reading a header at a known position. This asks for one precise range.
   * Fewer bytes than asked for means the file ended inside it.
   */
  async downloadChunk(
    request: DownloadRequest & { readonly offset: number; readonly length: number },
  ): Promise<Uint8Array> {
    const reach = this.#transfers(await this.#allowance(request))
    const { downloadChunk } = await import('./files/download.js')

    return await downloadChunk({ ...request, reach })
  }

  /**
   * Fetch a file as a `ReadableStream`.
   *
   * The same transfer {@link Account.downloadIterable} runs, wearing the shape
   * the platform expects. The stream pulls, so nothing further is fetched until
   * the consumer has taken what it was given, and cancelling it stops the
   * download rather than leaving ranges being fetched for a file nobody reads.
   */
  async downloadAsStream(
    request: DownloadRequest & StreamOptions,
  ): Promise<ReadableStream<Uint8Array>> {
    const reach = this.#transfers(await this.#allowance(request))
    const { downloadAsStream } = await import('./files/streams.js')

    return downloadAsStream({ ...request, reach })
  }

  /**
   * Fetch a file as a Node `Readable`.
   *
   * Only where the runtime has `node:stream`; elsewhere this rejects saying so.
   * Destroying the stream stops the download.
   */
  async downloadAsNodeStream(request: DownloadRequest & StreamOptions): Promise<NodeReadable> {
    const reach = this.#transfers(await this.#allowance(request))
    const { downloadAsNodeStream } = await import('./files/streams.js')

    return await downloadAsNodeStream({ ...request, reach })
  }

  /**
   * Ask for the login code again, by whatever means Telegram offers next.
   *
   * Not the same as calling {@link Account.sendCode} again, which starts a
   * fresh attempt and invalidates the hash in hand. This continues the attempt
   * already under way, which is what lets Telegram move from an in-app code to
   * an SMS. The answer may name a new hash; the caller keeps what comes back.
   */
  async resendCode(request: {
    readonly phone: string
    readonly phoneCodeHash: string
    readonly reason?: string
  }): Promise<SignInState> {
    return await this.#step(
      async (step, options) => await step.resendCode({ ...options, ...request }),
    )
  }

  /**
   * Sign in on a test datacenter, with one of Telegram's reserved numbers.
   *
   * The ordinary flow with a number whose confirmation code is known in
   * advance, which is what makes the sign-in paths testable without a real
   * number and its daily limit. Only reaches a test datacenter, because the
   * number names which one. The code is the datacenter's digit, repeated to
   * the length Telegram states when it sends it, or five times where it
   * states none; no other sign-in builds a code.
   *
   * Test accounts are public: Telegram wipes them periodically and anybody can
   * sign in to one, so nothing private belongs in a conversation held with one.
   */
  async startTest(
    options: { readonly dcId?: number; readonly phone?: string } = {},
  ): Promise<SignInState> {
    return await this.#step(
      async (step, base) =>
        await step.startTest({
          ...base,
          ...options,
          random: this.#options.random ?? randomBytes,
        }),
    )
  }

  /**
   * Sign in by showing a code to a device that is already signed in.
   *
   * The loop around {@link Account.requestLoginToken}: display, wait, ask
   * again when the token expires, and finish with the password where the
   * account has one. Resolves once the account is signed in.
   *
   * ```ts
   * await account.signInQr({ onToken: (url) => showQrCode(url) })
   * ```
   *
   * Telegram's `updateLoginToken` is used to notice an approval sooner; without
   * it the next request notices anyway. Every exit — approval, refusal, abort,
   * or the account stopping — cancels the wait and unsubscribes.
   */
  async signInQr(options: QrOptions): Promise<SignInState> {
    const { signInQr } = await import('./network/qr.js')

    // An account that stops mid-flow must not leave a sign-in waiting on a
    // token it will never ask about again, so stopping aborts the wait the same
    // way the caller's own signal would.
    const stopped = new AbortController()
    const release = this.#holdOpen(() => {
      stopped.abort(new LifecycleError(`the account '${this.name}' stopped`))
    })
    const given = options.signal
    const relay = (): void => stopped.abort(given?.reason)
    given?.addEventListener('abort', relay, { once: true })
    if (given?.aborted === true) stopped.abort(given.reason)

    try {
      return await signInQr(
        {
          requestToken: async (asked) => await this.requestLoginToken(asked),
          signInWithPassword: async (password) => await this.signInWithPassword(password),
          schedule: this.#options.schedule ?? defaultSchedule,
          onApproval: (notify) => this.#onLoginToken(notify),
        },
        { ...options, signal: stopped.signal },
      )
    } finally {
      given?.removeEventListener('abort', relay)
      release()
    }
  }

  /**
   * Be told when Telegram says a login token was approved.
   *
   * The update carries nothing worth reading — it is a prompt to ask again —
   * so this passes on the fact and no more.
   */
  #onLoginToken(notify: () => void): () => void {
    const watchers = this.#loginTokenWatchers
    watchers.add(notify)

    return () => {
      watchers.delete(notify)
    }
  }

  /** The commands a bot shows, for one scope and language. Bot accounts only. */
  async getMyCommands(target?: CommandsTarget): Promise<readonly CommandInfo[]> {
    return await (await import('./bots/config.js')).getMyCommands(this.#sending, target)
  }

  /**
   * Publish the commands a bot shows, for one scope and language. Bot accounts
   * only. An empty list is deleting them, which is {@link Account.deleteMyCommands}.
   */
  async setMyCommands(commands: readonly CommandInfo[], target?: CommandsTarget): Promise<void> {
    await (await import('./bots/config.js')).setMyCommands(this.#sending, commands, target)
  }

  /** Remove the commands for one scope and language, so the wider one applies. */
  async deleteMyCommands(target?: CommandsTarget): Promise<void> {
    await (await import('./bots/config.js')).deleteMyCommands(this.#sending, target)
  }

  /**
   * A bot's name, about text and description in one language — this account's
   * own, where it is a bot, or those of a bot it owns.
   */
  async getBotInfo(target?: BotInfoTarget): Promise<BotInfo> {
    return await (await import('./bots/config.js')).getBotInfo(this.#sending, target)
  }

  /** Change a bot's name, about text or description; only what is given is sent. */
  async setBotInfo(change: Partial<BotInfo> & BotInfoTarget): Promise<void> {
    await (await import('./bots/config.js')).setBotInfo(this.#sending, change)
  }

  /** The menu button one person sees, or everybody's where nobody is named. Bots only. */
  async getBotMenuButton(user?: string | PeerRef): Promise<MenuButtonSetting> {
    return await (await import('./bots/config.js')).getBotMenuButton(this.#sending, user)
  }

  /** Set the menu button one person sees, or everybody's. Bots only. */
  async setBotMenuButton(button: MenuButtonSetting, user?: string | PeerRef): Promise<void> {
    await (await import('./bots/config.js')).setBotMenuButton(this.#sending, button, user)
  }

  /** The rights a bot asks for when it is made an administrator. Bots only. */
  async setMyDefaultRights(target: 'group' | 'channel', rights: AdminRights): Promise<void> {
    await (await import('./bots/config.js')).setMyDefaultRights(this.#sending, target, rights)
  }

  /**
   * Press an inline button on a bot's message, as a person would, and read what
   * the bot answered. A button that asks for this account's password is answered
   * with a proof of it.
   */
  async getCallbackAnswer(
    peer: string | PeerRef,
    messageId: number,
    button: {
      readonly data?: Uint8Array | string
      readonly game?: boolean
      readonly password?: string
    },
  ): Promise<ButtonAnswer> {
    return await (await import('./bots/config.js')).getCallbackAnswer(
      this.#configuring,
      peer,
      messageId,
      button,
    )
  }

  /** Let a bot set this account's emoji status, or take the permission back. */
  async toggleEmojiStatusPermission(bot: string | PeerRef, allow: boolean): Promise<void> {
    await (await import('./bots/config.js')).toggleEmojiStatusPermission(this.#sending, bot, allow)
  }

  /** Answer a guest chat query with one result, and learn the message it became. Bots only. */
  async answerBotGuestChatQuery(
    queryId: bigint,
    result: TypeInputBotInlineResult,
  ): Promise<TypeInputBotInlineMessageID> {
    return await (await import('./bots/config.js')).answerBotGuestChatQuery(
      this.#sending,
      queryId,
      result,
    )
  }

  /** Prepare a message a mini app can ask a person to send. Bots only. */
  async prepareInlineMessage(
    user: string | PeerRef,
    result: TypeInputBotInlineResult,
    targets?: readonly PreparedTarget[],
  ): Promise<PreparedMessage> {
    return await (await import('./bots/config.js')).prepareInlineMessage(
      this.#sending,
      user,
      result,
      targets,
    )
  }

  /**
   * Open a bot's mini app.
   *
   * One opened in a conversation is kept open — prolonged every minute, as
   * Telegram requires — until it is closed, Telegram says its query is gone, or
   * this account stops.
   */
  async openWebview(request: WebViewRequest): Promise<WebView> {
    return await (await import('./bots/config.js')).openWebview(this.#configuring, request)
  }

  /** Stop keeping a mini app open. */
  closeWebview(view: WebView): void {
    view.close()
  }

  /** A sticker set and its stickers. */
  async getStickerSet(set: StickerSetRef): Promise<StickerSetView> {
    return await (await import('./stickers/stickers.js')).getStickerSet(this.#sending, set)
  }

  /** The sticker sets this account has installed. */
  async getInstalledStickers(): Promise<readonly StickerSetView[]> {
    return await (await import('./stickers/stickers.js')).getInstalledStickers(this.#sending)
  }

  /** One page of the sticker sets this account created. */
  async getMyStickerSets(options?: {
    readonly from?: bigint
    readonly limit?: number
  }): Promise<MySetsPage> {
    return await (await import('./stickers/stickers.js')).getMyStickerSets(this.#sending, options)
  }

  /** Make a sticker set, handing each sticker's file to Telegram first. */
  async createStickerSet(set: NewStickerSet): Promise<StickerSetView> {
    return await (await import('./stickers/stickers.js')).createStickerSet(this.#sending, set)
  }

  /** Add a sticker to a set this account manages. */
  async addStickerToSet(set: StickerSetRef, sticker: NewSticker): Promise<StickerSetView> {
    return await (await import('./stickers/stickers.js')).addStickerToSet(
      this.#sending,
      set,
      sticker,
    )
  }

  /** Take a sticker out of its set. */
  async deleteStickerFromSet(sticker: StickerRef): Promise<StickerSetView> {
    return await (await import('./stickers/stickers.js')).deleteStickerFromSet(
      this.#sending,
      sticker,
    )
  }

  /** Put a new sticker where an old one was, keeping its place. */
  async replaceStickerInSet(sticker: StickerRef, replacement: NewSticker): Promise<StickerSetView> {
    return await (await import('./stickers/stickers.js')).replaceStickerInSet(
      this.#sending,
      sticker,
      replacement,
    )
  }

  /** Move a sticker to a position in its set, counted from zero. */
  async moveStickerInSet(sticker: StickerRef, position: number): Promise<StickerSetView> {
    return await (await import('./stickers/stickers.js')).moveStickerInSet(
      this.#sending,
      sticker,
      position,
    )
  }

  /** Set a sticker set's thumbnail — a file, or one of its own emoji — or take it away. */
  async setStickerSetThumb(
    set: StickerSetRef,
    thumb:
      | { readonly file: TypeInputDocument | TypeInputMedia }
      | { readonly emojiId: bigint }
      | undefined,
  ): Promise<StickerSetView> {
    return await (await import('./stickers/stickers.js')).setStickerSetThumb(
      this.#sending,
      set,
      thumb,
    )
  }

  /** Choose the sticker set a supergroup offers, or remove it. */
  async setChatStickerSet(chat: string | PeerRef, set: StickerSetRef | undefined): Promise<void> {
    await (await import('./stickers/stickers.js')).setChatStickerSet(this.#sending, chat, set)
  }

  /** The documents custom emoji are drawn from, one per identifier, in order. */
  async getCustomEmojis(ids: readonly bigint[]): Promise<readonly (TypeDocument | undefined)[]> {
    return await (await import('./stickers/stickers.js')).getCustomEmojis(this.#sending, ids)
  }

  /** The custom emoji some messages use, each once, in order of first use. */
  async getCustomEmojisFromMessages(
    messages: readonly (TypeMessage | MessageView)[],
  ): Promise<readonly TypeDocument[]> {
    return await (await import('./stickers/stickers.js')).getCustomEmojisFromMessages(
      this.#sending,
      messages.map((one) => ('raw' in one ? one.raw : one)),
    )
  }

  /**
   * Vote in a poll, by the options' positions in its list or by their bytes.
   *
   * No options takes the vote back, where the poll allows it. The answer is
   * the poll as it stands afterwards.
   */
  async sendVote(
    peer: string | PeerRef,
    id: number,
    options: readonly (number | Uint8Array)[],
  ): Promise<PollState> {
    return await (await import('./messaging/interact.js')).sendVote(
      this.#interacting,
      peer,
      id,
      options,
    )
  }

  /** Close a poll so no more votes are counted, and read how it ended. */
  async closePoll(peer: string | PeerRef, id: number): Promise<PollState> {
    return await (await import('./messaging/interact.js')).closePoll(this.#interacting, peer, id)
  }

  /**
   * Pay a reaction into a message. **This spends Stars.**
   *
   * The answer is the message's reactions as they stand afterwards.
   */
  async sendPaidReaction(
    peer: string | PeerRef,
    id: number,
    count: number,
    options?: PaidReactionOptions,
  ): Promise<TypeMessageReactions> {
    return await (await import('./messaging/interact.js')).sendPaidReaction(
      this.#interacting,
      peer,
      id,
      count,
      options,
    )
  }

  /** Clear the unread-reaction badge on a conversation, or on one of its topics. */
  async readReactions(
    peer: string | PeerRef,
    options?: { readonly topicId?: number },
  ): Promise<void> {
    await (await import('./messaging/interact.js')).readReactions(this.#interacting, peer, options)
  }

  /** Unpin every pinned message in a conversation, or in one of its topics. */
  async unpinAllMessages(
    peer: string | PeerRef,
    options?: { readonly topicId?: number },
  ): Promise<void> {
    await (await import('./messaging/interact.js')).unpinAllMessages(
      this.#interacting,
      peer,
      options,
    )
  }

  /** Add items to a checklist, numbered on from its highest item. */
  async appendTodoList(
    peer: string | PeerRef,
    id: number,
    items: readonly MessageBody[],
  ): Promise<MessageView | undefined> {
    return await (await import('./messaging/interact.js')).appendTodoList(
      this.#interacting,
      peer,
      id,
      items,
    )
  }

  /** Tick checklist items off and untick others, by their numbers, in one change. */
  async toggleTodoCompleted(
    peer: string | PeerRef,
    id: number,
    change: { readonly completed?: readonly number[]; readonly incompleted?: readonly number[] },
  ): Promise<MessageView | undefined> {
    return await (await import('./messaging/interact.js')).toggleTodoCompleted(
      this.#interacting,
      peer,
      id,
      change,
    )
  }

  /** Translate messages of a conversation, one translation per message, in order. */
  async translateMessage(
    peer: string | PeerRef,
    ids: readonly number[],
    options: TranslateOptions,
  ): Promise<readonly Translation[]> {
    return await (await import('./messaging/interact.js')).translateMessage(
      this.#interacting,
      peer,
      ids,
      options,
    )
  }

  /** Translate text that is not in a conversation, one translation per text, in order. */
  async translateText(
    texts: readonly MessageBody[],
    options: TranslateOptions,
  ): Promise<readonly Translation[]> {
    return await (await import('./messaging/interact.js')).translateText(
      this.#interacting,
      texts,
      options,
    )
  }

  /**
   * Change a message a bot sent through inline mode, by the identifier the
   * chosen result arrived with — the object an update carries, or the Bot API's
   * string. The call goes to the datacenter the identifier names.
   */
  async editInlineMessage(
    message: TypeInputBotInlineMessageID | string,
    body?: MessageBody,
    options?: InlineEditOptions,
  ): Promise<void> {
    await (await import('./messaging/interact.js')).editInlineMessage(
      this.#interacting,
      message,
      body,
      options,
    )
  }

  /** Send a rich message: blocks, or markup Telegram parses, with the files it names. */
  async sendRichMessage(
    peer: string | PeerRef,
    content: RichContent,
    options?: SendOptions,
  ): Promise<SentMessage> {
    return await (await import('./messaging/interact.js')).sendRichMessage(
      this.#interacting,
      peer,
      content,
      options,
    )
  }

  /**
   * Open a draft a conversation shows while an answer is being written.
   *
   * Each `write` is one request; nothing runs in between, and `stop` takes it
   * off the screen. The message itself is still sent at the end.
   */
  async createStreamingDraft(peer: string | PeerRef, options?: DraftOptions): Promise<TextDraft> {
    return await (await import('./messaging/interact.js')).createStreamingDraft(
      this.#interacting,
      peer,
      options,
    )
  }

  /** The same, for a rich message, whose content is replaced on every update. */
  async createRichStreamingDraft(
    peer: string | PeerRef,
    options?: Omit<DraftOptions, 'mode'>,
  ): Promise<StreamingDraft<RichContent>> {
    return await (await import('./messaging/interact.js')).createRichStreamingDraft(
      this.#interacting,
      peer,
      options,
    )
  }

  /** Every message of the album one message belongs to, in the album's order. */
  async getMessageGroup(peer: string | PeerRef, id: number): Promise<readonly MessageView[]> {
    return await (await import('./messaging/inspect.js')).getMessageGroup(this.#sending, peer, id)
  }

  /** The message a message answers, wherever it is. */
  async getReplyTo(message: MessageView): Promise<MessageView | undefined> {
    return await (await import('./messaging/inspect.js')).getReplyTo(this.#sending, message)
  }

  /**
   * The message a link names: a public one by its username, a private one if
   * this account has met the channel, and a comment in the post's discussion.
   */
  async getMessageByLink(link: string): Promise<MessageView | undefined> {
    return await (await import('./messaging/inspect.js')).getMessageByLink(this.#sending, link)
  }

  /** The message a tapped button was on, asked for through the query. */
  async getCallbackQueryMessage(query: {
    readonly peer: string | PeerRef
    readonly messageId: number
    readonly queryId: bigint
  }): Promise<MessageView | undefined> {
    return await (await import('./messaging/inspect.js')).getCallbackQueryMessage(
      this.#sending,
      query,
    )
  }

  /** The reactions on several messages of one conversation, one entry per message. */
  async getMessageReactions(
    peer: string | PeerRef,
    ids: readonly number[],
  ): Promise<readonly (TypeMessageReactions | undefined)[]> {
    return await (await import('./messaging/inspect.js')).getMessageReactions(
      this.#interacting,
      peer,
      ids,
    )
  }

  /** The reactions on messages that may be in different conversations, in their order. */
  async getReactionsOf(
    messages: readonly MessageView[],
  ): Promise<readonly (TypeMessageReactions | undefined)[]> {
    return await (await import('./messaging/inspect.js')).getReactionsOf(
      this.#interacting,
      messages,
    )
  }

  /** The fact checks on several messages of one conversation, one per message. */
  async getFactCheck(
    peer: string | PeerRef,
    ids: readonly number[],
  ): Promise<readonly TypeFactCheck[]> {
    return await (await import('./messaging/inspect.js')).getFactCheck(this.#sending, peer, ids)
  }

  /** What Telegram would preview under a message with this text, if anything. */
  async getWebPagePreview(
    text: MessageBody,
  ): Promise<Extract<TypeMessageMedia, { _: 'messageMediaWebPage' }> | undefined> {
    return await (await import('./messaging/inspect.js')).getWebPagePreview(this.#sending, text)
  }

  /** The animations a send may name; nothing when the version held is current. */
  async getAvailableMessageEffects(hash?: number): Promise<MessageEffects | undefined> {
    return await (await import('./messaging/inspect.js')).getAvailableMessageEffects(
      this.#sending,
      hash,
    )
  }

  /**
   * Messages outside channels, by number alone, one entry per number.
   *
   * Outside channels a number is unique to the account, so no conversation has
   * to be named; a channel's message comes back as a gap.
   */
  async getMessagesOutsideChannels(
    ids: readonly number[],
  ): Promise<readonly (MessageView | undefined)[]> {
    return await (await import('./messaging/inspect.js')).getMessagesOutsideChannels(
      this.#sending,
      ids,
    )
  }

  /**
   * React to a message, or take a reaction back.
   *
   * ```ts
   * await account.react(chat, 42, '👍')
   * await account.react(chat, 42, undefined)
   * ```
   */
  async react(
    peer: string | PeerRef,
    id: number,
    reaction: ReactionInput,
    options?: { readonly big?: boolean },
  ): Promise<void> {
    await react(this.#sending, peer, id, reaction, options)
  }

  /** Pin a message in its conversation, or take the pin off. */
  async pinMessage(
    peer: string | PeerRef,
    id: number,
    options?: { readonly unpin?: boolean; readonly silent?: boolean; readonly bothSides?: boolean },
  ): Promise<void> {
    await pinMessage(this.#sending, peer, id, options)
  }

  /** Mark a conversation read, up to a message or up to the newest. */
  async readHistory(peer: string | PeerRef, upTo?: number): Promise<void> {
    await readHistory(this.#sending, peer, upTo)
  }

  /**
   * Show that this account is doing something in a conversation.
   *
   * Typing unless told otherwise. The indicator lapses after a few seconds, so
   * anything long-running says so again while it works.
   */
  async setTyping(
    peer: string | PeerRef,
    action?: TypeSendMessageAction,
    options?: { readonly topicId?: number },
  ): Promise<void> {
    await setTyping(this.#sending, peer, action, options)
  }

  /** Fetch messages by number, read rather than raw. */
  async getMessages(
    peer: string | PeerRef,
    ids: readonly number[],
  ): Promise<readonly MessageView[]> {
    return await getMessages(this.#sending, peer, ids)
  }

  /**
   * Answer a tapped button.
   *
   * An account signed in with a bot token receives these over this connection,
   * so this is where they are answered: a Bot API client is a different client
   * on a different connection and cannot answer a query that arrived here.
   *
   * ```ts
   * account.on('mtproto:callback_query', async (event) => {
   *   await account.answerCallback(event.raw['query_id'] as bigint, { text: 'done' })
   * })
   * ```
   */
  async answerCallback(queryId: bigint, answer?: CallbackAnswer): Promise<void> {
    await answerCallback(this.#sending, queryId, answer)
  }

  /**
   * Answer an inline query with results.
   *
   * An empty list is a valid answer meaning there is nothing to offer, which is
   * not the same as leaving the query unanswered — that leaves the person
   * waiting until it expires.
   */
  async answerInlineQuery(
    queryId: bigint,
    results: readonly TypeInputBotInlineResult[],
    answer?: InlineAnswer,
  ): Promise<void> {
    await answerInlineQuery(this.#sending, queryId, results, answer)
  }

  /**
   * Answer a request for delivery options.
   *
   * Telegram asks this only for an invoice that wanted an address. The answer
   * either offers options or says why there are none; the checkout waits on it
   * either way.
   */
  async answerShipping(queryId: bigint, answer: ShippingAnswer): Promise<void> {
    await answerShipping(this.#sending, queryId, answer)
  }

  /**
   * Approve or refuse a payment about to be taken.
   *
   * The last point at which it can be stopped. Passing a reason refuses and
   * shows it to the person; passing nothing approves and the card is charged.
   */
  async answerPrecheckout(queryId: bigint, refusal?: string): Promise<void> {
    await answerPrecheckout(this.#sending, queryId, refusal)
  }

  /**
   * Let somebody into a conversation they asked to join, or turn them down.
   *
   * A standing request rather than an expiring query, so this names the chat
   * and the person instead of an identifier. Turning somebody down leaves them
   * free to ask again.
   */
  async decideJoinRequest(
    chat: string | PeerRef,
    user: string | PeerRef,
    approved: boolean,
  ): Promise<void> {
    await decideJoinRequest(this.#sending, chat, user, approved)
  }

  // ---------------------------------------------------------------------
  // The second factor
  // ---------------------------------------------------------------------

  /**
   * What the operations below need from this account.
   *
   * The same two things sending needs, and for the same reason: the randomness
   * is the account's, and the salt padding a new password is derived with has
   * to be fresh.
   */
  get #securing(): Securing {
    return { api: this.#api, random: this.#options.random ?? randomBytes }
  }

  /**
   * What this account's second factor looks like right now.
   *
   * Says nothing secret: whether a password is set, its hint, and whether a
   * recovery address is confirmed.
   */
  async passwordStatus(): Promise<PasswordStatus> {
    return await passwordStatus(this.#securing)
  }

  /**
   * Set a password, or change the one already set.
   *
   * ```ts
   * await account.setPassword({ password: secret, hint: 'the usual' })
   * await account.setPassword({ password: next }, current)
   * ```
   *
   * The current password is required whenever one is already set. Neither it
   * nor the new one leaves this process: what goes to Telegram is a proof of
   * the old and a verifier for the new, and neither can be turned back into
   * what was typed.
   */
  async setPassword(next: NewPassword, current?: string): Promise<void> {
    await setPassword(this.#securing, next, current)
  }

  /** Take the password off the account. */
  async removePassword(current: string): Promise<void> {
    await removePassword(this.#securing, current)
  }

  /** Confirm a recovery address with the code Telegram sent to it. */
  async confirmRecoveryEmail(code: string): Promise<void> {
    await confirmRecoveryEmail(this.#securing, code)
  }

  /** Ask Telegram to send the confirmation code again. */
  async resendRecoveryEmail(): Promise<void> {
    await resendRecoveryEmail(this.#securing)
  }

  /** Give up on confirming a recovery address. */
  async cancelRecoveryEmail(): Promise<void> {
    await cancelRecoveryEmail(this.#securing)
  }

  /**
   * Ask for a recovery code, for a password that has been forgotten.
   *
   * Answers the address it went to, partly hidden.
   */
  async requestPasswordRecovery(): Promise<string> {
    return await requestPasswordRecovery(this.#securing)
  }

  /** Check a recovery code without spending it. */
  async checkRecoveryCode(code: string): Promise<boolean> {
    return await checkRecoveryCode(this.#securing, code)
  }

  // ---------------------------------------------------------------------
  // Signing in
  // ---------------------------------------------------------------------

  /**
   * Ask Telegram to send a login code to a number.
   *
   * The first step of the phone flow. What comes back names the code that was
   * sent, which the next step is refused without, and says how long to wait
   * before asking for another where the server said.
   *
   * Signing in is separate from connecting because the two fail differently: a
   * network that cannot be reached and a number Telegram will not accept are
   * not the same problem, and an account resumed from a session it was already
   * signed in with needs none of this.
   */
  async sendCode(phone: string): Promise<SignInState> {
    return await this.#step(async (step, options) => await step.sendCode({ ...options, phone }))
  }

  /**
   * Prove the code that was sent.
   *
   * Named for the half of the proof it carries, beside
   * {@link Account.signInWithPassword}, which carries the other. `phoneCodeHash`
   * is the one from {@link Account.sendCode}: it names the code, and Telegram
   * refuses a code offered without it.
   *
   * An account protected by a password is not signed in by this — the answer
   * says a password is wanted, and the password step finishes it.
   */
  async signInWithCode(request: {
    readonly phone: string
    readonly phoneCodeHash: string
    readonly code: string
  }): Promise<SignInState> {
    return await this.#step(async (step, options) => await step.signIn({ ...options, ...request }))
  }

  /** Finish a sign-in that the code alone could not, by proving the password. */
  async signInWithPassword(password: string | Uint8Array): Promise<SignInState> {
    return await this.#step(
      async (step, options) => await step.signInWithPassword({ ...options, password }),
    )
  }

  /** Sign in as a bot, which proves itself with its token in one call. */
  async signInAsBot(token: string): Promise<SignInState> {
    return await this.#step(async (step, options) => await step.signInAsBot({ ...options, token }))
  }

  /**
   * Ask for a token another device can approve.
   *
   * The second half of the flow is the other device's. What comes back is
   * either a token to display and its expiry, or — once it has been approved —
   * the signed-in account. A caller asks again to find out which, because
   * waiting for an approval that may never come is a decision about time, and
   * this layer keeps none.
   */
  async requestLoginToken(
    options: { readonly exceptIds?: readonly bigint[] } = {},
  ): Promise<LoginTokenState> {
    return await this.#step(
      async (step, base) => await step.requestLoginToken({ ...base, ...options }),
    )
  }

  /**
   * Sign in, asking only for what is actually needed.
   *
   * The steps above in one call, for the common case of driving them from a
   * prompt. An account resumed from a session it was already signed in with
   * reaches none of the callbacks: this asks Telegram first, because nothing
   * local answers that soundly — a stored flag outlives a session revoked from
   * another device, and an authorization discarded and re-obtained is a new one
   * nobody has proved anything to. `docs/mtproto.md` §8 names the signal: a
   * refusal about the account's authorization says the key exists and no
   * account is signed in against it.
   *
   * ```ts
   * await account.signIn({
   *   phone: () => ask('Phone: '),
   *   code: () => ask('Code: '),
   *   password: () => ask('Two-factor password: '),
   * })
   * ```
   *
   * A password is asked for only where the account has one. An account with no
   * password never reaches that callback, and one that has a password but was
   * given no callback is refused saying so rather than left half signed in.
   */
  async signIn(prompts: {
    phone: () => string | Promise<string>
    code: () => string | Promise<string>
    password?: () => string | Promise<string>
  }): Promise<void> {
    if (await this.#alreadySignedIn()) return

    const phone = await prompts.phone()
    const sent = await this.sendCode(phone)
    if (sent.kind !== 'code-sent') {
      throw new SessionError(`sending a code to ${phone} answered '${sent.kind}'`)
    }

    const state = await this.signInWithCode({
      phone,
      phoneCodeHash: sent.phoneCodeHash,
      code: await prompts.code(),
    })

    if (state.kind === 'authorized') return
    if (state.kind !== 'password-required') {
      // Registering a new account is a separate sequence and is not
      // implemented, so an answer that asks for one is reported rather than
      // treated as a sign-in that half worked.
      throw new SessionError(`signing in answered '${state.kind}'`)
    }

    if (prompts.password === undefined) {
      throw new SessionError('this account is protected by a password, and none was offered')
    }

    await this.signInWithPassword(await prompts.password())
  }

  /**
   * Sign out, and forget what only made sense while signed in.
   *
   * The call itself takes no arguments and has always been reachable through
   * the typed surface. What this adds is the half that is not a call: an
   * authorization revoked by the server is dead everywhere, and a store still
   * holding it describes an account that no longer exists.
   *
   * ```ts
   * await account.logOut()
   * ```
   *
   * Three kinds of state were true only because this account was signed in, and
   * all three go: the authorization at every datacenter this account could
   * reach, the place it had got to in the update stream, and the peers it had
   * learned. An access hash is issued to one account and means nothing to
   * another, and a position belongs to the stream of the account that read it —
   * so whoever signs in next would be reading somebody else's notes.
   *
   * The published address list stays. It describes Telegram rather than this
   * account, it is what the next sign-in needs before it can reach anything,
   * and nothing in it was issued to anybody.
   *
   * The call goes first. An authorization that survives a failed sign-out is
   * still an authorization, and a store cleared before the server agreed would
   * leave an account that is signed in somewhere it can no longer reach.
   *
   * Telegram may answer with a token that would let this device skip some
   * checks at a later sign-in. Nothing here keeps it: where it would live and
   * for how long are decisions about the store this has just finished clearing,
   * and `account.api.auth.logOut()` hands the answer back whole for a caller
   * that wants one.
   */
  async logOut(): Promise<void> {
    const network = this.#require()

    // Through the ordinary path, so a datacenter that redirects is followed
    // rather than reported: signing out of the datacenter this account does not
    // belong to would leave the one it does still signed in.
    await this.#invoke({ _: 'auth.logOut' })

    const datacenters = [...this.#reachable(network.datacenters.directory)]

    // Stopped before anything is removed, so nothing reaches for a key that is
    // about to be gone, and the network is down whether or not the store
    // co-operates.
    await this.stop()

    // Owned again for the removal. Stopping gave the area up, and erasing it
    // without holding it is exactly the write this account refuses from
    // anybody else — so the cleanup takes a lease of its own, and a run that
    // took the area over in the window between is refused rather than erased.
    const lease = await claimArea(this.#options.storage, {
      name: this.name,
      holder: `${String(Date.now().toString(36))}-${toHex(randomBytes(8))}`,
      ...(this.#options.storageGuard === undefined ? {} : { guard: this.#options.storageGuard }),
      ...(this.#options.storageLeaseMs === undefined
        ? {}
        : { leaseMs: this.#options.storageLeaseMs }),
    })

    try {
      const authorization = authorizationStore(namespaced(lease.storage, 'auth:'))

      for (const dcId of datacenters) await authorization.forget(dcId)
      await this.#forgetArea(lease.storage, 'updates:')
      await this.#forgetArea(lease.storage, 'peers:')
    } finally {
      await lease.release()
    }
  }

  /**
   * Every datacenter this account could hold an authorization at.
   *
   * Read from the same places the datacenter layer reads addresses from: a
   * configuration the server published if there is one, and the supplied
   * addresses otherwise. A published list names more datacenters than a
   * bootstrap does, so taking the bootstrap alone would leave keys behind at
   * exactly the datacenters this account had reached.
   */
  #reachable(directory: DcDirectory): Set<number> {
    return new Set<number>([
      directory.thisDc,
      ...directory.identifiers(),
      ...this.#options.bootstrap.options.map((address) => address.id),
    ])
  }

  /**
   * Remove one of the areas this account divides its store into.
   *
   * Bulk removal is optional in the store interface — every store this project
   * ships offers it, and one a caller wrote may not. Whether it can is asked of
   * the store this account was given rather than of its area: a namespaced view
   * always offers the method and quietly does nothing when what it wraps
   * cannot, which is the one answer nobody can act on. The removal itself goes
   * through the area, so signing this account out cannot reach another's.
   *
   * A store that cannot is reported rather than left to look as though the data
   * went. What stays behind belongs to an account that has signed out, and
   * somebody has to know it is still there.
   */
  async #forgetArea(storage: KV<unknown>, prefix: string): Promise<void> {
    if (this.#options.storage.clear === undefined) {
      this.#log.warn('this store cannot remove what the account signed out of', { area: prefix })

      return
    }

    await namespaced(storage, prefix).clear?.()
  }

  /**
   * Whether an account is already signed in against these keys.
   *
   * Asked rather than remembered. `updates.getState` is what this asks with: it
   * takes no arguments, changes nothing, and answers with the four counters
   * `docs/mtproto.md` §9.1 calls the client's own state — so a client has
   * reason to care about the answer beyond the question being asked here.
   *
   * Only the refusal that names an unregistered key means nobody is signed in.
   * Everything else is a different problem and is raised: a client that treated
   * a flood wait or an unreachable datacenter as "not signed in" would ask a
   * signed-in person for their phone number.
   */
  async #alreadySignedIn(): Promise<boolean> {
    try {
      await this.#invoke({ _: 'updates.getState' })

      return true
    } catch (error) {
      if (error instanceof TelegramError && error.message.startsWith('AUTH_KEY_UNREGISTERED (')) {
        return false
      }

      throw error
    }
  }

  /**
   * Run one sign-in step, and go where it says the account belongs.
   *
   * Each step follows a datacenter that redirects it and reports where it
   * ended, because an account lives at one datacenter and the one a client
   * reaches first is not always it. Recording that is what stops the next call
   * going back to the datacenter this one was just told to leave:
   * `docs/mtproto.md` §8 makes which datacenter an account belongs to a
   * property of the configuration, so adopting a configuration is how it is
   * said.
   *
   * The steps are loaded when one is taken, for the reason a transfer is: they
   * reach the password exchange and the session layer, and a program resuming a
   * session it is already signed in with should evaluate neither.
   */
  async #step<T extends { readonly dcId: number }>(
    run: (step: typeof import('./network/signin.js'), options: SignInOptions) => Promise<T>,
  ): Promise<T> {
    const network = this.#require()
    const module = await import('./network/signin.js')

    const state = await run(module, {
      reach: this.reach,
      dcId: network.datacenters.directory.thisDc,
      apiId: this.#options.apiId,
      apiHash: this.#options.apiHash,
    })

    await this.#belongTo(state.dcId)

    // A sign-in is the other moment Telegram says who this is, and the one that
    // happens before anything would think to ask. Read structurally: the step
    // this wraps is generic over what each returns, and only some of them
    // describe a user.
    const reached = state as { kind?: unknown; user?: { id?: unknown; bot?: unknown } }
    if (reached.kind === 'authorized' && typeof reached.user?.id === 'bigint') {
      await this.#rememberSelf(reached.user.id, reached.user.bot === true)
    }

    return state
  }

  /** Record which datacenter this account belongs to, when it has changed. */
  async #belongTo(dcId: number): Promise<void> {
    const { datacenters } = this.#require()
    const configuration = datacenters.directory.toConfiguration()
    if (configuration.thisDc === dcId) return

    await datacenters.adopt({ ...configuration, thisDc: dcId })
  }

  // ---------------------------------------------------------------------
  // People
  // ---------------------------------------------------------------------

  /**
   * Read this account's own user.
   *
   * ```ts
   * const me = await account.me()
   * console.log(me.id, me.username)
   * ```
   *
   * Works before this account has met anybody: it names itself rather than
   * resolving a peer, so nothing is looked up.
   */
  async me(): Promise<UserView> {
    const self = await whoAmI(this)
    await this.#rememberSelf(self.id)

    return self
  }

  /**
   * The username this account answers to, from what is already written down.
   *
   * ```ts
   * const name = await account.myUsername()
   * ```
   *
   * Reaches no network, which is the whole point of it: a caller deciding what
   * to render does not want a round trip. Answers nothing until this account
   * has read itself at least once — {@link Account.me} is the call that finds
   * out, and what it learns survives a restart.
   */
  async myUsername(): Promise<string | undefined> {
    return await myUsername(this.#peers, this.#selfId)
  }

  /**
   * Whether this account can name a peer without asking Telegram.
   *
   * ```ts
   * if (await account.knows('@someone')) { … }
   * ```
   *
   * The question {@link Account.resolve} does not answer: that one goes and
   * asks when it has to, so catching its failure is not the same as knowing
   * beforehand whether the operation is free.
   */
  async knows(peer: string | PeerRef): Promise<boolean> {
    return await knows(this.#peers, peer)
  }

  /**
   * Resolve several peers at once, positionally.
   *
   * ```ts
   * const [ann, bob] = await account.resolveMany(['@ann', '@bob'])
   * ```
   *
   * As long as what it was given and in the same order, with `undefined` where
   * this account cannot name one — a shorter list would shift every later entry
   * onto the wrong name. Eight travel at once, and a peer named twice is
   * resolved once.
   */
  async resolveMany(peers: readonly (string | PeerRef)[]): Promise<(TypeInputPeer | undefined)[]> {
    return await resolveMany(this, peers)
  }

  /**
   * Fetch one particular profile photo, by the identifier it carries.
   *
   * Not the newest one, which is what {@link Account.profilePhotos} starts
   * with: this names a photo referred to from somewhere else and fetches it
   * whether or not it is still current.
   */
  async profilePhoto(peer: string | PeerRef, photoId: bigint): Promise<Photo | undefined> {
    return await profilePhoto(this, peer, photoId)
  }

  /** Set or clear the private note this account keeps against a contact. */
  async setContactNote(peer: string | PeerRef, note: string | undefined): Promise<void> {
    await setContactNote(this, peer, note)
  }

  /**
   * Write down which user this account is.
   *
   * Reported rather than thrown: knowing this is a convenience, and a store
   * that would not take it must not fail the call that learned it.
   */
  async #rememberSelf(id: bigint, isBot?: boolean): Promise<void> {
    if (this.#selfId === id && isBot === undefined) return

    this.#selfId = id

    try {
      await this.#area.set(SELF, id.toString())
      // Kept beside the identifier because a session string carries both.
      if (isBot !== undefined) await this.#area.set(SELF_BOT, isBot)
    } catch (error) {
      this.#log.warn('could not write down which user this account is', { error })
    }
  }

  /**
   * Read several users at once.
   *
   * ```ts
   * const [a, b] = await account.users(['@one', '@two'])
   * ```
   *
   * Each name is resolved first, by the same rules as {@link Account.resolve},
   * and the read itself is a single call. A user Telegram declines to describe
   * is left out rather than handed over as an empty one.
   */
  async users(peers: readonly (string | PeerRef)[]): Promise<UserView[]> {
    return await readUsers(this, peers)
  }

  /**
   * Read everything Telegram will say about one user.
   *
   * ```ts
   * const full = await account.profile('@someone')
   * console.log(full.bio, full.commonChats)
   * ```
   *
   * A heavier call than {@link Account.users} and limited more tightly, so it
   * is worth making only when the extra fields are wanted.
   */
  async profile(peer: string | PeerRef): Promise<FullProfile> {
    return await readProfile(this, peer)
  }

  /**
   * Find somebody by the phone number they signed up with.
   *
   * Only works for a number this account already has, or one whose owner has
   * not hidden it. The server decides, and refuses otherwise.
   */
  async findByPhone(phone: string): Promise<UserView> {
    return await findByPhone(this, phone)
  }

  /** The conversations this account and one other person are both in. */
  async commonChats(
    peer: string | PeerRef,
    options?: { readonly limit?: number; readonly after?: bigint },
  ): Promise<ChatView[]> {
    return await commonChats(this, peer, options)
  }

  /**
   * Change this account's own name or bio.
   *
   * ```ts
   * await account.editProfile({ firstName: 'Yui', bio: 'building things' })
   * ```
   *
   * Only what is named is sent. The method reads an absent field as "leave it"
   * and an empty string as "clear it", so this does not fill in the rest.
   */
  async editProfile(edit: ProfileEdit): Promise<UserView> {
    return await editProfile(this, edit)
  }

  /** Take a username, or give up the one this account has by passing nothing. */
  async setUsername(username: string | undefined): Promise<UserView> {
    return await setUsername(this, username)
  }

  /**
   * Say once whether this account is at the keyboard.
   *
   * One call. Telegram treats an account that stops saying as offline after a
   * few minutes, so a program that wants to *stay* online repeats it —
   * {@link Account.stayOnline} is the managed form that does the repeating.
   */
  async setOnline(online: boolean): Promise<void> {
    await setOnline(this, online)
  }

  /**
   * Keep saying this account is at the keyboard until told to stop.
   *
   * ```ts
   * const stop = account.stayOnline()
   * …
   * stop()
   * ```
   *
   * Telegram forgets within a few minutes, so appearing online is a repeated
   * statement rather than a state. The interval is inside the protocol's own
   * margin: four minutes against the five Telegram allows.
   *
   * The timer is the account's, so stopping the account stops it. Calling this
   * twice replaces the first — an account has one presence, and two timers
   * would double the calls to say the same thing.
   *
   * A refused call is logged and the next one happens on schedule. Presence is
   * worth nothing and must not take an account down.
   */
  stayOnline(): () => void {
    this.#stopPresence?.()

    const later = this.#options.schedule ?? defaultSchedule
    let cancel: (() => void) | undefined

    const repeat = (): void => {
      this.#lifecycle.track(
        setOnline(this, true).catch((error: unknown) => {
          this.#log.warn('could not say this account is online', { error })
        }),
      )
      cancel = later(repeat, PRESENCE_INTERVAL)
    }

    repeat()

    const stop = (): void => {
      cancel?.()
      cancel = undefined
      if (this.#stopPresence === stop) this.#stopPresence = undefined
    }

    this.#stopPresence = stop

    return stop
  }

  /** Set the emoji shown beside this account's name, or clear it. */
  async setEmojiStatus(status: TypeEmojiStatus | undefined): Promise<void> {
    await setEmojiStatus(this, status)
  }

  /** Publish a birthday, with or without the year, or take it down. */
  async setBirthday(
    birthday: { readonly day: number; readonly month: number; readonly year?: number } | undefined,
  ): Promise<void> {
    await setBirthday(this, birthday)
  }

  /**
   * Remove photos from this account's own profile.
   *
   * Takes the photos themselves, which is what {@link Account.profilePhotos}
   * hands over. Answers with how many the server actually removed.
   */
  async deleteProfilePhotos(photos: readonly Photo[]): Promise<number> {
    return await deleteProfilePhotos(this, photos)
  }

  /** How long messages live by default in new conversations. Zero means forever. */
  async messageTtl(): Promise<number> {
    return await messageTtl(this)
  }

  /** Set how long messages live by default in new conversations. */
  async setMessageTtl(seconds: number): Promise<void> {
    await setMessageTtl(this, seconds)
  }

  /**
   * Read this account's contact list.
   *
   * Everybody in the answer is written down on the way back, so they can be
   * addressed afterwards without another lookup.
   */
  async contacts(): Promise<UserView[]> {
    return await readContacts(this)
  }

  /** Add somebody to this account's contacts. */
  async addContact(contact: NewContact): Promise<void> {
    await addContact(this, contact)
  }

  /**
   * Add contacts by phone number.
   *
   * A number that belongs to nobody is absent from the result rather than an
   * error. Numbers the server wants tried again come back separately, because
   * when to retry is the caller's decision.
   */
  async importContacts(contacts: readonly PhoneContact[]): Promise<ImportOutcome> {
    return await importContacts(this, contacts)
  }

  /** Remove people from this account's contacts. Not the same as blocking them. */
  async deleteContacts(peers: readonly (string | PeerRef)[]): Promise<void> {
    await deleteContacts(this, peers)
  }

  /**
   * Stop hearing from somebody.
   *
   * Takes a peer rather than a person, because a channel can be blocked too.
   * `storiesOnly` uses the separate list Telegram keeps for stories.
   */
  async block(
    peer: string | PeerRef,
    options?: { readonly storiesOnly?: boolean },
  ): Promise<boolean> {
    return await block(this, peer, options)
  }

  /**
   * Fetch a file as chunks this caller pulls.
   *
   * ```ts
   * for await (const chunk of account.downloadIterable(request)) {
   *   if (enough(chunk)) break
   * }
   * ```
   *
   * The same transfer {@link Account.downloadTo} runs, inverted. A sink is
   * called and cannot decline the next call, so a caller that has seen enough
   * can only throw; pulling makes `break` the answer. Leaving the loop stops
   * the fetching, and the loop is the backpressure — nothing further is asked
   * for until the chunk in hand has been taken.
   */
  downloadIterable(request: DownloadRequest): AsyncGenerator<Uint8Array, void, undefined> {
    return this.#pulling(request)
  }

  /** The generator {@link Account.downloadIterable} hands back. */
  async *#pulling(request: DownloadRequest): AsyncGenerator<Uint8Array, void, undefined> {
    const reach = this.#transfers(await this.#allowance(request))
    const { downloadIterable } = await import('./files/download.js')

    yield* downloadIterable({ ...request, reach })
  }

  /** Undo {@link Account.block}, on whichever of the two lists. */
  async unblock(
    peer: string | PeerRef,
    options?: { readonly storiesOnly?: boolean },
  ): Promise<boolean> {
    return await unblock(this, peer, options)
  }

  /**
   * Replace the set of people who see this account's close-friends stories.
   *
   * Replaces rather than adds: the call takes the whole list, so sending one
   * person removes everybody else.
   */
  async setCloseFriends(peers: readonly (string | PeerRef)[]): Promise<void> {
    await setCloseFriends(this, peers)
  }

  // ---------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------

  /** Add people to a conversation, answering those the server would not add. */
  async addMembers(
    chat: string | PeerRef,
    people: readonly (string | PeerRef)[],
    options?: AddOptions,
  ): Promise<NotAdded[]> {
    return await (await import('./chats/members.js')).addMembers(this, chat, people, options)
  }

  /** Bar somebody from a channel or supergroup. */
  async banMember(
    chat: string | PeerRef,
    member: string | PeerRef,
    options?: { readonly until?: number },
  ): Promise<void> {
    await (await import('./chats/members.js')).banMember(this, chat, member, options)
  }

  /** Lift every restriction on somebody, letting them back in. */
  async unbanMember(chat: string | PeerRef, member: string | PeerRef): Promise<void> {
    await (await import('./chats/members.js')).unbanMember(this, chat, member)
  }

  /** Restrict what somebody may do, without removing them. */
  async restrictMember(
    chat: string | PeerRef,
    member: string | PeerRef,
    restrictions: Restrictions,
  ): Promise<void> {
    await (await import('./chats/members.js')).restrictMember(this, chat, member, restrictions)
  }

  /** Remove somebody without barring them from returning. */
  async kickMember(
    chat: string | PeerRef,
    member: string | PeerRef,
    options?: { readonly deleteHistory?: boolean },
  ): Promise<void> {
    await (await import('./chats/members.js')).kickMember(this, chat, member, options)
  }

  /** Give somebody administrator rights; an empty record demotes them. */
  async setAdminRights(
    chat: string | PeerRef,
    member: string | PeerRef,
    rights: AdminRights,
    options?: { readonly rank?: string },
  ): Promise<void> {
    await (await import('./chats/members.js')).setAdminRights(this, chat, member, rights, options)
  }

  /** Set the title shown beside an administrator's name. */
  async setMemberRank(
    chat: string | PeerRef,
    member: string | PeerRef,
    rank: string | undefined,
  ): Promise<void> {
    await (await import('./chats/members.js')).setMemberRank(this, chat, member, rank)
  }

  /** Read one member's standing in a channel or supergroup. */
  async member(chat: string | PeerRef, member: string | PeerRef): Promise<MemberView | undefined> {
    return await (await import('./chats/members.js')).readChatMember(this, chat, member)
  }

  /** Hand a conversation to somebody else, proving this account's password. */
  async transferOwnership(
    chat: string | PeerRef,
    to: string | PeerRef,
    password: string,
  ): Promise<void> {
    await (await import('./chats/members.js')).transferOwnership(this, chat, to, password)
  }

  /** Join a channel or supergroup this account can already name. */
  async joinChat(chat: string | PeerRef): Promise<void> {
    await (await import('./chats/members.js')).joinChat(this, chat)
  }

  /** Leave a conversation. */
  async leaveChat(
    chat: string | PeerRef,
    options?: { readonly deleteHistory?: boolean },
  ): Promise<void> {
    await (await import('./chats/members.js')).leaveChat(this, chat, options)
  }

  /** Who would own this conversation if this account left it. */
  async creatorAfterLeave(chat: string | PeerRef): Promise<bigint | undefined> {
    return await (await import('./chats/members.js')).creatorAfterLeave(this, chat)
  }

  /** Make an additional invite link, with its own limits. */
  async createInviteLink(chat: string | PeerRef, options?: NewInviteLink): Promise<InviteLinkView> {
    return await (await import('./chats/invites.js')).createInviteLink(this, chat, options)
  }

  /** Replace the conversation's permanent link, withdrawing the old one. */
  async exportInviteLink(chat: string | PeerRef): Promise<InviteLinkView> {
    return await (await import('./chats/invites.js')).exportInviteLink(this, chat)
  }

  /** Change a link's limits. Zero clears one rather than setting it. */
  async editInviteLink(
    chat: string | PeerRef,
    link: string | InviteLinkView,
    edit: InviteLinkEdit,
  ): Promise<InviteLinkView> {
    return await (await import('./chats/invites.js')).editInviteLink(this, chat, link, edit)
  }

  /** Withdraw a link, and hand back the replacement where one was issued. */
  async revokeInviteLink(
    chat: string | PeerRef,
    link: string | InviteLinkView,
  ): Promise<{
    readonly revoked: InviteLinkView
    readonly replacement: InviteLinkView | undefined
  }> {
    return await (await import('./chats/invites.js')).revokeInviteLink(this, chat, link)
  }

  /** Read one invite link by its text. */
  async inviteLink(chat: string | PeerRef, link: string): Promise<InviteLinkView> {
    return await (await import('./chats/invites.js')).readInviteLink(this, chat, link)
  }

  /** The conversation's permanent link, read rather than replaced. */
  async primaryInviteLink(chat: string | PeerRef): Promise<InviteLinkView | undefined> {
    return await (await import('./chats/invites.js')).primaryInviteLink(this, chat)
  }

  /** Let one person in through a link that needs approval, or turn them away. */
  async decideJoin(
    chat: string | PeerRef,
    person: string | PeerRef,
    approve: boolean,
  ): Promise<void> {
    await (await import('./chats/invites.js')).decideJoinRequest(this, chat, person, approve)
  }

  /** Decide every pending request at once, optionally for one link. */
  async decideAllJoins(
    chat: string | PeerRef,
    approve: boolean,
    options?: { readonly link?: string | InviteLinkView },
  ): Promise<void> {
    await (await import('./chats/invites.js')).decideAllJoinRequests(this, chat, approve, options)
  }

  /** Look at what an invite link opens, without joining it. */
  async previewInvite(hash: string): Promise<InvitePreview> {
    return await (await import('./chats/invites.js')).previewInvite(this, hash)
  }

  /** Join by invite link. A link needing approval files a request instead. */
  async joinByLink(hash: string): Promise<void> {
    await (await import('./chats/invites.js')).joinByLink(this, hash)
  }

  /** Look at a shared folder link without joining it. */
  async previewChatlist(slug: string): Promise<ChatlistPreview> {
    return await (await import('./chats/invites.js')).previewChatlist(this, slug)
  }

  /** Join a shared folder, taking the conversations named. */
  async joinChatlist(slug: string, chats: readonly (string | PeerRef)[]): Promise<void> {
    await (await import('./chats/invites.js')).joinChatlist(this, slug, chats)
  }

  /** Rename a conversation. */
  async setChatTitle(chat: string | PeerRef, title: string): Promise<void> {
    await (await import('./chats/manage.js')).setChatTitle(this, chat, title)
  }

  /** Change what a conversation says about itself. */
  async setChatDescription(chat: string | PeerRef, description: string | undefined): Promise<void> {
    await (await import('./chats/manage.js')).setChatDescription(this, chat, description)
  }

  /** Put a picture on a conversation, from a file already uploaded. */
  async setChatPhoto(
    chat: string | PeerRef,
    options: {
      readonly photo?: UploadedFile
      readonly video?: UploadedFile
      readonly videoStart?: number
    },
  ): Promise<void> {
    await (await import('./chats/manage.js')).setChatPhoto(this, chat, options)
  }

  /** Take the picture off a conversation. */
  async deleteChatPhoto(chat: string | PeerRef): Promise<void> {
    await (await import('./chats/manage.js')).deleteChatPhoto(this, chat)
  }

  /** Give a channel a public name, or take it away. */
  async setChatUsername(chat: string | PeerRef, username: string | undefined): Promise<void> {
    await (await import('./chats/manage.js')).setChatUsername(this, chat, username)
  }

  /** Turn one of a conversation's additional usernames on or off. */
  async toggleChatUsername(
    chat: string | PeerRef,
    username: string,
    active: boolean,
  ): Promise<void> {
    await (await import('./chats/manage.js')).toggleChatUsername(this, chat, username, active)
  }

  /** Put a conversation's usernames in a given order. */
  async reorderChatUsernames(chat: string | PeerRef, order: readonly string[]): Promise<void> {
    await (await import('./chats/manage.js')).reorderChatUsernames(this, chat, order)
  }

  /** How long messages live in one conversation. Zero turns it off. */
  async setChatTtl(chat: string | PeerRef, seconds: number): Promise<void> {
    await (await import('./chats/manage.js')).setChatTtl(this, chat, seconds)
  }

  /** What everybody who is not an administrator may not do. */
  async setChatDefaultPermissions(
    chat: string | PeerRef,
    restrictions: Restrictions,
  ): Promise<void> {
    await (await import('./chats/manage.js')).setChatDefaultPermissions(this, chat, restrictions)
  }

  /** How long a member must wait between messages. Zero turns it off. */
  async setSlowMode(chat: string | PeerRef, seconds: number): Promise<void> {
    await (await import('./chats/manage.js')).setSlowMode(this, chat, seconds)
  }

  /** Hide the forward and copy buttons. Not a security control. */
  async toggleContentProtection(chat: string | PeerRef, enabled: boolean): Promise<void> {
    await (await import('./chats/manage.js')).toggleContentProtection(this, chat, enabled)
  }

  /** Make joining need approval. */
  async toggleJoinRequests(chat: string | PeerRef, enabled: boolean): Promise<void> {
    await (await import('./chats/manage.js')).toggleJoinRequests(this, chat, enabled)
  }

  /** Require membership before somebody may write. */
  async toggleJoinToSend(chat: string | PeerRef, enabled: boolean): Promise<void> {
    await (await import('./chats/manage.js')).toggleJoinToSend(this, chat, enabled)
  }

  /** Set the accent colour a conversation is shown in. */
  async setChatColor(
    chat: string | PeerRef,
    colour: TypePeerColor | undefined,
    options?: { readonly forProfile?: boolean },
  ): Promise<void> {
    await (await import('./chats/manage.js')).setChatColor(this, chat, colour, options)
  }

  /** Make a basic group, which needs the people in it at creation. */
  async createGroup(chat: NewChat, people: readonly (string | PeerRef)[]): Promise<ChatView> {
    return await (await import('./chats/lifecycle.js')).createGroup(this, chat, people)
  }

  /** Make a supergroup, which starts empty. */
  async createSupergroup(chat: NewChat & { readonly forum?: boolean }): Promise<ChatView> {
    return await (await import('./chats/lifecycle.js')).createSupergroup(this, chat)
  }

  /** Make a broadcast channel. */
  async createChannel(chat: NewChat): Promise<ChatView> {
    return await (await import('./chats/lifecycle.js')).createChannel(this, chat)
  }

  /** Delete a channel or supergroup for everybody. Irreversible. */
  async deleteChannel(chat: string | PeerRef): Promise<void> {
    await (await import('./chats/lifecycle.js')).deleteChannel(this, chat)
  }

  /** Delete a basic group for everybody. */
  async deleteGroup(chat: string | PeerRef): Promise<void> {
    await (await import('./chats/lifecycle.js')).deleteGroup(this, chat)
  }

  /** Remove what was said in a conversation. */
  async deleteHistory(chat: string | PeerRef, options?: HistoryRemoval): Promise<void> {
    await (await import('./chats/lifecycle.js')).deleteHistory(this, chat, options)
  }

  /** Remove everything one person said in a channel or supergroup. */
  async deleteMemberHistory(chat: string | PeerRef, member: string | PeerRef): Promise<void> {
    await (await import('./chats/lifecycle.js')).deleteMemberHistory(this, chat, member)
  }

  /** Read a conversation this account can name. */
  async chat(chat: string | PeerRef): Promise<ChatView> {
    return await (await import('./chats/lookup.js')).fetchChat(this, chat)
  }

  /** Read several conversations, positionally, with a gap for each unknown one. */
  async chats(chats: readonly (string | PeerRef)[]): Promise<(ChatView | undefined)[]> {
    return await (await import('./chats/lookup.js')).fetchChats(this, chats)
  }

  /** Read everything Telegram will say about a conversation. */
  async fullChat(chat: string | PeerRef): Promise<FullChat> {
    return await (await import('./chats/lookup.js')).fetchFullChat(this, chat)
  }

  /**
   * Read who a peer is — a person or a conversation, whichever it turns out to be.
   *
   * ```ts
   * const who = await account.peer('@someone')
   * ```
   *
   * One request rather than a full read: this is the record Telegram keeps for
   * the peer, not the description, the counts and the settings that
   * {@link Account.fullChat} fetches. Refused by name where the peer cannot be
   * addressed or Telegram will not describe it.
   */
  async peer(peer: string | PeerRef): Promise<PeerView> {
    return await (await import('./chats/peers.js')).fetchPeer(this, peer)
  }

  /**
   * Read who several peers are, positionally, in as few requests as possible.
   *
   * ```ts
   * const [me, channel] = await account.peersOf(['me', '@news'])
   * ```
   *
   * People, basic groups and channels are three different bulk reads in the
   * protocol, so a mixed list is one request per family rather than one per
   * peer. Entry `n` describes peer `n`, and is `undefined` where that peer could
   * not be named or Telegram would not describe it.
   */
  async peersOf(peers: readonly (string | PeerRef)[]): Promise<(PeerView | undefined)[]> {
    return await (await import('./chats/peers.js')).fetchPeers(this, peers)
  }

  /**
   * Read who one person is.
   *
   * {@link Account.peer} narrowed to people, so the answer needs no test for
   * which kind came back. A peer naming a conversation is refused.
   */
  async user(peer: string | PeerRef): Promise<UserView> {
    return await (await import('./chats/peers.js')).fetchUser(this, peer)
  }

  /**
   * Find the conversation-list rows for peers, including ones not yet known.
   *
   * ```ts
   * const [work] = await account.findDialogs(['@work'])
   * ```
   *
   * Peers this account can already address are asked about directly, in one
   * request. Whatever is left is looked for by walking the conversation list,
   * which stops as soon as the last one is found. Refused by name if any is
   * still missing afterwards — a row absent from the list is a conversation
   * this account does not have.
   */
  async findDialogs(peers: readonly (string | PeerRef)[]): Promise<DialogView[]> {
    return await (await import('./chats/peers.js')).findDialogs(this, peers)
  }

  /**
   * Find one of this account's folders by what it is called or numbered.
   *
   * ```ts
   * const work = await account.findFolder({ title: 'Work' })
   * ```
   *
   * Every criterion given has to match. Answers `undefined` where none does;
   * asking with nothing to match on is refused.
   */
  async findFolder(query: FolderQuery): Promise<Folder | undefined> {
    return await (await import('./chats/peers.js')).findFolder(this, query)
  }

  /**
   * Open a new topic in a forum.
   *
   * ```ts
   * const opened = await account.createTopic('@forum', { title: 'Releases' })
   * ```
   *
   * Answered with the service message that announced it, whose identifier is
   * also the new topic's identifier.
   */
  async createTopic(chat: string | PeerRef, topic: NewTopic): Promise<SentMessage> {
    return await (await import('./forums/topics.js')).createTopic(this.#posting, chat, topic)
  }

  /** Change a topic: its name, its icon, whether it is closed. */
  async editTopic(chat: string | PeerRef, topic: TopicRef, edit: TopicEdit): Promise<SentMessage> {
    return await (await import('./forums/topics.js')).editTopic(this.#posting, chat, topic, edit)
  }

  /** Close a topic to new messages, or open it again. */
  async setTopicClosed(
    chat: string | PeerRef,
    topic: TopicRef,
    closed: boolean,
  ): Promise<SentMessage> {
    return await (await import('./forums/topics.js')).setTopicClosed(
      this.#posting,
      chat,
      topic,
      closed,
    )
  }

  /** Hide the General topic, or show it again. It is the only one that can be. */
  async setGeneralTopicHidden(chat: string | PeerRef, hidden: boolean): Promise<SentMessage> {
    return await (await import('./forums/topics.js')).setGeneralTopicHidden(
      this.#posting,
      chat,
      hidden,
    )
  }

  /** Pin a topic to the top of the forum, or unpin it. */
  async setTopicPinned(chat: string | PeerRef, topic: TopicRef, pinned: boolean): Promise<void> {
    await (await import('./forums/topics.js')).setTopicPinned(this.#posting, chat, topic, pinned)
  }

  /** Put the pinned topics in a given order. The order given is the whole order. */
  async reorderPinnedTopics(
    chat: string | PeerRef,
    order: readonly TopicRef[],
    options?: { readonly unpinTheRest?: boolean },
  ): Promise<void> {
    await (await import('./forums/topics.js')).reorderPinnedTopics(
      this.#posting,
      chat,
      order,
      options,
    )
  }

  /** Delete a topic's messages, and keep this account's place in the stream. */
  async deleteTopicHistory(chat: string | PeerRef, topic: TopicRef): Promise<number> {
    return await (await import('./forums/topics.js')).deleteTopicHistory(this.#posting, chat, topic)
  }

  /** Read particular topics by number, positionally, with a gap for each missing one. */
  async topics(
    chat: string | PeerRef,
    topics: readonly TopicRef[],
  ): Promise<(ForumTopicView | undefined)[]> {
    return await (await import('./forums/topics.js')).fetchTopics(this.#posting, chat, topics)
  }

  /** Turn a supergroup into a forum, or turn it back into an ordinary one. */
  async setForumSettings(chat: string | PeerRef, settings: ForumSettings): Promise<void> {
    await (await import('./forums/topics.js')).setForumSettings(this.#posting, chat, settings)
  }

  /**
   * Post a story.
   *
   * ```ts
   * const story = await account.postStory({ media, caption: 'hello' })
   * ```
   *
   * Posted as this account unless a peer is named. Answered with the story
   * itself, so its number and expiry need no second request.
   *
   * Who may see it defaults to everyone. An audience is a list of privacy
   * rules — `[{ _: 'inputPrivacyValueAllowCloseFriends' }]` for close friends,
   * `[{ _: 'inputPrivacyValueAllowContacts' }]` for contacts — which is a value
   * rather than a helper so that posting a story loads nothing until it is
   * posted.
   */
  async postStory(story: NewStory, peer?: string | PeerRef): Promise<StoryView> {
    return await (await import('./stories/stories.js')).postStory(this.#posting, story, peer)
  }

  /** Change a story that is already posted. What is not given is left alone. */
  async editStory(id: number, edit: StoryEdit, peer?: string | PeerRef): Promise<StoryView> {
    return await (await import('./stories/stories.js')).editStory(this.#posting, id, edit, peer)
  }

  /** Take stories down. Answers the numbers Telegram actually removed. */
  async deleteStories(ids: readonly number[], peer?: string | PeerRef): Promise<number[]> {
    return await (await import('./stories/stories.js')).deleteStories(this.#posting, ids, peer)
  }

  /** Pin stories to a profile so they outlive their period, or unpin them. */
  async setStoriesPinned(
    ids: readonly number[],
    pinned: boolean,
    peer?: string | PeerRef,
  ): Promise<number[]> {
    return await (await import('./stories/stories.js')).setStoriesPinned(
      this.#posting,
      ids,
      pinned,
      peer,
    )
  }

  /** Hide a peer's stories from the row at the top, or show them again. */
  async setPeerStoriesArchived(peer: string | PeerRef, archived: boolean): Promise<void> {
    await (await import('./stories/stories.js')).setPeerStoriesArchived(
      this.#posting,
      peer,
      archived,
    )
  }

  /** React to a story, or take a reaction back by passing nothing. */
  async reactToStory(
    peer: string | PeerRef,
    id: number,
    reaction: StoryReaction,
    options?: { readonly addToRecent?: boolean },
  ): Promise<void> {
    await (await import('./stories/stories.js')).reactToStory(
      this.#posting,
      peer,
      id,
      reaction,
      options,
    )
  }

  /** Mark a peer's stories read, up to and including one. */
  async markStoriesSeen(peer: string | PeerRef, upTo: number): Promise<number[]> {
    return await (await import('./stories/stories.js')).markStoriesSeen(this.#posting, peer, upTo)
  }

  /** Report that stories were actually looked at, which is what counts a view. */
  async countStoryViews(peer: string | PeerRef, ids: readonly number[]): Promise<void> {
    await (await import('./stories/stories.js')).countStoryViews(this.#posting, peer, ids)
  }

  /** Stop reporting this account's story views for a while. */
  async hideMyStoryViews(options?: {
    readonly past?: boolean
    readonly future?: boolean
  }): Promise<TypeStoriesStealthMode> {
    return await (await import('./stories/stories.js')).hideMyViews(this.#posting, options)
  }

  /** Read particular stories by number, positionally, with a gap for each gone. */
  async stories(
    peer: string | PeerRef,
    ids: readonly number[],
  ): Promise<(StoryView | undefined)[]> {
    return await (await import('./stories/stories.js')).fetchStories(this.#posting, peer, ids)
  }

  /** A peer's stories that have not expired, and how far this account has read. */
  async peerStories(peer: string | PeerRef): Promise<PeerStoriesView> {
    return await (await import('./stories/stories.js')).peerStories(this.#posting, peer)
  }

  /** How stories this account posted have been received. */
  async storyInteractions(
    ids: readonly number[],
    peer?: string | PeerRef,
  ): Promise<(TypeStoryViews | undefined)[]> {
    return await (await import('./stories/stories.js')).storyInteractions(this.#posting, ids, peer)
  }

  /** A link to a story, which only exists for one on a public profile. */
  async storyLink(peer: string | PeerRef, id: number): Promise<string> {
    return await (await import('./stories/stories.js')).storyLink(this.#posting, peer, id)
  }

  /** Whether a story may be posted somewhere, and how many are left if so. */
  async canPostStory(peer?: string | PeerRef): Promise<StoryAllowance> {
    return await (await import('./stories/stories.js')).canPostStory(this.#posting, peer)
  }

  /**
   * Send a gift, paying for it in Stars.
   *
   * ```ts
   * await account.sendGift('@someone', { giftId })
   * ```
   *
   * **This spends Stars.** Two requests: the payment form, then the payment.
   */
  async sendGift(to: string | PeerRef, gift: NewGift): Promise<SentMessage> {
    return await (await import('./gifts/gifts.js')).sendGift(this.#posting, to, gift)
  }

  /** Show, hide or convert a gift this account was given. Converting is final. */
  async decideGift(gift: GiftRef, verdict: GiftVerdict): Promise<void> {
    await (await import('./gifts/gifts.js')).decideGift(this.#posting, gift, verdict)
  }

  /** Upgrade a gift into a unique collectible. **This may spend Stars.** */
  async upgradeGift(
    gift: GiftRef,
    options?: { readonly keepOriginalDetails?: boolean },
  ): Promise<SentMessage> {
    return await (await import('./gifts/gifts.js')).upgradeGift(this.#posting, gift, options)
  }

  /** Give a unique gift to somebody else. **This may spend Stars.** */
  async transferGift(gift: GiftRef, to: string | PeerRef): Promise<SentMessage> {
    return await (await import('./gifts/gifts.js')).transferGift(this.#posting, gift, to)
  }

  /** Buy a unique gift somebody has put up for resale. **This spends Stars.** */
  async buyResaleGift(
    slug: string,
    to: string | PeerRef,
    options?: { readonly inTon?: boolean },
  ): Promise<SentMessage> {
    return await (await import('./gifts/gifts.js')).buyResaleGift(this.#posting, slug, to, options)
  }

  /** Put a unique gift up for resale, or take it off sale with `null`. */
  async setResalePrice(gift: GiftRef, price: StarsPrice | null): Promise<void> {
    await (await import('./gifts/gifts.js')).setResalePrice(this.#posting, gift, price)
  }

  /** Pay in advance for somebody else's gift to be upgradeable. **Spends Stars.** */
  async prepayGiftUpgrade(peer: string | PeerRef, hash: string): Promise<SentMessage> {
    return await (await import('./gifts/gifts.js')).prepayUpgrade(this.#posting, peer, hash)
  }

  /** Pin gifts to the top of a profile. The list given is the whole pinned set. */
  async setPinnedGifts(peer: string | PeerRef, gifts: readonly GiftRef[]): Promise<void> {
    await (await import('./gifts/gifts.js')).setPinnedGifts(this.#posting, peer, gifts)
  }

  /** The gifts that can be bought right now. */
  async giftOptions(): Promise<TypeStarGift[]> {
    return await (await import('./gifts/gifts.js')).giftOptions(this.#posting)
  }

  /** What a gift could turn into if it were upgraded, sorted into the three kinds. */
  async giftUpgradeOptions(giftId: bigint): Promise<UpgradeOptions> {
    return await (await import('./gifts/gifts.js')).upgradeOptions(this.#posting, giftId)
  }

  /** One page of the unique gifts of a kind that are currently for sale. */
  async giftResaleOptions(query: ResaleQuery): Promise<ResalePage> {
    return await (await import('./gifts/gifts.js')).resaleOptions(this.#posting, query)
  }

  /** Read one unique gift by its public address. */
  async uniqueGift(slug: string): Promise<TypeStarGift> {
    return await (await import('./gifts/gifts.js')).uniqueGift(this.#posting, slug)
  }

  /** What a unique gift is currently reckoned to be worth. */
  async giftValue(slug: string) {
    return await (await import('./gifts/gifts.js')).giftValue(this.#posting, slug)
  }

  /** Read particular saved gifts by reference. */
  async savedGiftsById(gifts: readonly GiftRef[]): Promise<TypeSavedStarGift[]> {
    return await (await import('./gifts/gifts.js')).fetchSavedGifts(this.#posting, gifts)
  }

  /** A link for taking a unique gift out of Telegram. Needs the two-factor password. */
  async giftWithdrawalUrl(gift: GiftRef, password: string): Promise<string> {
    return await (await import('./gifts/gifts.js')).giftWithdrawalUrl(this.#posting, gift, password)
  }

  /** Offer to buy a unique gift from whoever owns it. Nothing is spent until accepted. */
  async offerForGift(to: string | PeerRef, offer: GiftOffer): Promise<SentMessage> {
    return await (await import('./gifts/gifts.js')).offerForGift(this.#posting, to, offer)
  }

  /** Accept an offer somebody made for a gift this account owns. */
  async settleGiftOffer(message: number): Promise<SentMessage> {
    return await (await import('./gifts/gifts.js')).settleGiftOffer(this.#posting, message)
  }

  /** Spend one of this account's boost slots on a conversation. */
  async boost(chat: string | PeerRef): Promise<void> {
    await (await import('./premium/premium.js')).boost(this, chat)
  }

  /** The boost slots this account has, and what each is spent on. */
  async boostSlots(): Promise<TypeMyBoost[]> {
    return await (await import('./premium/premium.js')).boostSlots(this)
  }

  /** Whether this account can boost something, and at whose expense. */
  async canBoost(): Promise<BoostChance> {
    return await (await import('./premium/premium.js')).canBoost(this)
  }

  /** How boosted a conversation is, and what the next level needs. */
  async boostStats(chat: string | PeerRef) {
    return await (await import('./premium/premium.js')).boostStats(this, chat)
  }

  /** The connection a business account granted a bot. */
  async businessConnection(connectionId: string): Promise<TypeBotBusinessConnection> {
    return await (await import('./premium/premium.js')).businessConnection(this, connectionId)
  }

  /** Make a link that opens a conversation with this account, pre-filled. */
  async createBusinessLink(
    message: LinkMessage,
    options?: { readonly title?: string },
  ): Promise<TypeBusinessChatLink> {
    return await (await import('./premium/premium.js')).createBusinessLink(this, message, options)
  }

  /** Change what one of this account's business links says. */
  async editBusinessLink(
    slug: string,
    message: LinkMessage,
    options?: { readonly title?: string },
  ): Promise<TypeBusinessChatLink> {
    return await (await import('./premium/premium.js')).editBusinessLink(
      this,
      slug,
      message,
      options,
    )
  }

  /** Take one of this account's business links down. */
  async deleteBusinessLink(slug: string): Promise<void> {
    await (await import('./premium/premium.js')).deleteBusinessLink(this, slug)
  }

  /** Every business link this account has published. */
  async businessLinks(): Promise<TypeBusinessChatLink[]> {
    return await (await import('./premium/premium.js')).businessLinks(this)
  }

  /** Set what people see before they have written anything, or clear it. */
  async setBusinessIntro(intro: BusinessIntro | undefined): Promise<void> {
    await (await import('./premium/premium.js')).setBusinessIntro(this, intro)
  }

  /** Publish when this account is open for business, or take the hours down. */
  async setBusinessHours(hours: WorkHours | undefined): Promise<void> {
    await (await import('./premium/premium.js')).setWorkHours(this, hours)
  }

  /**
   * Keep a conversation's updates flowing while somebody is looking at it.
   *
   * ```ts
   * const stop = await account.watchChat('@news')
   * …
   * stop()
   * ```
   *
   * Telegram does not push a channel's updates to an account that is not
   * looking at it; what it offers instead is the channel's difference, on
   * request, with each answer saying how long to wait before asking again. So
   * watching a channel means asking repeatedly, at the server's interval rather
   * than at one chosen here, and the updates arrive through the ordinary
   * handlers exactly as pushed ones do.
   *
   * A conversation that is not a channel or supergroup needs none of this — its
   * updates are in the account's own sequence and already arrive — so watching
   * one is accepted and does nothing, which keeps a caller from having to know
   * which kind it has.
   *
   * Counted, so two parts of a program may watch one channel and neither ends
   * the other's subscription. The returned stop is safe to call more than once,
   * and everything still being watched is released when the account stops.
   */
  async watchChat(chat: string | PeerRef): Promise<() => void> {
    const { channelFor } = await import('./network/peers.js')
    const channel = channelFor(await this.resolve(chat))

    // Not a channel, so nothing to follow. Answered with a stop that does
    // nothing rather than with a refusal: whether a conversation has a sequence
    // of its own is Telegram's business, not the caller's.
    if (channel === undefined) return () => {}

    if (channel._ === 'inputChannelEmpty') return () => {}
    const channelId = channel.channel_id
    // A position the account has never held cannot be asked for a difference.
    // The dialog carries one, and reading it is what the reference does here
    // too — a bot has no dialogs and falls back to what it has stored.
    const stored = this.#state.channelPts(channelId)
    let pts: number | undefined
    if (stored === undefined) {
      try {
        const [dialog] = await (await import('./chats/lookup.js')).fetchDialogs(this, [chat])
        pts = dialog?.pts
      } catch (error) {
        this.#log.debug('no dialog to read a starting position from', { error })
      }
    }

    const updates = this.#require().updates
    updates.watchChannel(channelId, pts)

    let stopped = false

    return () => {
      if (stopped) return
      stopped = true
      // The account may have been stopped in between, which released every
      // watch already. Asking the manager then is harmless — it knows nothing
      // about this channel and says so.
      this.#network?.updates.unwatchChannel(channelId)
    }
  }

  /** What a public conversation looks like from outside it. */
  async previewChat(username: string): Promise<ChatView | undefined> {
    return await (await import('./chats/lookup.js')).previewChat(this, username)
  }

  /** Channels Telegram thinks are like this one. */
  async similarChannels(chat: string | PeerRef): Promise<ChatView[]> {
    return await (await import('./chats/lookup.js')).similarChannels(this, chat)
  }

  /** Who wrote a post in a channel that signs its posts. */
  async messageAuthor(chat: string | PeerRef, messageId: number): Promise<UserView | undefined> {
    return await (await import('./chats/lookup.js')).messageAuthor(this, chat, messageId)
  }

  /** This account's own record about particular conversations. */
  async peerDialogs(chats: readonly (string | PeerRef)[]): Promise<DialogView[]> {
    return await (await import('./chats/lookup.js')).fetchDialogs(this, chats)
  }

  /** Every folder this account has, in the order they are shown. */
  async folders(): Promise<Folder[]> {
    return await (await import('./chats/folders.js')).readFolders(this)
  }

  /** Make a folder. The number is the caller's to choose. */
  async createFolder(folder: NewFolder): Promise<void> {
    await (await import('./chats/folders.js')).createFolder(this, folder)
  }

  /** Change a folder, reading the current one first so nothing is dropped. */
  async editFolder(
    id: number,
    edit: {
      readonly title?: string
      readonly pinned?: readonly (string | PeerRef)[]
      readonly included?: readonly (string | PeerRef)[]
      readonly excluded?: readonly (string | PeerRef)[]
    },
  ): Promise<void> {
    await (await import('./chats/folders.js')).editFolder(this, id, edit)
  }

  /** Remove a folder. The conversations in it are not affected. */
  async deleteFolder(id: number): Promise<void> {
    await (await import('./chats/folders.js')).deleteFolder(this, id)
  }

  /** Put the folders in a given order. */
  async setFolderOrder(order: readonly number[]): Promise<void> {
    await (await import('./chats/folders.js')).setFolderOrder(this, order)
  }

  /** Move conversations into the archive, or back out of it. */
  async archiveChats(chats: readonly (string | PeerRef)[], archived: boolean): Promise<void> {
    await (await import('./chats/folders.js')).archiveChats(this, chats, archived)
  }

  /** Mark a conversation as unread, or clear the mark. */
  async markChatUnread(chat: string | PeerRef, unread: boolean): Promise<void> {
    await (await import('./chats/folders.js')).markChatUnread(this, chat, unread)
  }

  /** Keep an unsent message against a conversation. */
  async saveDraft(
    chat: string | PeerRef,
    text: string | undefined,
    options?: { readonly entities?: readonly TypeMessageEntity[]; readonly replyTo?: number },
  ): Promise<void> {
    await (await import('./chats/folders.js')).saveDraft(this, chat, text, options)
  }

  // ---------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------

  /** Add middleware to this account's own chain. */
  use(middleware: Middleware<MtprotoContext & Ext>, options?: UseOptions): this {
    this.#dispatcher.use(middleware, options)

    return this
  }

  /**
   * Handle events of a kind, or of several.
   *
   * ```ts
   * account.on('message', (event) => event.reply('Seen.'))
   * ```
   *
   * The last argument places the handler: `group` makes it one of a set where
   * only the first match runs, and `once` removes it after it has run. See
   * `docs/middleware.md` §5.
   */
  on<K extends MtprotoEventKind>(
    kind: K | readonly K[],
    handler: Handler<MtprotoContext & Ext>,
    options?: OnOptions,
  ): this
  /**
   * Handle what a filter matches.
   *
   * The handler's context is what the filter proves: `f.text()` hands it a
   * context whose `text` is a string. Give a composed filter a name before
   * registering it, for the reason `Bot.on` gives.
   */
  on<F extends FilterMeta>(
    filter: F & AccountRunnable<F>,
    handler: Handler<AccountFilterContext<F> & Ext>,
    options?: OnOptions,
  ): this
  /** Handle events of a kind that a filter also matches. */
  on<K extends MtprotoEventKind, F extends FilterMeta>(
    kind: K | readonly K[],
    filter: F & AccountRunnable<F>,
    handler: Handler<AccountFilterContext<F> & Ext>,
    options?: OnOptions,
  ): this
  /** Handle an event the application raises with {@link Account.emit}. */
  on<P>(
    event: EventDefinition<P>,
    handler: Handler<CustomEvent<P> & Ext>,
    options?: OnOptions,
  ): this
  on(...args: unknown[]): this {
    const [first, handler, options] = args
    if (isEventDefinition(first)) {
      this.#customKind(first)
      this.#dispatcher.on(first.kind, handler as never, (options ?? {}) as OnOptions)
      return this
    }
    register(this.#dispatcher, args, false)

    return this
  }

  /**
   * Raise an event of the application's own, and run this account's
   * middleware and handlers for it.
   *
   * Dispatched as an update is — plugins installed first, the same middleware
   * and error handling, and tracked so that `stop()` waits for it — but it
   * touches none of the account's update state: no sequence moves, and nothing
   * is acknowledged to a datacenter. `address` names who it concerns, so state
   * keyed by chat and sender loads for it.
   */
  async emit<P>(event: EventDefinition<P>, payload: P, address?: EventAddress): Promise<void> {
    this.#customKind(event)
    const work = (async () => {
      if (this.#plugins.pending > 0) await this.#installPlugins()
      const context = createCustomEvent(event, payload, { client: this, log: this.#log }, address)
      await this.#dispatch(context as unknown as MtprotoContext & Ext)
    })()
    this.#lifecycle.track(work)
    await work
  }

  /** Accept an event kind of the application's, refusing one an account also produces. */
  #customKind(event: EventDefinition<unknown>): void {
    if (
      (SHARED_KINDS as readonly string[]).includes(event.kind) ||
      (ACCOUNT_KINDS as readonly string[]).includes(event.kind)
    ) {
      throw new ValidationError(
        `'${event.kind}' is a kind of event an account produces from updates; name an application's event something else`,
      )
    }
  }

  /**
   * As {@link Account.on}, for a handler that runs once and is removed.
   *
   * Once means once: two updates arriving together cannot both run it.
   */
  once<K extends MtprotoEventKind>(
    kind: K | readonly K[],
    handler: Handler<MtprotoContext & Ext>,
    options?: OnOptions,
  ): this
  once<F extends FilterMeta>(
    filter: F & AccountRunnable<F>,
    handler: Handler<AccountFilterContext<F> & Ext>,
    options?: OnOptions,
  ): this
  once<K extends MtprotoEventKind, F extends FilterMeta>(
    kind: K | readonly K[],
    filter: F & AccountRunnable<F>,
    handler: Handler<AccountFilterContext<F> & Ext>,
    options?: OnOptions,
  ): this
  once(...args: unknown[]): this {
    register(this.#dispatcher, args, true)

    return this
  }

  /**
   * Remove a handler.
   *
   * At once, including from an update being dispatched now that has not
   * reached it yet. A handler already running finishes.
   */
  off(handler: Handler<never>): boolean {
    return this.#dispatcher.off(handler as Handler<MtprotoContext & Ext>)
  }

  /** Handle new messages. */
  onMessage(handler: Handler<MtprotoContext & Ext>): this {
    return this.on('message', handler)
  }

  /** Run before this account's handlers; returning `Propagation.Stop` skips them. */
  before(hook: BeforeHook<MtprotoContext & Ext>): this {
    this.#dispatcher.before(hook)

    return this
  }

  /** Run after this account's handlers and routers, told whether any handler ran. */
  after(hook: AfterHook<MtprotoContext & Ext>): this {
    this.#dispatcher.after(hook)

    return this
  }

  /**
   * Be told about anything a handler threw.
   *
   * Including what a router's handlers threw that the router did not take. A
   * catcher returning `false` passes the error on; with none taking it, it is
   * logged at `error` level on this account's logger.
   */
  catch(handler: ErrorHandler<MtprotoContext & Ext>): this {
    this.#dispatcher.catch(handler)

    return this
  }

  /**
   * Add a router, to run after this account's own handlers.
   *
   * Its middleware wraps only its own handlers, and it reads what this account
   * injected. A router belongs to one parent at a time.
   */
  addChild(router: AccountRouter<Ext>): this {
    this.#dispatcher.addChild(dispatcherOf(router as AccountRouter<never>))

    return this
  }

  /** Take a router back out. Updates already being dispatched keep it. */
  removeChild(router: AccountRouter<Ext>): boolean {
    return this.#dispatcher.removeChild(dispatcherOf(router as AccountRouter<never>))
  }

  /**
   * Make a value reachable as `deps[name]` from this account and its routers.
   *
   * Scoped to this account: a second account in the same process has its own,
   * and nothing is shared through a global. The names are typed by merging into
   * `Dependencies`. A value is kept as given — a promise stays a promise — and
   * is the application's to close; the account does not own it.
   */
  inject<K extends keyof Dependencies & string>(name: K, value: Dependencies[K]): this
  inject(dependencies: Partial<Dependencies>): this
  inject(first: string | Partial<Dependencies>, value?: unknown): this {
    if (typeof first === 'string') {
      this.#dispatcher.inject(first as keyof Dependencies & string, value as never)
    } else {
      this.#dispatcher.inject(first)
    }

    return this
  }

  /** What was injected. Reading a name nobody injected throws a `ConfigError`. */
  get deps(): Dependencies {
    return this.#dispatcher.deps
  }

  /**
   * Install a plugin, or add a router.
   *
   * A plugin is installed when the account starts, in dependency order, or
   * before the first update if one arrives first. One that needs only
   * somewhere to put middleware — the session and conversation plugins — is
   * installable here and on a bot alike.
   */
  extend(router: AccountRouter<Ext>): this
  extend(plugin: Plugin<string, unknown, Account<Ext>>): this
  extend(plugin: Plugin<string, unknown, MiddlewareHost>): this
  extend(extension: AccountRouter<Ext> | Plugin<string, unknown, never>): this {
    if (extension instanceof AccountRouter) return this.addChild(extension)

    this.#plugins.add(extension as unknown as Plugin<string, unknown, Account<Ext>>)

    return this
  }

  /**
   * Be told when this account starts and when it begins to stop.
   *
   * How a plugin lets go of what it holds between updates. `stopping` runs
   * before the stop waits for handlers still running, and what it returns is
   * awaited within the stop's deadline; `started` runs on every start,
   * including a restart. An observer that throws is logged and the rest are
   * still told: a failing observer must not keep connections open.
   */
  observe(observer: HostObserver): () => void {
    this.#observers.add(observer)

    return () => {
      this.#observers.delete(observer)
    }
  }

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

  /**
   * Open the connection this account speaks over.
   *
   * Named for what it does, because connecting and signing in fail differently
   * and a caller wants to know which happened. Idempotent: the lifecycle shares
   * one attempt between concurrent callers rather than opening two.
   */
  async connect(): Promise<void> {
    await this.#lifecycle.start()
  }

  /**
   * Bring the account up by the mechanism it runs.
   *
   * What an application calls. For an account that is connecting, so this is
   * the general verb over the specific one rather than a second way to do it.
   */
  async start(): Promise<void> {
    await this.connect()
  }

  /** Stop, draining what is in flight, and close every connection. */
  async stop(options: StopOptions = {}): Promise<boolean> {
    await this.#lifecycle.stop(options)

    return this.#lifecycle.stopped
  }

  /**
   * Put middleware around everything this account dispatches.
   *
   * How an application reaches outside a client. Installed once: an account
   * already held by one application being added to another has two owners, and
   * the second would silently replace the first's middleware.
   */
  surround(middleware: Middleware<MtprotoContext & Ext>): void {
    if (this.#surrounding !== undefined) {
      throw new LifecycleError(`the account '${this.name}' is already held by an application`)
    }

    this.#surrounding = middleware
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  /**
   * Assemble the network.
   *
   * Each layer is given the one beneath it and owns what it always owned. The
   * updates manager is handed a way to reach a datacenter and somewhere to put
   * what it decides is this account's to see, which is the only wiring between
   * the protocol and the events a caller registered for.
   *
   * The stack is loaded here rather than imported at the top of this file, so
   * that a program which never connects an account never evaluates the codec
   * tables or the layers that read them; `stack.ts` says why. It is loaded once
   * per process and is already resolved for every account after the first, so a
   * second connection pays nothing for it.
   */
  async #open(): Promise<void> {
    try {
      await this.#build()
    } catch (error) {
      // The area is taken before anything else on the way up is read, so a
      // start that fails after that point has already taken it. Giving it back
      // here is what stops one bad start from holding the name for the life of
      // the process — nothing above calls `stop` on a `start` that threw.
      await this.#release()
      throw error
    }
  }

  /** Everything a start does once the area belongs to this run. */
  async #build(): Promise<void> {
    const {
      API,
      CORE,
      MTPROTO,
      openConnections,
      openDatacenters,
      openPools,
      openUpdates,
      TlScope,
    } = await import('./stack.js')

    const scope = new TlScope('api', [CORE, MTPROTO, API])

    // Taken before anything is read from it or written to it. An account that
    // finds the area already held says so rather than writing over whatever is
    // there, which is what two accounts sharing one store used to do.
    this.#holder = `${String(Date.now().toString(36))}-${toHex(randomBytes(8))}`
    const lease = await claimArea(this.#options.storage, {
      name: this.name,
      holder: this.#holder,
      ...(this.#options.takeOverStorage === undefined
        ? {}
        : { takeOver: this.#options.takeOverStorage }),
      ...(this.#options.storageGuard === undefined ? {} : { guard: this.#options.storageGuard }),
      ...(this.#options.storageLeaseMs === undefined
        ? {}
        : { leaseMs: this.#options.storageLeaseMs }),
      onLost: (error) => {
        // Another run owns the area now, and nothing this one writes will land:
        // its place in the stream would stop advancing while it kept handling
        // updates the other run handles too. So it stops.
        this.#log.error('another run took over this account’s storage; stopping', {
          account: this.name,
          error,
        })
        void this.stop().catch(() => undefined)
      },
    })

    this.#lease = lease
    // Everything this account writes from here goes through the lease, so a
    // write that began before another run took the area over is refused rather
    // than landing in an area this run no longer owns.
    this.#area = lease.storage
    const storage = lease.storage

    // What the exclusion is actually worth, said once where somebody reading a
    // log can see it. An origin-wide guard covers every page that can reach the
    // store; a process-wide one covers this process and says nothing about
    // another opened over the same directory.
    this.#log.debug('this account holds its storage area', {
      account: this.name,
      exclusion: lease.scope,
    })

    await this.#seed(
      authorizationStore(namespaced(storage, 'auth:')),
      datacenterStore(namespaced(storage, 'dcs:')),
    )

    // Where the stream was left off, if this account has run before. Built here
    // rather than in the constructor because reading it is asynchronous and
    // because an account that never connects has no place in the stream to
    // resume from.
    this.#updates = updateStore(namespaced(storage, 'updates:'))
    this.#selfId = await readSelfId(storage)
    const resumed = await this.#updates.load()
    this.#state = new UpdateState(resumed ?? {})
    // Resumed as it is: a position far behind is legitimate after a long
    // absence, and nothing here can tell one from a position an earlier
    // version reached by starting where it assumed rather than where Telegram
    // said. Said, so that an operator watching a long catch-up knows why.
    if (resumed !== undefined && resumed.basis === undefined) {
      this.#log.warn(
        'updates: resuming from a position written without a recorded starting point; ' +
          'everything after it will be fetched and delivered',
        { pts: resumed.pts, date: resumed.date },
      )
    }

    const datacenters = await openDatacenters({
      scope,
      client: { apiId: this.#options.apiId, ...DEVICE, ...this.#options.device },
      keys: this.#options.keys,
      authorization: authorizationStore(namespaced(storage, 'auth:')),
      datacenters: datacenterStore(namespaced(storage, 'dcs:')),
      bootstrap: this.#options.bootstrap,
      ...(this.#options.obfuscated === undefined ? {} : { obfuscated: this.#options.obfuscated }),
      ...(this.#options.proxy === undefined ? {} : { route: this.#options.proxy }),
      ...(this.#options.open === undefined ? {} : { open: this.#options.open }),
      ...(this.#options.openChannel === undefined
        ? {}
        : { openChannel: this.#options.openChannel }),
      ...(this.#options.now === undefined ? {} : { now: this.#options.now }),
      ...(this.#options.random === undefined ? {} : { random: this.#options.random }),
      ...(this.#options.schedule === undefined ? {} : { schedule: this.#options.schedule }),
    })

    /**
     * Whether what arrived on a connection is this account's stream.
     *
     * `isUpdateSource` holds the rule and the reasons for it. Read here rather
     * than captured, because which datacenter an account belongs to changes: a
     * migration moves it, and the connection that becomes the stream is the one
     * at the datacenter it moved to.
     */
    const primary = (origin: ManagedConnection): boolean =>
      isUpdateSource(origin, datacenters.directory.thisDc)

    this.#link = 'idle'
    const connections = openConnections({
      datacenters,
      // What the server says without being asked. A connection reports every
      // message the session layer had no rule for, and among them are the
      // updates — which is the only way they reach an account at all.
      //
      // Filtered rather than forwarded wholesale: the sequence treats anything
      // it is handed as an update, so a pong or an acknowledgement passed on
      // here would be dispatched to handlers as though Telegram had said
      // something. Only the seven constructors of the `Updates` type qualify,
      // and `UPDATE_CONTAINERS` is that list.
      onEvent: (origin, event) => {
        // Nothing but the stream itself moves the account through the stream.
        if (!primary(origin)) return

        if (event.kind === 'new-session' && event.gap) {
          // The server started a new session, so whatever it sent while none
          // existed was never delivered — but only an account that had a place
          // in the stream can have lost anything. One that has never run has
          // nothing behind it, and asking for the difference from a position it
          // invented would fetch a backlog it was never meant to see. One that
          // has taken its starting position since does have a place.
          if (this.#network?.updates.established === true) this.#lifecycle.track(this.#catchUp())

          return
        }

        if (event.kind !== 'message') return
        if (!UPDATE_CONTAINERS.has(event.message.value._)) return

        // Not awaited, and tracked so that a shutdown waits for it: holding the
        // connection while a handler runs would make one slow handler a gap in
        // the stream.
        this.#lifecycle.track(this.feed(event.message.value))
      },
      // Only the connection carrying the stream decides the status: the others
      // come and go with transfers and calls to other datacenters, and none of
      // them being down means updates are not arriving.
      onState: (origin, state) => {
        if (!primary(origin)) return
        this.#link = state
        this.#observeStatus()
      },
      // Which connection lost its channel, with which kind of key, and what is
      // being done about it — the record an operator needs to tell a refused
      // key from a dropped socket. Counters and local names only.
      onDiagnostic: (_origin, report) => {
        const refused =
          report.event === 'key-discarded' || report.action === 'discard-key-and-reconnect'
        if (refused) this.#log.warn('connection: the datacenter refused the key', report)
        else this.#log.info('connection: a channel ended', report)
      },
      ...(this.#options.now === undefined ? {} : { now: this.#options.now }),
      ...(this.#options.random === undefined ? {} : { random: this.#options.random }),
      ...(this.#options.schedule === undefined ? {} : { schedule: this.#options.schedule }),
    })

    const pools = openPools({ connections })

    const updates = openUpdates({
      state: this.#state,
      peers: this.#peers,
      invoke: async (query) => await pools.get().invoke(query),
      onUpdate: (update) => {
        // Nothing waits for a handler: the sequence has already decided this
        // update is this account's to see, and holding the stream for whatever
        // a handler does would make one slow handler a gap in the sequence.
        this.#lifecycle.track(this.deliver(update))
      },
      onFailure: (error) => this.#log.error('updates', { error }),
      // A position read back from the store is one Telegram reported, however
      // small its numbers. Only an account that has none asks for one.
      established: resumed !== undefined,
      onPosition: async () => await this.#remember(),
      onProgress: (report) => {
        if (report.kind === 'retrying') this.#log.warn('updates: will try again', report)
        else this.#log.info(`updates: ${PROGRESS[report.kind]}`, report)
      },
      ...(this.#options.schedule === undefined ? {} : { schedule: this.#options.schedule }),
    })

    this.#network = { datacenters, connections, pools, updates }
  }

  /**
   * Put an imported session where the datacenter layer will find it.
   *
   * Once, on the way up and before anything reads an authorization. What a
   * caller passed a string for is to be this account, so the string is
   * authoritative: a key already in the store for another datacenter belongs to
   * whoever was there before, and an account that reached that datacenter would
   * use a stranger's key rather than its own.
   *
   * Every datacenter this account can reach is forgotten first, and the set is
   * read from the same place the datacenter layer reads it: a stored
   * configuration if the store holds one, and the supplied addresses otherwise.
   * A configuration the server published lists more datacenters than a bootstrap
   * does, and it is preferred over the bootstrap — so clearing only what the
   * bootstrap names would leave exactly the keys this account could still reach.
   *
   * A supplied store is still the caller's. This clears what would conflict
   * with the session it was asked to import, and nothing else.
   */
  async #seed(authorization: AuthorizationStore, datacenters: DatacenterStore): Promise<void> {
    const imported = this.#importing
    if (imported === undefined) return

    // An authorization already here for this datacenter that is not the one
    // being imported is somebody's signed-in account. It is kept unless the
    // caller said to replace it, and nothing is cleared before that is known.
    const existing = await authorization.key(imported.dcId)
    if (existing !== undefined && !sameBytes(existing, imported.authKey) && !imported.replace) {
      throw new SessionError(
        `the storage for the account '${this.name}' already holds a different authorization for ` +
          `datacenter ${imported.dcId}; import with replace: true to put this session in its place`,
      )
    }

    // Cleared before it is used, so a failure part-way leaves an account that
    // authorizes from nothing rather than one holding somebody else's key.
    this.#importing = undefined

    const configuration = (await datacenters.load()) ?? this.#options.bootstrap
    const reachable = new Set<number>([
      imported.dcId,
      configuration.thisDc,
      ...configuration.options.map((address) => address.id),
      ...this.#options.bootstrap.options.map((address) => address.id),
    ])

    // Forgotten before the imported key is written, so a failure between the
    // two leaves an account with no authorization rather than one holding both
    // its own and somebody else's.
    for (const dcId of reachable) await authorization.forget(dcId)

    await authorization.setKey(imported.dcId, imported.authKey)
    if (imported.self !== undefined) await this.#rememberSelf(imported.self.id, imported.self.isBot)
  }

  /**
   * Take the network down.
   *
   * Every layer that was opened is closed, in the order that leaves nothing
   * reaching for something already gone: the updates manager stops chasing
   * before the connections it would chase over are closed.
   */
  #close(): void {
    const network = this.#network
    // Cleared first, so anything that arrives while closing finds no network
    // rather than a half-closed one.
    this.#network = undefined
    if (network === undefined) return

    network.updates.close()
    network.connections.close()
    this.#link = 'closed'
    this.#observeStatus()
  }

  /**
   * Turn one update into an event and run the handlers for it.
   *
   * Where an application's middleware surrounds this account: outside the
   * dispatcher entirely, so what an application installs runs around this
   * account's own middleware rather than sorting into it.
   */
  async deliver(update: TlValue): Promise<void> {
    // Installed by dispatch as well as by a start, as a bot does: an update fed
    // in without a start must not reach handlers whose plugins are missing.
    if (this.#plugins.pending > 0) await this.#installPlugins()

    // A QR sign-in waiting on a token learns of the approval here. Told before
    // the handlers run and without waiting for them: a sign-in should not be
    // held up by what an application does with an unrelated update.
    if ((update as { readonly _?: unknown })._ === 'updateLoginToken') {
      for (const notify of [...this.#loginTokenWatchers]) notify()
    }

    const normalized = normalizeUpdate(update)
    this.#gather(normalized)

    await this.#dispatch(this.#contextOf(normalized))
  }

  /** The context an event is handled with, able to act through this account. */
  #contextOf(normalized: NormalizedUpdate): MtprotoContext & Ext {
    return contextFor(normalized, {
      client: this,
      log: this.#log,
      // What lets a handler answer what it just heard. The account supplies the
      // peers it has learned and the way to reach a datacenter, because it owns
      // both — nothing is resolved until a handler actually acts.
      actions: {
        peers: this.#peers,
        invoke: async (query) => await this.#invoke(query),
        random: this.#options.random ?? randomBytes,
        // Reaching a datacenter for a transfer is this account's to arrange.
        // What the reference is refreshed from is not, so the location comes
        // from the layer that still holds the message it arrived in.
        fetch: async (request, references) => {
          const reach = this.#transfers(await this.#allowance(request))
          const { download } = await import('./files/download.js')

          return await download({ ...request, reach, references })
        },
        // What the actions delegate to, so an answer is sent exactly as the
        // account's own methods send one.
        sending: this.#sending,
        lookup: async (peer) => await this.peer(peer),
      },
    }) as MtprotoContext & Ext
  }

  /**
   * Run the handlers for one event.
   *
   * Where an application's middleware surrounds this account: outside the
   * dispatcher entirely, so what an application installs runs around this
   * account's own middleware rather than sorting into it.
   */
  async #dispatch(context: MtprotoContext & Ext): Promise<void> {
    if (this.#surrounding === undefined) {
      await this.#dispatcher.dispatch(context)

      return
    }

    await this.#surrounding(context, async () => {
      await this.#dispatcher.dispatch(context)
    })
  }

  /**
   * Add a message to the album it belongs to, if anything could handle one.
   *
   * Each part has already been, or is about to be, handled as a message of its
   * own; this only arranges for the album to be handled once as well. Nothing
   * is held when no handler could take it, which is most programs.
   */
  #gather(normalized: NormalizedUpdate): void {
    const message = normalized.message
    if (normalized.kind !== 'message' || message?._ !== 'message') return
    const group = message.grouped_id
    const chat = normalized.chat
    if (group === undefined || chat === undefined) return

    const coverage = this.#dispatcher.collectKinds()
    if (!coverage.opaque && !coverage.kinds.has('mtproto:album')) return

    const key = `${chat.kind}:${chat.id}:${group}`
    const album = this.#albums.get(key) ?? { parts: [], cancel: () => {} }
    album.cancel()
    album.parts.push(normalized)
    album.cancel = (this.#options.schedule ?? defaultSchedule)(() => {
      this.#flushAlbum(key)
    }, this.#options.albumWindow ?? ALBUM_WINDOW)
    this.#albums.set(key, album)
  }

  /** Handle one gathered album now. */
  #flushAlbum(key: string): void {
    const album = this.#albums.get(key)
    if (album === undefined) return
    this.#albums.delete(key)
    album.cancel()

    const parts = [...album.parts].sort(
      (left, right) => Number(left.message?.['id'] ?? 0) - Number(right.message?.['id'] ?? 0),
    )
    const [first] = parts
    if (first === undefined) return

    const whole: NormalizedUpdate = {
      ...first,
      kind: 'mtproto:album',
      album: parts.flatMap((part) => (part.message === undefined ? [] : [part.message])),
      // An album's caption is on whichever part it was written on, usually
      // one; the first that has one speaks for the album.
      text: parts.find((part) => part.text !== undefined)?.text,
    }

    // Nothing awaits this: the timer that fired it has nobody to report to, so
    // it is tracked like any other update and its handlers' errors go where
    // theirs do.
    this.#lifecycle.track(this.#dispatch(this.#contextOf(whole))).catch((error: unknown) => {
      this.#log.error('unhandled error while dispatching an album', { error })
    })
  }

  /** Handle every album still gathering. */
  #flushAlbums(): void {
    for (const key of [...this.#albums.keys()]) this.#flushAlbum(key)
  }

  /**
   * Install whatever is queued, never twice at a time.
   *
   * Serialized on one chain, as a bot's are: two updates arriving before the
   * first start would otherwise both see the same queue and install it twice.
   */
  #installPlugins(): Promise<unknown> {
    this.#pluginWork = this.#pluginWork.then(() => this.#plugins.install(this))

    return this.#pluginWork
  }

  /**
   * Tell every observer about a transition.
   *
   * Every one is told even when one throws, and what threw is logged: the
   * transition is happening regardless, and an observer that failed to let go
   * of something is worth an operator's attention but not worth leaving the
   * network open for.
   */
  async #tell(transition: 'started' | 'stopping'): Promise<void> {
    for (const observer of [...this.#observers]) {
      try {
        await observer[transition]?.()
      } catch (error) {
        this.#log.error(`an observer failed on ${transition}`, { error })
      }
    }
  }

  /**
   * Ask what was missed while there was no session.
   *
   * Reported rather than thrown: this runs off the back of a connection event,
   * so there is nobody to throw to, and an account that cannot catch up is
   * still an account that works — it has simply missed something, which the
   * next gap it notices will also close.
   */
  async #catchUp(): Promise<void> {
    this.#catchingUp += 1
    this.#observeStatus()
    try {
      await this.#require().updates.recover()
      await this.#remember()
    } catch (error) {
      this.#log.error('updates', { error })
    } finally {
      this.#catchingUp -= 1
      this.#observeStatus()
    }
  }

  /**
   * The area, read at the moment of each call rather than captured.
   *
   * Built once and handed to the peer store, which outlives the swap from the
   * plain area to the leased one. Capturing the area instead would leave the
   * peer store writing through a view that is not fenced, which is the one
   * place an account writes most often.
   */
  #through(): KV<unknown> {
    return {
      get: (key) => this.#area.get(key),
      set: (key, value, options) => this.#area.set(key, value, options),
      delete: (key) => this.#area.delete(key),
      has: async (key) =>
        this.#area.has === undefined
          ? (await this.#area.get(key)) !== undefined
          : await this.#area.has(key),
      clear: async (prefix) => {
        await this.#area.clear?.(prefix)
      },
      keys: (prefix) => this.#area.keys?.(prefix) ?? noKeys(),
    }
  }

  /**
   * Give up the claim on the area, if this run holds it.
   *
   * What is released is the right to be the account running against this
   * storage, not what is in it: starting again resumes from what was left.
   * Reported rather than thrown — an account on the way down has nowhere to
   * throw, and a claim left behind is recoverable where a failed shutdown is
   * not.
   */
  async #release(): Promise<void> {
    const lease = this.#lease
    if (lease === undefined) return

    this.#lease = undefined
    this.#holder = undefined
    // Back to the unfenced view. A stopped account still answers `exportSession`
    // and still holds the peers it learned, and neither is a write another run
    // could collide with.
    this.#area = namespaced(this.#options.storage, areaFor(this.name))

    try {
      await lease.release()
    } catch (error) {
      this.#log.warn('the claim on this storage could not be given up', { error })
    }
  }

  /** Take whatever the connection reported, for the sequence to judge. */
  async feed(value: Parameters<Updates['feed']>[0]): Promise<void> {
    await this.#require().updates.feed(value)
    await this.#remember()
  }

  /**
   * Write down how far through the stream this account has got.
   *
   * Once per batch rather than once per update: what arrived together is judged
   * together, and when `feed` returns there is nothing half-applied to write.
   * The cost is the one this account already accepts elsewhere — every answer
   * it receives writes the peers it described — so a write per batch absorbed
   * is the same order of cost under the same owner.
   *
   * Any position written after the updates it counts is safe to resume from.
   * One that is behind asks for a difference and is told what it missed, which
   * is the machinery `docs/mtproto.md` §9.3 already describes; the only thing
   * that varies is how much of it a restart has to ask for.
   *
   * A store that will not take the position does not fail the stream. The
   * updates have already been judged and handed on, and losing the place costs
   * a catch-up rather than a correctness — the same trade the peer harvest
   * makes for the same reason.
   */
  async #remember(): Promise<void> {
    try {
      await this.#updates?.save(this.#state.snapshot())
    } catch (error) {
      this.#log.warn('could not write down how far through the stream this account has got', {
        error,
      })
    }
  }

  /**
   * Send one query over whichever connection the pools choose.
   *
   * The single place an account turns a query into a request. Both the escape
   * hatch and the actions a context is given go through it, so there is one
   * answer to which datacenter a call travels to, one answer to what happens
   * when there is no connection, and one place the peers an answer described
   * are written down.
   */
  async #invoke(query: TlValue, options?: CallDefaults): Promise<TlValue> {
    // A mention formatted by any means goes out addressed with the hash this
    // account holds; see `messaging/mentions.ts`.
    const answer = await this.#following(await addressMentions(query, this.#peers), options)
    await this.#learn(answer)

    return answer
  }

  /**
   * Make a call, going where a datacenter says the account is.
   *
   * A datacenter that redirects is not refusing the call so much as addressing
   * it: `docs/mtproto.md` §8 gives two of the four redirections an answer an
   * ordinary call can act on. An account that has moved leaves the datacenter
   * it moved to knowing nothing about it, so it is introduced there before the
   * call is worth repeating, and where it now lives is written down — nothing
   * else ever tells this account it moved, because the published configuration
   * is never re-fetched. A network that merely suggests another datacenter says
   * nothing about where the account lives, so that one is followed without
   * being recorded.
   *
   * The other two belong elsewhere and are raised rather than followed. A phone
   * redirection means signing in again at the datacenter it names, which is the
   * sign-in steps' business; a file redirection is a transfer's, and a transfer
   * already follows its own.
   *
   * Bounded by the number of datacenters there are to visit: a client cannot
   * legitimately be sent to more of them than exist, so anything past that is
   * datacenters pointing at each other rather than an account being found.
   */
  async #following(query: TlValue, options?: CallDefaults): Promise<TlValue> {
    let dcId = this.#require().datacenters.directory.thisDc
    const seen: number[] = [dcId]

    for (let redirection = 0; redirection <= MAX_MIGRATIONS; redirection += 1) {
      const here = this.#require().pools.get({ id: dcId })

      try {
        return await here.invoke(query, options)
      } catch (error) {
        // Loaded here rather than at the top of this file: recognising a
        // redirection needs the session layer's error type and answering one
        // needs the transfer, and neither belongs in the graph a program
        // evaluates just by importing the package. A call that is not
        // redirected never reaches this.
        const { MigrationError } = await import('./session/dispatcher.js')
        if (!(error instanceof MigrationError)) throw error
        if (error.kind !== 'user' && error.kind !== 'network') throw error

        await this.#addressable(error.dcId, here)

        if (error.kind === 'user') {
          const { transferAuthorization } = await import('./network/migration.js')
          await transferAuthorization({
            from: here,
            to: this.#require().pools.get({ id: error.dcId }),
            dcId: error.dcId,
          })
          await this.#belongTo(error.dcId)
        }

        dcId = error.dcId
        seen.push(dcId)
      }
    }

    throw new SessionError(`the datacenters redirected in a loop: ${seen.join(' → ')}`)
  }

  /**
   * Make sure a datacenter a redirection named can be reached at all.
   *
   * A first run is given one address, and the list it starts with is the list
   * it keeps. A redirection to a datacenter that list does not name would
   * otherwise be the end of the account: the call fails saying no address is
   * known, and every call after it fails the same way, because the thing that
   * would fix it is the list nobody asked for.
   *
   * The server publishes the whole list, and this is the one moment it is both
   * needed and known to be missing — so it is asked for here rather than on
   * every connection or every first call, neither of which knows whether the
   * list is sufficient. A redirection to a datacenter already in the list costs
   * nothing: the list is read, not fetched.
   *
   * Asked over the connection that issued the redirection, which is by
   * definition reachable, and `help.getConfig` needs no authorization.
   */
  async #addressable(dcId: number, here: Callable): Promise<void> {
    const { datacenters } = this.#require()
    if (datacenters.directory.candidates({ id: dcId }).length > 0) return

    await datacenters.refresh(here)
  }

  /**
   * Write down the peers an answer described.
   *
   * `docs/mtproto.md` §10 asks for this of every result, not only of updates:
   * an access hash is issued per account and cannot be worked out, and almost
   * every answer carries `users` and `chats` describing everyone it mentions.
   * Reading a conversation's history and then being unable to name anybody who
   * spoke in it is the failure this prevents — the hash was in the answer, and
   * throwing it away means asking Telegram for what has already arrived.
   *
   * Nothing is fetched and nothing extra is sent. This reads what came back
   * anyway, which is what makes it free of the traffic questions the rest of
   * this layer has to answer.
   *
   * A caller holding {@link Account.reach} invokes on a pool directly and is
   * outside this. That door is for choosing a datacenter, and what a caller
   * does with an answer it asked for by hand is theirs.
   *
   * A store that will not take the peers does not fail the call that carried
   * them. The answer is the caller's and it has already arrived; losing it
   * because something could not be written down would turn a successful call
   * into a failure over a record the account can learn again from the next
   * answer that mentions the same peer.
   */
  async #learn(answer: TlValue): Promise<void> {
    try {
      await harvest(this.#peers, answer)
    } catch (error) {
      this.#log.warn('could not write down the peers an answer described', { error })
    }
  }

  #require(): Network {
    if (this.#network === undefined) {
      throw new LifecycleError(`the account '${this.name}' is not connected`)
    }

    return this.#network
  }
}

/**
 * How often an account repeats that it is online, in milliseconds.
 *
 * Telegram forgets after about five minutes, so four is inside the margin
 * without being wasteful.
 */
const PRESENCE_INTERVAL = 240_000

/** Timers, where a caller supplied none. */
const defaultSchedule = (run: () => void, delayMs: number): (() => void) => {
  const timer = setTimeout(run, delayMs)

  return () => clearTimeout(timer)
}

/** Where an account writes down which user it is. */
const SELF = 'self'

/** Whether the user this account is, is a bot. */
const SELF_BOT = 'selfBot'

/** Options for {@link Account.fromString}, beside the account's own. */
export interface SessionImportOptions {
  /** The layout the string is in. `'portable'`, this library's own, unless given. */
  readonly format?: SessionFormat
  /**
   * Put this session in place of a different authorization the store already
   * holds for its datacenter. Without it, finding one is an error, since that
   * authorization is somebody's signed-in account.
   */
  readonly replace?: boolean
}

/** Whether two keys are the same key. */
function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

/**
 * A bootstrap's addresses, with the ones a session string named added for a
 * datacenter the bootstrap has none for. The bootstrap is the caller's
 * statement of where to go, and is not overridden.
 */
function withSessionAddresses(
  bootstrap: readonly DcAddress[],
  session: TransferredSession,
): readonly DcAddress[] {
  const added = session.addresses
    .filter(
      (address) =>
        !bootstrap.some(
          (known) => known.id === address.id && known.mediaOnly === address.mediaOnly,
        ),
    )
    .map(
      (address): DcAddress => ({
        id: address.id,
        host: address.host,
        port: address.port,
        ipv6: address.ipv6,
        mediaOnly: address.mediaOnly,
        tcpoOnly: false,
        cdn: false,
        static: false,
        thisPortOnly: false,
        secret: undefined,
      }),
    )

  return added.length === 0 ? bootstrap : [...bootstrap, ...added]
}

/** How long an album waits for its next part, unless an account says otherwise. */
const ALBUM_WINDOW = 250

/** An album being gathered. */
interface Album {
  readonly parts: NormalizedUpdate[]
  cancel: () => void
}

/**
 * Which user an account last knew itself to be, from its own area.
 *
 * Kept as text rather than a number: a user identifier is 64-bit, and a store
 * that round-trips through JSON would quietly lose the low bits of a large one.
 * Anything unreadable is treated as not yet known, because the only cost of
 * that is one call to find out again.
 */
async function readSelfId(storage: KV<unknown>): Promise<bigint | undefined> {
  const stored = await storage.get(SELF)
  if (typeof stored !== 'string') return undefined

  try {
    return BigInt(stored)
  } catch {
    return undefined
  }
}

/** Nothing, for a store that cannot enumerate its keys. */
async function* noKeys(): AsyncIterable<string> {
  // Deliberately yields nothing.
}

/** What an account's contexts are, for a caller naming the type. */
export type AccountContext<Ext = unknown> = MtprotoContext & Ext

/** So a context is recognisably dispatchable without naming the dispatcher. */
export type { Dispatchable }
