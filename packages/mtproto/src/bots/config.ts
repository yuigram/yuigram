/**
 * How a bot presents itself, and the mini apps and buttons around it.
 *
 * Three different callers use this surface, and which one a call is for is the
 * first thing to know about it:
 *
 * ```
 *   a bot account      its own commands, its menu button, its default rights,
 *                      answering a guest chat, preparing a message for a mini app
 *   the bot's owner    its name, description and about text, by naming the bot
 *   any user account   pressing a bot's button, opening its mini apps, letting it
 *                      set this account's emoji status
 * ```
 *
 * A call made by the wrong kind of account is refused by Telegram, not guessed
 * at here: whether an account is a bot is Telegram's record, and a bot's owner
 * is whoever created it.
 *
 * Loaded when one of them is called.
 */

import { ValidationError } from '@yuigram/core'
import { type AdminRights, adminRights } from '../chats/common.js'
import type {
  TypeBotCommand,
  TypeBotCommandScope,
  TypeBotMenuButton,
  TypeInlineQueryPeerType,
  TypeInputBotInlineMessageID,
  TypeInputBotInlineResult,
  TypeInputUser,
} from '../generated/api/types/index.js'
import type { Sending } from '../messaging/send.js'
import { userFor } from '../network/peers.js'
import type { PeerRef } from '../normalize/normalize.js'
import type { TlValue } from '../tl/index.js'

/** What configuring a bot needs from a client. */
export interface Configuring extends Sending {
  /** The password proof machinery, for a button that asks for this account's password. */
  readonly srp?: { readonly pbkdf2?: unknown }
  /** Run something later; answers how to cancel it. */
  schedule(run: () => void, delayMs: number): () => void
  /**
   * Keep something running until the account stops.
   *
   * Answers how to let go of it early. The account runs what it holds when it
   * stops, so nothing started here outlives it.
   */
  hold(close: () => void): () => void
  /** Report something that went wrong where nobody is waiting for the answer. */
  warn(message: string, error: unknown): void
}

