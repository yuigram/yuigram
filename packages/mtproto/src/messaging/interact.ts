// SPDX-License-Identifier: MIT

/**
 * Acting on a message that already exists.
 *
 * Voting in its poll, closing that poll, paying a reaction into it, adding to
 * and ticking off its checklist, translating it, clearing the pins or the
 * reaction badge above it, editing one a bot sent inline — and the two sends
 * that are neither text nor media: a rich message, and the draft a
 * conversation shows while an answer is still being written.
 *
 * Loaded when one of them is called. Each reaches the network, so each takes
 * the client rather than living on a value, and each hands the account what
 * the answer carried, so a vote or an edit this account made reaches its own
 * handlers exactly as one somebody else made would.
 */

import { ValidationError } from '@yuigram/core'
import type { MessageView } from '../entities/message.js'
import { MessageView as View } from '../entities/message.js'
import type {
  TypeInputBotInlineMessageID,
  TypeInputMedia,
  TypeInputRichMessage,
  TypeMessageEntity,
  TypeMessageReactions,
  TypePaidReactionPrivacy,
  TypePoll,
  TypePollResults,
  TypeReplyMarkup,
  TypeSendMessageAction,
  TypeTextWithEntities,
} from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import { type SentMessage, sentMessage } from '../normalize/sent.js'
import type { TlValue } from '../tl/index.js'
import {
  bodyOf,
  flagsOf,
  getMessages,
  keyFor,
  type MessageBody,
  type Sending,
  type SendOptions,
  targetOf,
} from './send.js'

/** What acting on a message needs from a client, beyond what sending does. */
export interface Interacting extends Sending {
  /**
   * Make a call on a particular datacenter.
   *
   * An inline message lives on the datacenter its identifier names, and only
   * that one will edit it.
   */
  at?(dcId: number, query: TlValue): Promise<TlValue>
  /** The current time in milliseconds, for identifiers Telegram requires to be time-based. */
  now?(): number
}

/** The updates an answer carries, however it carries them. */
function updatesOf(answer: unknown): readonly TlValue[] {
  const value = answer as TlValue
  if (value._ === 'updateShort') return [value['update'] as TlValue]

  const list = value['updates']

  return Array.isArray(list) ? (list as TlValue[]) : []
}

/** The message an edit produced, found in the answer by its number. */
function editedIn(answer: unknown, id: number): MessageView | undefined {
  for (const update of updatesOf(answer)) {
    if (
      update._ !== 'updateEditMessage' &&
      update._ !== 'updateEditChannelMessage' &&
      update._ !== 'updateNewMessage' &&
      update._ !== 'updateNewChannelMessage'
    ) {
      continue
    }

    const message = update['message'] as TlValue | undefined
    if (message?.['id'] === id) return new View(message as never)
  }

  return undefined
}

/** The one message a number names, refused where the account cannot see it. */
async function messageAt(
  client: Interacting,
  peer: string | PeerRef,
  id: number,
  what: string,
): Promise<MessageView> {
  const [view] = await getMessages(client, peer, [id])

  if (view === undefined || view.isEmpty) {
    throw new ValidationError(
      `message ${id} does not exist or this account cannot see it, to ${what}`,
    )
  }

  return view
}

/* -------------------------------------------------------------------------- */
/* Polls                                                                       */
/* -------------------------------------------------------------------------- */

/** A poll as it stands: what was asked, and how it is going. */
export interface PollState {
  readonly poll: TypePoll
  readonly results: TypePollResults
}

/** The poll an answer about one carries. */
function pollIn(answer: unknown, what: string): PollState {
  const update = updatesOf(answer).find((one) => one._ === 'updateMessagePoll')
  const poll = update?.['poll'] as TypePoll | undefined
  const results = update?.['results'] as TypePollResults | undefined

  if (poll === undefined || results === undefined) {
    throw new ValidationError(`Telegram answered ${what} without describing the poll`)
  }

  return { poll, results }
}

