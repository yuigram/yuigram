// SPDX-License-Identifier: MPL-2.0

/**
 * Filters over the updates that are not messages.
 *
 * Two things matter for each: that it matches what it says it matches, and that
 * the dispatcher can skip it — a filter with no `kinds` is run against every
 * update, so the metadata is asserted beside the predicate. The contexts here
 * are the flattened shapes the event layer produces, built by hand so a case
 * shows exactly which field decides.
 */

import { when } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { f } from '../src/index.js'

/** A context, as the event layer hands one to a filter. */
const at = (kind: string, fields: Record<string, unknown> = {}) => ({ kind, ...fields })

const emoji = (value: string) => ({ type: 'emoji', emoji: value })
const custom = (id: string) => ({ type: 'custom_emoji', custom_emoji_id: id })
const paid = { type: 'paid' }

const reacted = (before: unknown[], after: unknown[]) =>
  at('message_reaction', { old_reaction: before, new_reaction: after })

describe('reaction filters', () => {
  it('matches a change on either side, because an update carries both', () => {
    const added = reacted([], [emoji('👍')])
    const removed = reacted([emoji('👍')], [])

    expect(f.reaction.emoji('👍')(added)).toBe(true)
    expect(f.reaction.emoji('👍')(removed)).toBe(true)
    expect(f.reaction.emoji('🔥')(added)).toBe(false)
    // No emoji named matches any emoji reaction.
    expect(f.reaction.emoji()(added)).toBe(true)
    expect(f.reaction.emoji()(reacted([], [paid]))).toBe(false)
  })

  it('tells an added reaction from a removed one by how many there are', () => {
    expect(f.reaction.added(reacted([], [emoji('👍')]))).toBe(true)
    expect(f.reaction.added(reacted([emoji('👍')], []))).toBe(false)
    expect(f.reaction.removed(reacted([emoji('👍')], []))).toBe(true)
    expect(f.reaction.removed(reacted([], [emoji('👍')]))).toBe(false)
    // Swapped one for another: neither added nor removed, still a change.
    const swapped = reacted([emoji('👍')], [emoji('🔥')])
    expect(f.reaction.added(swapped)).toBe(false)
    expect(f.reaction.removed(swapped)).toBe(false)
    expect(f.reaction.any(swapped)).toBe(true)
  })

  it('matches custom and paid reactions by what they are', () => {
    expect(f.reaction.custom('5368')(reacted([], [custom('5368')]))).toBe(true)
    expect(f.reaction.custom('1')(reacted([], [custom('5368')]))).toBe(false)
    expect(f.reaction.custom()(reacted([], [custom('5368')]))).toBe(true)
    expect(f.reaction.paid(reacted([], [paid]))).toBe(true)
    expect(f.reaction.paid(reacted([], [emoji('👍')]))).toBe(false)
  })

  it('matches nothing where an update carries no reaction lists', () => {
    expect(f.reaction.any(at('message_reaction'))).toBe(false)
    expect(f.reaction.emoji('👍')(at('message'))).toBe(false)
  })

  it('names the kind it can match', () => {
    expect(f.reaction.any.kinds).toEqual(['message_reaction'])
    expect(f.reaction.emoji('👍').kinds).toEqual(['message_reaction'])
  })
})

describe('payment filters', () => {
  it('matches each step by the payload the bot put on the invoice', () => {
    const shipping = at('shipping_query', { invoice_payload: 'order-42' })
    const checkout = at('pre_checkout_query', { invoice_payload: 'order-42' })
    const paidFor = at('message', { successful_payment: { invoice_payload: 'order-42' } })

    expect(f.payment.shipping('order-42')(shipping)).toBe(true)
    expect(f.payment.shipping('order-7')(shipping)).toBe(false)
    expect(f.payment.preCheckout('order-42')(checkout)).toBe(true)
    expect(f.payment.successful('order-42')(paidFor)).toBe(true)
    expect(f.payment.successful()(paidFor)).toBe(true)
    expect(f.payment.successful()(at('message'))).toBe(false)
  })

  it('matches a payload by pattern as well as by name', () => {
    const checkout = at('pre_checkout_query', { invoice_payload: 'order-42' })

    expect(f.payment.preCheckout(/^order-/)(checkout)).toBe(true)
    expect(f.payment.preCheckout(/^sub-/)(checkout)).toBe(false)
  })

  it('names the kinds each step arrives as', () => {
    expect(f.payment.shipping('x').kinds).toEqual(['shipping_query'])
    expect(f.payment.preCheckout('x').kinds).toEqual(['pre_checkout_query'])
    // A completed payment is a service message, not a query.
    expect(f.payment.successful().kinds).toContain('message')
  })
})

