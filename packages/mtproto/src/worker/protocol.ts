// SPDX-License-Identifier: MIT

/**
 * What a caller and a worker host say to each other.
 *
 * The host owns a real {@link Account} — its connections, its keys, its peers
 * and its place in the update stream. A caller in a page, a tab or a thread
 * owns nothing but a port, and every capability it uses crosses that port as
 * one of the messages below.
 *
 * ```
 *   caller                                  host
 *     hello {v}                  ───────>   welcome {v} | mismatch {v}
 *     attach {account, lock?}    ───────>   attached {status}
 *     call {id, method, args}    ───────>   result {id} | failure {id}
 *     abort {id}                 ───────>   (the call rejects as cancelled)
 *                                <───────   callback {id, slot, args}
 *     callback-result {id}       ───────>
 *                                <───────   update {seq, update}
 *     ack {seq}                  ───────>
 *     pull {stream, credit}      ───────>   item {stream} ... | end | failure
 *                                <───────   status {status}
 *     ping                       ───────>   pong
 *     release                    ───────>   (everything this caller held goes)
 *                                <───────   stopped | expired | lagged
 * ```
 *
 * **Versioned.** Both sides state the version they speak, and a host that does
 * not speak the caller's answers `mismatch` rather than guessing — a caller
 * built against one protocol and a host against another would otherwise fail
 * in ways that describe neither.
 *
 * **Validated.** Every message is checked before anything reads it, on both
 * sides. A port is a boundary: whatever posts to it is not necessarily this
 * package, and a message that is not one of these is dropped rather than
 * trusted.
 *
 * **Values keep what they mean, not what they were.** Structured cloning
 * copies data and nothing else: a class instance arrives as a plain object, a
 * function cannot be sent at all. So the few things that are not data are
 * written as tagged records — a view as the raw value it reads, a function the
 * caller supplied as a token the host calls back through, a handle as a token
 * whose methods are called by name — and every other non-data value is
 * refused where it is sent, naming what it was.
 */

import {
  AuthError,
  CancelledError,
  ConfigError,
  FloodError,
  LifecycleError,
  NetworkError,
  PeerError,
  SessionError,
  StorageError,
  StorageOwnershipError,
  TelegramError,
  ValidationError,
  YuigramError,
} from '@yuigram/core'
import type { ConnectionStatus } from '../account.js'
import { CommunityLinkRequestView, CommunityPeerView } from '../communities/communities.js'
import {
  ChatEventView,
  ForumTopicView,
  InviteImporterView,
  InviteLinkView,
} from '../entities/chat.js'
import { DialogView } from '../entities/dialog.js'
import { MediaView } from '../entities/media.js'
import { MemberView } from '../entities/member.js'
import { MessageView, ReactionView } from '../entities/message.js'
import { ChatView, UserView } from '../entities/peer.js'
import { StickerSetView } from '../entities/sticker-set.js'
import { PeerStoriesView, StoryView, StoryViewerView } from '../entities/story.js'
import { EphemeralMessageView } from '../messaging/ephemeral.js'
import { MigrationError, type MigrationKind, RpcError } from '../session/errors.js'

/** The protocol this build speaks. Raised whenever a message changes shape. */
export const PROTOCOL_VERSION = 1

/** The key a tagged record is marked with. No TL field is spelled this way. */
export const TAG = '@yuigram'

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

/** What a caller sends. Every message names the connection it belongs to. */
export type CallerMessage =
  | { readonly type: 'hello'; readonly connection: string; readonly v: number }
  | {
      readonly type: 'attach'
      readonly connection: string
      readonly account: string
      /** Receive the account's updates. */
      readonly updates: boolean
      /** Handed to the host's factory the first time this account is made, and never logged. */
      readonly restore?: string
      /**
       * A Web Lock this caller holds for as long as its browsing context lives.
       *
       * Where there are locks, the host asks for the same one: it is granted
       * when the caller lets it go or its context is destroyed, which a closed
       * tab does without a word. A live page, however throttled, keeps it.
       */
      readonly lock?: string
    }
  | {
      readonly type: 'call'
      readonly connection: string
      readonly id: number
      readonly method: string
      readonly args: readonly unknown[]
      /**
       * Where the caller removed an `AbortSignal` from the arguments.
       *
       * A signal cannot be cloned, so the caller takes it out and the host puts
       * its own in the same place — one that `abort` fires. The operation then
       * stops for the same reason it would have in-process.
       */
      readonly signals?: readonly string[]
    }
  | { readonly type: 'abort'; readonly connection: string; readonly id: number }
  | {
      readonly type: 'callback-result'
      readonly connection: string
      readonly id: number
      readonly ok: boolean
      readonly value?: unknown
      readonly error?: SerializedError
    }
  | {
      readonly type: 'pull'
      readonly connection: string
      readonly stream: number
      readonly credit: number
    }
  | { readonly type: 'ack'; readonly connection: string; readonly seq: number }
  | { readonly type: 'ping'; readonly connection: string }
  | { readonly type: 'release'; readonly connection: string }

