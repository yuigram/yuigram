/**
 * Streaming text into a conversation from an account, as it is written.
 *
 * ```ts
 * import { streamTo } from '@yuigram/mtproto/stream'
 *
 * await streamTo(account, '@someone', model.stream(prompt), { parseMode: 'MarkdownV2' })
 * ```
 *
 * The same engine as the Bot API's, over MTProto's streaming drafts: each
 * window is a draft written with `messages.setTyping`, and a message each time
 * a window fills or the stream ends.
 *
 * Everything goes through the account it is handed, and ranges are mapped to
 * MTProto's constructors as plain data — so this entry point loads no protocol
 * code of its own.
 *
 * **The stop button.** A reader stopping a draft is reported to the account as
 * a typing update from that reader carrying `sendMessageStopDraftAction` and
 * the draft's key — as the schema describes it; it has not been verified
 * against Telegram's servers. A stream stops only for its own drafts' keys,
 * which are random 64-bit values the account drew, and only for a report from
 * the conversation it is writing into.
 */

import { ValidationError } from '@yuigram/core'
import {
  type EarlyEnd,
  runStream,
  StopController,
  type StreamFormat,
  type StreamPayload,
  type StreamResult,
  type StreamSource,
} from '@yuigram/core/stream'
import { toTlEntities } from '../format/neutral.js'
import type { FormattedText } from '../format/text.js'
import type { RichContent, StreamingDraft, TextDraft } from '../messaging/interact.js'
import type { SendOptions } from '../messaging/send.js'
import type { PeerRef } from '../normalize/normalize.js'
import type { SentMessage } from '../normalize/sent.js'

/** What of an account a stream uses. */
export interface StreamingAccount {
  readonly name: string
  resolve(peer: string | PeerRef): Promise<unknown>
  createStreamingDraft(
    peer: string | PeerRef,
    options?: {
      readonly topicId?: number
      readonly canStop?: boolean
      readonly keepOnStop?: boolean
    },
  ): Promise<TextDraft>
  createRichStreamingDraft(
    peer: string | PeerRef,
    options?: {
      readonly topicId?: number
      readonly canStop?: boolean
      readonly keepOnStop?: boolean
    },
  ): Promise<StreamingDraft<RichContent>>
  sendText(
    peer: string | PeerRef,
    body: FormattedText | string,
    options?: SendOptions,
  ): Promise<SentMessage>
  sendRichMessage(
    peer: string | PeerRef,
    content: RichContent,
    options?: SendOptions,
  ): Promise<SentMessage>
  on(kind: 'mtproto:typing', handler: (context: never) => unknown): unknown
}

/** How a stream is sent from an account. */
export interface AccountStreamOptions {
  /** Read the text as Telegram HTML or MarkdownV2. Plain text when absent. */
  readonly parseMode?: 'HTML' | 'MarkdownV2'
  /** Send it as a rich message, written in rich Markdown (`true`) or rich HTML. */
  readonly rich?: boolean | 'markdown' | 'html'
  /** The longest message, in UTF-16 code units. 4,096, Telegram's default. */
  readonly maxLength?: number
  readonly editInterval?: number
  readonly maxEditBackoff?: number
  /**
   * Open the draft before the first text arrives: empty, or, for a rich
   * message, Telegram's thinking block. True, as on the Bot API, whose empty
   * draft is the same request made on a bot's behalf. A draft that fails is
   * retried like any other and never ends the stream.
   */
  readonly thinkingPlaceholder?: boolean
  readonly canStop?: boolean
  /** When the reader stops it, send what was written so far as a message. */
  readonly keepOnStop?: boolean
  readonly topicId?: number
  readonly signal?: AbortSignal
  readonly onAbort?: EarlyEnd
  readonly onSourceError?: EarlyEnd
  /** Options for the messages sent, the markup attached to the last only. */
  readonly send?: SendOptions
  readonly onPiece?: (text: string, draftId: number) => void
  readonly onMessage?: (message: SentMessage) => void
  readonly onError?: (error: unknown) => void | Promise<void>
}

/** A stream in progress on one account, for the stop button to find. */
interface Run {
  readonly peerId: bigint | undefined
  readonly keys: Set<bigint>
  readonly canStop: boolean
  readonly stop: StopController
}

/** What an account's streams share. */
interface Registry {
  /** The streams running now, for the stop button to find. */
  readonly runs: Set<Run>
  /**
   * The last draft number handed out on this account.
   *
   * Per account rather than per stream, as a bot's are per client: two
   * streams running at once never report the same number for different
   * drafts. The number is the stream's own; what the reader's client keys a
   * draft by is the random value the account draws for it.
   */
  drafts: number
}

/** The streams running on each account, and whether its listener is installed. */
const registries = new WeakMap<StreamingAccount, Registry>()

/** The largest draft number before counting starts again, as a bot's does. */
const MAX_DRAFT = 0x7fff_ffff

