/**
 * The flow and the bot wiring both entry points share.
 *
 * An order in two questions: what to drink, and what size. Written top to
 * bottom as one function, and resumable wherever it stopped — the questions
 * asked and answers given are kept in the store, not in a closure.
 */

import { appendFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type Bot,
  type ConversationFlavour,
  conversation,
  defineFlow,
  EffectUncertainError,
  type FlowRecord,
  file,
  type MessageContext,
  memory,
  WaitTimeoutError,
} from 'yuigram'

/** What the plugin adds to this bot's contexts. */
export type WithConversation = ConversationFlavour

/** The context the flow is written against. */
type Step = MessageContext & WithConversation

/** What an order produced. */
export interface Order {
  readonly drink: string
  readonly size: string
  readonly number: number
}

/** Anything typed that is not a command. */
const typed = {
  match: (message: Step) => typeof message.text === 'string' && !message.text.startsWith('/'),
  transform: (message: Step) => (message.text as string).trim(),
}

/**
 * Wire the conversation plugin and the flow into a bot, keeping everything
 * under `directory`.
 *
 * Returns the flow controls, for startup and shutdown.
 */
export function install(bot: Bot<WithConversation>, directory: string) {
  const orders = join(directory, 'orders.log')

  const order = defineFlow<Step, undefined, Order>({
    name: 'order',
    // Raised whenever the steps change. A run started under another version
    // is left alone and reported rather than replayed down a different path.
    version: 1,
    async run(flow) {
      const drink = await flow.ask(
        'drink',
        (message) => message.reply('What would you like?'),
        typed,
      )

      let size: string
      try {
        size = await flow.ask(
          'size',
          (message) => message.reply(`A ${drink}. Small, medium or large?`),
          {
            ...typed,
            transform: (message) => (message.text as string).trim().toLowerCase(),
            validate: (answer) =>
              ['small', 'medium', 'large'].includes(answer) || 'Small, medium or large, please.',
            onInvalid: (reason, message) => message.reply(reason ?? 'Pardon?'),
            timeout: 10 * 60_000,
          },
        )
      } catch (error) {
        if (!(error instanceof WaitTimeoutError)) throw error
        // Ten minutes passed. If an update noticed, reply to it; if a deadline
        // did, there is nobody to reply to and the order simply ends.
        if (flow.hasContext) {
          await flow.effect('too-late', async () => {
            await flow.context.reply('That took a while, so I dropped the order. /order again?')

            return null
          })
        }

        return { drink, size: 'none', number: 0 }
      }

      // Everything that reaches outside is an effect, so a restart replays its
      // result rather than doing it again. Placing an order is not safe to
      // repeat, so a stop in the middle of it is reported as uncertain rather
      // than placed twice.
      let number: number
      try {
        number = await flow.effect('place', async () => {
          const placed = await placeOrder(orders, drink, size)

          return placed
        })
      } catch (error) {
        if (!(error instanceof EffectUncertainError)) throw error
        await flow.effect('check', async () => {
          await flow.context.reply('Something went wrong while ordering; please check with us.')

          return null
        })

        return { drink, size, number: 0 }
      }

      await flow.effect('confirm', async () => {
        await flow.context.reply(`Order #${number}: a ${size} ${drink}.`)

        return null
      })

      return { drink, size, number }
    },
  })

  const plugin = conversation<Step>({
    // Scenes are not used here; memory is enough for their positions.
    storage: memory(),
    flows: {
      // A store that survives the process is the whole point.
      storage: file<FlowRecord>(join(directory, 'flows')),
      define: [order],
    },
  })

  bot.extend(plugin)
  bot.onCommand('order', async (message) => {
    await message.conversation.start(order)
  })
  bot.onCommand('cancel', async (message) => {
    const cancelled = await message.conversation.cancelFlow('you cancelled it')
    await message.reply(cancelled ? 'Cancelled.' : 'There was nothing to cancel.')
  })

  return plugin.controls.flows as NonNullable<typeof plugin.controls.flows>
}

/** Append an order to the log and return its number. */
async function placeOrder(path: string, drink: string, size: string): Promise<number> {
  const existing = await readFile(path, 'utf8').catch(() => '')
  const number = existing.split('\n').filter(Boolean).length + 1
  await appendFile(path, `${JSON.stringify({ number, drink, size })}\n`, 'utf8')

  return number
}
