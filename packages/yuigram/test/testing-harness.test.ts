/**
 * Testing an application the way its author would, through the published
 * entry points.
 *
 * Two small applications — a bot and an account, each with buttons, per-person
 * state, a refusal from Telegram it handles and a failure it does not — are
 * driven through `yuigram/testing`. What is asserted is what the author would
 * assert: what was sent, what a person now sees, what state was kept, and which
 * errors reached nobody.
 */

import { describe, expect, it } from 'vitest'
import { f } from '../src/account-filters.js'
import {
  callbackButton,
  InlineKeyboard,
  inlineKeyboard,
  memory,
  RpcError,
  type SessionFlavor,
  session,
  TelegramError,
  userChatKey,
} from '../src/index.js'
import {
  apiError,
  chatJoinRequestUpdate,
  chosenInlineResultUpdate,
  messageReactionUpdate,
  mockAccount,
  mockBot,
  pollAnswerUpdate,
  preCheckoutQueryUpdate,
  rpcError,
  user,
} from '../src/testing.js'

interface Cart {
  items: string[]
}

describe('a bot', () => {
  /** A small shop: a menu of buttons, a cart per person, a checkout that can be refused. */
  function shop() {
    const harness = mockBot()
    const bot = harness.bot.extend(
      session<Cart>({ storage: memory(), key: userChatKey, initial: () => ({ items: [] }) }),
    )
    const menu = new InlineKeyboard().text('Coffee', 'add:coffee').text('Tea', 'add:tea')

    bot.onCommand('menu', (message) =>
      message.reply('What would you like?', { reply_markup: menu }),
    )
    bot.onCallbackQuery(/^add:/, async (query) => {
      const cart = (query as unknown as SessionFlavor<Cart>).session
      cart.items.push(query.data?.slice('add:'.length) ?? '')
      await query.answerCallbackQuery({ text: 'Added' })
      await query.edit(`Cart: ${cart.items.join(', ')}`, { reply_markup: menu })
    })
    bot.onCommand('pay', async (message) => {
      try {
        await message.reply('Paying…')
      } catch (error) {
        if (!(error instanceof TelegramError)) throw error
        harness.bot.api // keeps the reference a real handler would log with
      }
    })
    bot.onCommand('boom', () => {
      throw new Error('boom')
    })

    return harness
  }

  it('presses buttons on the message it sent, and keeps each person’s cart', async () => {
    const harness = shop()

    await harness.send.command('/menu')
    expect(harness.sent).toHaveLength(1)
    await harness.send.press('add:coffee')
    await harness.send.press('add:tea')

    expect(harness.calls.last('answerCallbackQuery')?.params).toMatchObject({ text: 'Added' })
    // What the person now sees, with the buttons still under it.
    expect(harness.sent[0]).toMatchObject({ text: 'Cart: coffee, tea' })
    expect(harness.calls.count('editMessageText')).toBe(2)

    // Somebody else, somewhere else, starts with an empty cart.
    const other = user({ id: 4242 })
    await harness.send.command('/menu', { from: other })
    await harness.send.press('add:tea', { from: other })
    expect(harness.sent.at(-1)).toMatchObject({ text: 'Cart: tea' })

    await expect(harness.send.press('add:water')).rejects.toThrow("sends 'add:water'")
    await harness.dispose()
  })

  it('keeps what no handler caught, and lets a refusal reach the handler that expects it', async () => {
    const harness = shop()
    harness.on('sendMessage', apiError(403, 'Forbidden: bot was blocked by the user'))

    await harness.send.command('/pay')
    expect(harness.errors).toEqual([])

    await harness.send.command('/boom')
    expect(harness.errors).toHaveLength(1)
    expect((harness.errors[0] as Error).message).toBe('boom')

    // An application's own error handler still takes what it takes.
    const caught: unknown[] = []
    harness.bot.onError((error) => {
      caught.push(error)
    })
    await harness.send.command('/boom')
    expect(caught).toHaveLength(1)
    expect(harness.errors).toHaveLength(1)
    await harness.dispose()
  })

  it('builds the updates a shop also receives', async () => {
    const harness = mockBot()
    const seen: string[] = []
    harness.bot.on('inline_result_chosen', (event) => {
      seen.push(`chosen ${event.result_id}`)
    })
    harness.bot.on('message_reaction', (event) => {
      seen.push(`reaction ${event.new_reaction.length}`)
    })
    harness.bot.on('pre_checkout_query', async (event) => {
      seen.push(`checkout ${event.invoice_payload}`)
    })
    harness.bot.on('poll_answer', (event) => {
      seen.push(`vote ${event.option_ids.join()}`)
    })
    harness.bot.on('chat_join_request', (event) => {
      seen.push(`join ${event.sender.id}`)
    })

    await harness.send.update(chosenInlineResultUpdate('r1', { query: 'tea' }))
    await harness.send.update(messageReactionUpdate({ messageId: 1, new: ['👍'] }))
    await harness.send.update(preCheckoutQueryUpdate({ payload: 'order-7' }))
    await harness.send.update(pollAnswerUpdate({ pollId: 'p', optionIds: [0, 2] }))
    await harness.send.update(chatJoinRequestUpdate({ from: user({ id: 77 }) }))

    expect(seen).toEqual(['chosen r1', 'reaction 1', 'checkout order-7', 'vote 0,2', 'join 77'])
    await harness.dispose()
  })
})

