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

import { readSession } from 'yuigram'
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
  }
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
  /** The username the account answers to, from what it has written down. */
  username?(): Promise<string | undefined>
}

/** Streams text into a conversation from an account, as `yuigram/stream` does. */
export type StreamFunction = (
  account: LiveAccount,
  peer: { readonly kind: 'user'; readonly id: bigint } | string,
  source: AsyncIterable<string>,
  options: { readonly signal?: AbortSignal },
) => Promise<{
  readonly messages: ReadonlyArray<{ readonly id: number | undefined }>
  readonly drafts: number
  readonly aborted: boolean
}>

/** What a running check can reach and report. */
export interface CheckContext {
  bot(): LiveBot
  account(): Promise<LiveAccount>
  /** The chat the bot may write to. */
  readonly botChat: string | undefined
  /** The chat the account may write to besides its Saved Messages. */
  readonly accountChat: string | undefined
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
  readonly needs: readonly ('bot' | 'account' | 'bot chat' | 'account chat')[]
  /** What it does, in a line. */
  readonly does: string
  /** What a pass looks like. */
  readonly expects: string
  run(context: CheckContext): Promise<void>
}

const MARK = 'yuigram live check'

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
]
