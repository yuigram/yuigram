// SPDX-License-Identifier: MIT

/**
 * Streaming a model's answer into a private chat, as it is written.
 *
 * ```ts
 * import { stream } from 'yuigram/stream'
 *
 * const streaming = stream({ parseMode: 'MarkdownV2', canStop: true })
 * bot.extend(streaming)
 *
 * bot.onMessage(async (message) => {
 *   await message.stream(openai.chat.completions.create({ ..., stream: true }))
 * })
 * ```
 *
 * The reader sees a draft growing while the answer is produced — Telegram's
 * `sendMessageDraft`, which it offers in private chats only — and a message
 * each time a window fills or the answer ends. `yuigram/stream` holds the
 * engine; what this adds is the Bot API's methods, its limits, and who may
 * stop a stream.
 *
 * **Who may stop a stream.** A reader pressing stop arrives as a
 * `stopped_message_generation` update naming a chat and a draft. It stops a
 * stream only when that stream asked for the button (`canStop`), is still
 * running, is in that chat and thread, and put that very draft on the screen —
 * draft identities are never reused by one client, so a stop meant for a
 * stream that has ended cannot reach one that started later, and a stream in
 * one chat cannot be stopped from another.
 */

import { ConfigError, ValidationError } from '@yuigram/core'
import {
  type EarlyEnd,
  type RunStreamOptions,
  runStream,
  StopController,
  type StreamFormat,
  type StreamPayload,
  type StreamResult,
  type StreamSource,
  type StreamTransport,
} from '@yuigram/core/stream'
import type { RawApi } from '../api.js'
import type { InputRichMessage, Message, MessageEntity } from '../generated/types/index.js'

export * from '@yuigram/core/stream'

/** How a stream is sent. Each call may override what the plugin was given. */
export interface StreamOptions {
  /** Read the text as Telegram HTML or MarkdownV2. Plain text when absent. */
  readonly parseMode?: 'HTML' | 'MarkdownV2'
  /** Send it as a rich message, written in rich Markdown (`true`) or rich HTML. */
  readonly rich?: boolean | 'markdown' | 'html'
  /**
   * A window smaller than Telegram allows: UTF-16 code units of text, or code
   * points of rich markup. Capped at Telegram's own limits.
   */
  readonly maxLength?: number
  /** The shortest time between two drafts, in milliseconds. 250. */
  readonly editInterval?: number
  /** The longest that grows to after failed drafts, in milliseconds. 4,000. */
  readonly maxEditBackoff?: number
  /** Show Telegram's "Thinking…" placeholder before the first text. True. */
  readonly thinkingPlaceholder?: boolean
  /** Show the reader a button that stops the stream. */
  readonly canStop?: boolean
  /** When the reader stops it, send what was written so far as a message. */
  readonly keepOnStop?: boolean
  /** Cancels the stream. */
  readonly signal?: AbortSignal
  /** When aborted: send what was produced, or not. `send` by default. */
  readonly onAbort?: EarlyEnd
  /** When the source fails: send what was produced, or not. `send` by default. */
  readonly onSourceError?: EarlyEnd
  readonly message_thread_id?: number
  readonly reply_parameters?: Parameters<RawApi['sendMessage']>[0]['reply_parameters']
  readonly link_preview_options?: Parameters<RawApi['sendMessage']>[0]['link_preview_options']
  readonly disable_notification?: boolean
  readonly protect_content?: boolean
  /** A keyboard, attached to the stream's last message only. */
  readonly reply_markup?: Parameters<RawApi['sendMessage']>[0]['reply_markup']
  readonly onPiece?: (text: string, draftId: number) => void
  readonly onMessage?: (message: Message) => void
  readonly onError?: (error: unknown) => void | Promise<void>
}

/** A stream in progress, as {@link StreamControls.active} reports it. */
export interface ActiveStream {
  readonly chatId: number
  readonly threadId: number | undefined
  readonly drafts: number
  readonly canStop: boolean
  readonly stopped: boolean
}

/** What the plugin offers besides `message.stream`. */
export interface StreamControls {
  /** Stream into a private chat by id, outside any update. */
  send(
    target: { readonly chatId: number; readonly source: StreamSource } & StreamOptions,
  ): Promise<StreamResult<Message>>
  /** The streams running now. */
  readonly active: readonly ActiveStream[]
  /** Stop every stream in a chat. Returns how many were stopped. */
  stop(chatId: number): number
  /** Stop every stream. Returns how many were stopped. */
  stopAll(): number
}