/** What a host sends. */
export type HostMessage =
  | { readonly type: 'welcome'; readonly connection: string; readonly v: number }
  | { readonly type: 'mismatch'; readonly connection: string; readonly v: number }
  | {
      readonly type: 'attached'
      readonly connection: string
      readonly account: string
      /** The account's connection status at the moment this caller attached. */
      readonly status: ConnectionStatus
    }
  | {
      readonly type: 'status'
      readonly connection: string
      /** The account's connection status changed to this. */
      readonly status: ConnectionStatus
    }
  | {
      readonly type: 'result'
      readonly connection: string
      readonly id: number
      readonly value: unknown
    }
  | {
      readonly type: 'failure'
      readonly connection: string
      readonly id: number
      readonly error: SerializedError
    }
  | {
      readonly type: 'callback'
      readonly connection: string
      readonly id: number
      readonly callback: number
      readonly args: readonly unknown[]
    }
  | {
      readonly type: 'item'
      readonly connection: string
      readonly stream: number
      readonly value: unknown
    }
  | { readonly type: 'end'; readonly connection: string; readonly stream: number }
  | {
      readonly type: 'stream-failure'
      readonly connection: string
      readonly stream: number
      readonly error: SerializedError
    }
  | {
      readonly type: 'update'
      readonly connection: string
      readonly seq: number
      readonly update: unknown
    }
  | { readonly type: 'pong'; readonly connection: string }
  | { readonly type: 'stopped'; readonly connection: string; readonly account: string }
  | { readonly type: 'expired'; readonly connection: string }
  | {
      readonly type: 'lagged'
      readonly connection: string
      /** Updates this caller was sent and had not acknowledged when it was let go. */
      readonly unacknowledged: number
    }
  | { readonly type: 'protocol-error'; readonly connection: string; readonly reason: string }

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const STATUSES: ReadonlySet<unknown> = new Set<ConnectionStatus>([
  'offline',
  'connecting',
  'updating',
  'connected',
])

const isStatus = (value: unknown): value is ConnectionStatus => STATUSES.has(value)

/** A check on the fields one type of message carries, beyond its type and connection. */
type Shape = (data: Record<string, unknown>) => boolean

const always: Shape = () => true

/** What each message a caller may send has to carry. */
const CALLER_SHAPES: Readonly<Record<string, Shape>> = {
  hello: (data) => isCount(data['v']),
  attach: (data) =>
    isText(data['account']) &&
    typeof data['updates'] === 'boolean' &&
    (data['restore'] === undefined || typeof data['restore'] === 'string') &&
    (data['lock'] === undefined || isText(data['lock'])),
  call: (data) =>
    isCount(data['id']) &&
    isText(data['method']) &&
    Array.isArray(data['args']) &&
    (data['signals'] === undefined ||
      (Array.isArray(data['signals']) && data['signals'].every(isText))),
  abort: (data) => isCount(data['id']),
  'callback-result': (data) => isCount(data['id']) && typeof data['ok'] === 'boolean',
  pull: (data) => isCount(data['stream']) && isCount(data['credit']) && data['credit'] > 0,
  ack: (data) => isCount(data['seq']),
  ping: always,
  release: always,
}

/** What each message a host may send has to carry. */
const HOST_SHAPES: Readonly<Record<string, Shape>> = {
  welcome: (data) => isCount(data['v']),
  mismatch: (data) => isCount(data['v']),
  attached: (data) => isText(data['account']) && isStatus(data['status']),
  status: (data) => isStatus(data['status']),
  stopped: (data) => isText(data['account']),
  result: (data) => isCount(data['id']),
  failure: (data) => isCount(data['id']) && isError(data['error']),
  callback: (data) =>
    isCount(data['id']) && isCount(data['callback']) && Array.isArray(data['args']),
  item: (data) => isCount(data['stream']),
  end: (data) => isCount(data['stream']),
  'stream-failure': (data) => isCount(data['stream']) && isError(data['error']),
  update: (data) => isCount(data['seq']),
  lagged: (data) => isCount(data['unacknowledged']),
  'protocol-error': (data) => typeof data['reason'] === 'string',
  pong: always,
  expired: always,
}

