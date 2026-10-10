// SPDX-License-Identifier: MIT

/**
 * docs/ru/state.md continues one example across blocks: the waiting example runs on the bot
 * the scenes example built, which carries the conversation plugin's flavour.
 */

interface Signup {
  name?: string
}

interface Cart {
  count: number
}

type Step = import('yuigram').MessageContext & import('yuigram').ConversationFlavour<Signup>

declare const bot: import('yuigram').Bot<import('yuigram').ConversationFlavour<Signup>>
