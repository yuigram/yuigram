/**
 * 14 — Conversations: scenes, prompts and typed buttons.
 *
 * A bot that asks for two things and then confirms with a button. Everything
 * here is the conversation plugin and the callback-data schema — no state kept
 * in a module-level map, and nothing that breaks when a second person starts
 * the same form.
 *
 * Three things are worth knowing before using this:
 *
 * - **State belongs to a conversation**, which by default is one person in one
 *   chat. Two people filling in this form in the same group do not see each
 *   other's answers, and neither of them advances the other's step.
 * - **A scene's position is stored**, so a deployment in the middle of a form
 *   resumes it. `await conversation.wait(...)` is a suspended function and is
 *   *not* stored — it does not survive a restart, which is the trade for being
 *   able to write a question inline.
 * - **Updates for one conversation are serialised.** Two messages arriving
 *   together cannot both advance the same step.
 *
 * ```sh
 * BOT_TOKEN=123456:ABC… pnpm tsx examples/14-conversations/index.ts
 * ```
 */

import {
  Bot,
  type ConversationFlavour,
  conversation,
  defineCallbackData,
  InlineKeyboard,
  type MessageContext,
  memory,
  type ScenePosition,
} from 'yuigram'

/** What this form collects. */
interface Signup {
  name?: string
  age?: number
}

/**
 * The buttons the confirmation carries.
 *
 * A schema rather than a string format: `confirm.unpack` gives back a typed
 * `answer`, and a button from an older release — one with different fields —
 * reads as nothing instead of as a wrong answer.
 */
const confirm = defineCallbackData('signup').literal('answer', ['yes', 'no'])

/** What the plugin adds to this bot's contexts. */
type WithConversation = ConversationFlavour<Signup>

/** The context a step of this form is handed. */
type Step = MessageContext & WithConversation

const token = process.env['BOT_TOKEN']

if (token === undefined) {
  throw new Error('set BOT_TOKEN to run this example')
}

const bot = Bot.fromToken<WithConversation>(token)

bot.extend(
  conversation<Step, Signup>({
    // Memory is fine to try this with. A form that has to survive a restart
    // wants a store that does: the position is the only thing kept, and it is
    // plain data.
    storage: memory<ScenePosition<Signup>>(),
    // The default — one person in one chat. `'chat+user+topic'` would give
    // each forum topic its own form.
    scope: 'chat+user',
    // A form nobody finishes should not be waiting a month later.
    ttl: 60 * 60,
    scenes: [
      {
        name: 'signup',
        initial: () => ({}),
        steps: [
          async (message, scene) => {
            if (scene.fresh) {
              await message.reply('What is your name?')

              return
            }

            const name = message.text?.trim()
            if (name === undefined || name.length === 0) {
              await message.reply('Please send your name as text.')

              return
            }

            scene.state.name = name
            scene.next()
          },

          async (message, scene) => {
            if (scene.fresh) {
              await message.reply(`Hello, ${scene.state.name}. How old are you?`)

              return
            }

            const age = Number(message.text)
            if (!Number.isInteger(age) || age < 0 || age > 150) {
              // Staying on the step is how a question is asked again: nothing
              // is written, and the next message arrives here too.
              await message.reply('That is not an age. Try a whole number.')

              return
            }

            scene.state.age = age
            scene.next()
          },

          async (message, scene) => {
            if (scene.fresh) {
              await message.reply(`${scene.state.name}, ${scene.state.age}. Is that right?`, {
                reply_markup: new InlineKeyboard()
                  .add(confirm.button('Yes', { answer: 'yes' }))
                  .add(confirm.button('No', { answer: 'no' })),
              })

              return
            }

            // Anything typed at this point is not an answer to the buttons.
            await message.reply('Please use one of the buttons.')
          },
        ],

        // Runs however the form ends: finished, cancelled, or replaced by
        // another scene. The place to clean up whatever the form was holding.
        onLeave: async (message, scene) => {
          if (scene.cancelled) await message.reply('Cancelled. Nothing was saved.')
        },

        // Runs before every step. Returning after `scene.cancel()` is what
        // makes `/cancel` work from anywhere in the form.
        beforeStep: (message, scene) => {
          if (message.text === '/cancel') scene.cancel()
        },
      },
    ],
  }),
)

bot.onCommand('start', async (message) => {
  await message.conversation.enter('signup')
})

/**
 * The button press.
 *
 * The schema's filter matches only this schema's data, so a button belonging
 * to some other feature never reaches this handler. Matching is not
 * authorisation: the query says who pressed it, and a bot that cares checks
 * that here.
 */
bot.on('callback_query', async (query) => {
  const pressed = query.data === undefined ? undefined : confirm.unpack(query.data)
  if (pressed === undefined) return

  if (pressed.answer === 'yes') {
    const position = await query.conversation.position()
    const signup = position?.state
    await query.answerCallbackQuery({ text: 'Saved' })
    await query.edit(`Thank you, ${signup?.name ?? 'friend'}.`)
    await query.conversation.leave()

    return
  }

  await query.answerCallbackQuery({ text: 'Starting again' })
  await query.conversation.enter('signup')
})

/**
 * Asking a question without a scene.
 *
 * `wait` stops here until the next message in *this* conversation arrives —
 * somebody else's message in the same group goes to the ordinary handlers
 * untouched. In memory only: a restart loses it, which is why the form above
 * is built from steps instead.
 */
bot.onCommand('nickname', async (message) => {
  await message.reply('What should I call you? (30 seconds)')

  const answer = await message.conversation.wait<string>({
    match: (context) => typeof (context as Step).text === 'string',
    transform: (context) => (context as Step).text as string,
    validate: (text) => text.length <= 32 || 'That is too long — 32 characters at most.',
    onInvalid: async (reason) => {
      await message.reply(reason ?? 'Try again.')
    },
    timeout: 30_000,
    nullOnTimeout: true,
  })

  await message.reply(answer === undefined ? 'Never mind.' : `Noted: ${answer}`)
})

// Every open wait is cancelled when the bot stops, so nothing is left
// suspended on a promise that will never settle.
process.once('SIGINT', () => {
  void bot.stop()
})

await bot.poll()
