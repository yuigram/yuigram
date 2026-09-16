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
import {
  createLogger,
  type Dispatchable,
  Dispatcher,
  type ErrorHandler,
  file,
  type Handler,
  Lifecycle,
  LifecycleError,
  type Logger,
  type Middleware,
  NetworkError,
  namespaced,
  PeerError,
  SessionError,
  type StopOptions,
  TelegramError,
  type UseOptions,
  ValidationError,
} from '@yuigram/core'
import { type MtprotoApi, rawApi } from './api.js'
import type { ServerRsaKey } from './auth/keys.js'
import type { AdminRights, Restrictions } from './chats/common.js'
import type { Folder, NewFolder } from './chats/folders.js'
import {
  archiveChats,
  createFolder,
  deleteFolder,
  editFolder,
  markChatUnread,
  readFolders,
  saveDraft,
  setFolderOrder,
} from './chats/folders.js'
import type {
  ChatlistPreview,
  InviteLinkEdit,
  InvitePreview,
  NewInviteLink,
} from './chats/invites.js'
import {
  createInviteLink,
  decideAllJoinRequests,
  decideJoinRequest as decideInviteJoin,
  editInviteLink,
  exportInviteLink,
  joinByLink,
  joinChatlist,
  previewChatlist,
  previewInvite,
  primaryInviteLink,
  readInviteLink,
  revokeInviteLink,
} from './chats/invites.js'
import type { HistoryRemoval, NewChat } from './chats/lifecycle.js'
import {
  createChannel,
  createGroup,
  createSupergroup,
  deleteChannel,
  deleteGroup,
  deleteHistory,
  deleteMemberHistory,
} from './chats/lifecycle.js'
import type { FullChat } from './chats/lookup.js'
import {
  fetchChat,
  fetchChats,
  fetchDialogs,
  fetchFullChat,
  messageAuthor,
  previewChat,
  similarChannels,
} from './chats/lookup.js'
import {
  deleteChatPhoto,
  reorderChatUsernames,
  setChatColor,
  setChatDefaultPermissions,
  setChatDescription,
  setChatPhoto,
  setChatTitle,
  setChatTtl,
  setChatUsername,
  setSlowMode,
  toggleChatUsername,
  toggleContentProtection,
  toggleJoinRequests,
  toggleJoinToSend,
} from './chats/manage.js'
import type { AddOptions, NotAdded } from './chats/members.js'
import {
  addMembers,
  banMember,
  creatorAfterLeave,
  joinChat,
  kickMember,
  leaveChat,
  readChatMember,
  restrictMember,
  setAdminRights,
  setMemberRank,
  transferOwnership,
  unbanMember,
} from './chats/members.js'
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
import type { PeerStoriesView, StoryView, StoryViewerView } from './entities/story.js'
import type { DownloadOutcome, DownloadRequest, DownloadSink } from './files/download.js'
import type { UploadedFile, UploadRequest } from './files/upload.js'
import type {
  Boost,
  Photo,
  SavedStarGift,
  StarsTransaction,
  TypeEmojiStatus,
  TypeInputBotInlineResult,
  TypeInputMedia,
  TypeInputPeer,
  TypeMessageEntity,
  TypePeerColor,
  TypeSendMessageAction,
} from './generated/api/types/index.js'
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
import type { Connections, ManagedConnection } from './network/connections.js'
import type { Datacenters, DatacentersOptions } from './network/datacenters.js'
import type { DcConfiguration, DcDirectory } from './network/dc.js'
import type { Callable } from './network/migration.js'
import { harvest, inputPeer, resolveUsername } from './network/peers.js'
import type { Pools } from './network/pools.js'
import type { LoginTokenState, Reach, SignInOptions, SignInState } from './network/signin.js'
import { type MtprotoContext, mtprotoContext } from './normalize/context.js'
import { isUpdateSource, UPDATE_CONTAINERS } from './normalize/events.js'
import type { PeerRef } from './normalize/normalize.js'
import type { SentMessage } from './normalize/sent.js'
import type {
  AllStoriesOptions,
  BoostWalkOptions,
  ChatEventOptions,
  GiftWalkOptions,
  ImporterWalkOptions,
  InviteWalkOptions,
  MemberOptions,
  ReactionWalkOptions,
  SearchOptions,
  StarsWalkOptions,
  StoryWalkOptions,
  TopicWalkOptions,
  ViewerWalkOptions,
  WalkOptions,
} from './paging/walk.js'
import {
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
} from './paging/walk.js'
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
import { decodeSession, encodeSession, type PortableSession } from './session.js'
import { type AuthorizationStore, authorizationStore } from './storage/authorization.js'
import { type DatacenterStore, datacenterStore } from './storage/datacenters.js'
import { type AreaLease, areaFor, claimArea } from './storage/ownership.js'
import { type PeerStore, peerStore } from './storage/peers.js'
import { type UpdateStore, updateStore } from './storage/updates.js'
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
   * **One store per account.** The division here is by purpose, not by account,
   * because before it signs in an account has no identity to divide by. Two
   * accounts given the same store write to the same keys, and the second to
   * reach a datacenter overwrites the first one's authorization for it — with
   * no error, because neither key says who negotiated it. Give each account a
   * store of its own, or an area of one: `namespaced(store, 'first:')`.
   *
   * This is easiest to reach by accident in a browser, where `web()` called
   * twice with no arguments produces two stores over the same `localStorage`
   * under the same prefix, which is one store. A path or a prefix is the whole
   * of the fix.
   */
  readonly storage: KV<unknown>
  /**
   * Take an area a previous run left open.
   *
   * An account records that it holds its area of the store while it is running,
   * and gives that up when it stops. A run that ends without stopping — a
   * crash, a process killed — leaves the record behind, and the next run cannot
   * tell that from another program running right now. So it refuses, and this
   * is how a caller that knows better says otherwise.
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
   */
  readonly storageGuard?: Guard
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
  /** Installed by an application that holds this account. */
  #surrounding: Middleware<MtprotoContext & Ext> | undefined
  /**
   * A session this account was built from, until it has been written down.
   *
   * Held rather than applied because reading a session is immediate and writing
   * one is not: a caller finds out that a string is malformed where they passed
   * it, and the store learns about it on the way up, before anything reads an
   * authorization.
   */
  #importing: PortableSession | undefined

  constructor(options: AccountOptions) {
    this.#options = options
    this.name = options.name ?? 'account'
    this.#log = options.log ?? createLogger()
    this.#dispatcher = new Dispatcher<MtprotoContext & Ext>()
    this.#area = namespaced(options.storage, areaFor(this.name))
    this.#peers = peerStore(namespaced(this.#through(), 'peers:'))
    this.#lifecycle = new Lifecycle({
      onStart: () => this.#open(),
      onStop: async () => {
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
  static fromString<Ext = unknown>(session: string, options: AccountOptions): Account<Ext> {
    const imported = decodeSession(session)

    if (imported.testMode !== options.bootstrap.testMode) {
      // Addresses for one network and a key from the other cannot be made to
      // work, and the failure they produce says nothing about why.
      throw new SessionError(
        `a session for the ${imported.testMode ? 'test' : 'production'} network cannot be used ` +
          `with addresses for the ${options.bootstrap.testMode ? 'test' : 'production'} network`,
      )
    }

    const account = new Account<Ext>({
      ...options,
      // The session names the datacenter its key belongs to, which is this
      // account's own. A bootstrap says where to start looking, not whose key
      // this is.
      bootstrap: { ...options.bootstrap, thisDc: imported.dcId },
    })
    account.#importing = imported

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
  async exportSession(): Promise<string> {
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

    return encodeSession({
      dcId,
      testMode: configuration?.testMode ?? this.#options.bootstrap.testMode,
      authKey: key,
    })
  }

  /** How far through its lifecycle this account has got. */
  get state(): string {
    return this.#lifecycle.state
  }

  /** Whether this account is connected. */
  get connected(): boolean {
    return this.#network !== undefined
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
  dialogs(options?: WalkOptions): AsyncGenerator<DialogView, void, undefined> {
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
    options?: WalkOptions,
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
    options?: SearchOptions,
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
    options?: WalkOptions,
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
    const reached = state as { kind?: unknown; user?: { id?: unknown } }
    if (reached.kind === 'authorized' && typeof reached.user?.id === 'bigint') {
      await this.#rememberSelf(reached.user.id)
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
  async #rememberSelf(id: bigint): Promise<void> {
    if (this.#selfId === id) return

    this.#selfId = id

    try {
      await this.#area.set(SELF, id.toString())
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
   * Say whether this account is at the keyboard.
   *
   * Telegram treats an account that stops saying as offline after a few
   * minutes, so a program that wants to appear online repeats this. How often
   * is the caller's: nothing here puts it on a timer.
   */
  async setOnline(online: boolean): Promise<void> {
    await setOnline(this, online)
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
    return await addMembers(this, chat, people, options)
  }

  /** Bar somebody from a channel or supergroup. */
  async banMember(
    chat: string | PeerRef,
    member: string | PeerRef,
    options?: { readonly until?: number },
  ): Promise<void> {
    await banMember(this, chat, member, options)
  }

  /** Lift every restriction on somebody, letting them back in. */
  async unbanMember(chat: string | PeerRef, member: string | PeerRef): Promise<void> {
    await unbanMember(this, chat, member)
  }

  /** Restrict what somebody may do, without removing them. */
  async restrictMember(
    chat: string | PeerRef,
    member: string | PeerRef,
    restrictions: Restrictions,
  ): Promise<void> {
    await restrictMember(this, chat, member, restrictions)
  }

  /** Remove somebody without barring them from returning. */
  async kickMember(
    chat: string | PeerRef,
    member: string | PeerRef,
    options?: { readonly deleteHistory?: boolean },
  ): Promise<void> {
    await kickMember(this, chat, member, options)
  }

  /** Give somebody administrator rights; an empty record demotes them. */
  async setAdminRights(
    chat: string | PeerRef,
    member: string | PeerRef,
    rights: AdminRights,
    options?: { readonly rank?: string },
  ): Promise<void> {
    await setAdminRights(this, chat, member, rights, options)
  }

  /** Set the title shown beside an administrator's name. */
  async setMemberRank(
    chat: string | PeerRef,
    member: string | PeerRef,
    rank: string | undefined,
  ): Promise<void> {
    await setMemberRank(this, chat, member, rank)
  }

  /** Read one member's standing in a channel or supergroup. */
  async member(chat: string | PeerRef, member: string | PeerRef): Promise<MemberView | undefined> {
    return await readChatMember(this, chat, member)
  }

  /** Hand a conversation to somebody else, proving this account's password. */
  async transferOwnership(
    chat: string | PeerRef,
    to: string | PeerRef,
    password: string,
  ): Promise<void> {
    await transferOwnership(this, chat, to, password)
  }

  /** Join a channel or supergroup this account can already name. */
  async joinChat(chat: string | PeerRef): Promise<void> {
    await joinChat(this, chat)
  }

  /** Leave a conversation. */
  async leaveChat(
    chat: string | PeerRef,
    options?: { readonly deleteHistory?: boolean },
  ): Promise<void> {
    await leaveChat(this, chat, options)
  }

  /** Who would own this conversation if this account left it. */
  async creatorAfterLeave(chat: string | PeerRef): Promise<bigint | undefined> {
    return await creatorAfterLeave(this, chat)
  }

  /** Make an additional invite link, with its own limits. */
  async createInviteLink(chat: string | PeerRef, options?: NewInviteLink): Promise<InviteLinkView> {
    return await createInviteLink(this, chat, options)
  }

  /** Replace the conversation's permanent link, withdrawing the old one. */
  async exportInviteLink(chat: string | PeerRef): Promise<InviteLinkView> {
    return await exportInviteLink(this, chat)
  }

  /** Change a link's limits. Zero clears one rather than setting it. */
  async editInviteLink(
    chat: string | PeerRef,
    link: string | InviteLinkView,
    edit: InviteLinkEdit,
  ): Promise<InviteLinkView> {
    return await editInviteLink(this, chat, link, edit)
  }

  /** Withdraw a link, and hand back the replacement where one was issued. */
  async revokeInviteLink(
    chat: string | PeerRef,
    link: string | InviteLinkView,
  ): Promise<{
    readonly revoked: InviteLinkView
    readonly replacement: InviteLinkView | undefined
  }> {
    return await revokeInviteLink(this, chat, link)
  }

  /** Read one invite link by its text. */
  async inviteLink(chat: string | PeerRef, link: string): Promise<InviteLinkView> {
    return await readInviteLink(this, chat, link)
  }

  /** The conversation's permanent link, read rather than replaced. */
  async primaryInviteLink(chat: string | PeerRef): Promise<InviteLinkView | undefined> {
    return await primaryInviteLink(this, chat)
  }

  /** Let one person in through a link that needs approval, or turn them away. */
  async decideJoin(
    chat: string | PeerRef,
    person: string | PeerRef,
    approve: boolean,
  ): Promise<void> {
    await decideInviteJoin(this, chat, person, approve)
  }

  /** Decide every pending request at once, optionally for one link. */
  async decideAllJoins(
    chat: string | PeerRef,
    approve: boolean,
    options?: { readonly link?: string | InviteLinkView },
  ): Promise<void> {
    await decideAllJoinRequests(this, chat, approve, options)
  }

  /** Look at what an invite link opens, without joining it. */
  async previewInvite(hash: string): Promise<InvitePreview> {
    return await previewInvite(this, hash)
  }

  /** Join by invite link. A link needing approval files a request instead. */
  async joinByLink(hash: string): Promise<void> {
    await joinByLink(this, hash)
  }

  /** Look at a shared folder link without joining it. */
  async previewChatlist(slug: string): Promise<ChatlistPreview> {
    return await previewChatlist(this, slug)
  }

  /** Join a shared folder, taking the conversations named. */
  async joinChatlist(slug: string, chats: readonly (string | PeerRef)[]): Promise<void> {
    await joinChatlist(this, slug, chats)
  }

  /** Rename a conversation. */
  async setChatTitle(chat: string | PeerRef, title: string): Promise<void> {
    await setChatTitle(this, chat, title)
  }

  /** Change what a conversation says about itself. */
  async setChatDescription(chat: string | PeerRef, description: string | undefined): Promise<void> {
    await setChatDescription(this, chat, description)
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
    await setChatPhoto(this, chat, options)
  }

  /** Take the picture off a conversation. */
  async deleteChatPhoto(chat: string | PeerRef): Promise<void> {
    await deleteChatPhoto(this, chat)
  }

  /** Give a channel a public name, or take it away. */
  async setChatUsername(chat: string | PeerRef, username: string | undefined): Promise<void> {
    await setChatUsername(this, chat, username)
  }

  /** Turn one of a conversation's additional usernames on or off. */
  async toggleChatUsername(
    chat: string | PeerRef,
    username: string,
    active: boolean,
  ): Promise<void> {
    await toggleChatUsername(this, chat, username, active)
  }

  /** Put a conversation's usernames in a given order. */
  async reorderChatUsernames(chat: string | PeerRef, order: readonly string[]): Promise<void> {
    await reorderChatUsernames(this, chat, order)
  }

  /** How long messages live in one conversation. Zero turns it off. */
  async setChatTtl(chat: string | PeerRef, seconds: number): Promise<void> {
    await setChatTtl(this, chat, seconds)
  }

  /** What everybody who is not an administrator may not do. */
  async setChatDefaultPermissions(
    chat: string | PeerRef,
    restrictions: Restrictions,
  ): Promise<void> {
    await setChatDefaultPermissions(this, chat, restrictions)
  }

  /** How long a member must wait between messages. Zero turns it off. */
  async setSlowMode(chat: string | PeerRef, seconds: number): Promise<void> {
    await setSlowMode(this, chat, seconds)
  }

  /** Hide the forward and copy buttons. Not a security control. */
  async toggleContentProtection(chat: string | PeerRef, enabled: boolean): Promise<void> {
    await toggleContentProtection(this, chat, enabled)
  }

  /** Make joining need approval. */
  async toggleJoinRequests(chat: string | PeerRef, enabled: boolean): Promise<void> {
    await toggleJoinRequests(this, chat, enabled)
  }

  /** Require membership before somebody may write. */
  async toggleJoinToSend(chat: string | PeerRef, enabled: boolean): Promise<void> {
    await toggleJoinToSend(this, chat, enabled)
  }

  /** Set the accent colour a conversation is shown in. */
  async setChatColor(
    chat: string | PeerRef,
    colour: TypePeerColor | undefined,
    options?: { readonly forProfile?: boolean },
  ): Promise<void> {
    await setChatColor(this, chat, colour, options)
  }

  /** Make a basic group, which needs the people in it at creation. */
  async createGroup(chat: NewChat, people: readonly (string | PeerRef)[]): Promise<ChatView> {
    return await createGroup(this, chat, people)
  }

  /** Make a supergroup, which starts empty. */
  async createSupergroup(chat: NewChat & { readonly forum?: boolean }): Promise<ChatView> {
    return await createSupergroup(this, chat)
  }

  /** Make a broadcast channel. */
  async createChannel(chat: NewChat): Promise<ChatView> {
    return await createChannel(this, chat)
  }

  /** Delete a channel or supergroup for everybody. Irreversible. */
  async deleteChannel(chat: string | PeerRef): Promise<void> {
    await deleteChannel(this, chat)
  }

  /** Delete a basic group for everybody. */
  async deleteGroup(chat: string | PeerRef): Promise<void> {
    await deleteGroup(this, chat)
  }

  /** Remove what was said in a conversation. */
  async deleteHistory(chat: string | PeerRef, options?: HistoryRemoval): Promise<void> {
    await deleteHistory(this, chat, options)
  }

  /** Remove everything one person said in a channel or supergroup. */
  async deleteMemberHistory(chat: string | PeerRef, member: string | PeerRef): Promise<void> {
    await deleteMemberHistory(this, chat, member)
  }

  /** Read a conversation this account can name. */
  async chat(chat: string | PeerRef): Promise<ChatView> {
    return await fetchChat(this, chat)
  }

  /** Read several conversations, positionally, with a gap for each unknown one. */
  async chats(chats: readonly (string | PeerRef)[]): Promise<(ChatView | undefined)[]> {
    return await fetchChats(this, chats)
  }

  /** Read everything Telegram will say about a conversation. */
  async fullChat(chat: string | PeerRef): Promise<FullChat> {
    return await fetchFullChat(this, chat)
  }

  /** What a public conversation looks like from outside it. */
  async previewChat(username: string): Promise<ChatView | undefined> {
    return await previewChat(this, username)
  }

  /** Channels Telegram thinks are like this one. */
  async similarChannels(chat: string | PeerRef): Promise<ChatView[]> {
    return await similarChannels(this, chat)
  }

  /** Who wrote a post in a channel that signs its posts. */
  async messageAuthor(chat: string | PeerRef, messageId: number): Promise<UserView | undefined> {
    return await messageAuthor(this, chat, messageId)
  }

  /** This account's own record about particular conversations. */
  async peerDialogs(chats: readonly (string | PeerRef)[]): Promise<DialogView[]> {
    return await fetchDialogs(this, chats)
  }

  /** Every folder this account has, in the order they are shown. */
  async folders(): Promise<Folder[]> {
    return await readFolders(this)
  }

  /** Make a folder. The number is the caller's to choose. */
  async createFolder(folder: NewFolder): Promise<void> {
    await createFolder(this, folder)
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
    await editFolder(this, id, edit)
  }

  /** Remove a folder. The conversations in it are not affected. */
  async deleteFolder(id: number): Promise<void> {
    await deleteFolder(this, id)
  }

  /** Put the folders in a given order. */
  async setFolderOrder(order: readonly number[]): Promise<void> {
    await setFolderOrder(this, order)
  }

  /** Move conversations into the archive, or back out of it. */
  async archiveChats(chats: readonly (string | PeerRef)[], archived: boolean): Promise<void> {
    await archiveChats(this, chats, archived)
  }

  /** Mark a conversation as unread, or clear the mark. */
  async markChatUnread(chat: string | PeerRef, unread: boolean): Promise<void> {
    await markChatUnread(this, chat, unread)
  }

  /** Keep an unsent message against a conversation. */
  async saveDraft(
    chat: string | PeerRef,
    text: string | undefined,
    options?: { readonly entities?: readonly TypeMessageEntity[]; readonly replyTo?: number },
  ): Promise<void> {
    await saveDraft(this, chat, text, options)
  }

  // ---------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------

  /** Add middleware to this account's own chain. */
  use(middleware: Middleware<MtprotoContext & Ext>, options?: UseOptions): this {
    this.#dispatcher.use(middleware, options)

    return this
  }

  /** Handle events of a kind. */
  on(kind: string | readonly string[], handler: Handler<MtprotoContext & Ext>): this {
    this.#dispatcher.on(kind, handler)

    return this
  }

  /** Handle new messages. */
  onMessage(handler: Handler<MtprotoContext & Ext>): this {
    return this.on('message', handler)
  }

  /** Be told about anything a handler threw. */
  catch(handler: ErrorHandler<MtprotoContext & Ext>): this {
    this.#dispatcher.catch(handler)

    return this
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

    const datacenters = await openDatacenters({
      scope,
      client: { apiId: this.#options.apiId, ...DEVICE, ...this.#options.device },
      keys: this.#options.keys,
      authorization: authorizationStore(namespaced(storage, 'auth:')),
      datacenters: datacenterStore(namespaced(storage, 'dcs:')),
      bootstrap: this.#options.bootstrap,
      ...(this.#options.obfuscated === undefined ? {} : { obfuscated: this.#options.obfuscated }),
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
          // invented would fetch a backlog it was never meant to see.
          if (resumed !== undefined) this.#lifecycle.track(this.#catchUp())

          return
        }

        if (event.kind !== 'message') return
        if (!UPDATE_CONTAINERS.has(event.message.value._)) return

        // Not awaited, and tracked so that a shutdown waits for it: holding the
        // connection while a handler runs would make one slow handler a gap in
        // the stream.
        this.#lifecycle.track(this.feed(event.message.value))
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
  }

  /**
   * Turn one update into an event and run the handlers for it.
   *
   * Where an application's middleware surrounds this account: outside the
   * dispatcher entirely, so what an application installs runs around this
   * account's own middleware rather than sorting into it.
   */
  async deliver(update: Parameters<typeof mtprotoContext>[0]): Promise<void> {
    const context = mtprotoContext(update, {
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
      },
    }) as MtprotoContext & Ext

    if (this.#surrounding === undefined) {
      await this.#dispatcher.dispatch(context)

      return
    }

    await this.#surrounding(context, async () => {
      await this.#dispatcher.dispatch(context)
    })
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
    try {
      await this.#require().updates.recover()
      await this.#remember()
    } catch (error) {
      this.#log.error('updates', { error })
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
  async #invoke(query: TlValue): Promise<TlValue> {
    const answer = await this.#following(query)
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
  async #following(query: TlValue): Promise<TlValue> {
    let dcId = this.#require().datacenters.directory.thisDc
    const seen: number[] = [dcId]

    for (let redirection = 0; redirection <= MAX_MIGRATIONS; redirection += 1) {
      const here = this.#require().pools.get({ id: dcId })

      try {
        return await here.invoke(query)
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

/** Where an account writes down which user it is. */
const SELF = 'self'

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