/** Check a message against the shapes one side may send. */
function readMessage(data: unknown, shapes: Readonly<Record<string, Shape>>): boolean {
  if (!isObject(data) || !isText(data['connection'])) return false

  const type = data['type']
  if (typeof type !== 'string' || !Object.hasOwn(shapes, type)) return false

  return (shapes[type] as Shape)(data)
}

/**
 * Read a message a caller sent, or `undefined` if it is not one.
 *
 * Checked field by field against the shape its type names. What fails is not
 * repaired: a message with a missing field is somebody else's message, or a
 * caller built against another version, and either way reading it would mean
 * guessing.
 */
export function readCallerMessage(data: unknown): CallerMessage | undefined {
  return readMessage(data, CALLER_SHAPES) ? (data as CallerMessage) : undefined
}

/** Read a message a host sent, or `undefined` if it is not one. */
export function readHostMessage(data: unknown): HostMessage | undefined {
  return readMessage(data, HOST_SHAPES) ? (data as HostMessage) : undefined
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

/** An error as it crosses: its identity, its message, and the fields it carries. */
export interface SerializedError {
  readonly name: string
  readonly message: string
  /** Own data fields — `method`, `retryAfter` and the like. Never functions. */
  readonly fields: Readonly<Record<string, unknown>>
}

function isError(value: unknown): value is SerializedError {
  return (
    isObject(value) &&
    typeof value['name'] === 'string' &&
    typeof value['message'] === 'string' &&
    isObject(value['fields'])
  )
}

/** Fields an error carries that are its identity rather than its data. */
const NOT_FIELDS = new Set(['name', 'message', 'stack', 'cause'])

/**
 * Write an error down so its identity survives the crossing.
 *
 * The stack is not sent: it describes the host's code, which is of no use to a
 * caller and says more about the host than a caller needs to know.
 */
export function serializeError(error: unknown): SerializedError {
  if (!(error instanceof Error)) {
    return { name: 'Error', message: String(error), fields: {} }
  }

  const fields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(error)) {
    if (NOT_FIELDS.has(key)) continue
    if (typeof value === 'function' || typeof value === 'symbol') continue
    if (value !== null && typeof value === 'object' && !(value instanceof Uint8Array)) continue

    fields[key] = value
  }

  return { name: error.name, message: error.message, fields }
}

/**
 * An error the host raised whose class this side does not have.
 *
 * The name is the host's, so a caller checking `error.name` sees what was
 * thrown; the fields are on it, so nothing the host said is lost.
 */
export class RemoteError extends YuigramError {
  override readonly name: string

  constructor(serialized: SerializedError) {
    super(serialized.message)
    this.name = serialized.name
    Object.assign(this, serialized.fields)
  }
}

/** Raised on the caller's side when the host is gone and a call cannot finish. */
export class HostUnavailableError extends YuigramError {
  override readonly name = 'HostUnavailableError'
}

/** The classes a caller can rebuild by name, because it has them too. */
const REBUILT: Readonly<
  Record<string, (message: string, fields: Record<string, unknown>) => Error>
> = {
  YuigramError: (message) => new YuigramError(message),
  ConfigError: (message) => new ConfigError(message),
  ValidationError: (message) => new ValidationError(message),
  NetworkError: (message) => new NetworkError(message),
  AuthError: (message) => new AuthError(message),
  SessionError: (message) => new SessionError(message),
  StorageError: (message) => new StorageError(message),
  StorageOwnershipError: (message) => new StorageOwnershipError(message),
  PeerError: (message) => new PeerError(message),
  CancelledError: (message) => new CancelledError(message),
  LifecycleError: (message) => new LifecycleError(message),
  TelegramError: (message, fields) =>
    new TelegramError(
      message,
      typeof fields['method'] === 'string' ? { method: fields['method'] } : {},
    ),
  FloodError: (message, fields) =>
    new FloodError(message, {
      retryAfter: typeof fields['retryAfter'] === 'number' ? fields['retryAfter'] : 0,
      ...(typeof fields['method'] === 'string' ? { method: fields['method'] } : {}),
    }),
  RpcError: (message, fields) =>
    new RpcError(message, {
      code: typeof fields['code'] === 'number' ? fields['code'] : 0,
      text: typeof fields['text'] === 'string' ? fields['text'] : '',
      ...(typeof fields['method'] === 'string' ? { method: fields['method'] } : {}),
    }),
  MigrationError: (message, fields) =>
    new MigrationError(message, {
      kind: fields['kind'] as MigrationKind,
      dcId: typeof fields['dcId'] === 'number' ? fields['dcId'] : 0,
      ...(typeof fields['code'] === 'number' ? { code: fields['code'] } : {}),
      ...(typeof fields['text'] === 'string' ? { text: fields['text'] } : {}),
      ...(typeof fields['method'] === 'string' ? { method: fields['method'] } : {}),
    }),
}

