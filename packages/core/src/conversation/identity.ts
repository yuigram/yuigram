// SPDX-License-Identifier: MIT

/**
 * Which conversation a piece of state belongs to, and who may advance it.
 *
 * Everything in this package — a scene's position, a pending prompt, a flow
 * waiting for a reply — is state about one conversation with one person. Two
 * questions decide whether two updates share it:
 *
 * ```
 *   scope ──> which parts of the update make up the key
 *   key   ──> the string that state is stored and locked under
 * ```
 *
 * The key always begins with the client's name. An application holding a bot
 * and three accounts has four independent sets of conversations, and a key that
 * did not say which client would let one client's update advance another's
 * scene — which is not a collision that can be noticed after the fact.
 *
 * The default scope is chat and user together. A person's place in a form is
 * theirs, not the group's, and a group where two people are filling in the same
 * form must not have one person's answer advance the other's. An application
 * that wants the other behaviour says so.
 */

import { ValidationError } from '../errors/errors.js'

/**
 * A chat or a sender, as much of one as a key reads.
 *
 * `kind` is for a transport whose numbers are unique only within a sort of
 * peer. Over MTProto a user, a basic group and a channel are numbered
 * separately, so user 5 and group 5 are two conversations; a key built from
 * the number alone would give them one position and one lock. The Bot API
 * folds the sort into the number and names none.
 */
export interface AddressedPeer {
  readonly id?: number | string | bigint | undefined
  readonly kind?: string | undefined
}

/** What an update has to carry for a conversation key to be derived from it. */
export interface Addressed {
  readonly client: { readonly name: string }
  readonly chat?: AddressedPeer | undefined
  readonly sender?: AddressedPeer | undefined
  /** The forum topic, where the transport models one. */
  readonly topicId?: number | undefined
}

/**
 * Which parts of an update make up the conversation key.
 *
 * - `chat` — everybody in a chat shares one conversation
 * - `user` — a person has one conversation wherever they are
 * - `chat+user` — a person's conversation in one chat, which is the default
 * - `chat+topic` — a forum topic is its own conversation, shared by everybody
 * - `chat+user+topic` — a person's conversation within one topic
 */
export type ConversationScope = 'chat' | 'user' | 'chat+user' | 'chat+topic' | 'chat+user+topic'

/** Derives the key from an update, for an application whose scope is its own. */
export type ConversationKeyFn = (context: Addressed) => string | undefined

/** The default, which is also the one most applications want. */
export const DEFAULT_SCOPE: ConversationScope = 'chat+user'

/**
 * The key an update's conversation is stored and locked under.
 *
 * Answers `undefined` for an update the scope cannot be derived from — an
 * inline query has no chat, a channel post has no sender — and everything here
 * treats that as "no conversation", which is different from a conversation that
 * happens to be empty. Nothing is stored and nothing is advanced.
 */
export function conversationKey(
  context: Addressed,
  scope: ConversationScope = DEFAULT_SCOPE,
): string | undefined {
  const chat = addressPart(context.chat)
  const user = addressPart(context.sender)
  const topic = context.topicId

  const parts: (string | number)[] = [context.client.name]

  if (scope !== 'user') {
    if (chat === undefined) return undefined
    parts.push('c', chat)
  }

  if (scope === 'user' || scope === 'chat+user' || scope === 'chat+user+topic') {
    if (user === undefined) return undefined
    parts.push('u', user)
  }

  if (scope === 'chat+topic' || scope === 'chat+user+topic') {
    // A conversation outside any topic is still a conversation; only a scope
    // that asked for topics distinguishes it from one inside the General topic.
    parts.push('t', topic ?? 0)
  }

  return parts.join(':')
}

/**
 * Run work for one conversation at a time, without serialising the rest.
 *
 * Two updates for the same person can arrive close enough together that both
 * read the stored state before either writes it, and the second write then
 * loses the first — a form that advances one step for two answers, or a prompt
 * answered twice. A lock per conversation key makes each update see what the
 * one before it wrote.
 *
 * Per key, not one lock: a bot serving a thousand conversations must not
 * process them one at a time because two of them might collide. The map holds
 * only the keys with work in flight and drops each one as it drains, so a bot
 * that has been running for a month holds no more entries than it has
 * conversations happening at that moment.
 */
/**
 * How a chat or a sender is written into a key.
 *
 * The number alone where no sort is named, which keeps every key the Bot API
 * has already stored where it was; the sort and the number where one is. A
 * 64-bit number is written out in full rather than rounded through a float.
 */
export function addressPart(peer: AddressedPeer | undefined): string | number | undefined {
  const id = peer?.id
  if (id === undefined) return undefined

  const written = typeof id === 'bigint' ? id.toString() : id

  return peer?.kind === undefined ? written : `${peer.kind}:${written}`
}

export class ConversationLocks {
  /** The tail of each key's queue: what the next arrival waits on. */
  readonly #queues = new Map<string, Promise<unknown>>()

  /** How many conversations have work in flight. */
  get size(): number {
    return this.#queues.size
  }

  /**
   * Run `work` once everything already queued for this key has finished.
   *
   * A failure inside `work` is the caller's and propagates, but it does not
   * poison the queue: the next update for the same conversation runs normally.
   */
  async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const release = await this.acquire(key)

    try {
      return await work()
    } finally {
      release()
    }
  }

  /**
   * Wait for this key's turn, and hold it until the returned function is called.
   *
   * For work that has to let go in the middle — a handler waiting for the next
   * message cannot hold the conversation while it waits, or the message it is
   * waiting for could never be let in. Releasing twice is harmless.
   */
  async acquire(key: string): Promise<() => void> {
    // What is queued never rejects: a turn ends when it is released, however
    // the work inside it ended, so one failed update cannot fail every later
    // one for the same conversation.
    const ahead = this.#queues.get(key) ?? Promise.resolve()
    let finish: () => void = () => {}
    const mine = new Promise<void>((resolve) => {
      finish = resolve
    })
    const tail = ahead.then(() => mine)

    this.#queues.set(key, tail)
    await ahead

    let released = false

    return () => {
      if (released) return
      released = true
      finish()
      // Removed only if nothing else queued behind it, which is what keeps the
      // map the size of the conversations currently in flight.
      if (this.#queues.get(key) === tail) this.#queues.delete(key)
    }
  }
}

/** Refuse a scope that is not one of the five. */
export function checkScope(scope: string): asserts scope is ConversationScope {
  const known: readonly string[] = ['chat', 'user', 'chat+user', 'chat+topic', 'chat+user+topic']
  if (!known.includes(scope)) {
    throw new ValidationError(`'${scope}' is not a conversation scope: ${known.join(', ')}`)
  }
}