/** A user named for a call that takes one, refused where the peer is not a person. */
async function userOf(
  client: Sending,
  peer: string | PeerRef,
  what: string,
): Promise<TypeInputUser> {
  const user = userFor(await client.resolve(peer))
  if (user === undefined)
    throw new ValidationError(`${what} is a user or a bot, not a conversation`)

  return user
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Where a list of commands applies.
 *
 * The narrowest scope that matches a conversation wins, which is what lets a
 * bot show administrators a longer list than everybody else.
 */
export type CommandScope =
  | 'default'
  /** Every private chat. */
  | 'users'
  /** Every group. */
  | 'chats'
  /** Every group's administrators. */
  | 'chatAdmins'
  /** One conversation. */
  | { readonly chat: string | PeerRef }
  /** One conversation's administrators. */
  | { readonly adminsOf: string | PeerRef }
  /** One member of one conversation. */
  | { readonly chat: string | PeerRef; readonly member: string | PeerRef }

/** Which commands, for which people, in which language. */
export interface CommandsTarget {
  readonly scope?: CommandScope
  /** A two-letter language code; empty for everybody without a list of their own. */
  readonly languageCode?: string
}

async function scopeOf(
  client: Sending,
  scope: CommandScope | undefined,
): Promise<TypeBotCommandScope> {
  switch (scope) {
    case undefined:
    case 'default':
      return { _: 'botCommandScopeDefault' }
    case 'users':
      return { _: 'botCommandScopeUsers' }
    case 'chats':
      return { _: 'botCommandScopeChats' }
    case 'chatAdmins':
      return { _: 'botCommandScopeChatAdmins' }
    default:
  }

  if ('adminsOf' in scope) {
    return { _: 'botCommandScopePeerAdmins', peer: await client.resolve(scope.adminsOf) }
  }
  if ('member' in scope) {
    return {
      _: 'botCommandScopePeerUser',
      peer: await client.resolve(scope.chat),
      user_id: await userOf(client, scope.member, 'a command scope’s member'),
    }
  }

  return { _: 'botCommandScopePeer', peer: await client.resolve(scope.chat) }
}

function languageOf(target: CommandsTarget | undefined): string {
  const code = target?.languageCode ?? ''
  if (code !== '' && !/^[a-z]{2}$/.test(code)) {
    throw new ValidationError(`${JSON.stringify(code)} is not a two-letter language code`)
  }

  return code
}

/** One command: the word without its slash, and what it does. */
export interface CommandInfo {
  readonly command: string
  readonly description: string
}

/** Telegram's rule for a command: 1–32 lowercase letters, digits and underscores. */
const COMMAND = /^[a-z0-9_]{1,32}$/

function commandsOf(commands: readonly CommandInfo[]): TypeBotCommand[] {
  return commands.map(({ command, description }) => {
    if (!COMMAND.test(command)) {
      throw new ValidationError(
        `${JSON.stringify(command)} is not a command: 1 to 32 lowercase letters, digits and underscores`,
      )
    }
    if (description.length < 1 || description.length > 256) {
      throw new ValidationError(`the description of /${command} is 1 to 256 characters`)
    }

    return { _: 'botCommand', command, description }
  })
}

/** The commands a bot shows, for one scope and language. Bots only. */
export async function getMyCommands(
  client: Sending,
  target?: CommandsTarget,
): Promise<readonly CommandInfo[]> {
  const answer = await client.api.bots.getBotCommands({
    scope: await scopeOf(client, target?.scope),
    lang_code: languageOf(target),
  })

  return answer.map((one) => ({ command: one.command, description: one.description }))
}

/**
 * Publish the commands a bot shows, for one scope and language. Bots only.
 *
 * An empty list is refused: that is {@link deleteMyCommands}, which puts the
 * wider scope's list back rather than showing none.
 */
export async function setMyCommands(
  client: Sending,
  commands: readonly CommandInfo[],
  target?: CommandsTarget,
): Promise<void> {
  if (commands.length === 0) {
    throw new ValidationError('an empty list is deleting the commands; use deleteMyCommands')
  }

  const done = await client.api.bots.setBotCommands({
    scope: await scopeOf(client, target?.scope),
    lang_code: languageOf(target),
    commands: commandsOf(commands),
  })
  if (!done) throw new ValidationError('Telegram declined to set the commands')
}

/** Remove the commands for one scope and language, so the wider one applies. Bots only. */
export async function deleteMyCommands(client: Sending, target?: CommandsTarget): Promise<void> {
  await client.api.bots.resetBotCommands({
    scope: await scopeOf(client, target?.scope),
    lang_code: languageOf(target),
  })
}

/* -------------------------------------------------------------------------- */
/* The bot's own description                                                   */
/* -------------------------------------------------------------------------- */

/** What a bot says about itself, in one language. */
export interface BotInfo {
  readonly name: string
  /** The short text on its profile. */
  readonly about: string
  /** The longer text in an empty chat with it. */
  readonly description: string
}

/** Which bot, in which language. */
export interface BotInfoTarget {
  /**
   * The bot to describe, when the account is its owner rather than the bot
   * itself. Left out, the account is the bot.
   */
  readonly bot?: string | PeerRef
  readonly languageCode?: string
}

async function botOf(client: Sending, target: BotInfoTarget | undefined) {
  return target?.bot === undefined ? {} : { bot: await userOf(client, target.bot, 'the bot') }
}

/** A bot's name, about text and description in one language. */
export async function getBotInfo(client: Sending, target?: BotInfoTarget): Promise<BotInfo> {
  const answer = await client.api.bots.getBotInfo({
    ...(await botOf(client, target)),
    lang_code: languageOf(target),
  })

  return { name: answer.name, about: answer.about, description: answer.description }
}

/**
 * Change a bot's name, about text or description in one language.
 *
 * Only what is given is sent: the protocol reads an absent field as "leave it"
 * and an empty one as "clear it", so the two must not be confused.
 */
export async function setBotInfo(
  client: Sending,
  change: Partial<BotInfo> & BotInfoTarget,
): Promise<void> {
  if (change.name === undefined && change.about === undefined && change.description === undefined) {
    throw new ValidationError('say what to change: a name, an about text or a description')
  }

  const done = await client.api.bots.setBotInfo({
    ...(await botOf(client, change)),
    lang_code: languageOf(change),
    ...(change.name === undefined ? {} : { name: change.name }),
    ...(change.about === undefined ? {} : { about: change.about }),
    ...(change.description === undefined ? {} : { description: change.description }),
  })
  if (!done) throw new ValidationError('Telegram declined to change the bot’s description')
}

/* -------------------------------------------------------------------------- */
/* Menu button and default rights                                              */
/* -------------------------------------------------------------------------- */

/** The button beside the message box in a chat with a bot. */
export type MenuButtonSetting =
  | { readonly kind: 'default' }
  | { readonly kind: 'commands' }
  | { readonly kind: 'webApp'; readonly text: string; readonly url: string }

function menuButtonOf(button: MenuButtonSetting): TypeBotMenuButton {
  switch (button.kind) {
    case 'default':
      return { _: 'botMenuButtonDefault' }
    case 'commands':
      return { _: 'botMenuButtonCommands' }
    default:
      if (button.text === '' || !/^https:\/\//.test(button.url)) {
        throw new ValidationError('a mini app button needs its text and an https address')
      }

      return { _: 'botMenuButton', text: button.text, url: button.url }
  }
}

function readMenuButton(button: TypeBotMenuButton): MenuButtonSetting {
  switch (button._) {
    case 'botMenuButtonDefault':
      return { kind: 'default' }
    case 'botMenuButtonCommands':
      return { kind: 'commands' }
    default:
      return { kind: 'webApp', text: button.text, url: button.url }
  }
}

/**
 * The menu button one person sees, or the one everybody sees. Bots only.
 *
 * `undefined` names everybody: the button a bot sets for no one in particular.
 */
export async function getBotMenuButton(
  client: Sending,
  user?: string | PeerRef,
): Promise<MenuButtonSetting> {
  const answer = await client.api.bots.getBotMenuButton({
    user_id:
      user === undefined ? { _: 'inputUserEmpty' } : await userOf(client, user, 'the person'),
  })

  return readMenuButton(answer)
}

/** Set the menu button one person sees, or the one everybody sees. Bots only. */
export async function setBotMenuButton(
  client: Sending,
  button: MenuButtonSetting,
  user?: string | PeerRef,
): Promise<void> {
  const done = await client.api.bots.setBotMenuButton({
    user_id:
      user === undefined ? { _: 'inputUserEmpty' } : await userOf(client, user, 'the person'),
    button: menuButtonOf(button),
  })
  if (!done) throw new ValidationError('Telegram declined to set the menu button')
}

/**
 * The rights a bot asks for when somebody adds it as an administrator. Bots only.
 *
 * Groups and channels have separate defaults and separate calls, because what
 * an administrator does in one is not what it does in the other.
 */
export async function setMyDefaultRights(
  client: Sending,
  target: 'group' | 'channel',
  rights: AdminRights,
): Promise<void> {
  const admin_rights = adminRights(rights)
  const done =
    target === 'group'
      ? await client.api.bots.setBotGroupDefaultAdminRights({ admin_rights })
      : await client.api.bots.setBotBroadcastDefaultAdminRights({ admin_rights })

  if (!done) throw new ValidationError(`Telegram declined to set the default ${target} rights`)
}

/* -------------------------------------------------------------------------- */
/* Pressing a bot's button, as a user                                          */
/* -------------------------------------------------------------------------- */

/** What a bot answered a pressed button with. */
export interface ButtonAnswer {
  /** A notice to show, where the bot sent one. */
  readonly message?: string
  /** Whether the notice is a dialog rather than a passing toast. */
  readonly alert: boolean
  /** An address to open instead, where the bot gave one. */
  readonly url?: string
  /** How long the answer may be reused for the same button, in seconds. */
  readonly cacheTime: number
}

/**
 * Press an inline button on a bot's message, as a person would.
 *
 * The mirror of a bot answering one: this is the account on the other side.
 * `data` is the button's own payload. A button that asks for the account's
 * password — handing over a channel, say — is answered with a proof of it, never
 * with the password itself. Telegram waits for the bot, and refuses with a
 * timeout when the bot does not answer in time.
 */
export async function getCallbackAnswer(
  client: Configuring,
  peer: string | PeerRef,
  messageId: number,
  button: {
    readonly data?: Uint8Array | string
    readonly game?: boolean
    readonly password?: string
  },
): Promise<ButtonAnswer> {
  if (button.data === undefined && button.game !== true) {
    throw new ValidationError('a pressed button carries its data, or is a game button')
  }

  const target = await client.resolve(peer)
  let password: unknown
  if (button.password !== undefined) {
    const { proveCurrent } = await import('../security/password.js')
    password = await proveCurrent(client as never, button.password)
  }

  const answer = await client.api.messages.getBotCallbackAnswer({
    peer: target,
    msg_id: messageId,
    ...(button.data === undefined
      ? {}
      : {
          data:
            typeof button.data === 'string' ? new TextEncoder().encode(button.data) : button.data,
        }),
    ...(button.game === true ? { game: true as const } : {}),
    ...(password === undefined ? {} : { password: password as never }),
  })

  return {
    alert: answer.alert === true,
    cacheTime: answer.cache_time,
    ...(answer.message === undefined ? {} : { message: answer.message }),
    ...(answer.url === undefined ? {} : { url: answer.url }),
  }
}

/** Let a bot set this account's emoji status, or take the permission back. */
export async function toggleEmojiStatusPermission(
  client: Sending,
  bot: string | PeerRef,
  allow: boolean,
): Promise<void> {
  const done = await client.api.bots.toggleUserEmojiStatusPermission({
    bot: await userOf(client, bot, 'the bot'),
    enabled: allow,
  })
  if (!done) throw new ValidationError('Telegram declined to change the permission')
}

/* -------------------------------------------------------------------------- */
/* Inline results a bot hands over                                             */
/* -------------------------------------------------------------------------- */

/**
 * Answer a guest chat query with one result. Bots only.
 *
 * The answer names the message the result became, as an inline message: it has
 * no conversation of this bot's and is edited by that identifier.
 */
export async function answerBotGuestChatQuery(
  client: Sending,
  queryId: bigint,
  result: TypeInputBotInlineResult,
): Promise<TypeInputBotInlineMessageID> {
  return await client.api.messages.setBotGuestChatResult({ query_id: queryId, result })
}

/** Where a prepared message may be sent from a mini app. */
export type PreparedTarget =
  | 'self'
  | 'privateChats'
  | 'bots'
  | 'groups'
  | 'supergroups'
  | 'channels'

const PEER_TYPES: Readonly<Record<PreparedTarget, TypeInlineQueryPeerType>> = {
  self: { _: 'inlineQueryPeerTypeSameBotPM' },
  privateChats: { _: 'inlineQueryPeerTypePM' },
  bots: { _: 'inlineQueryPeerTypeBotPM' },
  groups: { _: 'inlineQueryPeerTypeChat' },
  supergroups: { _: 'inlineQueryPeerTypeMegagroup' },
  channels: { _: 'inlineQueryPeerTypeBroadcast' },
}

/** A message prepared for a mini app to send, and when the preparation lapses. */
export interface PreparedMessage {
  readonly id: string
  /** Unix seconds. */
  readonly expiresAt: number
}

/**
 * Prepare a message a mini app can ask the user to send. Bots only.
 *
 * The mini app hands the identifier to the client, which asks the user where to
 * send it — among the kinds of conversation given, or anywhere when none are.
 */
export async function prepareInlineMessage(
  client: Sending,
  user: string | PeerRef,
  result: TypeInputBotInlineResult,
  targets?: readonly PreparedTarget[],
): Promise<PreparedMessage> {
  if (targets?.length === 0) {
    throw new ValidationError('name at least one kind of conversation, or leave the list out')
  }

  const answer = await client.api.messages.savePreparedInlineMessage({
    result,
    user_id: await userOf(client, user, 'the person the message is for'),
    ...(targets === undefined
      ? {}
      : { peer_types: [...new Set(targets)].map((one) => PEER_TYPES[one]) }),
  })

  return { id: answer.id, expiresAt: answer.expire_date }
}

/* -------------------------------------------------------------------------- */
/* Mini apps                                                                   */
/* -------------------------------------------------------------------------- */

/** How often an open mini app is said to still be open, per Telegram's rule. */
export const WEBVIEW_PROLONG_MS = 60_000

/** How a mini app is opened, which decides the request and whether it stays open. */
export type WebViewSource =
  /** The bot's main mini app. */
  | { readonly kind: 'main'; readonly startParam?: string }
  /** A button that opens a mini app without a conversation: a reply keyboard, a switch, the side menu. */
  | {
      readonly kind: 'simple'
      readonly url?: string
      readonly startParam?: string
      readonly from?: 'switch' | 'sideMenu'
    }
  /** An inline button, the menu button or the attachment menu, in a conversation. */
  | {
      readonly kind: 'chat'
      readonly url?: string
      readonly startParam?: string
      readonly fromMenu?: boolean
      readonly replyTo?: number
      readonly sendAs?: string | PeerRef
      readonly silent?: boolean
    }
  /** A named mini app from a link. */
  | {
      readonly kind: 'app'
      readonly shortName: string
      readonly startParam?: string
      readonly allowWrite?: boolean
    }

/** What is needed to open a mini app. */
export interface WebViewRequest {
  readonly bot: string | PeerRef
  readonly source: WebViewSource
  /** The conversation it is opened in; the chat with the bot when left out. */
  readonly chat?: string | PeerRef
  /** Colours for the app, as hex strings, under the names mini apps read. */
  readonly theme?: Readonly<Record<string, string>>
  /** The platform the app is told it runs on, such as `android` or `tdesktop`. */
  readonly platform: string
  readonly compact?: boolean
  readonly fullscreen?: boolean
}

/**
 * An open mini app.
 *
 * Where Telegram gave it a query identifier it has to be told, every minute,
 * that the app is still open — and the handle does that until it is closed, the
 * account stops, or Telegram says the query is no longer valid.
 */
export interface WebView {
  readonly url: string
  /** Present where the app can send a message back through the query. */
  readonly queryId?: bigint
  readonly fullscreen: boolean
  /** Whether it is still being kept open. */
  readonly open: boolean
  /** Stop keeping it open. Closing twice does nothing the second time. */
  close(): void
}

/**
 * Open a bot's mini app.
 *
 * The request depends on where the app is opened from, and an app opened in a
 * conversation comes back with a query identifier the app sends its result
 * through; while it is open, the client has to prolong that query every sixty
 * seconds, and close the app if Telegram answers that the query is gone.
 */
export async function openWebview(client: Configuring, request: WebViewRequest): Promise<WebView> {
  if (request.platform === '') throw new ValidationError('say which platform the app runs on')

  // The bot is resolved once, as a peer: a mini app opened without a
  // conversation is opened in the chat with the bot, and that chat is this peer.
  const botPeer = await client.resolve(request.bot)
  const bot = userFor(botPeer)
  if (bot === undefined)
    throw new ValidationError('a mini app belongs to a bot, not a conversation')

  const chat = request.chat === undefined ? botPeer : await client.resolve(request.chat)
  const shape = {
    ...(request.compact === true ? { compact: true as const } : {}),
    ...(request.fullscreen === true ? { fullscreen: true as const } : {}),
    ...(request.theme === undefined
      ? {}
      : { theme_params: { _: 'dataJSON' as const, data: JSON.stringify(request.theme) } }),
    platform: request.platform,
  }
  const asked: Asked = { client, bot, chat, shape, named: request.chat !== undefined }
  const { answer, prolong } = await REQUESTS[request.source.kind](asked, request.source as never)

  return keptOpen(client, answer, prolong)
}

/** What every mini app request needs, resolved once. */
interface Asked {
  readonly client: Configuring
  readonly bot: TypeInputUser
  readonly chat: Awaited<ReturnType<Configuring['resolve']>>
  readonly shape: Record<string, unknown> & { readonly platform: string }
  /** Whether the caller named a conversation rather than leaving it to the bot's. */
  readonly named: boolean
}

/** The request a source is opened with, and the prolongation it needs if any. */
type Opened = { readonly answer: TlValue; readonly prolong?: TlValue }

const startOf = (startParam: string | undefined) =>
  startParam === undefined ? {} : { start_param: startParam }

const REQUESTS: {
  readonly [K in WebViewSource['kind']]: (
    asked: Asked,
    source: Extract<WebViewSource, { kind: K }>,
  ) => Promise<Opened>
} = {
  // The main app is opened in a conversation only where one was named.
  main: async ({ client, bot, chat, shape, named }, source) => ({
    answer: (await client.api.messages.requestMainWebView({
      peer: named ? chat : { _: 'inputPeerEmpty' },
      bot,
      ...startOf(source.startParam),
      ...shape,
    } as never)) as unknown as TlValue,
  }),

  simple: async ({ client, bot, shape }, source) => ({
    answer: (await client.api.messages.requestSimpleWebView({
      bot,
      ...(source.url === undefined ? {} : { url: source.url }),
      ...startOf(source.startParam),
      ...(source.from === 'switch' ? { from_switch_webview: true as const } : {}),
      ...(source.from === 'sideMenu' ? { from_side_menu: true as const } : {}),
      ...shape,
    } as never)) as unknown as TlValue,
  }),

  chat: async ({ client, bot, chat, shape }, source) => {
    const around = {
      ...(source.replyTo === undefined
        ? {}
        : { reply_to: { _: 'inputReplyToMessage' as const, reply_to_msg_id: source.replyTo } }),
      ...(source.sendAs === undefined ? {} : { send_as: await client.resolve(source.sendAs) }),
      ...(source.silent === true ? { silent: true as const } : {}),
    }

    return {
      answer: (await client.api.messages.requestWebView({
        peer: chat,
        bot,
        ...(source.url === undefined ? {} : { url: source.url }),
        ...startOf(source.startParam),
        ...(source.fromMenu === true ? { from_bot_menu: true as const } : {}),
        ...around,
        ...shape,
      } as never)) as unknown as TlValue,
      // The same reply and identity as the app was opened with, because the
      // result it sends goes where the query was opened.
      prolong: { _: 'messages.prolongWebView', peer: chat, bot, ...around },
    }
  },

  app: async ({ client, bot, chat, shape }, source) => ({
    answer: (await client.api.messages.requestAppWebView({
      peer: chat,
      app: { _: 'inputBotAppShortName', bot_id: bot, short_name: source.shortName },
      ...startOf(source.startParam),
      ...(source.allowWrite === true ? { write_allowed: true as const } : {}),
      ...shape,
    } as never)) as unknown as TlValue,
    prolong: { _: 'messages.prolongWebView', peer: chat, bot },
  }),
}

/** A mini app's handle, prolonging its query for as long as it stays open. */
function keptOpen(client: Configuring, answer: TlValue, prolong: TlValue | undefined): WebView {
  const url = answer['url']
  if (typeof url !== 'string')
    throw new ValidationError('Telegram answered without the app’s address')

  const queryId = typeof answer['query_id'] === 'bigint' ? answer['query_id'] : undefined
  let open = true
  let cancel: (() => void) | undefined
  let release: (() => void) | undefined

  const close = () => {
    if (!open) return

    open = false
    cancel?.()
    release?.()
  }

  if (queryId !== undefined && prolong !== undefined) {
    const again = () => {
      cancel = client.schedule(() => {
        if (!open) return

        void client.api
          .call({ ...prolong, query_id: queryId } as never)
          .then(() => {
            if (open) again()
          })
          .catch((error: unknown) => {
            // A query Telegram no longer knows is an app that has to close;
            // anything else is a missed minute, and the next one is tried.
            if (error instanceof Error && /\bQUERY_ID_INVALID\b/.test(error.message)) {
              close()

              return
            }
            client.warn('could not keep the mini app open', error)
            if (open) again()
          })
      }, WEBVIEW_PROLONG_MS)
    }

    again()
    release = client.hold(close)
  }

  return {
    url,
    ...(queryId === undefined ? {} : { queryId }),
    fullscreen: answer['fullscreen'] === true,
    get open() {
      return open
    },
    close,
  }
}
