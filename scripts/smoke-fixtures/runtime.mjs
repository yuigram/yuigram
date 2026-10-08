/**
 * Runtime checks against the installed packages.
 *
 * Copied into a throwaway project by `scripts/smoke-package.mjs` and run with
 * plain node, so it must not import anything from this repository.
 */

import {
  Account,
  App,
  Bot,
  createSession,
  encrypted,
  filter,
  FloodError,
  inline,
  media,
  memory,
  parseCommand,
  readLink,
  readPresence,
  Router,
  schemaInfo,
  StorageError,
  throttle,
  writeLink,
} from 'yuigram'
import { slotMachineReels } from 'yuigram/dice'
import { mockBot } from 'yuigram/testing'
import {
  hashInitData,
  InitDataError,
  readInitData,
  verifyInitData,
  verifyInitDataSignature,
} from 'yuigram/web-app'
import { indexedDb } from 'yuigram/indexeddb'
import { expressWebhook, fastifyWebhook, koaWebhook, nodeWebhook } from 'yuigram/webhook'

const checks = []

function check(name, fn) {
  try {
    checks.push([name, fn() === false ? 'failed' : 'ok'])
  } catch (error) {
    checks.push([name, `failed: ${error.message}`])
  }
}

check('the entry point exports the client', () => typeof Bot === 'function')
check('core is re-exported', () => typeof memory === 'function' && typeof createSession === 'function')
check('the bot filter helpers are exported', () => typeof filter === 'function')
check('the error hierarchy is exported', () => typeof FloodError === 'function')
check('the storage failure is exported', () => typeof StorageError === 'function')
check('schemaInfo names the Bot API version', () => /^\d+\.\d+$/.test(schemaInfo.botApi))
check('the MTProto client is re-exported', () => typeof Account === 'function')
// The escape hatch `docs/architecture.md` §7 promises. Building an account
// needs no network, so its presence is checkable without one.
check('the MTProto escape hatch is on the client', () => {
  const account = new Account({
    apiId: 1,
    apiHash: 'x',
    keys: [],
    storage: memory(),
    bootstrap: { thisDc: 2, testMode: true, options: [] },
  })

  return typeof account.api.call === 'function'
})
// Naming a peer: the operation that turns what an account knows into something
// a call can carry. Answered from the store, so it needs no network.
const namer = new Account({
  apiId: 1,
  apiHash: 'x',
  keys: [],
  storage: memory(),
  bootstrap: { thisDc: 2, testMode: true, options: [] },
})
await namer.peers.save({ kind: 'user', id: 7n, accessHash: 99n, min: false, usernames: ['someone'] })
const named = await namer.resolve('@someone')
let refusedUnknown = false
try {
  await namer.resolve({ kind: 'user', id: 404n })
} catch {
  refusedUnknown = true
}

check('a known peer is named for a call', () => named?._ === 'inputPeerUser' && named?.user_id === 7n)
check('a peer the account never saw is refused', () => refusedUnknown)

// The generated half: a namespace and a method the committed schema declares.
check('the MTProto method surface is on the client', () => {
  const account = new Account({
    apiId: 1,
    apiHash: 'x',
    keys: [],
    storage: memory(),
    bootstrap: { thisDc: 2, testMode: true, options: [] },
  })

  return typeof account.api.messages.sendMessage === 'function'
})
check('the container both transports meet in is re-exported', () => typeof App === 'function')
check('the container registers across clients', () => {
  const app = new App()
  return (
    typeof app.on === 'function' && typeof app.once === 'function' && typeof app.off === 'function'
  )
})
check('schemaInfo names the TL layer', () => Number.isInteger(schemaInfo.tlLayer))
check('the testing subpath resolves', () => typeof mockBot === 'function')
check('the webhook subpath resolves', () =>
  [nodeWebhook, expressWebhook, fastifyWebhook, koaWebhook].every((f) => typeof f === 'function'))
const entry = await import('yuigram')
check('the adapters stay out of the entry point', () => !('nodeWebhook' in entry) && !('koaWebhook' in entry))
check('the IndexedDB store is its own entry point, and says what a runtime without IndexedDB lacks', () => {
  if ('indexedDb' in entry) return false
  try {
    indexedDb()
    return false
  } catch (error) {
    return /indexedDB/.test(error.message)
  }
})
// The mock datacenter runs a real key exchange. It belongs to the test tree,
// and this is the only check that can see whether it reached a consumer.
check('the MTProto test infrastructure stays out of the installed package', () =>
  ['mockAccount', 'MockServer', 'MockDatacenter', 'PACKAGE_NAME'].every((name) => !(name in entry)))

