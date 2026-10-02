/**
 * An account wired to an in-process Telegram.
 *
 * Drives the real account — dispatch, middleware, context, filters, sessions,
 * the operations a handler calls, the peers it keeps — with the connection to
 * Telegram replaced by one that answers from a script. No key is exchanged and
 * nothing leaves the process, so a test of an application's handlers runs in
 * milliseconds and needs no credentials.
 *
 * What is replaced is exactly the channel an account sends calls over; above
 * it, nothing is. A call a handler makes arrives here as the TL value the
 * account would have sent, and is answered with a TL value as Telegram would
 * answer it, or refused with the error an account raises for a refusal.
 *
 * The protocol itself — the key exchange, the encrypted session, the update
 * sequence — is not what this tests; the project's own suites test that against
 * datacenters that do the real work.
 */

import {
  createLogger,
  type LogFields,
  type Logger,
  memory,
  processGuard,
  silentSink,
} from '@yuigram/core'
import { Account, type AccountOptions } from '../account.js'
import type { TypeMessageAction } from '../generated/api/types/index.js'
import { AuthKey } from '../message/auth-key.js'
import type { DcConfiguration } from '../network/dc.js'
import type { PeerRef } from '../normalize/normalize.js'
import { rpcErrorToException } from '../session/errors.js'
import type { TlValue } from '../tl/index.js'

/** One call the account made, as it sent it. */
export interface RecordedInvoke {
  /** The method, with any wrapping the account adds taken off. */
  readonly method: string
  /** The call itself, unwrapped. */
  readonly query: TlValue
  /** Where it falls among every call made. */
  readonly index: number
}

/** What a method answers with: one value, or the list a method such as `users.getUsers` returns. */
export type Answered = TlValue | readonly TlValue[]

/** How a call is answered: a value, or a function of the call. */
export type Answer = Answered | ((query: TlValue) => Answered | Promise<Answered>)

/** Everything the account asked Telegram for. */
export interface AccountCalls {
  readonly calls: readonly RecordedInvoke[]
  callsTo(method: string): readonly RecordedInvoke[]
  last(method: string): RecordedInvoke | undefined
  count(method: string): number
  /** Forget what was recorded so far. */
  reset(): void
}

/** Who sends a message, and where. */
export interface AccountMessageOptions {
  /** The sender. A user of its own unless given. */
  readonly from?: TestUser
  /** Where it was said: the sender's private chat unless given. */
  readonly chat?: PeerRef
  /** Its number in the conversation. Counted up unless given. */
  readonly id?: number
  /** Whether this account sent it. */
  readonly out?: boolean
  /** In Unix seconds. */
  readonly date?: number
}

/** A person in a test. */
export interface TestUser {
  readonly id: bigint
  readonly accessHash: bigint
  readonly firstName: string
  readonly username?: string
  readonly bot?: boolean
}

/** Ways to feed updates into the account. */
export interface AccountSender {
  /** Deliver one update, exactly as Telegram would send it. */
  update(update: TlValue): Promise<void>
  /** Deliver a text message. */
  message(text: string, options?: AccountMessageOptions): Promise<void>
  /** Deliver a service message saying something happened. */
  service(action: TypeMessageAction, options?: AccountMessageOptions): Promise<void>
  /**
   * Deliver a button press on a message this account sent, as a bot receives
   * one. The message is the latest this account sent with a keyboard, unless
   * one is named by number.
   */
  press(
    data: string,
    options?: { readonly from?: TestUser; readonly messageId?: number },
  ): Promise<void>
}

/** What {@link mockAccount} hands back. */
export interface MockAccount {
  /** The account under test. Register handlers on it as usual. */
  readonly account: Account
  /** Feed updates in. */
  readonly send: AccountSender
  /** Everything the account asked Telegram for. */
  readonly calls: AccountCalls
  /** The messages this account sent, as the harness answered them. */
  readonly sent: readonly TlValue[]
  /**
   * Errors a handler threw that nothing caught, in order. Collected from the
   * account's logger, so `account.catch` still takes what it takes.
   */
  readonly errors: readonly unknown[]
  /** Answer a method this way from now on. */
  on(method: string, answer: Answer): MockAccount
  /** Answer a method this way once, before any standing answer. */
  once(method: string, answer: Answer): MockAccount
  /** Stop the account. */
  dispose(): Promise<void>
}