/** What the plugin adds to a context. */
export interface StreamFlavour {
  /** Stream into the chat this update came from. Private chats only. */
  stream(source: StreamSource, options?: StreamOptions): Promise<StreamResult<Message>>
}

/** What a client must offer the plugin. */
interface StreamHost {
  readonly api: RawApi
  use(middleware: never): unknown
  on(kind: 'stopped_message_generation', handler: never): unknown
}

/** One stream, as the plugin tracks it for stopping. */
interface Run {
  readonly chatId: number
  readonly threadId: number | undefined
  readonly canStop: boolean
  readonly draftIds: Set<number>
  readonly stop: StopController
}

/**
 * The largest draft identity this plugin allocates: a positive 32-bit
 * integer, so it fits whichever width Telegram stores the identity in.
 */
export const DRAFT_ID_MAX = 0x7fffffff

/** The engine's format for a stream's options, refusing a contradiction. */
function formatOf(options: StreamOptions): StreamFormat {
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

/** What a rich draft's placeholder says before any text has arrived. */
const thinkingText = '…'

/** A rich payload as the method takes it. */
function richOf(payload: StreamPayload | undefined): InputRichMessage {
  if (payload === undefined || payload.kind !== 'rich') {
    // Before any text, a rich draft shows Telegram's thinking block, which
    // exists for exactly this.
    return { blocks: [{ type: 'thinking', text: thinkingText }] } as unknown as InputRichMessage
  }

  return payload.dialect === 'html' ? { html: payload.source } : { markdown: payload.source }
}

function textOf(payload: StreamPayload | undefined): { text: string; entities?: MessageEntity[] } {
  if (payload === undefined || payload.kind !== 'text') return { text: '' }
  const { text, entities } = payload.formatted

  return entities.length === 0 ? { text } : { text, entities: entities as MessageEntity[] }
}

/** The fields that are set, for options that take no explicit `undefined`. */
function given<Fields extends object>(
  fields: Fields,
): { [Key in keyof Fields]?: Exclude<Fields[Key], undefined> } {
  const set: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) set[key] = value
  }

  return set as { [Key in keyof Fields]?: Exclude<Fields[Key], undefined> }
}

/** Where a stream's drafts and messages go: the Bot API methods for its format. */
function transportOf(
  client: RawApi,
  chatId: number,
  options: StreamOptions,
  rich: boolean,
): StreamTransport<Message> {
  const threadId = options.message_thread_id
  const drawn = {
    ...(options.canStop === true ? { can_stop: true } : {}),
    ...(options.keepOnStop === true ? { keep_on_stop: true } : {}),
    ...given({ message_thread_id: threadId }),
  }
  const shared = {
    chat_id: chatId,
    ...given({
      message_thread_id: threadId,
      reply_parameters: options.reply_parameters,
      disable_notification: options.disable_notification,
      protect_content: options.protect_content,
    }),
  }

  return {
    draft: (payload, draftId, signal) =>
      rich
        ? client.sendRichMessageDraft(
            { chat_id: chatId, draft_id: draftId, rich_message: richOf(payload), ...drawn },
            { signal },
          )
        : client.sendMessageDraft(
            { chat_id: chatId, draft_id: draftId, ...textOf(payload), ...drawn },
            { signal },
          ),
    send: (payload, { last }, signal) => {
      // The keyboard belongs under the whole answer, so only its last message carries it.
      const markup = last ? given({ reply_markup: options.reply_markup }) : {}
      if (rich) {
        return client.sendRichMessage(
          { ...shared, rich_message: richOf(payload), ...markup },
          { signal },
        )
      }

      return client.sendMessage(
        {
          ...shared,
          ...textOf(payload),
          ...given({ link_preview_options: options.link_preview_options }),
          ...markup,
        },
        { signal },
      )
    },
  }
}

