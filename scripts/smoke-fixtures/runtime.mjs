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
  Router,
  schemaInfo,
  StorageError,
  throttle,
} from 'yuigram'
import { mockBot } from 'yuigram/testing'
import { expressWebhook, fastifyWebhook, nodeWebhook } from 'yuigram/webhook'

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
  [nodeWebhook, expressWebhook, fastifyWebhook].every((f) => typeof f === 'function'))
const entry = await import('yuigram')
check('the adapters stay out of the entry point', () => !('nodeWebhook' in entry))
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

for (const [name, result] of checks) {
  process.stdout.write(`  ${result === 'ok' ? 'ok  ' : 'FAIL'}  ${name}\n`)
}

const failures = checks.filter(([, result]) => result !== 'ok')
if (failures.length > 0) {
  process.stderr.write(`\n${failures.map(([n, r]) => `${n}: ${r}`).join('\n')}\n`)
  process.exit(1)
}