describe('an account', () => {
  /** The same shop, run from an account: a bot account's buttons, a cart per person. */
  function shop() {
    const harness = mockAccount()
    const account = harness.account.extend(
      session<Cart>({ storage: memory(), key: userChatKey, initial: () => ({ items: [] }) }),
    )
    const menu = inlineKeyboard([
      [callbackButton('Coffee', 'add:coffee'), callbackButton('Tea', 'add:tea')],
    ])

    account.on('message', f.command('menu', { prefixes: '/' }), async (event) => {
      await event.reply({ text: 'What would you like?', entities: [] }, {
        replyMarkup: menu,
      } as never)
    })
    account.on('mtproto:callback_query', async (event) => {
      const cart = (event as unknown as SessionFlavor<Cart>).session
      cart.items.push(event.data?.slice('add:'.length) ?? '')
      await event.answerCallback({ text: 'Added' })
      await event.edit(`Cart: ${cart.items.join(', ')}`)
    })
    account.on('message', f.action('members-added'), async (event) => {
      await event.reply(`Welcome, ${event.action.users.length} of you`)
    })
    account.on('message', f.command('post', { prefixes: '/' }), async (event) => {
      try {
        await event.reply('Posting…')
      } catch (error) {
        if (!(error instanceof RpcError && error.is('CHAT_WRITE_FORBIDDEN'))) throw error
      }
    })
    account.on('message', f.command('boom', { prefixes: '/' }), () => {
      throw new Error('boom')
    })

    return harness
  }

  it('answers a message, and a service message narrowed by its kind', async () => {
    const harness = shop()

    await harness.send.message('/menu')
    expect(harness.calls.last('messages.sendMessage')?.query).toMatchObject({
      message: 'What would you like?',
    })

    await harness.send.service(
      { _: 'messageActionChatAddUser', users: [5n, 6n] },
      { chat: { kind: 'chat', id: 3n } },
    )
    expect(harness.calls.last('messages.sendMessage')?.query).toMatchObject({
      message: 'Welcome, 2 of you',
      peer: { _: 'inputPeerChat', chat_id: 3n },
    })
    await harness.dispose()
  })

  it('handles a press on a message it sent, keeping each person’s cart', async () => {
    const harness = shop()
    harness.account.on('message', f.command('shop', { prefixes: '/' }), async (event) => {
      await harness.account.sendText(event.chat as never, 'Menu', {
        markup: inlineKeyboard([
          [callbackButton('Coffee', 'add:coffee'), callbackButton('Tea', 'add:tea')],
        ]),
      })
    })

    await harness.send.message('/shop')
    const menu = harness.sent.at(-1)
    expect(menu?.['reply_markup']).toBeDefined()

    const buyer = { id: 900n, accessHash: 9n, firstName: 'Buyer' }
    await harness.send.press('add:coffee', { from: buyer })
    await harness.send.press('add:tea', { from: buyer })

    expect(harness.calls.last('messages.setBotCallbackAnswer')?.query).toMatchObject({
      message: 'Added',
    })
    expect(harness.calls.last('messages.editMessage')?.query).toMatchObject({
      message: 'Cart: coffee, tea',
    })
    await expect(harness.send.press('add:water')).rejects.toThrow("sends 'add:water'")
    await harness.dispose()
  })

  it('raises a refusal as the class a handler expects, and keeps what nothing caught', async () => {
    const harness = shop()
    harness.once('messages.sendMessage', rpcError(403, 'CHAT_WRITE_FORBIDDEN'))

    await harness.send.message('/post')
    expect(harness.errors).toEqual([])

    await harness.send.message('/boom')
    expect(harness.errors).toHaveLength(1)
    expect((harness.errors[0] as Error).message).toBe('boom')

    // A refusal that reaches nobody is kept too, as the class it arrived as.
    harness.once('messages.sendMessage', rpcError(400, 'PEER_ID_INVALID'))
    await harness.send.message('/menu')
    expect(harness.errors[1]).toBeInstanceOf(RpcError)
    expect(harness.errors[1]).toMatchObject({ code: 400, text: 'PEER_ID_INVALID' })
    await harness.dispose()
  })

  it('answers a method that returns a list with one, scripted without a cast', async () => {
    const harness = mockAccount()
    // `users.getUsers` answers with a vector rather than with one value.
    harness.on('users.getUsers', () => [
      { _: 'user', id: 7n, first_name: 'Ada', status: { _: 'userStatusRecently' } },
    ])
    await harness.account.connect()

    const [found] = await harness.account.api.users.getUsers({ id: [{ _: 'inputUserSelf' }] })

    expect(found).toMatchObject({ _: 'user', id: 7n, first_name: 'Ada' })
    await harness.dispose()
  })

  it('starts on the first update and stops when disposed, refusing what was never scripted', async () => {
    const harness = mockAccount()
    expect(harness.account.connected).toBe(false)

    let failure: unknown
    harness.account.on('message', async () => {
      try {
        await harness.account.api.messages.getHistory({
          peer: { _: 'inputPeerSelf' },
          offset_id: 0,
          offset_date: 0,
          add_offset: 0,
          limit: 1,
          max_id: 0,
          min_id: 0,
          hash: 0n,
        })
      } catch (error) {
        failure = error
      }
    })
    await harness.send.message('hello')

    expect(harness.account.connected).toBe(true)
    expect(String(failure)).toContain("no answer is scripted for 'messages.getHistory'")

    await harness.dispose()
    expect(harness.account.connected).toBe(false)
  })
})
