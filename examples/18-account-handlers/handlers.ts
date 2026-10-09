// SPDX-License-Identifier: MIT

/**
 * What the account in this example does, kept apart from how it is started.
 *
 * `install` takes an account and registers everything on it, so the same code
 * runs signed in to Telegram from `index.ts` and against a stand-in datacenter
 * in the project's tests.
 */

import {
  type Account,
  AccountRouter,
  type ConversationFlavour,
  conversation,
  defineFlow,
  type FlowRecord,
  fromHtml,
  type KV,
  type MtprotoContext,
  memory,
  Propagation,
} from 'yuigram'
import { f } from 'yuigram/account-filters'

// What handlers may ask for by name. Declared once, and typed everywhere a
// handler reads it.
declare module '@yuigram/core' {
  interface Dependencies {
    /** How many private messages each person has sent since the account started. */
    readonly counts: Map<bigint, number>
  }
}

/** The events this account handles, with the conversation the plugin adds. */
export type Event = MtprotoContext & ConversationFlavour

/**
 * A form that survives a restart: asks for a name, then confirms it.
 *
 * Written as one function. Where it waits, it is stored, so an account that
 * stops between the question and the answer carries on when it starts again.
 */
export const signup = defineFlow<Event, undefined, string>({
  name: 'signup',
  async run(flow) {
    const name = await flow.ask(
      'name',
      async (event) => {
        await event.reply('What should I call you?')
      },
      {
        match: (event) => event.text !== undefined && !event.text.startsWith('/'),
        transform: (event) => event.text ?? '',
      },
    )

    await flow.effect('confirm', async () => {
      if (flow.hasContext) await flow.context.send(fromHtml`Welcome, <b>${name}</b>.`)
    })

    return name
  },
})

/** What `install` is told. */
export interface Setup {
  /** Where the form's runs are kept. Memory unless given; a file store survives a process. */
  readonly runs?: KV<FlowRecord>
}

/**
 * Register everything on an account.
 *
 * - **Groups.** Commands are in group 0: the first that matches answers and
 *   the rest of the group is skipped. The counter is in group 1, which runs
 *   after it whatever group 0 did.
 * - **A router** holds the form, with middleware of its own that only its
 *   handlers pass through.
 * - **A dependency** holds the counts, injected once and read by name.
 */
export function install(account: Account<ConversationFlavour>, setup: Setup = {}): void {
  account.extend(
    conversation<Event>({
      storage: memory(),
      flows: { storage: setup.runs ?? memory<FlowRecord>(), define: [signup as never] },
    }),
  )
  account.inject('counts', new Map())

  // Commands typed as `.ping`, the way a person marks one for their own
  // account rather than for a bot.
  const command = (name: string) => f.command(name, { prefixes: '.' })

  account.on(
    'message',
    command('ping'),
    async (event) => {
      await event.reply('pong')
    },
    { group: 0 },
  )

  account.on(
    'message',
    command('count'),
    async (event) => {
      const counts = account.deps.counts
      const from = event.sender?.id
      await event.reply(
        `You have sent ${from === undefined ? 0 : (counts.get(from) ?? 0)} messages.`,
      )
    },
    { group: 0 },
  )

  // Every private message with text, counted after the commands had their turn.
  const privateText = f.and(f.chat('user'), f.text())
  account.on(
    privateText,
    (event) => {
      const counts = account.deps.counts
      const from = event.sender?.id
      if (from !== undefined) counts.set(from, (counts.get(from) ?? 0) + 1)

      return Propagation.Continue
    },
    { group: 1 },
  )

  const forms = new AccountRouter<ConversationFlavour>()
  forms.use(async (event, next) => {
    event.log.info('a form update', { kind: event.kind })
    await next()
  })
  forms.on('message', f.command('signup'), async (event) => {
    await event.conversation.start('signup')
  })
  account.addChild(forms)

  account.catch((error, event) => {
    event.log.error('a handler failed', { error })
  })
}
