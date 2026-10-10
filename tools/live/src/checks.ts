// SPDX-License-Identifier: MIT

/**
 * The live checks, and what each is expected to observe.
 *
 * Two tiers. A `read` check asks Telegram something and changes nothing. A
 * `write` check sends, edits or deletes — only in the chat the operator named
 * for it or in the account's own Saved Messages — and registers the undoing of
 * each thing it did before doing the next, so a check that fails half-way
 * still leaves nothing behind.
 *
 * Checks reach the clients through the narrow shapes below, which a `Bot` and
 * an `Account` satisfy, so the runner can be exercised without a network.
 */

import {
  documentFile,
  type InputFile,
  media,
  readSession,
  type UploadedFile,
  type UploadSource,
  uploadedDocument,
} from 'yuigram'
import { shortId } from './redact.js'

/* -------------------------------------------------------------------------- */
/* What a check needs of each client                                          */
/* -------------------------------------------------------------------------- */

/** The part of a bot the checks use. */
export interface LiveBot {
  readonly api: {
    getMe(): Promise<{
      readonly id: number
      readonly is_bot: boolean
      readonly username?: string | undefined
    }>
    getWebhookInfo(): Promise<{ readonly url: string; readonly pending_update_count: number }>
    getMyCommands(): Promise<readonly unknown[]>
    sendMessage(params: {
      chat_id: number | string
      text: string
    }): Promise<{ readonly message_id: number }>
    editMessageText(params: {
      chat_id: number | string
      message_id: number
      text: string
    }): Promise<unknown>
    deleteMessage(params: { chat_id: number | string; message_id: number }): Promise<unknown>
    sendDocument(params: {
      chat_id: number | string
      document: InputFile
      caption?: string
    }): Promise<{
      readonly message_id: number
      readonly document?: { readonly file_id: string } | undefined
    }>
  }
  /** Fetch a file by what names it, through the bot's own transport. */
  download(target: { readonly file_id: string }): Promise<Uint8Array>
}

/** The part of an account the checks use. */
export interface LiveAccount {
  connect(): Promise<void>
  stop(options?: { readonly timeout?: number }): Promise<unknown>
  readonly api: { call(query: { readonly _: string } & Record<string, unknown>): Promise<unknown> }
  me(): Promise<{
    readonly id: bigint
    readonly isBot?: boolean
    readonly username?: string | undefined
  }>
  dialogs(options?: { readonly limit?: number }): AsyncIterable<unknown>
  exportSession(options?: { readonly format?: 'portable' | 'tl-v3' }): Promise<string>
  sendText(
    peer: { readonly kind: 'user'; readonly id: bigint } | string,
    body: string,
  ): Promise<{ readonly id: number | undefined }>
  deleteMessages(
    peer: { readonly kind: 'user'; readonly id: bigint } | string,
    ids: readonly number[],
    options?: { readonly revoke?: boolean },
  ): Promise<void>
  saveDraft(
    peer: { readonly kind: 'user'; readonly id: bigint } | string,
    text: string | undefined,
  ): Promise<void>
  history(
    peer: { readonly kind: 'user'; readonly id: bigint } | string,
    options?: { readonly limit?: number },
  ): AsyncIterable<{ readonly id: number; readonly text?: string | undefined }>
  on(kind: 'message', handler: (event: { readonly text?: string | undefined }) => unknown): unknown
  upload(request: { readonly source: UploadSource; readonly name?: string }): Promise<UploadedFile>
  sendMedia(
    peer: { readonly kind: 'user'; readonly id: bigint } | string,
    media: ReturnType<typeof uploadedDocument>,
    body?: string,
  ): Promise<{ readonly id: number | undefined; readonly message?: unknown }>
  download(request: ReturnType<typeof documentFile>): Promise<Uint8Array>
  /** The username the account answers to, from what it has written down. */
  username?(): Promise<string | undefined>
}