/**
 * Vote in a poll.
 *
 * An option is the bytes the poll gave it, or its position in the poll's list,
 * which is read from the message first — the protocol only takes bytes, and a
 * position is what a person picking from a list has. No options at all takes
 * the vote back, where the poll allows it.
 */
export async function sendVote(
  client: Interacting,
  peer: string | PeerRef,
  id: number,
  options: readonly (number | Uint8Array)[],
): Promise<PollState> {
  const target = await client.resolve(peer)
  let chosen: Uint8Array[]

  if (options.some((option) => typeof option === 'number')) {
    const view = await messageAt(client, peer, id, 'vote in')
    const media = view.media?.raw
    if (media?._ !== 'messageMediaPoll') {
      throw new ValidationError(`message ${id} carries no poll to vote in`)
    }

    chosen = options.map((option) => {
      if (typeof option !== 'number') return option

      const answer = media.poll.answers[option]
      if (answer?._ !== 'pollAnswer') {
        throw new ValidationError(`the poll has no option at position ${option}`)
      }

      return answer.option
    })
  } else {
    chosen = [...(options as readonly Uint8Array[])]
  }

  const answer = await client.api.messages.sendVote({ peer: target, msg_id: id, options: chosen })

  return pollIn(answer, 'a vote')
}

/**
 * Close a poll, so no more votes are counted.
 *
 * Closing is an edit of what the message carries, and Telegram reads only the
 * closed mark from the poll sent with it — the poll's own question and answers
 * stay as they are and come back in the answer. So nothing is read first and
 * nothing of the original is restated.
 */
export async function closePoll(
  client: Interacting,
  peer: string | PeerRef,
  id: number,
): Promise<PollState> {
  const target = await client.resolve(peer)

  const answer = await client.api.messages.editMessage({
    peer: target,
    id,
    media: {
      _: 'inputMediaPoll',
      poll: {
        _: 'poll',
        id: 0n,
        closed: true,
        question: { _: 'textWithEntities', text: '', entities: [] },
        answers: [],
        hash: 0n,
      },
    },
  })

  return pollIn(answer, 'closing a poll')
}

/* -------------------------------------------------------------------------- */
/* Reactions                                                                   */
/* -------------------------------------------------------------------------- */

/** How many times a paid reaction is tried again when its identifier has aged. */
const PAID_ATTEMPTS = 3

/**
 * An identifier for a paid reaction.
 *
 * Unlike a send's, this one is required to carry the time: the current Unix
 * second in the upper half and random bits in the lower. Telegram refuses one
 * that is too old as expired rather than as a duplicate, which is what makes
 * trying again with a fresh one safe.
 */
function paidKey(client: Interacting): bigint {
  const seconds = BigInt(Math.floor((client.now?.() ?? Date.now()) / 1000))
  const low = new DataView(client.random(4).buffer as ArrayBuffer).getUint32(0, true)

  return BigInt.asIntN(64, (seconds << 32n) | BigInt(low))
}

/** Who a paid reaction is shown as coming from. */
export interface PaidReactionOptions {
  /**
   * Keep this account off the list of payers, or put it back on it.
   *
   * Left out, the choice made last time stands, which is how Telegram treats a
   * reaction that says nothing about it.
   */
  readonly anonymous?: boolean
  /** Pay as a channel this account may post as. */
  readonly asChat?: string | PeerRef
}

async function paidPrivacy(
  client: Interacting,
  options?: PaidReactionOptions,
): Promise<TypePaidReactionPrivacy | undefined> {
  if (options?.asChat !== undefined) {
    return { _: 'paidReactionPrivacyPeer', peer: await client.resolve(options.asChat) }
  }
  if (options?.anonymous === undefined) return undefined

  return { _: options.anonymous ? 'paidReactionPrivacyAnonymous' : 'paidReactionPrivacyDefault' }
}

/**
 * Pay a reaction into a message, in Stars.
 *
 * **This spends Stars.** `count` is how many are sent at once, and must be a
 * whole number. The answer is the message's reactions as they stand afterwards.
 */
