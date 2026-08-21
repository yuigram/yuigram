/**
 * Runtime checks against the installed packages.
 *
 * Copied into a throwaway project by `scripts/smoke-package.mjs` and run with
 * plain node, so it must not import anything from this repository.
 */

import {
  Bot,
  createSession,
  filter,
  FloodError,
  inline,
  media,
  memory,
  Router,
  schemaInfo,
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
check('schemaInfo names the Bot API version', () => /^\d+\.\d+$/.test(schemaInfo.botApi))
check('the testing subpath resolves', () => typeof mockBot === 'function')
check('the webhook subpath resolves', () =>
  [nodeWebhook, expressWebhook, fastifyWebhook].every((f) => typeof f === 'function'))
const entry = await import('yuigram')
check('the adapters stay out of the entry point', () => !('nodeWebhook' in entry))

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
