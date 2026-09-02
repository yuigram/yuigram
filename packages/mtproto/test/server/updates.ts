/**
 * A datacenter that produces update streams a client cannot survive by luck.
 *
 * The update subsystem cannot be proved against the live network: the cases
 * that matter are the ones that happen rarely and unpredictably, and a manager
 * that has only met a well-behaved server has not been tested at all. So the
 * server comes first, and it is built to misbehave on demand.
 *
 * It keeps the state a real one keeps — a sequence for the common box, one per
 * channel, and the message history behind them — so a difference request is
 * answered from what was actually produced rather than from a fixture. That is
 * what makes a recovery test meaningful: the client is told to catch up, and
 * what it catches up to is the truth the server has been keeping all along.
 *
 * ```
 *   produce ──> history ──┬──> stream   (in order, reordered, duplicated, dropped)
 *                         └──> difference (what the stream did not deliver)
 * ```
 *
 * Nothing here is random. Every departure from good behaviour is asked for by
 * name, so a case describes the misbehaviour it is about and gets exactly that.
 */

import { TelegramError } from '@yuigram/core'
import type { TlValue } from '../../src/tl/index.js'

/** The moment the server's clock starts at. */
const EPOCH = 1_700_000_000

/** One thing that happened, and where it sits in its sequence. */
interface Entry {
  /** The sequence number this left the box at. */
  readonly pts: number
  /** How much of the sequence it consumed. */
  readonly count: number
  readonly update: TlValue
}

/** What a channel is doing when it is asked about. */
export type ChannelBehaviour = 'normal' | 'private' | 'too-long'

/** How a difference request should answer. */
export interface DifferenceFaults {
  /** Answer the common box with `differenceTooLong` instead of catching up. */
  readonly tooLong?: boolean
  /** Hand back at most this many messages at a time, as a slice. */
  readonly sliceAt?: number
  /** How each channel answers. */
  readonly channels?: ReadonlyMap<string, ChannelBehaviour>
}

export class UpdateServerError extends Error {}

/**
 * The authoritative side of an update stream.
 *
 * Produces updates, remembers them, and answers catch-up requests from that
 * memory. A case drives it: nothing happens on a timer and nothing is invented.
 */
export class UpdateServer {
  /** The common box: private chats and basic groups. */
  #pts = 1
  /** Secret chats and certain bot events. */
  #qts = 1
  /** Counts the containers the server has sent, not the updates in them. */
  #seq = 0
  #date = EPOCH

  readonly #common: Entry[] = []
  readonly #channels = new Map<string, { pts: number; log: Entry[] }>()

  /** Everyone the server will describe alongside what it sends. */
  readonly #users: TlValue[] = []
  readonly #chats: TlValue[] = []

  /** What a difference request should do instead of catching up honestly. */
  faults: DifferenceFaults = {}

  /** Every request the server was asked to answer. */
  readonly asked: TlValue[] = []

  /** The state a client would be told to start from. */
  get state(): TlValue {
    return {
      _: 'updates.state',
      pts: this.#pts,
      qts: this.#qts,
      date: this.#date,
      seq: this.#seq,
      unread_count: 0,
    }
  }

  /** What the common box has reached. */
  get pts(): number {
    return this.#pts
  }

  /** What a channel has reached. */
  channelPts(channelId: bigint): number {
    return this.#channels.get(channelId.toString())?.pts ?? 1
  }

  /** Describe a user, so anything mentioning it can carry it. */
  addUser(id: bigint, options: { accessHash?: bigint; username?: string } = {}): TlValue {
    const user: TlValue = {
      _: 'user',
      id,
      access_hash: options.accessHash ?? 0x1111n,
      ...(options.username === undefined ? {} : { username: options.username }),
    }
    this.#users.push(user)

    return user
  }

  /** Describe a channel, so anything mentioning it can carry it. */
  addChannel(id: bigint, options: { accessHash?: bigint } = {}): TlValue {
    const channel: TlValue = {
      _: 'channel',
      id,
      access_hash: options.accessHash ?? 0x2222n,
      title: `channel ${id}`,
    }
    this.#chats.push(channel)

    return channel
  }

  /**
   * A new message in the common box.
   *
   * Advances the box exactly as the protocol says: one message consumes one
   * step, and the update carries the sequence number it arrived at.
   */
  message(id: number, options: { fromId?: bigint; count?: number } = {}): TlValue {
    const count = options.count ?? 1
    this.#pts += count
    this.#date += 1

    const update: TlValue = {
      _: 'updateNewMessage',
      message: {
        _: 'message',
        id,
        ...(options.fromId === undefined
          ? {}
          : { from_id: { _: 'peerUser', user_id: options.fromId } }),
        message: `message ${id}`,
        date: this.#date,
      },
      pts: this.#pts,
      pts_count: count,
    }

    this.#common.push({ pts: this.#pts, count, update })

    return update
  }

  /**
   * Messages removed from the common box.
   *
   * Carries no message of its own, so nothing about it can be recognised by
   * identity — only the sequence can say whether it has already been applied.
   */
  deletion(ids: readonly number[]): TlValue {
    this.#pts += ids.length
    this.#date += 1

    const update: TlValue = {
      _: 'updateDeleteMessages',
      messages: [...ids],
      pts: this.#pts,
      pts_count: ids.length,
    }

    this.#common.push({ pts: this.#pts, count: ids.length, update })

    return update
  }