export async function sendPaidReaction(
  client: Interacting,
  peer: string | PeerRef,
  id: number,
  count: number,
  options?: PaidReactionOptions,
): Promise<TypeMessageReactions> {
  if (!Number.isInteger(count) || count <= 0) {
    throw new ValidationError(`a paid reaction sends a whole number of Stars, not ${count}`)
  }

  const target = await client.resolve(peer)
  const privacy = await paidPrivacy(client, options)

  for (let attempt = 1; ; attempt += 1) {
    try {
      const answer = await client.api.messages.sendPaidReaction({
        peer: target,
        msg_id: id,
        count,
        random_id: paidKey(client),
        ...(privacy === undefined ? {} : { private: privacy }),
      })

      const update = updatesOf(answer).find((one) => one._ === 'updateMessageReactions')
      const reactions = update?.['reactions'] as TypeMessageReactions | undefined
      if (reactions === undefined) {
        throw new ValidationError('Telegram answered the reaction without the reactions it left')
      }

      return reactions
    } catch (error) {
      const expired = error instanceof Error && /\bRANDOM_ID_EXPIRED\b/.test(error.message)
      if (!expired || attempt >= PAID_ATTEMPTS) throw error
    }
  }
}

/**
 * Clear the unread-reaction badge on a conversation, or on one of its topics.
 *
 * A different badge from the unread-message one and a different call: reading
 * a conversation does not clear reactions.
 */
export async function readReactions(
  client: Interacting,
  peer: string | PeerRef,
  options?: { readonly topicId?: number },
): Promise<void> {
  const target = await client.resolve(peer)
  await client.api.messages.readReactions({
    peer: target,
    ...(options?.topicId === undefined ? {} : { top_msg_id: options.topicId }),
  })
}

/* -------------------------------------------------------------------------- */
/* Pins                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Unpin every pinned message in a conversation, or in one of its topics.
 *
 * A different call from unpinning one: the answer is the position the
 * conversation's history moved to rather than a list of messages, and it is
 * applied to the sequence it belongs to.
 */
export async function unpinAllMessages(
  client: Interacting,
  peer: string | PeerRef,
  options?: { readonly topicId?: number },
): Promise<void> {
  const target = await client.resolve(peer)
  await client.api.messages.unpinAllMessages({
    peer: target,
    ...(options?.topicId === undefined ? {} : { top_msg_id: options.topicId }),
  })
}

/* -------------------------------------------------------------------------- */
/* Checklists                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Add items to a checklist a message carries.
 *
 * Each item is numbered by the sender, and the numbers have to be new: they are
 * how a completion names an item. So the checklist is read first and the new
 * items continue from its highest number, in the order given.
 */
export async function appendTodoList(
  client: Interacting,
  peer: string | PeerRef,
  id: number,
  items: readonly MessageBody[],
): Promise<MessageView | undefined> {
  if (items.length === 0) {
    throw new ValidationError('a checklist is appended to with at least one item')
  }

  const view = await messageAt(client, peer, id, 'add to')
  const media = view.media?.raw
  if (media?._ !== 'messageMediaToDo') {
    throw new ValidationError(`message ${id} carries no checklist to add to`)
  }

  const next = Math.max(0, ...media.todo.list.map((item) => item.id)) + 1
  const target = await client.resolve(peer)

  const answer = await client.api.messages.appendTodoList({
    peer: target,
    msg_id: id,
    list: items.map((body, at) => {
      const { message, entities } = bodyOf(body)

      return {
        _: 'todoItem' as const,
        id: next + at,
        title: { _: 'textWithEntities' as const, text: message, entities: [...(entities ?? [])] },
      }
    }),
  })

  return editedIn(answer, id)
}

/**
 * Tick items off a checklist, and untick others, by their numbers.
 *
 * Both travel in one call because they are one change, and a client shows one
 * edit rather than two.
 */