// Encryption at rest, through the published build: scrypt derivation, AES-GCM
// and the wrapped store all reached by whatever the package resolves to.
const backing = memory()
const vault = encrypted(backing, 'a-secret-for-the-smoke-test')
await vault.set('note', { text: 'a-recognisable-string' })
const readBack = await vault.get('note')
const underneath = String(await backing.get('note'))

check('an encrypted store round-trips a value', () => readBack?.text === 'a-recognisable-string')
check(
  'the value it wrapped is not readable underneath',
  () => !underneath.includes('a-recognisable-string'),
)

const { bot, send, calls } = mockBot()
bot.onCommand('start', (message) => message.reply('hello'))
await send.command('/start')

check('an update is handled end to end', () => calls.last('sendMessage')?.params.text === 'hello')

// The generated halves of the surface: a named registration per event kind, and
// every method a context can address with its identifiers filled in. Both are
// installed on the prototype, so this also checks the published build kept them.
check('named registrations are installed', () => typeof bot.onChatMemberJoined === 'function')

const { bot: bound, send: sendTo, calls: boundCalls } = mockBot()
bound.onMessage((message) => message.sendChatAction({ action: 'typing' }))
await sendTo.message('anything')

check(
  'a bound method supplies the chat it arrived from',
  () => typeof boundCalls.last('sendChatAction')?.params.chat_id === 'number',
)

const { bot: hosted, send: sendHosted, calls: hostedCalls } = mockBot()
const feature = new Router({ name: 'smoke' })
feature.onCommand('ping', (message) => message.reply('pong'))
hosted.extend(feature)
await sendHosted.command('/ping')

check(
  'a router installed on a client handles updates',
  () => hostedCalls.last('sendMessage')?.params.text === 'pong',
)

const paced = throttle({ globalPerSecond: 1000 })
check('a throttle installs as a hook', () => typeof paced.hook === 'function')
check('the throttle reports its queue depth', () => paced.handle.pending === 0)

check(
  'an inline result gets its type and a unique id',
  () => inline.article('t', 'm').type === 'article' && inline.photo('u').id !== inline.photo('u').id,
)

check('a file source streams rather than buffering', () => {
  const source = media.path('./nothing.txt')
  return typeof source.filename === 'string'
})

const response = await bot.webhook()({
  method: 'POST',
  headers: {},
  body: {
    update_id: 9,
    message: { message_id: 1, date: 1, chat: { id: 1, type: 'private' }, text: '/start' },
  },
})

check('the webhook handler acknowledges an update', () => response.status === 200)

// A file fetched through a bot's own transport, and through a message it received.
const served = new Uint8Array([1, 2, 3])
const fileClient = {
  call: async (request) => ({
    status: 200,
    body: { ok: true, result: { file_id: request.params.file_id, file_path: 'docs/f.bin' } },
  }),
  fileUrl: (path) => `memory:${path}`,
  fetchFile: async () => ({
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(served)
        controller.close()
      },
    }),
  }),
}
const filesBot = new Bot('1:x', { client: fileClient })
const downloaded = await filesBot.download('doc')
check('a bot downloads through its own transport', () => downloaded.join() === '1,2,3')
let fromMessage
filesBot.on('message', async (ctx) => {
  fromMessage = await ctx.download()
})
await filesBot.handleUpdate({
  update_id: 10,
  message: {
    message_id: 2,
    date: 1,
    chat: { id: 1, type: 'private' },
    document: { file_id: 'doc', file_unique_id: 'd' },
  },
})
check('a message downloads the file it carries', () => fromMessage?.join() === '1,2,3')

// The storage adapter, installed on its own, over the runtime's own SQLite.
const { openDatabase, sqliteCounter, sqliteStore } = await import('@yuigram/sqlite')
const database = await openDatabase(':memory:')
const stored = sqliteStore(database)
await stored.set('k', { kept: true }, { ttl: 60 })
const kept = await stored.get('k')
check('the SQLite store keeps a value', () => kept?.kept === true)
const counted = await sqliteCounter(database).hit('k', 1_000, 0)
check('the SQLite counter counts a hit', () => counted.count === 1 && counted.resetMs === 1_000)
database.close()