/** Streams text into a conversation from an account, as `yuigram/stream` does. */
export type StreamFunction = (
  account: LiveAccount,
  peer: { readonly kind: 'user'; readonly id: bigint } | string,
  source: AsyncIterable<string>,
  options: {
    readonly signal?: AbortSignal
    /** Let the reader stop it from their client. */
    readonly canStop?: boolean
  },
) => Promise<{
  readonly messages: ReadonlyArray<{ readonly id: number | undefined }>
  readonly drafts: number
  readonly aborted: boolean
  /** Whether the reader stopped it. */
  readonly stopped?: boolean
}>

/** What a running check can reach and report. */
export interface CheckContext {
  bot(): LiveBot
  account(): Promise<LiveAccount>
  /** The chat the bot may write to. */
  readonly botChat: string | undefined
  /** The chat the account may write to besides its Saved Messages. */
  readonly accountChat: string | undefined
  /** A second account a person operates, for the check only a reader can finish. */
  readonly reader: string | undefined
  /** Record what was seen. Passed through the scrubber before it is printed. */
  observe(line: string): void
  /** Register the undoing of something just done; run in reverse, whatever happens. */
  cleanup(step: () => Promise<unknown>): void
  /** Fail the check with an expectation that did not hold. */
  expect(condition: boolean, what: string): void
  /** How an account streams, loaded only by the check that needs it. */
  stream(): Promise<StreamFunction>
}

/** One check. */
export interface LiveCheck {
  readonly id: string
  /**
   * What running it does to Telegram's state.
   *
   * - `read` — asks and changes nothing: the bot checks.
   * - `session` — connects as the account. No message is touched, but a
   *   temporary key is bound and this client is recorded among the account's
   *   active sessions, so it is not read-only.
   * - `write` — sends, edits or deletes, and undoes what it did.
   */
  readonly tier: 'read' | 'session' | 'write'
  readonly needs: readonly ('bot' | 'account' | 'bot chat' | 'account chat' | 'reader')[]
  /** What it does, in a line. */
  readonly does: string
  /** What a pass looks like. */
  readonly expects: string
  run(context: CheckContext): Promise<void>
}

const MARK = 'yuigram live check'

/** What the file checks send: a name that says what it is. */
export const FILE_NAME = 'yuigram-live-check.bin'

/**
 * What the file checks send: four kilobytes of a fixed pattern.
 *
 * Made rather than read, so nothing on the operator's machine is uploaded, and
 * the same every run, so a difference is the transfer's and not the input's.
 * Small enough to be one part each way.
 */
export function fileBytes(): Uint8Array {
  const bytes = new Uint8Array(4_000)
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 31 + 7) & 0xff
  return bytes
}

/** Where two byte strings first differ, or `undefined` where they are the same bytes. */
export function firstDifference(expected: Uint8Array, actual: Uint8Array): number | undefined {
  const shorter = Math.min(expected.length, actual.length)
  for (let index = 0; index < shorter; index += 1) {
    if (expected[index] !== actual[index]) return index
  }
  return expected.length === actual.length ? undefined : shorter
}

/** Report a round trip, and fail the check unless the bytes came back as they went. */
function compareRoundTrip(context: CheckContext, sent: Uint8Array, received: Uint8Array): void {
  const at = firstDifference(sent, received)
  context.observe(
    `uploaded ${sent.length} bytes, downloaded ${received.length}, ` +
      (at === undefined ? 'identical' : `first difference at byte ${at}`),
  )
  context.expect(at === undefined, 'the downloaded bytes are the uploaded bytes')
}

/** Bytes in memory, as the source an upload reads. */
function memorySource(bytes: Uint8Array): UploadSource {
  return {
    size: bytes.length,
    read: async (offset, length) => bytes.subarray(offset, offset + length),
  }
}

/** The document a sent message carries, if it carries one. */
function documentOf(message: unknown): Parameters<typeof documentFile>[0] | undefined {
  const sent = message as
    | {
        readonly _?: string
        readonly media?: { readonly _?: string; readonly document?: { readonly _?: string } }
      }
    | undefined
  if (sent?._ !== 'message' || sent.media?._ !== 'messageMediaDocument') return undefined
  const document = sent.media.document
  return document?._ === 'document'
    ? (document as unknown as Parameters<typeof documentFile>[0])
    : undefined
}

