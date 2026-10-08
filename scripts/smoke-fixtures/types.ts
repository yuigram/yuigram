/**
 * Type-level checks against the installed packages.
 *
 * Copied into a throwaway project by `scripts/smoke-package.mjs` and compiled
 * under each module resolution a consumer might use. It must not import
 * anything from this repository.
 *
 * What this is for is not the compilation but the *inference*: a published
 * build whose declarations resolve through the façade but lose their narrowing
 * compiles here and disappoints every user. So each line below asserts a type
 * the surface is supposed to produce, by using it.
 */

import { type RedisClient, redisCounter, redisStore } from '@yuigram/redis'
import { type SqliteDatabase, sqliteCounter, sqliteStore } from '@yuigram/sqlite'
import {
  type Account,
  type AccountOptions,
  type AnyEventContext,
  App,
  Bot,
  downloadToFile,
  encrypted,
  type KV,
  limiter,
  type MtprotoApi,
  type MtprotoContext,
  memory,
  Router,
  type SessionFlavor,
  session,
  type TlValue,
  userChatKey,
} from 'yuigram'
import { type SlotMachineReels, slotMachineReels } from 'yuigram/dice'
import { type IndexedDbStore, indexedDb } from 'yuigram/indexeddb'
import { mtproxy } from 'yuigram/mtproxy'
import { mockBot } from 'yuigram/testing'
import { type InitData, InitDataKey, verifyInitData } from 'yuigram/web-app'
import { koaWebhook, nodeWebhook } from 'yuigram/webhook'

interface Cart {
  items: string[]
}

/** What the session plugin adds. The parameter carries extensions, not the whole context. */
type WithCart = SessionFlavor<Cart>

const bot = Bot.fromToken<WithCart>('1:x').extend(
  session<Cart>({
    storage: memory<Cart>(),
    key: userChatKey,
    initial: () => ({ items: [] }),
  }),
)

bot.onCommand('buy', (message) => {
  message.session.items.push(message.command.rest)
  return message.reply(`${message.session.items.length} items`)
})

bot.onMessage((message) => {
  // Guaranteed on a message, so no `?.` is needed and none is written: if the
  // published build widened this, the line stops compiling.
  const chatId: number = message.chat.id
  const text: string | undefined = message.text
  return message.reply(`${chatId} ${text}`)
})

// A named registration, generated per event kind.
bot.onChatMemberJoined((event) => event.reply('welcome'))

// A bound method: the chat came with the update, so only the person is named.
bot.onMessage((message) => message.banChatMember({ user_id: 1 }))

// Supplied parameters stay overridable.
bot.onMessage((message) => message.sendMessage({ chat_id: 2, text: 'elsewhere' }))

// A router declares what it needs, and this client provides it.
const cart = new Router<WithCart>()
cart.onCommand('cart', (message) => message.reply(`${message.session.items.length} items`))
bot.extend(cart)

// One application holding both transports, which is the whole point of the
// façade: the two subsystems never import each other, so this is the only way a
// consumer can put them together — and it has to type-check as installed.
const app = new App()
app.add(bot)

declare const user: Account
app.add(user)

// One registration across both transports, typed by the union the application
// was declared with. A published build that lost the discriminant compiles the
// call and silently stops narrowing, which is what this catches.
const cross = new App<AnyEventContext | MtprotoContext>()
cross.on('message', (event) => {
  const transport: 'bot-api' | 'mtproto' = event.transport
  if (event.transport === 'mtproto') {
    const text: string | undefined = event.text
    return [transport, text]
  }
  return [transport, event.updateId]
})

// The discriminant a handler installed on more than one client branches on. A
// published build that widened it to `string` still compiles everywhere else.
declare const context: MtprotoContext
export const transport: 'mtproto' = context.transport

// An encrypted store keeps the value type a caller asked for while the store it
// wraps holds ciphertext. A published build that collapsed either half would
// hand every read back as `unknown`.
const vault = encrypted<Cart>(memory<string>(), 'a-secret-for-the-smoke-test')
export const stored: Promise<Cart | undefined> = vault.get('a')
export const persists: boolean = vault.info.persistent

// The MTProto escape hatch, named. A caller writing a helper around it needs
// both the query type and the result type to have names a consumer can reach.
declare const account: Account
export const raw: MtprotoApi = account.api
export const answered: Promise<TlValue> = raw.call({ _: 'help.getConfig' })

// And the generated half, whose argument and result types have to survive the
// published declarations: a build that widened either would still compile here
// without these annotations.
export const resolved: Promise<{ readonly _: string }> = raw.contacts.resolveUsername({
  username: 'telegram',
})
export const checked: Promise<boolean> = raw.account.checkUsername({ username: 'taken' })

// Resolution takes a name or the reference an event carries, and gives back
// something the generated surface accepts as a peer.
declare const named: Account

// Named the way a consumer would have to, since the generated union is not a
// separate export: a resolved peer is whatever `resolve` gives back.
type Resolved = Awaited<ReturnType<Account['resolve']>>

export const byName: Promise<Resolved> = named.resolve('@someone')
export const byReference: Promise<Resolved> = named.resolve({ kind: 'user', id: 1n })

// The point of the whole thing: what resolution produces is what the generated
// surface accepts, with no cast in between.
export const addressed = byName.then(async (peer) => named.api.messages.getPeerSettings({ peer }))

// It is on the context too, per api-design.md §12, and narrowed by transport
// rather than added to the unified surface.
declare const mtproto: MtprotoContext
export const fromEvent: Promise<TlValue> = mtproto.api.call({ _: 'help.getConfig' })

export const listener = nodeWebhook(bot.webhook())
export const koaMiddleware = koaWebhook(bot.webhook(), { path: '/hook' })
export const harness = mockBot()

// The reels of a slot machine are a tuple of three named symbols.
export const reels: SlotMachineReels = slotMachineReels(64)

// Launch data is checked with a key derived once, under an age limit the caller states.
declare const initData: string
export const launched: Promise<InitData> = InitDataKey.fromToken('1:x').then((key) =>
  verifyInitData(initData, { key, maxAge: 3600 }),
)

// A store over a connection the application opened, typed by what it keeps,
// and a counter a limiter takes in place of a store.
declare const database: SqliteDatabase
export const typedStore: KV<{ readonly count: number }> = sqliteStore<{ readonly count: number }>(
  database,
)
export const sharedLimits = limiter({ counter: sqliteCounter(database) })

// The same through a Redis client of the application's.
declare const redis: RedisClient
export const redisSessions: KV<{ readonly count: number }> = redisStore<{ readonly count: number }>(
  redis,
)
export const redisLimits = limiter({ counter: redisCounter(redis) })

// A download through the bot, and to disk through the function given the bot's transport.
export const downloaded: Promise<Uint8Array> = bot.download('file-id')
export const written: Promise<void> = downloadToFile(bot.files, './out.bin', 'file-id')

// A browser's own IndexedDB, as the DOM types it, is a factory with no cast.
export const browserState: IndexedDbStore<{ readonly theme: string }> = indexedDb<{
  readonly theme: string
}>({ factory: indexedDB, keyRange: IDBKeyRange })

// An MTProxy is what an account takes as its proxy.
export const proxy: AccountOptions['proxy'] = mtproxy({
  host: '127.0.0.1',
  port: 443,
  secret: '00112233445566778899aabbccddeeff',
})