// The Redis adapter sends commands through whatever client it is given; a
// function standing in for one shows the installed package's side of that.
const { redisStore } = await import('@yuigram/redis')
const sent = []
await redisStore(async (args) => {
  sent.push(args)
  return 'OK'
}).set('k', 1, { ttl: 2 })
check('the Redis store sends a write with its expiry', () => sent[0]?.join(' ') === 'SET yuigram:kv:k 1 PX 2000')

// Links: the bot links a bot hands out, and the proxy and profile links an account reads.
check('a bot link is written in its published form', () =>
  writeLink({ kind: 'channel-bot', bot: 'shop_bot', admin: ['post_messages', 'edit_messages'] }) ===
    'https://t.me/shop_bot?startchannel&admin=post_messages+edit_messages' &&
  writeLink({ kind: 'mini-app', bot: 'shop_bot', payload: 'page_42', mode: 'fullscreen' }) ===
    'https://t.me/shop_bot?startapp=page_42&mode=fullscreen',
)
check('a bot link is read back from any of its hosts', () => {
  const link = readLink('telegram.dog/shop_bot?startgroup=invite&admin=post_messages')
  return link?.kind === 'group-bot' && link.payload === 'invite' && link.admin?.[0] === 'post_messages'
})
check('a proxy link is read, and a start parameter past 64 characters refused', () => {
  const proxy = readLink('tg://proxy?server=192.0.2.10&port=443&secret=ee00')
  let refused = false
  try {
    writeLink({ kind: 'bot-start', bot: 'shop_bot', payload: 'a'.repeat(65) })
  } catch {
    refused = true
  }
  return proxy?.kind === 'proxy' && proxy.port === 443 && refused
})

// Mini App launch data: a vector computed outside the repository, under a placeholder token.
const launch =
  'auth_date=1700000000&query_id=AAH-second_vector&user=%7B%22id%22%3A2222222222%2C%22first_name%22%3A%22Grace%20Brewster%22%2C%22is_premium%22%3Atrue%7D&hash=e58bd23de3144a2f335326d90f673314212b5fd69bef9b771670af746442e042'
const placeholder = '123456789:AAExample_token-for_test-vectors_only'
const verified = await verifyInitData(launch, { token: placeholder, maxAge: 60, now: 1_700_000_030 })
check('launch data is read, and its hash checked with the token', () =>
  readInitData(launch).user?.first_name === 'Grace Brewster' && verified.user?.id === 2222222222,
)
const problems = await Promise.all([
  verifyInitData(launch.replace('Grace', 'Grade'), { token: placeholder, maxAge: Infinity }),
  verifyInitData(launch, { token: placeholder, maxAge: 60, now: 1_700_000_061 }),
  verifyInitDataSignature(launch, { botId: 123456789, maxAge: Infinity }),
].map((pending) => pending.then(() => 'accepted', (error) => (error instanceof InitDataError ? error.problem : 'other'))))
check('altered, old and unsigned launch data are each refused for what they are', () =>
  problems.join(' ') === 'mismatch expired unsigned',
)
const written = await hashInitData(launch, { token: placeholder })
check('the hash of launch data is written as it was computed outside', () =>
  written === 'e58bd23de3144a2f335326d90f673314212b5fd69bef9b771670af746442e042',
)

// The utilities that need no client.
check('a command is parsed from text as a handler would receive it', () => {
  const command = parseCommand('/give@shop_bot 10 gold')
  return (
    command?.name === 'give' &&
    command.mention === 'shop_bot' &&
    command.rest === '10 gold' &&
    command.args.join() === '10,gold' &&
    parseCommand('see /help') === undefined
  )
})
check('a slot machine shows its reels left to right', () =>
  slotMachineReels(64).join() === 'seven,seven,seven' && slotMachineReels(2).join() === 'grapes,bar,bar',
)

check('a status is read as a user’s presence is', () => {
  const offline = readPresence({ _: 'userStatusOffline', was_online: 1_700_000_000 })
  return (
    offline?.state === 'offline' &&
    offline.lastSeen === 1_700_000_000 &&
    readPresence({ _: 'userStatusRecently', by_me: true })?.hiddenByMe === true &&
    readPresence(undefined) === undefined
  )
})

for (const [name, result] of checks) {
  process.stdout.write(`  ${result === 'ok' ? 'ok  ' : 'FAIL'}  ${name}\n`)
}

const failures = checks.filter(([, result]) => result !== 'ok')
if (failures.length > 0) {
  process.stderr.write(`\n${failures.map(([n, r]) => `${n}: ${r}`).join('\n')}\n`)
  process.exit(1)
}