/* -------------------------------------------------------------------------- */
/* The checks                                                                 */
/* -------------------------------------------------------------------------- */

export const CHECKS: readonly LiveCheck[] = [
  {
    id: 'bot.identity',
    tier: 'read',
    needs: ['bot'],
    does: 'getMe',
    expects: 'a bot with a username',
    async run(context) {
      const me = await context.bot().api.getMe()
      context.observe(
        `id ${shortId(me.id)}, is_bot ${me.is_bot}, username present ${me.username !== undefined}`,
      )
      context.expect(me.is_bot, 'getMe describes a bot')
      context.expect(me.username !== undefined, 'the bot has a username')
    },
  },
  {
    id: 'bot.webhook',
    tier: 'read',
    needs: ['bot'],
    does: 'getWebhookInfo',
    expects: 'an answer; whether a webhook is set is reported, not changed',
    async run(context) {
      const info = await context.bot().api.getWebhookInfo()
      context.observe(
        `webhook set ${info.url !== ''}, pending updates ${info.pending_update_count}`,
      )
    },
  },
  {
    id: 'bot.commands',
    tier: 'read',
    needs: ['bot'],
    does: 'getMyCommands',
    expects: 'a list, possibly empty',
    async run(context) {
      const commands = await context.bot().api.getMyCommands()
      context.observe(`${commands.length} command(s)`)
      context.expect(Array.isArray(commands), 'getMyCommands answers with a list')
    },
  },
  {
    id: 'account.connect',
    tier: 'session',
    needs: ['account'],
    does: 'connect with the session, then help.getConfig',
    expects: 'no new authorization key; a configuration naming a datacenter',
    async run(context) {
      const account = await context.account()
      const config = (await account.api.call({ _: 'help.getConfig' })) as {
        readonly this_dc?: number
      }
      context.observe(`this_dc ${config.this_dc}`)
      context.expect(typeof config.this_dc === 'number', 'help.getConfig names this datacenter')
    },
  },
  {
    id: 'account.identity',
    tier: 'session',
    needs: ['account'],
    does: 'the account reads its own user',
    expects: 'a user; whether it is a bot is reported',
    async run(context) {
      const me = await (await context.account()).me()
      context.observe(`id ${shortId(me.id)}, bot ${me.isBot === true}`)
    },
  },
  {
    id: 'account.dialogs',
    tier: 'session',
    needs: ['account'],
    does: 'walk at most one conversation',
    expects: 'no more than one, and no error',
    async run(context) {
      let seen = 0
      for await (const _ of (await context.account()).dialogs({ limit: 1 })) seen += 1
      context.observe(`${seen} conversation(s)`)
      context.expect(seen <= 1, 'the walk stops at its limit')
    },
  },
  {
    id: 'account.session',
    tier: 'session',
    needs: ['account'],
    does: 'export the session in both layouts and read each back',
    expects: 'both carry the same key; only lengths are printed',
    async run(context) {
      const account = await context.account()
      const portable = await account.exportSession()
      const tl = await account.exportSession({ format: 'tl-v3' })
      const one = readSession(portable)
      const two = readSession(tl, { format: 'tl-v3' })
      const same = one.authKey.every((byte, index) => byte === two.authKey[index])
      context.observe(
        `portable ${portable.length} characters, tl-v3 ${tl.length} characters, same key ${same}`,
      )
      context.expect(
        same && one.dcId === two.dcId,
        'both layouts carry the same key and datacenter',
      )
    },
  },
  {
    id: 'bot.message',
    tier: 'write',
    needs: ['bot', 'bot chat'],
    does: 'send, edit and delete one message in the bot chat',
    expects: 'a message id, the edit accepted, the deletion accepted',
    async run(context) {
      const api = context.bot().api
      const chat = context.botChat as string
      const sent = await api.sendMessage({ chat_id: chat, text: `${MARK}: send` })
      context.cleanup(() =>
        api.deleteMessage({ chat_id: chat, message_id: sent.message_id }).catch(() => undefined),
      )
      context.observe(`sent message ${sent.message_id}`)

      await api.editMessageText({
        chat_id: chat,
        message_id: sent.message_id,
        text: `${MARK}: edited`,
      })
      context.observe('edited')
      const deleted = await api.deleteMessage({ chat_id: chat, message_id: sent.message_id })
      context.observe(`deleted ${deleted === true}`)
      context.expect(deleted === true, 'the message was deleted')
    },
  },
  {
    id: 'account.saved',
    tier: 'write',
    needs: ['account'],
    does: 'send a message to Saved Messages, read it back, delete it',
    expects: 'the message is the newest in Saved Messages, then gone',
    async run(context) {
      const account = await context.account()
      const me = await account.me()
      const self = { kind: 'user' as const, id: me.id }
      const text = `${MARK}: saved ${Date.now()}`
      const sent = await account.sendText(self, text)
      const id = sent.id
      if (id !== undefined)
        context.cleanup(() => account.deleteMessages(self, [id], { revoke: true }))

      let newest: { readonly id: number; readonly text?: string | undefined } | undefined
      for await (const message of account.history(self, { limit: 1 })) newest = message
      context.observe(`sent ${id !== undefined}, newest is it ${newest?.text === text}`)
      context.expect(newest?.text === text, 'the sent message is the newest in Saved Messages')
    },
  },
  {
    id: 'account.draft',
    tier: 'write',
    needs: ['account'],
    does: 'keep a draft in Saved Messages, then clear it',
    expects: 'both accepted',
    async run(context) {
      const account = await context.account()
      const me = await account.me()
      const self = { kind: 'user' as const, id: me.id }
      context.cleanup(() => account.saveDraft(self, undefined))
      await account.saveDraft(self, `${MARK}: draft`)
      context.observe('draft kept')
      await account.saveDraft(self, undefined)
      context.observe('draft cleared')
    },
  },
  {
    id: 'bot-account.update',
    tier: 'write',
    needs: ['bot', 'bot chat', 'account'],
    does: 'the bot writes in its chat, where the account is a member, and the account hears it',
    expects: 'a message event with the text within 20 seconds',
    async run(context) {
      const account = await context.account()
      const api = context.bot().api
      const chat = context.botChat as string
      const text = `${MARK}: update ${Date.now()}`
      const heard = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 20_000)
        account.on('message', (event) => {
          if (event.text === text) {
            clearTimeout(timer)
            resolve(true)
          }
        })
      })

      const sent = await api.sendMessage({ chat_id: chat, text })
      context.cleanup(() =>
        api.deleteMessage({ chat_id: chat, message_id: sent.message_id }).catch(() => undefined),
      )
      const arrived = await heard
      context.observe(`heard ${arrived}`)
      context.expect(arrived, 'the account received the bot’s message as an update')
    },
  },
  {
    id: 'account.mention',
    tier: 'write',
    needs: ['account', 'account chat'],
    does: 'the account mentions itself by username in its chat, and reads the mention back',
    expects: 'the message carries a mention of the account; it is deleted afterwards',
    async run(context) {
      const account = await context.account()
      const chat = context.accountChat as string
      const me = await account.me()
      const username = me.username
      context.expect(username !== undefined, 'the test account has a username to be mentioned by')
      const text = `${MARK}: mention @${username}`
      const sent = await account.sendText(chat, text)
      const id = sent.id
      if (id !== undefined)
        context.cleanup(() => account.deleteMessages(chat, [id], { revoke: true }))

      let newest: { readonly text?: string | undefined } | undefined
      for await (const message of account.history(chat, { limit: 1 })) newest = message
      context.observe(`sent ${id !== undefined}, read back ${newest?.text === text}`)
      context.expect(newest?.text === text, 'the mention reads back as it was sent')
    },
  },
  {
    id: 'bot.file',
    tier: 'write',
    needs: ['bot', 'bot chat'],
    does: 'send a fixed 4,000-byte file to the bot chat as a document, download it with bot.download, compare, delete the message',
    expects: 'the same bytes back; the message deleted',
    async run(context) {
      const bot = context.bot()
      const chat = context.botChat as string
      const bytes = fileBytes()
      const sent = await bot.api.sendDocument({
        chat_id: chat,
        document: media.buffer(bytes, FILE_NAME),
        caption: `${MARK}: file`,
      })
      // Registered before anything else can fail, and not excused if it fails:
      // the message is the one thing this check leaves behind.
      context.cleanup(() => bot.api.deleteMessage({ chat_id: chat, message_id: sent.message_id }))
      context.observe(`sent message ${sent.message_id}`)

      const fileId = sent.document?.file_id
      context.expect(fileId !== undefined, 'the sent message carries a document')
      compareRoundTrip(context, bytes, await bot.download({ file_id: fileId as string }))
    },
  },
  {
    id: 'account.file',
    tier: 'write',
    needs: ['account'],
    does: 'upload a fixed 4,000-byte file to Saved Messages as a document, download it from the sent message, compare, delete the message',
    expects: 'the same bytes back; the message deleted',
    async run(context) {
      const account = await context.account()
      const me = await account.me()
      const self = { kind: 'user' as const, id: me.id }
      const bytes = fileBytes()
      const uploaded = await account.upload({ source: memorySource(bytes), name: FILE_NAME })
      const sent = await account.sendMedia(
        self,
        uploadedDocument(uploaded, { name: FILE_NAME, mimeType: 'application/octet-stream' }),
        `${MARK}: file`,
      )
      const id = sent.id
      if (id !== undefined) {
        context.cleanup(() => account.deleteMessages(self, [id], { revoke: true }))
      }
      context.observe(`sent ${id !== undefined}`)
      context.expect(id !== undefined, 'the send names the message it made, so it can be deleted')

      const document = documentOf(sent.message)
      context.expect(document !== undefined, 'the sent message carries the document')
      compareRoundTrip(
        context,
        bytes,
        await account.download(documentFile(document as Parameters<typeof documentFile>[0])),
      )
    },
  },
  {
    id: 'account.stream',
    tier: 'write',
    needs: ['account'],
    does: 'stream text into Saved Messages as drafts, then stop it by abort before the end',
    expects: 'drafts shown, the stream reported as aborted, and anything it sent deleted',
    async run(context) {
      const account = await context.account()
      const me = await account.me()
      const self = { kind: 'user' as const, id: me.id }
      const stream = await context.stream()
      const controller = new AbortController()
      const source = (async function* () {
        yield `${MARK}: stream `
        await new Promise((resolve) => setTimeout(resolve, 1_500))
        yield 'still going '
        controller.abort()
        await new Promise((resolve) => setTimeout(resolve, 1_500))
        yield 'never shown'
      })()

      const result = await stream(account, self, source, { signal: controller.signal })
      for (const message of result.messages) {
        const id = message.id
        if (id !== undefined)
          context.cleanup(() => account.deleteMessages(self, [id], { revoke: true }))
      }
      context.observe(
        `drafts ${result.drafts}, aborted ${result.aborted}, messages ${result.messages.length}`,
      )
      context.expect(result.aborted, 'the stream reports that it was stopped')
    },
  },
  {
    id: 'account.stream-stop',
    tier: 'write',
    needs: ['account', 'reader'],
    does: 'stream slowly into a private chat with the reader, who taps stop in their client within 60 seconds',
    expects: 'the stream reports that the reader stopped it; anything it sent is deleted',
    async run(context) {
      const account = await context.account()
      const reader = context.reader as string
      const stream = await context.stream()
      const source = (async function* () {
        // Two seconds a piece for up to a minute: long enough for a person to
        // see the draft and tap stop, short enough that a run nobody watches ends.
        for (let piece = 1; piece <= 30; piece += 1) {
          yield `${MARK}: stop me ${piece} `
          await new Promise((resolve) => setTimeout(resolve, 2_000))
        }
      })()

      context.observe('streaming; the reader has 60 seconds to tap stop')
      const result = await stream(account, reader, source, { canStop: true })
      for (const message of result.messages) {
        const id = message.id
        if (id !== undefined)
          context.cleanup(() => account.deleteMessages(reader, [id], { revoke: true }))
      }
      context.observe(
        `drafts ${result.drafts}, stopped ${result.stopped === true}, messages ${result.messages.length}`,
      )
      context.expect(result.stopped === true, 'the reader stopped the stream')
    },
  },
]