  /** A new message in a channel, which keeps a sequence of its own. */
  channelMessage(channelId: bigint, id: number, options: { count?: number } = {}): TlValue {
    const key = channelId.toString()
    const box = this.#channels.get(key) ?? { pts: 1, log: [] }
    const count = options.count ?? 1
    box.pts += count
    this.#channels.set(key, box)
    this.#date += 1

    const update: TlValue = {
      _: 'updateNewChannelMessage',
      message: {
        _: 'message',
        id,
        peer_id: { _: 'peerChannel', channel_id: channelId },
        message: `channel message ${id}`,
        date: this.#date,
      },
      pts: box.pts,
      pts_count: count,
    }

    box.log.push({ pts: box.pts, count, update })

    return update
  }

  /**
   * Wrap updates the way a server sends several at once.
   *
   * The container's own sequence counts containers rather than the updates in
   * them, and a client that mistakes one for the other drifts immediately.
   */
  container(
    updates: readonly TlValue[],
    options: { seqStart?: number; seq?: number; carryPeers?: boolean } = {},
  ): TlValue {
    this.#seq += 1
    const seq = options.seq ?? this.#seq
    const seqStart = options.seqStart ?? seq

    const peers = options.carryPeers !== false

    return seqStart === seq
      ? {
          _: 'updates',
          updates: [...updates],
          users: peers ? [...this.#users] : [],
          chats: peers ? [...this.#chats] : [],
          date: this.#date,
          seq,
        }
      : {
          _: 'updatesCombined',
          updates: [...updates],
          users: peers ? [...this.#users] : [],
          chats: peers ? [...this.#chats] : [],
          date: this.#date,
          seq_start: seqStart,
          seq,
        }
  }

  /** One update on its own, outside any sequence. */
  short(update: TlValue): TlValue {
    return { _: 'updateShort', update, date: this.#date }
  }

  /** The answer that says the stream fell too far behind to be caught up on. */
  tooLong(): TlValue {
    return { _: 'updatesTooLong' }
  }

  /**
   * Answer a catch-up request from what actually happened.
   *
   * The difference is computed rather than fixed, so a client that asks from
   * the wrong place is told the truth about that place.
   */
  invoke(query: TlValue): TlValue {
    this.asked.push(query)

    switch (query._) {
      case 'updates.getState':
        return this.state
      case 'updates.getDifference':
        return this.#difference(query)
      case 'updates.getChannelDifference':
        return this.#channelDifference(query)
      default:
        throw new UpdateServerError(`the server was not asked to answer '${query._}'`)
    }
  }

  #difference(query: TlValue): TlValue {
    if (this.faults.tooLong === true) {
      return { _: 'updates.differenceTooLong', pts: this.#pts }
    }

    const from = readInt(query, 'pts')
    const missing = this.#common.filter((entry) => entry.pts > from)
    if (missing.length === 0) {
      return { _: 'updates.differenceEmpty', date: this.#date, seq: this.#seq }
    }

    const limit = this.faults.sliceAt
    const taken = limit === undefined ? missing : missing.slice(0, limit)
    const complete = taken.length === missing.length

    const messages = taken.map((entry) => entry.update['message'] as TlValue)
    const reached = taken.at(-1)?.pts ?? from

    return complete
      ? {
          _: 'updates.difference',
          new_messages: messages,
          new_encrypted_messages: [],
          other_updates: [],
          chats: [...this.#chats],
          users: [...this.#users],
          state: this.state,
        }
      : {
          _: 'updates.differenceSlice',
          new_messages: messages,
          new_encrypted_messages: [],
          other_updates: [],
          chats: [...this.#chats],
          users: [...this.#users],
          intermediate_state: {
            _: 'updates.state',
            pts: reached,
            qts: this.#qts,
            date: this.#date,
            seq: this.#seq,
            unread_count: 0,
          },
        }
  }

  #channelDifference(query: TlValue): TlValue {
    const channel = query['channel']
    if (typeof channel !== 'object' || channel === null) {
      throw new UpdateServerError('a channel difference must name a channel')
    }

    const id = (channel as TlValue)['channel_id']
    if (typeof id !== 'bigint') {
      throw new UpdateServerError('a channel difference must name a channel identifier')
    }

    const key = id.toString()
    const behaviour = this.faults.channels?.get(key) ?? 'normal'
    if (behaviour === 'private') {
      // Refused the way Telegram refuses it, so a client recognises it by the
      // name rather than by the type the server happens to raise.
      throw new TelegramError('CHANNEL_PRIVATE (400)')
    }

    const box = this.#channels.get(key) ?? { pts: 1, log: [] }
    if (behaviour === 'too-long') {
      return {
        _: 'updates.channelDifferenceTooLong',
        final: true,
        dialog: { _: 'dialog' },
        messages: [],
        chats: [...this.#chats],
        users: [...this.#users],
      }
    }

    const from = readInt(query, 'pts')
    const missing = box.log.filter((entry) => entry.pts > from)
    if (missing.length === 0) {
      return { _: 'updates.channelDifferenceEmpty', final: true, pts: box.pts }
    }

    const limit = this.faults.sliceAt
    const taken = limit === undefined ? missing : missing.slice(0, limit)
    const complete = taken.length === missing.length

    return {
      _: 'updates.channelDifference',
      ...(complete ? { final: true } : {}),
      pts: taken.at(-1)?.pts ?? from,
      new_messages: taken.map((entry) => entry.update['message'] as TlValue),
      other_updates: [],
      chats: [...this.#chats],
      users: [...this.#users],
    }
  }
}

function readInt(value: TlValue, field: string): number {
  const raw = value[field]
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    throw new UpdateServerError(`'${value._}.${field}' must be a whole number`)
  }

  return raw
}