/** Options for {@link mockAccount}. */
export interface MockAccountOptions
  extends Partial<Omit<AccountOptions, 'openChannel' | 'open' | 'keys' | 'bootstrap'>> {
  /** Who this account is. A user of its own unless given. */
  readonly self?: TestUser
}

/**
 * Refuse a call the way Telegram does.
 *
 * The account raises what it raises for a real refusal — an `RpcError` with the
 * code and the name, a `FloodError` for a wait, a `MigrationError` for a
 * redirection — because the value goes through the same conversion.
 *
 * ```ts
 * harness.once('messages.sendMessage', rpcError(403, 'CHAT_WRITE_FORBIDDEN'))
 * ```
 */
export function rpcError(code: number, text: string): Answer {
  return (query) => {
    throw rpcErrorToException({ _: 'rpc_error', error_code: code, error_message: text }, query._)
  }
}

/** The wrappers an account puts around a call, taken off to find the call. */
const WRAPPERS = new Set([
  'invokeWithLayer',
  'initConnection',
  'invokeWithoutUpdates',
  'invokeAfterMsg',
  'invokeWithTakeout',
  'invokeWithMessagesRange',
  'invokeWithBusinessConnection',
  'invokeWithGooglePlayIntegrity',
  'invokeWithApnsSecret',
  'invokeWithReCaptcha',
])

function unwrap(query: TlValue): TlValue {
  let current = query
  while (WRAPPERS.has(current._) && typeof current['query'] === 'object') {
    current = current['query'] as TlValue
  }
  return current
}

const BOOTSTRAP: DcConfiguration = {
  thisDc: 2,
  testMode: false,
  options: [
    {
      id: 2,
      host: '127.0.0.1',
      port: 443,
      ipv6: false,
      mediaOnly: false,
      cdn: false,
      secret: undefined,
      tcpoOnly: false,
      thisPortOnly: false,
      static: false,
    },
  ],
}

/** Keeps what no handler caught, and forwards everything. */
function capturing(target: Logger, errors: unknown[]): Logger {
  const keep = (message: string, fields: LogFields | undefined): void => {
    if (message.startsWith('unhandled error while dispatching')) errors.push(fields?.['error'])
  }

  return {
    debug: (message, fields) => target.debug(message, fields),
    info: (message, fields) => target.info(message, fields),
    warn: (message, fields) => target.warn(message, fields),
    error: (message, fields) => {
      keep(message, fields)
      target.error(message, fields)
    },
    child: (name, fields) => capturing(target.child(name, fields), errors),
    isEnabled: (level) => level === 'error' || target.isEnabled(level),
  }
}

/** What a callback button sends, as text, in either form the schema has had for one. */
function callbackDataOf(button: TlValue): string | undefined {
  const type = button['type'] as TlValue | undefined
  const bytes =
    button._ === 'keyboardInlineButton' && type?._ === 'inlineButtonTypeCallback'
      ? type['data']
      : button._ === 'keyboardButtonCallback'
        ? button['data']
        : undefined
  return bytes instanceof Uint8Array ? new TextDecoder().decode(bytes) : undefined
}

const peerOf = (ref: PeerRef): TlValue =>
  ref.kind === 'user'
    ? { _: 'peerUser', user_id: ref.id }
    : ref.kind === 'chat'
      ? { _: 'peerChat', chat_id: ref.id }
      : { _: 'peerChannel', channel_id: ref.id }

/**
 * Create an account backed by an in-process Telegram.
 *
 * ```ts
 * const { account, send, calls } = mockAccount()
 * account.on('message', f.text('ping'), (event) => event.reply('pong'))
 *
 * await send.message('ping')
 * expect(calls.last('messages.sendMessage')?.query).toMatchObject({ message: 'pong' })
 * ```
 *
 * Sending, editing and deleting messages, reading history, reacting, typing and
 * answering a button are answered without being scripted, as Telegram would
 * answer them. Anything else is refused with an error naming the method, and
 * scripted with `on` or `once`.
 */