/**
 * Rebuild an error from what crossed.
 *
 * A class both sides have comes back as that class, so `instanceof FloodError`
 * works on the caller's side exactly as it would have on the host's. Anything
 * else comes back as a {@link RemoteError} carrying the host's name and fields.
 */
export function deserializeError(serialized: SerializedError): Error {
  const rebuild = Object.hasOwn(REBUILT, serialized.name) ? REBUILT[serialized.name] : undefined
  if (rebuild === undefined) return new RemoteError(serialized)

  const error = rebuild(serialized.message, { ...serialized.fields })
  for (const [key, value] of Object.entries(serialized.fields)) {
    if (!(key in error)) Object.assign(error, { [key]: value })
  }

  return error
}

/* -------------------------------------------------------------------------- */
/* Values                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The views, by name.
 *
 * Every one is a function of the single value it reads, which is what makes
 * sending the value and rebuilding the view on the other side faithful: the
 * view is not state, it is a reading of state, and the state crosses whole.
 */
const VIEWS = {
  ChatEventView,
  ChatView,
  CommunityLinkRequestView,
  CommunityPeerView,
  DialogView,
  EphemeralMessageView,
  ForumTopicView,
  InviteImporterView,
  InviteLinkView,
  MediaView,
  MemberView,
  MessageView,
  PeerStoriesView,
  ReactionView,
  StickerSetView,
  StoryView,
  StoryViewerView,
  UserView,
} as const

type ViewName = keyof typeof VIEWS

/** Which view a value is, if it is one. */
function viewNameOf(value: object): ViewName | undefined {
  for (const name of Object.keys(VIEWS) as ViewName[]) {
    if (value instanceof VIEWS[name]) return name
  }

  return undefined
}

/** How deep a value may nest before it is refused rather than walked. */
const MAX_DEPTH = 128

/** What an encoder does with the two kinds of value that are not data. */
export interface EncodeHooks {
  /** Replace a function found where a callback may be, or refuse it. */
  callback?(fn: (...args: never[]) => unknown, path: string): unknown
}

/**
 * Write a value so it crosses intact.
 *
 * Views become tagged raw values; data is copied as it is; bigint, byte arrays,
 * dates, maps and sets pass through, because structured cloning carries them
 * faithfully. Anything else is refused with the path to it, so a caller learns
 * which field was the problem instead of receiving an object that quietly lost
 * its behaviour.
 */
export function encodeValue(value: unknown, hooks: EncodeHooks = {}, path = 'value'): unknown {
  return encode(value, hooks, path, 0, new WeakSet())
}

function encode(
  value: unknown,
  hooks: EncodeHooks,
  path: string,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (depth > MAX_DEPTH) throw new ValidationError(`${path} nests too deeply to send`)

  if (value === null || value === undefined) return value

  switch (typeof value) {
    case 'string':
    case 'number':
    case 'bigint':
    case 'boolean':
      return value
    case 'function':
      if (hooks.callback !== undefined) return hooks.callback(value as never, path)
      throw new ValidationError(
        `${path} is a function, and a function cannot cross to or from a worker`,
      )
    case 'symbol':
      throw new ValidationError(`${path} is a symbol, which cannot cross to or from a worker`)
    default:
      break
  }

  const object = value as object

  if (ArrayBuffer.isView(object) || object instanceof ArrayBuffer || object instanceof Date) {
    return object
  }

  if (seen.has(object)) {
    throw new ValidationError(`${path} refers back to itself, which cannot be sent`)
  }
  seen.add(object)

  try {
    if (Array.isArray(object)) {
      return object.map((item, index) => encode(item, hooks, `${path}[${index}]`, depth + 1, seen))
    }

    if (object instanceof Map) {
      return new Map(
        [...object].map(([key, item]) => [
          key,
          encode(item, hooks, `${path}.get(${String(key)})`, depth + 1, seen),
        ]),
      )
    }

    if (object instanceof Set) {
      return new Set(
        [...object].map((item, index) => encode(item, hooks, `${path}[${index}]`, depth + 1, seen)),
      )
    }

    const view = viewNameOf(object)
    if (view !== undefined) {
      const raw = (object as { readonly raw: unknown }).raw

      return { [TAG]: 'view', view, raw: encode(raw, hooks, `${path}.raw`, depth + 1, seen) }
    }

    const prototype = Object.getPrototypeOf(object)
    if (prototype !== Object.prototype && prototype !== null) {
      const name = (object as { constructor?: { name?: string } }).constructor?.name ?? 'object'
      throw new ValidationError(
        `${path} is a ${name}, which has behaviour a worker boundary cannot carry`,
      )
    }

    const copy: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(object)) {
      // An absent optional field stays absent rather than arriving as a key
      // holding undefined, which an exact-optional type would reject.
      if (item === undefined) continue
      copy[key] = encode(item, hooks, `${path}.${key}`, depth + 1, seen)
    }

    return copy
  } finally {
    seen.delete(object)
  }
}

