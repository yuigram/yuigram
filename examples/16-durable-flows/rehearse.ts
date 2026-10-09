// SPDX-License-Identifier: MPL-2.0

/**
 * The same bot, across a real restart, without Telegram.
 *
 * ```sh
 * pnpm tsx examples/16-durable-flows/rehearse.ts
 * ```
 *
 * Runs itself twice as two separate processes over one state directory. The
 * first starts an order and answers the first question, then exits. The
 * second is a new process with nothing in memory: it registers the flow again,
 * receives the second answer, and finishes the order. Each prints what the
 * bot sent.
 *
 * Telegram is replaced by the in-process harness from `yuigram/testing`, which
 * drives the real update pipeline with only the network swapped out.
 */

import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { messageUpdate, mockBot, privateChat, user } from 'yuigram/testing'
import { install, type WithConversation } from './flow.js'

const [stage, directory] = process.argv.slice(2)

/** One person in one private chat, the same in both processes. */
const person = user({ id: 7, first_name: 'Ada' })
const chat = privateChat({ id: 7 })

/** Deliver a message with an explicit update number, as Telegram would. */
async function say(send: ReturnType<typeof mockBot>['send'], updateId: number, text: string) {
  const update = messageUpdate({ text, from: person, chat })
  await send.update({ ...update, update_id: updateId })
}

async function stageOne(state: string): Promise<void> {
  const { bot, send, calls } = mockBot<WithConversation>()
  install(bot, state)

  await say(send, 101, '/order')
  await say(send, 102, 'flat white')

  for (const call of calls.callsTo('sendMessage')) console.log(`  bot: ${call.params['text']}`)
}

async function stageTwo(state: string): Promise<void> {
  const { bot, send, calls } = mockBot<WithConversation>()
  install(bot, state)

  await say(send, 103, 'enormous')
  await say(send, 104, 'Large')

  for (const call of calls.callsTo('sendMessage')) console.log(`  bot: ${call.params['text']}`)
  const orders = await readFile(join(state, 'orders.log'), 'utf8')
  console.log(`  orders placed: ${orders.trim().split('\n').length}`)
}

if (stage === 'one' && directory !== undefined) {
  await stageOne(directory)
} else if (stage === 'two' && directory !== undefined) {
  await stageTwo(directory)
} else {
  const state = await mkdtemp(join(tmpdir(), 'yuigram-flows-'))
  const self = fileURLToPath(import.meta.url)

  try {
    for (const next of ['one', 'two']) {
      console.log(`process ${next}:`)
      // A new process each time: the same runtime flags, nothing else shared
      // but the directory.
      const child = spawnSync(process.execPath, [...process.execArgv, self, next, state], {
        stdio: 'inherit',
      })
      if (child.status !== 0) throw new Error(`process ${next} exited with ${child.status}`)
    }
  } finally {
    await rm(state, { recursive: true, force: true })
  }
}