/** The one listener an account gets, however many streams it runs. */
function registryOf(account: StreamingAccount): Registry {
  const existing = registries.get(account)
  if (existing !== undefined) return existing

  const registry: Registry = { runs: new Set(), drafts: 0 }
  registries.set(account, registry)
  const live = registry.runs

  account.on('mtproto:typing', ((context: { readonly raw?: unknown }) => {
    const update = (context.raw ?? {}) as {
      readonly _?: string
      readonly user_id?: bigint
      readonly action?: { readonly _?: string; readonly random_id?: bigint }
    }
    if (update.action?._ !== 'sendMessageStopDraftAction') return
    const key = update.action.random_id
    if (key === undefined) return

    for (const run of live) {
      if (!run.canStop || !run.keys.has(key)) continue
      if (run.peerId !== undefined && update.user_id !== undefined && update.user_id !== run.peerId)
        continue
      run.stop.stop()
    }
  }) as never)

  return registry
}

function formatOf(options: AccountStreamOptions): StreamFormat {
  if (options.rich !== undefined && options.rich !== false) {
    if (options.parseMode !== undefined) {
      throw new ValidationError(
        'a rich message is written in its own dialect; pass rich or parseMode, not both',
      )
    }

    return { kind: 'rich', dialect: options.rich === 'html' ? 'html' : 'markdown' }
  }
  if (options.parseMode === 'HTML') return { kind: 'html' }
  if (options.parseMode === 'MarkdownV2') return { kind: 'markdown' }

  return { kind: 'plain' }
}

function bodyOf(payload: StreamPayload | undefined): FormattedText {
  if (payload === undefined || payload.kind !== 'text') return { text: '', entities: [] }

  return { text: payload.formatted.text, entities: toTlEntities(payload.formatted.entities) }
}

function richOf(payload: StreamPayload | undefined): RichContent {
  if (payload === undefined || payload.kind !== 'rich') {
    // Before any text, a rich draft shows Telegram's thinking block, which
    // exists for exactly this.
    return {
      blocks: {
        _: 'inputRichMessage',
        blocks: [{ _: 'pageBlockThinking', text: { _: 'textPlain', text: '…' } }],
      },
    }
  }

  return payload.dialect === 'html' ? { html: payload.source } : { markdown: payload.source }
}

/** The user a peer names, for matching a stop report to its conversation. */
function userIdOf(resolved: unknown): bigint | undefined {
  const peer = resolved as { readonly _?: string; readonly user_id?: bigint }

  return peer._ === 'inputPeerUser' ? peer.user_id : undefined
}

/** Stream text into a conversation from an account. */
export async function streamTo(
  account: StreamingAccount,
  peer: string | PeerRef,
  source: StreamSource,
  options: AccountStreamOptions = {},
): Promise<StreamResult<SentMessage>> {
  const format = formatOf(options)
  const rich = format.kind === 'rich'
  const drafting = {
    ...(options.topicId === undefined ? {} : { topicId: options.topicId }),
    ...(options.canStop === true ? { canStop: true } : {}),
    ...(options.keepOnStop === true ? { keepOnStop: true } : {}),
  }
  const sending: SendOptions = {
    ...(options.topicId === undefined ? {} : { topicId: options.topicId }),
    ...options.send,
  }
  const { markup, ...withoutMarkup } = sending

  const run: Run = {
    peerId: userIdOf(await account.resolve(peer)),
    keys: new Set(),
    canStop: options.canStop === true,
    stop: new StopController(),
  }
  const registry = registryOf(account)
  const live = registry.runs

  // Each window is a draft of its own; opened the first time it is written.
  const handles = new Map<number, Promise<TextDraft | StreamingDraft<RichContent>>>()
  const handleFor = (id: number) => {
    let handle = handles.get(id)
    if (handle === undefined) {
      handle = (
        rich
          ? account.createRichStreamingDraft(peer, drafting)
          : account.createStreamingDraft(peer, drafting)
      ).then((opened) => {
        run.keys.add(opened.key)

        return opened
      })
      handles.set(id, handle)
    }

    return handle
  }

  live.add(run)
  try {
    return await runStream<SentMessage>({
      source,
      format,
      nextDraftId: () => {
        registry.drafts = registry.drafts >= MAX_DRAFT ? 1 : registry.drafts + 1

        return registry.drafts
      },
      stop: run.stop,
      onStop: options.keepOnStop === true ? 'send' : 'discard',
      ...(options.maxLength === undefined ? {} : { limits: { text: options.maxLength } }),
      ...(options.editInterval === undefined ? {} : { editInterval: options.editInterval }),
      ...(options.maxEditBackoff === undefined ? {} : { maxEditBackoff: options.maxEditBackoff }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.onAbort === undefined ? {} : { onAbort: options.onAbort }),
      ...(options.onSourceError === undefined ? {} : { onSourceError: options.onSourceError }),
      ...(options.onPiece === undefined ? {} : { onPiece: options.onPiece }),
      ...(options.onMessage === undefined ? {} : { onMessage: options.onMessage }),
      ...(options.onError === undefined ? {} : { onError: options.onError }),
      thinkingPlaceholder: options.thinkingPlaceholder !== false,
      transport: {
        draft: async (payload, id) => {
          const handle = await handleFor(id)
          if (rich) await (handle as StreamingDraft<RichContent>).write(richOf(payload))
          else await (handle as TextDraft).write(bodyOf(payload))
        },
        send: async (payload, { last }) => {
          const options =
            last && markup !== undefined ? { ...withoutMarkup, markup } : withoutMarkup
          if (rich) return await account.sendRichMessage(peer, richOf(payload), options)

          return await account.sendText(peer, bodyOf(payload), options)
        },
      },
    })
  } finally {
    live.delete(run)
  }
}