describe('membership filters', () => {
  const change = (was: string, now: string, extra: Record<string, unknown> = {}) =>
    at('chat_member', {
      old_chat_member: { status: was, user: { id: 5, is_bot: false, first_name: 'A' } },
      new_chat_member: { status: now, user: { id: 5, is_bot: false, first_name: 'A' }, ...extra },
    })

  it.each([
    ['joined', 'left', 'member'],
    ['left', 'member', 'left'],
    ['promoted', 'member', 'administrator'],
    ['demoted', 'administrator', 'member'],
    ['banned', 'member', 'kicked'],
    ['unbanned', 'kicked', 'member'],
    ['restricted', 'member', 'restricted'],
  ] as const)('reads a %s from the statuses before and after', (kind, was, now) => {
    expect(f.member[kind](change(was, now))).toBe(true)
  })

  it('reports both changes a single transition is', () => {
    const banned = change('administrator', 'kicked')

    expect(f.member.banned(banned)).toBe(true)
    expect(f.member.demoted(banned)).toBe(true)
    // Banning is not leaving, which is the thing a bot treats differently.
    expect(f.member.left(banned)).toBe(false)
  })

  it('reads a subscriber from the end date on the membership', () => {
    expect(f.member.subscribed(change('left', 'member', { until_date: 1 }))).toBe(true)
    expect(f.member.subscribed(change('left', 'member'))).toBe(false)
  })

  it('narrows to this bot by the user the change is about', () => {
    const bot = at('my_chat_member', {
      old_chat_member: { status: 'left', user: { id: 99, is_bot: true, first_name: 'B' } },
      new_chat_member: { status: 'member', user: { id: 99, is_bot: true, first_name: 'B' } },
    })

    expect(f.member.self(99)(bot)).toBe(true)
    expect(f.member.self(5)(bot)).toBe(false)
  })

  it('takes a change by name, and matches nothing without both sides', () => {
    expect(f.member.change('joined')(change('left', 'member'))).toBe(true)
    expect(f.member.any(at('chat_member'))).toBe(false)
    expect(f.member.joined(at('chat_member', { old_chat_member: { status: 'left' } }))).toBe(false)
  })

  it('names both kinds a standing change arrives as', () => {
    expect(f.member.any.kinds).toEqual(['chat_member', 'my_chat_member'])
  })
})

describe('routing filters', () => {
  it('matches the kinds it was given, and says which they are', () => {
    const kinds = f.kind.in('message', 'callback_query')

    expect(kinds(at('message'))).toBe(true)
    expect(kinds(at('callback_query'))).toBe(true)
    expect(kinds(at('poll'))).toBe(false)
    expect(kinds.kinds).toEqual(['message', 'callback_query'])
  })

  it('matches a kind a plugin added, which no generated list knows', () => {
    const custom = f.kind.custom('order_paid')

    expect(custom(at('order_paid'))).toBe(true)
    expect(custom(at('message'))).toBe(false)
    // Nothing to skip on: a plugin's kinds are not in the generated list.
    expect(custom.kinds).toBeUndefined()
  })
})

describe('the other update filters', () => {
  it('matches a boost, a business connection and a game button', () => {
    expect(f.boost.any(at('chat_boost', { boost: { boost_id: 'b' } }))).toBe(true)
    expect(f.boost.any(at('chat_boost'))).toBe(false)

    const overBusiness = at('business_message', { business_connection_id: 'conn-1' })
    expect(f.business.any(overBusiness)).toBe(true)
    expect(f.business.connection('conn-1')(overBusiness)).toBe(true)
    expect(f.business.connection('conn-2')(overBusiness)).toBe(false)
    // The connection update itself carries its id as `id`, so it is excluded.
    expect(f.business.any(at('business_connection', { id: 'conn-1' }))).toBe(false)

    const gameButton = at('callback_query', { game_short_name: 'snake' })
    expect(f.game.shortName('snake')(gameButton)).toBe(true)
    expect(f.game.shortName(/^sn/)(gameButton)).toBe(true)
    expect(f.game.shortName('chess')(gameButton)).toBe(false)
  })

  it('matches a chosen inline result by the identifier the bot gave it', () => {
    const chosen = at('inline_result_chosen', { result_id: 'r42' })

    expect(f.chosenResult('r42')(chosen)).toBe(true)
    expect(f.chosenResult(/^r/)(chosen)).toBe(true)
    expect(f.chosenResult('r7')(chosen)).toBe(false)
    expect(f.chosenResult('r42').kinds).toEqual(['inline_result_chosen'])
  })

  it('matches a reply to one particular message', () => {
    const answering = (id: number) => at('message', { reply_to_message: { message_id: id } })

    expect(f.reply.to(42)(answering(42))).toBe(true)
    expect(f.reply.to(42)(answering(7))).toBe(false)
    expect(f.reply.to(42)(at('message'))).toBe(false)
    expect(f.reply.exists(answering(42))).toBe(true)
  })
})

describe('gating middleware on a filter', () => {
  it('runs the middleware on a match and passes everything else along', async () => {
    const seen: string[] = []
    const gated = when(f.kind.in('message'), async (context, next) => {
      seen.push(`ran on ${context.kind}`)
      await next()
    })

    let reached = 0
    const downstream = async () => {
      reached += 1
    }

    await gated(at('message'), downstream)
    await gated(at('poll'), downstream)

    expect(seen).toEqual(['ran on message'])
    // Both updates carried on: a gate that does not match must not stop them.
    expect(reached).toBe(2)
  })
})