export async function toggleTodoCompleted(
  client: Interacting,
  peer: string | PeerRef,
  id: number,
  change: { readonly completed?: readonly number[]; readonly incompleted?: readonly number[] },
): Promise<MessageView | undefined> {
  const completed = change.completed ?? []
  const incompleted = change.incompleted ?? []

  if (completed.length === 0 && incompleted.length === 0) {
    throw new ValidationError('ticking nothing off and unticking nothing changes nothing')
  }
  const both = completed.filter((item) => incompleted.includes(item))
  if (both.length > 0) {
    throw new ValidationError(`item ${both[0]} cannot be ticked off and unticked at once`)
  }

  const target = await client.resolve(peer)
  const answer = await client.api.messages.toggleTodoCompleted({
    peer: target,
    msg_id: id,
    completed: [...completed],
    incompleted: [...incompleted],
  })

  return editedIn(answer, id)
}

/* -------------------------------------------------------------------------- */
/* Translation                                                                 */
/* -------------------------------------------------------------------------- */

/** A translation, with the formatting carried across. */
export interface Translation {
  readonly text: string
  readonly entities: readonly TypeMessageEntity[]
}

/** How a translation is asked for. */
export interface TranslateOptions {
  /** The language to translate into, as a two-letter code. */
  readonly to: string
  /** The register to translate in, where Telegram offers a choice. */
  readonly tone?: string
}

function checkLanguage(options: TranslateOptions): void {
  if (!/^[a-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/.test(options.to)) {
    throw new ValidationError(`${JSON.stringify(options.to)} is not a language code`)
  }
}

/** The translations an answer carries, checked to be one for each thing asked. */
function translationsOf(
  result: readonly TypeTextWithEntities[],
  asked: number,
): readonly Translation[] {
  if (result.length !== asked) {
    throw new ValidationError(
      `asked for ${asked} translations and Telegram returned ${result.length}`,
    )
  }

  return result.map((one) => ({ text: one.text, entities: one.entities }))
}

/**
 * Translate messages of a conversation.
 *
 * One translation per message, in the order asked, so they pair up by position
 * — which is checked rather than assumed, because a short answer paired by
 * position puts one message's translation under another.
 */
export async function translateMessage(
  client: Interacting,
  peer: string | PeerRef,
  ids: readonly number[],
  options: TranslateOptions,
): Promise<readonly Translation[]> {
  if (ids.length === 0) throw new ValidationError('name at least one message to translate')
  checkLanguage(options)

  const target = await client.resolve(peer)
  const answer = await client.api.messages.translateText({
    peer: target,
    id: [...ids],
    to_lang: options.to,
    ...(options.tone === undefined ? {} : { tone: options.tone }),
  })

  return translationsOf(answer.result, ids.length)
}

/**
 * Translate text that is not in a conversation — a draft, or something pasted.
 *
 * Formatting goes with the text and comes back moved to where the translation
 * puts it.
 */
export async function translateText(
  client: Interacting,
  texts: readonly MessageBody[],
  options: TranslateOptions,
): Promise<readonly Translation[]> {
  if (texts.length === 0) throw new ValidationError('name at least one text to translate')
  checkLanguage(options)

  const answer = await client.api.messages.translateText({
    text: texts.map((body) => {
      const { message, entities } = bodyOf(body)

      return { _: 'textWithEntities' as const, text: message, entities: [...(entities ?? [])] }
    }),
    to_lang: options.to,
    ...(options.tone === undefined ? {} : { tone: options.tone }),
  })

  return translationsOf(answer.result, texts.length)
}

/* -------------------------------------------------------------------------- */
/* Inline messages                                                             */
/* -------------------------------------------------------------------------- */

/** The highest datacenter number an identifier may name. */
const MAX_DC = 1000

/**
 * Read the string form of an inline message's identifier.
 *
 * The Bot API hands inline messages around as a string, which is the
 * identifier's fields — without the constructor in front — as base64url. Its
 * length says which of the two forms it is: twenty bytes for the original,
 * twenty-four for the one with a 64-bit owner.
 */
export function readInlineMessageId(text: string): TypeInputBotInlineMessageID {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) {
    throw new ValidationError('an inline message identifier is base64url text')
  }

  const standard = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(standard + '='.repeat((4 - (standard.length % 4)) % 4))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  const view = new DataView(bytes.buffer)

  const id: TypeInputBotInlineMessageID =
    bytes.length === 20
      ? {
          _: 'inputBotInlineMessageID',
          dc_id: view.getInt32(0, true),
          id: view.getBigInt64(4, true),
          access_hash: view.getBigInt64(12, true),
        }
      : bytes.length === 24
        ? {
            _: 'inputBotInlineMessageID64',
            dc_id: view.getInt32(0, true),
            owner_id: view.getBigInt64(4, true),
            id: view.getInt32(12, true),
            access_hash: view.getBigInt64(16, true),
          }
        : invalidLength(bytes.length)

  if (id.dc_id <= 0 || id.dc_id > MAX_DC) {
    throw new ValidationError(`the inline message identifier names datacenter ${id.dc_id}`)
  }

  return id
}