/** The engine's options that come straight from a stream's own. */
function engineOptionsOf(
  options: StreamOptions,
): Omit<RunStreamOptions<Message>, 'source' | 'transport' | 'nextDraftId'> {
  const { maxLength } = options

  return {
    onStop: options.keepOnStop === true ? 'send' : 'discard',
    ...(maxLength === undefined
      ? {}
      : { limits: { text: Math.min(maxLength, 4096), rich: Math.min(maxLength, 32768) } }),
    ...given({
      editInterval: options.editInterval,
      maxEditBackoff: options.maxEditBackoff,
      thinkingPlaceholder: options.thinkingPlaceholder,
      signal: options.signal,
      onAbort: options.onAbort,
      onSourceError: options.onSourceError,
      onPiece: options.onPiece,
      onMessage: options.onMessage,
      onError: options.onError,
    }),
  }
}

/**
 * The stream plugin.
 *
 * Install it with `bot.extend(...)`; `message.stream(...)` is then on every
 * context of a private chat, and the returned value's `controls` stream
 * outside an update, report what is running, and stop it.
 */
export function stream(defaults: StreamOptions = {}): {
  readonly name: 'stream'
  readonly controls: StreamControls
  install(host: StreamHost): StreamControls
} {
  const live = new Set<Run>()
  // Draft identities are never reused by this client: each stream's drafts are
  // its own, and a late stop for one that ended matches nothing.
  let counter = Math.floor(Math.random() * (DRAFT_ID_MAX / 2))
  let api: RawApi | undefined

  const nextDraftId = (): number => {
    counter = (counter % DRAFT_ID_MAX) + 1

    return counter
  }

  const run = async (
    chatId: number,
    source: StreamSource,
    options: StreamOptions,
  ): Promise<StreamResult<Message>> => {
    if (api === undefined)
      throw new ConfigError('install the stream plugin on a bot before streaming')
    const merged: StreamOptions = { ...defaults, ...options }
    const format = formatOf(merged)

    const entry: Run = {
      chatId,
      threadId: merged.message_thread_id,
      canStop: merged.canStop === true,
      draftIds: new Set(),
      stop: new StopController(),
    }

    live.add(entry)
    try {
      return await runStream<Message>({
        ...engineOptionsOf(merged),
        source,
        format,
        nextDraftId: () => {
          const id = nextDraftId()
          entry.draftIds.add(id)

          return id
        },
        stop: entry.stop,
        transport: transportOf(api, chatId, merged, format.kind === 'rich'),
      })
    } finally {
      live.delete(entry)
    }
  }

  const requestStop = (matches: (entry: Run) => boolean): number => {
    let stopped = 0
    for (const entry of live) {
      if (matches(entry) && entry.stop.stop()) stopped += 1
    }

    return stopped
  }

  const controls: StreamControls = {
    send: ({ chatId, source, ...options }) => run(chatId, source, options),
    get active() {
      return [...live].map((entry) => ({
        chatId: entry.chatId,
        threadId: entry.threadId,
        drafts: entry.draftIds.size,
        canStop: entry.canStop,
        stopped: entry.stop.stopped,
      }))
    },
    stop: (chatId) => requestStop((entry) => entry.chatId === chatId),
    stopAll: () => requestStop(() => true),
  }

  return {
    name: 'stream',
    controls,
    install(host) {
      api = host.api

      // A handler rather than middleware, so a bot subscribing to the update
      // kinds it handles subscribes to this one too.
      host.on('stopped_message_generation', ((context: {
        readonly chat: { readonly id: number }
        readonly draft_id: number
        readonly message_thread_id?: number | undefined
      }) => {
        requestStop(
          (entry) =>
            entry.canStop &&
            entry.chatId === context.chat.id &&
            entry.draftIds.has(context.draft_id) &&
            (context.message_thread_id === undefined ||
              context.message_thread_id === entry.threadId),
        )
      }) as never)

      host.use((async (context: Record<string, unknown>, next: () => Promise<void>) => {
        const chat = context['chat'] as { readonly id?: number; readonly type?: string } | undefined
        if (chat?.id !== undefined && !('stream' in context)) {
          Object.defineProperty(context, 'stream', {
            configurable: true,
            enumerable: false,
            value: async (source: StreamSource, options: StreamOptions = {}) => {
              if (chat.type !== 'private') {
                throw new ValidationError(
                  `drafts exist only in private chats, and this is a ${chat.type ?? 'different'} chat; send a message instead`,
                )
              }
              const thread = context['message_thread_id']

              return await run(chat.id as number, source, {
                ...(typeof thread === 'number' ? { message_thread_id: thread } : {}),
                ...options,
              })
            },
          })
        }
        await next()
      }) as never)

      return controls
    },
  }
}