export function mockAccount(options: MockAccountOptions = {}): MockAccount {
  const recorded: RecordedInvoke[] = []
  const standing = new Map<string, Answer>()
  const queued = new Map<string, Answer[]>()
  const sent: TlValue[] = []
  const errors: unknown[] = []
  const self: TestUser = options.self ?? { id: 1n, accessHash: 10n, firstName: 'Me' }
  let nextMessageId = 100
  let pts = 1
  let nextUser = 1000n

  const now = (): number => Math.floor((options.now?.() ?? Date.now()) / 1000)

  // A message as Telegram answers a send: this account's, in the conversation
  // asked for, reported through the updates a send causes.
  const answerSend = (query: TlValue): TlValue => {
    const peer = query['peer'] as TlValue
    const target =
      peer._ === 'inputPeerUser'
        ? { _: 'peerUser', user_id: peer['user_id'] }
        : peer._ === 'inputPeerChat'
          ? { _: 'peerChat', chat_id: peer['chat_id'] }
          : peer._ === 'inputPeerChannel'
            ? { _: 'peerChannel', channel_id: peer['channel_id'] }
            : { _: 'peerUser', user_id: self.id }
    const message: TlValue = {
      _: 'message',
      out: true,
      id: nextMessageId++,
      peer_id: target,
      from_id: { _: 'peerUser', user_id: self.id },
      date: now(),
      message: typeof query['message'] === 'string' ? query['message'] : '',
      ...(query['entities'] === undefined ? {} : { entities: query['entities'] }),
      ...(query['reply_markup'] === undefined ? {} : { reply_markup: query['reply_markup'] }),
    }
    sent.push(message)
    pts += 1
    return {
      _: 'updates',
      updates: [
        { _: 'updateMessageID', id: message['id'], random_id: query['random_id'] },
        { _: 'updateNewMessage', message, pts, pts_count: 1 },
      ],
      users: [],
      chats: [],
      date: now(),
      seq: 0,
    }
  }

  const answerEdit = (query: TlValue): TlValue => {
    const index = sent.findIndex((one) => one['id'] === query['id'])
    const before = sent[index]
    const message: TlValue = {
      ...(before ?? {
        _: 'message',
        id: query['id'],
        peer_id: { _: 'peerUser', user_id: self.id },
      }),
      _: 'message',
      edit_date: now(),
      ...(typeof query['message'] === 'string' ? { message: query['message'] } : {}),
      ...(query['entities'] === undefined ? {} : { entities: query['entities'] }),
      ...(query['reply_markup'] === undefined ? {} : { reply_markup: query['reply_markup'] }),
    }
    if (index !== -1) sent[index] = message
    pts += 1
    return {
      _: 'updates',
      updates: [{ _: 'updateEditMessage', message, pts, pts_count: 1 }],
      users: [],
      chats: [],
      date: now(),
      seq: 0,
    }
  }

  const affected = (): TlValue => {
    pts += 1
    return { _: 'messages.affectedMessages', pts, pts_count: 1 }
  }

  const DEFAULTS: Record<string, Answer> = {
    'messages.sendMessage': answerSend,
    'messages.sendMedia': answerSend,
    'messages.editMessage': answerEdit,
    'messages.deleteMessages': affected,
    'channels.deleteMessages': affected,
    'messages.readHistory': affected,
    'channels.readHistory': { _: 'boolTrue' },
    'messages.setTyping': { _: 'boolTrue' },
    'messages.setBotCallbackAnswer': { _: 'boolTrue' },
    'messages.sendReaction': () => ({
      _: 'updates',
      updates: [],
      users: [],
      chats: [],
      date: now(),
      seq: 0,
    }),
    'updates.getState': () => ({
      _: 'updates.state',
      pts,
      qts: 0,
      date: now(),
      seq: 0,
      unread_count: 0,
    }),
  }

  const answer = async (query: TlValue): Promise<TlValue> => {
    const call = unwrap(query)
    recorded.push({ method: call._, query: call, index: recorded.length })

    const pending = queued.get(call._)
    const chosen = pending?.shift() ?? standing.get(call._) ?? DEFAULTS[call._]
    if (pending !== undefined && pending.length === 0) queued.delete(call._)
    if (chosen === undefined) {
      throw new Error(`no answer is scripted for '${call._}'; script one with on() or once()`)
    }

    // A list goes back as it is: the account reads a vector where the method returns one.
    return (typeof chosen === 'function' ? await chosen(call) : chosen) as TlValue
  }

  const log = capturing(options.log ?? createLogger({ sink: silentSink() }), errors)
  const { self: _self, ...accountOptions } = options
  const account = new Account({
    apiId: 1,
    apiHash: 'test',
    storage: memory(),
    // Nothing is scheduled unless a case asks: an account's timers chase a
    // network that is not there.
    schedule: () => () => {},
    // A guard of its own. The process-wide one would make two harnesses with
    // the same account name contenders, and a test that failed before it
    // disposed would hold the name against every test after it.
    storageGuard: processGuard(),
    ...accountOptions,
    log,
    keys: [],
    bootstrap: BOOTSTRAP,
    openChannel: async (channel) =>
      ({
        dcId: channel.address.id,
        authorization: channel.authorization ?? {
          key: AuthKey.from(new Uint8Array(256)),
          salt: 0n,
          ...(channel.expiresIn === undefined ? {} : { expiresAt: 2_000_000_000 }),
        },
        state: 'ready',
        invoke: answer,
        bind: async () => {},
        close() {},
      }) as never,
  })

  let connected: Promise<void> | undefined
  const ready = (): Promise<void> => {
    connected ??= account.connect()
    return connected
  }

  /** Write down a person, as an account does for everybody an update names. */
  const know = async (person: TestUser): Promise<void> => {
    await account.peers.save({
      kind: 'user',
      id: person.id,
      accessHash: person.accessHash,
      min: false,
      usernames: person.username === undefined ? [] : [person.username.toLowerCase()],
    })
  }

  const knowChat = async (chat: PeerRef): Promise<void> => {
    if (chat.kind === 'user') return
    await account.peers.save({
      kind: chat.kind,
      id: chat.id,
      ...(chat.kind === 'channel' ? { accessHash: chat.id * 7n } : {}),
      min: false,
      usernames: [],
    })
  }

  const person = (): TestUser => {
    const id = nextUser++
    return { id, accessHash: id * 7n, firstName: 'Test' }
  }

  const deliver = async (update: TlValue): Promise<void> => {
    await ready()
    await account.deliver(update)
  }

  const messageUpdate = async (
    body: TlValue,
    messageOptions: AccountMessageOptions,
  ): Promise<void> => {
    const from = messageOptions.from ?? person()
    const chat = messageOptions.chat ?? { kind: 'user', id: from.id }
    await ready()
    await know(from)
    await knowChat(chat)
    pts += 1
    const message = {
      ...body,
      id: messageOptions.id ?? nextMessageId++,
      peer_id: peerOf(chat),
      from_id: { _: 'peerUser', user_id: from.id },
      date: messageOptions.date ?? now(),
      ...(messageOptions.out === true ? { out: true } : {}),
    }
    await deliver(
      chat.kind === 'channel'
        ? { _: 'updateNewChannelMessage', message, pts, pts_count: 1 }
        : { _: 'updateNewMessage', message, pts, pts_count: 1 },
    )
  }

  const harness: MockAccount = {
    account,
    sent,
    errors,
    calls: {
      calls: recorded,
      callsTo: (method) => recorded.filter((call) => call.method === method),
      last: (method) => recorded.filter((call) => call.method === method).at(-1),
      count: (method) => recorded.filter((call) => call.method === method).length,
      reset: () => {
        recorded.length = 0
      },
    },
    on(method, given) {
      standing.set(method, given)
      return harness
    },
    once(method, given) {
      const list = queued.get(method) ?? []
      list.push(given)
      queued.set(method, list)
      return harness
    },
    send: {
      update: deliver,
      message: (text, messageOptions = {}) =>
        messageUpdate({ _: 'message', message: text }, messageOptions),
      service: (action, messageOptions = {}) =>
        messageUpdate({ _: 'messageService', action }, messageOptions),
      async press(data, pressOptions = {}) {
        const target =
          pressOptions.messageId === undefined
            ? sent.findLast((one) => one['reply_markup'] !== undefined)
            : sent.find((one) => one['id'] === pressOptions.messageId)
        if (target === undefined) throw new Error(`there is no sent message to press '${data}' on`)

        const markup = target['reply_markup'] as { rows?: { buttons?: TlValue[] }[] } | undefined
        const bytes = new TextEncoder().encode(data)
        const offered = (markup?.rows ?? [])
          .flatMap((row) => row.buttons ?? [])
          .some((button) => callbackDataOf(button) === data)
        if (!offered)
          throw new Error(`no button on message ${String(target['id'])} sends '${data}'`)

        const from = pressOptions.from ?? person()
        await ready()
        await know(from)
        await deliver({
          _: 'updateBotCallbackQuery',
          query_id: BigInt(nextMessageId++),
          user_id: from.id,
          peer: target['peer_id'],
          msg_id: target['id'],
          chat_instance: 1n,
          data: bytes,
        })
      },
    },
    async dispose() {
      await account.stop({ timeout: 100 })
    },
  }

  return harness
}