function invalidLength(length: number): never {
  throw new ValidationError(
    `an inline message identifier is 20 or 24 bytes once decoded, not ${length}`,
  )
}

/** Write an inline message's identifier in the string form the Bot API uses. */
export function writeInlineMessageId(id: TypeInputBotInlineMessageID): string {
  const bytes = new Uint8Array(id._ === 'inputBotInlineMessageID' ? 20 : 24)
  const view = new DataView(bytes.buffer)

  view.setInt32(0, id.dc_id, true)
  if (id._ === 'inputBotInlineMessageID') {
    view.setBigInt64(4, id.id, true)
    view.setBigInt64(12, id.access_hash, true)
  } else {
    view.setBigInt64(4, id.owner_id, true)
    view.setInt32(12, id.id, true)
    view.setBigInt64(16, id.access_hash, true)
  }

  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** How to change a message sent through inline mode. */
export interface InlineEditOptions {
  readonly media?: TypeInputMedia
  readonly markup?: TypeReplyMarkup
  readonly noWebpagePreview?: boolean
  readonly invertMedia?: boolean
}

/**
 * Change a message a bot sent through inline mode.
 *
 * Such a message has no conversation and no number, only the identifier the
 * chosen result arrived with — as the object an update carries or the string
 * the Bot API uses. It lives on the datacenter that identifier names, so the
 * call goes there.
 */
export async function editInlineMessage(
  client: Interacting,
  message: TypeInputBotInlineMessageID | string,
  body?: MessageBody,
  options?: InlineEditOptions,
): Promise<void> {
  const id = typeof message === 'string' ? readInlineMessageId(message) : message
  const written = body === undefined ? undefined : bodyOf(body)

  const query = {
    _: 'messages.editInlineBotMessage' as const,
    id,
    ...(written === undefined ? {} : { message: written.message }),
    ...(written?.entities === undefined ? {} : { entities: written.entities }),
    ...(options?.media === undefined ? {} : { media: options.media }),
    ...(options?.markup === undefined ? {} : { reply_markup: options.markup }),
    ...(options?.noWebpagePreview === true ? { no_webpage: true as const } : {}),
    ...(options?.invertMedia === true ? { invert_media: true as const } : {}),
  }

  if (client.at === undefined) {
    const { _: _name, ...params } = query
    await client.api.messages.editInlineBotMessage(params)

    return
  }

  await client.at(id.dc_id, query as unknown as TlValue)
}

/* -------------------------------------------------------------------------- */
/* Rich messages                                                               */
/* -------------------------------------------------------------------------- */

/** One file a rich message's markup refers to, under the name the markup uses. */
export type RichFile =
  | {
      readonly id: string
      readonly photo: Extract<TypeInputMedia, { _: 'inputMediaPhoto' }>['id']
    }
  | {
      readonly id: string
      readonly document: Extract<TypeInputMedia, { _: 'inputMediaDocument' }>['id']
    }

/**
 * What a rich message is made of.
 *
 * Blocks assembled by the caller, or markup Telegram parses itself. The markup
 * forms carry their files beside them, each under the name the markup refers
 * to it by, because markup is text and text cannot hold a photo.
 */
export type RichContent =
  | { readonly blocks: TypeInputRichMessage }
  | { readonly html: string; readonly files?: readonly RichFile[]; readonly rtl?: boolean }
  | { readonly markdown: string; readonly files?: readonly RichFile[]; readonly rtl?: boolean }

/** Turn what a caller wrote into the payload a call carries. */
export function richMessageOf(content: RichContent): TypeInputRichMessage {
  if ('blocks' in content) return content.blocks

  const files = (content.files ?? []).map((file) => {
    if (file.id.length === 0)
      throw new ValidationError('a rich message file needs the name its markup uses')

    return 'photo' in file
      ? { _: 'inputRichFilePhoto' as const, id: file.id, photo: file.photo }
      : { _: 'inputRichFileDocument' as const, id: file.id, document: file.document }
  })
  const shared = {
    ...(content.rtl === true ? { rtl: true as const } : {}),
    ...(files.length === 0 ? {} : { files }),
  }

  return 'html' in content
    ? { _: 'inputRichMessageHTML', html: content.html, ...shared }
    : { _: 'inputRichMessageMarkdown', markdown: content.markdown, ...shared }
}

/**
 * Send a rich message.
 *
 * A rich message is a page rather than a line: headings, quotations, lists,
 * media and buttons, in blocks. It goes out through the ordinary send with the
 * text left empty, because the content is its own field — so every targeting
 * option means here exactly what it means for a text.
 */
export async function sendRichMessage(
  client: Interacting,
  peer: string | PeerRef,
  content: RichContent,
  options?: SendOptions,
): Promise<SentMessage> {
  const target = await targetOf(client, peer, options)
  const key = keyFor(client)

  const answer = await client.api.messages.sendMessage({
    peer: target.peer,
    message: '',
    random_id: key,
    rich_message: richMessageOf(content),
    ...(target.reply === undefined ? {} : { reply_to: target.reply }),
    ...flagsOf(options),
  })

  return sentMessage(answer, key)
}

/* -------------------------------------------------------------------------- */
/* Streaming drafts                                                            */
/* -------------------------------------------------------------------------- */

/** How a draft is opened. */
export interface DraftOptions {
  /** Whether each update adds to what is shown, or replaces it. `replace` by default. */
  readonly mode?: 'append' | 'replace'
  /** The thread the draft is being written in. */
  readonly topicId?: number
  /** Whether the person reading may stop it. */
  readonly canStop?: boolean
  /** Whether what was written stays on the reader's screen when it is stopped. */
  readonly keepOnStop?: boolean
}

/**
 * A draft being written, one update at a time.
 *
 * Nothing runs in the background. Each update is one request, made when the
 * caller calls; the handle holds only what it has written. Stopping is a request
 * too, and a stopped handle refuses further updates rather than sending them —
 * so a draft abandoned half-way leaves nothing behind but what it already sent,
 * which the reader's client lets lapse like any other typing indicator.
 */
export interface StreamingDraft<Content> {
  /** What ties every update of this draft together. */
  readonly key: bigint
  /** Show more of it. */
  write(content: Content): Promise<void>
  /** Take it off the reader's screen. Stopping twice sends nothing the second time. */
  stop(): Promise<void>
  /** Whether it has been stopped. */
  readonly stopped: boolean
}

/** A text draft, which also keeps what it has written. */
export interface TextDraft extends StreamingDraft<MessageBody> {
  /** Everything written so far: what the final send would carry. */
  readonly text: TypeTextWithEntities
}

/** The part every draft shares: one key, one action per update, one stop. */
function drafting<Content>(
  client: Interacting,
  target: Awaited<ReturnType<Interacting['resolve']>>,
  options: DraftOptions | undefined,
  actionFor: (content: Content, key: bigint) => TypeSendMessageAction,
): StreamingDraft<Content> {
  const key = keyFor(client)
  let stopped = false

  const act = async (action: TypeSendMessageAction) => {
    await client.api.messages.setTyping({
      peer: target,
      action,
      ...(options?.topicId === undefined ? {} : { top_msg_id: options.topicId }),
    })
  }

  return {
    key,
    get stopped() {
      return stopped
    },
    async write(content: Content) {
      if (stopped) throw new ValidationError('this draft has been stopped')

      await act(actionFor(content, key))
    },
    async stop() {
      if (stopped) return

      stopped = true
      await act({ _: 'sendMessageStopDraftAction', random_id: key })
    },
  }
}

function drawn(options: DraftOptions | undefined) {
  return {
    ...(options?.canStop === true ? { can_stop: true as const } : {}),
    ...(options?.keepOnStop === true ? { keep_on_stop: true as const } : {}),
  }
}

/**
 * Open a text draft that a conversation shows while an answer is written.
 *
 * What a program does while producing something long: the reader watches it
 * arrive rather than waiting for one message at the end. A draft is not a
 * message — nothing is saved and nothing can be replied to — so the message is
 * still sent at the end, with whatever {@link TextDraft.text} holds.
 */
export async function createStreamingDraft(
  client: Interacting,
  peer: string | PeerRef,
  options?: DraftOptions,
): Promise<TextDraft> {
  const target = await client.resolve(peer)
  const append = options?.mode === 'append'
  let written: TypeTextWithEntities = { _: 'textWithEntities', text: '', entities: [] }

  const draft = drafting<MessageBody>(client, target, options, (body, key) => {
    const next = append ? joined(written, body) : only(body)

    return {
      _: 'sendMessageTextDraftAction',
      random_id: key,
      text: next,
      ...drawn(options),
    }
  })

  return {
    key: draft.key,
    get stopped() {
      return draft.stopped
    },
    get text() {
      return written
    },
    async write(body: MessageBody) {
      const next = append ? joined(written, body) : only(body)
      await draft.write(body)
      // Recorded only once the update went out, so a failed one does not leave
      // the handle claiming the reader saw text they never did.
      written = next
    },
    stop: async () => await draft.stop(),
  }
}

/**
 * Open a rich draft, which shows blocks rather than a line of text.
 *
 * The same lifecycle as a text draft. Each update replaces the whole content,
 * because a rich message is a page, and a page is not appended to a line at a
 * time.
 */
export async function createRichStreamingDraft(
  client: Interacting,
  peer: string | PeerRef,
  options?: Omit<DraftOptions, 'mode'>,
): Promise<StreamingDraft<RichContent>> {
  const target = await client.resolve(peer)

  return drafting<RichContent>(client, target, options, (content, key) => ({
    _: 'inputSendMessageRichMessageDraftAction',
    random_id: key,
    rich_message: richMessageOf(content),
    ...drawn(options),
  }))
}

/** One body as the value a draft carries. */
function only(body: MessageBody): TypeTextWithEntities {
  const { message, entities } = bodyOf(body)

  return { _: 'textWithEntities', text: message, entities: [...(entities ?? [])] }
}

/**
 * Two pieces of a draft, as one.
 *
 * The second piece's formatting moves by the first piece's length in UTF-16
 * code units, which is what an entity's offset counts.
 */
function joined(first: TypeTextWithEntities, body: MessageBody): TypeTextWithEntities {
  const next = only(body)
  const shift = first.text.length

  return {
    _: 'textWithEntities',
    text: first.text + next.text,
    entities: [
      ...first.entities,
      ...next.entities.map((entity) => ({ ...entity, offset: entity.offset + shift })),
    ],
  }
}