/** What a decoder does with the tagged records only one side understands. */
export interface DecodeHooks {
  /** Rebuild a function from a token. Host side only. */
  callback?(id: number, path: string): unknown
  /** Rebuild a handle from a token. Caller side only. */
  handle?(id: number, kind: string, fields: Readonly<Record<string, unknown>>): unknown
  /** Rebuild an iterator from a token. Caller side only. */
  stream?(id: number, kind: string): unknown
}

/**
 * Read a value back.
 *
 * Only the records a side expects are rebuilt. A tag this side has no hook for
 * is refused rather than returned as a plain object, because a caller holding
 * the record would think it held the thing.
 */
export function decodeValue(value: unknown, hooks: DecodeHooks = {}, path = 'value'): unknown {
  return decode(value, hooks, path, 0)
}

function decode(value: unknown, hooks: DecodeHooks, path: string, depth: number): unknown {
  if (depth > MAX_DEPTH) throw new ValidationError(`${path} nests too deeply to read`)
  if (value === null || typeof value !== 'object') return value
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Date) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => decode(item, hooks, `${path}[${index}]`, depth + 1))
  }

  if (value instanceof Map) {
    return new Map(
      [...value].map(([key, item]) => [
        key,
        decode(item, hooks, `${path}.get(${String(key)})`, depth + 1),
      ]),
    )
  }

  if (value instanceof Set) {
    return new Set(
      [...value].map((item, index) => decode(item, hooks, `${path}[${index}]`, depth + 1)),
    )
  }

  const record = value as Record<string, unknown>
  const tag = record[TAG]

  if (tag !== undefined) return decodeTagged(tag, record, hooks, path, depth)

  const copy: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(record)) {
    copy[key] = decode(item, hooks, `${path}.${key}`, depth + 1)
  }

  return copy
}

function decodeTagged(
  tag: unknown,
  record: Record<string, unknown>,
  hooks: DecodeHooks,
  path: string,
  depth: number,
): unknown {
  switch (tag) {
    case 'view': {
      const name = record['view']
      if (typeof name !== 'string' || !Object.hasOwn(VIEWS, name)) {
        throw new ValidationError(`${path} names a view this side does not have`)
      }
      const View = VIEWS[name as ViewName] as unknown as new (raw: unknown) => unknown

      return new View(decode(record['raw'], hooks, `${path}.raw`, depth + 1))
    }
    case 'callback':
      if (hooks.callback === undefined || !isCount(record['id'])) break

      return hooks.callback(record['id'], path)
    case 'handle':
      if (
        hooks.handle === undefined ||
        !isCount(record['id']) ||
        typeof record['kind'] !== 'string' ||
        !isObject(record['fields'])
      ) {
        break
      }

      return hooks.handle(
        record['id'],
        record['kind'],
        decode(record['fields'], hooks, `${path}.fields`, depth + 1) as Record<string, unknown>,
      )
    case 'stream':
      if (
        hooks.stream === undefined ||
        !isCount(record['id']) ||
        typeof record['kind'] !== 'string'
      ) {
        break
      }

      return hooks.stream(record['id'], record['kind'])
    default:
      break
  }

  throw new ValidationError(`${path} is a record of a kind this side cannot rebuild`)
}

/** Mark a value as a token of one of the three kinds. */
export function token(
  kind: 'callback' | 'handle' | 'stream',
  id: number,
  extra: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return { [TAG]: kind, id, ...extra }
}

/**
 * Copy bytes into a buffer of their own, so the buffer can be transferred.
 *
 * Transferring detaches a buffer from the side that sent it. A byte array read
 * off the wire is often a window onto a larger buffer the sender still uses, so
 * only a copy the sender made for this message is ever transferred — which is
 * what makes transfer safe for the side giving it up.
 */
export function ownedCopy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength))
  copy.set(bytes)

  return copy
}
