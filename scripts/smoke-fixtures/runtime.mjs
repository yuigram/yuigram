/**
 * Runtime checks against the installed packages.
 *
 * Copied into a throwaway project by `scripts/smoke-package.mjs` and run with
 * plain node, so it must not import anything from this repository.
 */

import { Bot, createSession, filter, FloodError, memory, schemaInfo } from 'yuigram'
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
bot.command('start', (ctx) => ctx.reply('hello'))
await send.command('/start')

check('an update is handled end to end', () => calls.last('sendMessage')?.params.text === 'hello')

const response = await bot.webhookHandler()({
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
