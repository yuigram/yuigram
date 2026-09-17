/**
 * Star gifts, boosts, and the business surface.
 *
 * Nothing here spends anything. Every case runs against a fake client, and what
 * is judged is the request that would have travelled — which matters more here
 * than anywhere else in the package, because these are the calls that move
 * money and a wrong field is a wrong charge.
 *
 * Three things in particular:
 *
 * - **that the payment form and the payment go together**, because Telegram
 *   will not take an invoice directly and a form paid twice is paid twice;
 * - **that the free path is taken when Telegram says there is nothing to pay**,
 *   because `NO_PAYMENT_NEEDED` is the other branch rather than a failure;
 * - **that amounts keep their precision**, because Stars have a nanostar part
 *   and a price silently rounded is a price silently wrong.
 */

import { TelegramError, ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import type { MtprotoApi } from '../src/api.js'
import type { TypeInputPeer } from '../src/generated/api/types/index.js'
import {
  buyResaleGift,
  decideGift,
  fetchSavedGifts,
  type Gifting,
  giftOptions,
  giftWithdrawalUrl,
  OFFER_STANDS_FOR,
  offerForGift,
  prepayUpgrade,
  resaleOptions,
  sendGift,
  setPinnedGifts,
  setResalePrice,
  settleGiftOffer,
  transferGift,
  uniqueGift,
  upgradeGift,
  upgradeOptions,
} from '../src/gifts/gifts.js'
import {
  boost,
  boostSlots,
  boostStats,
  businessConnection,
  businessLinks,
  canBoost,
  createBusinessLink,
  deleteBusinessLink,
  editBusinessLink,
  type Premiuming,
  setBusinessIntro,
  setWorkHours,
} from '../src/premium/premium.js'
import type { TlValue } from '../src/tl/index.js'

const PEER: TypeInputPeer = { _: 'inputPeerUser', user_id: 5n, access_hash: 50n }

/** The empty container that stands in for "the change happened". */
const NOTHING: TlValue = { _: 'updates', updates: [], users: [], chats: [], date: 0, seq: 0 }

/** A payment form, as Telegram answers one. */
const FORM: TlValue = { _: 'payments.paymentFormStarGift', form_id: 123n, invoice: {} }

/** A paid result carrying updates. */
const PAID: TlValue = { _: 'payments.paymentResult', updates: NOTHING }

/** A client answering from a script, recording what it was asked. */
function fake(answers: readonly unknown[] = []) {
  const asked: { method: string; params: Record<string, unknown> }[] = []
  const fed: TlValue[] = []
  let at = 0

  const named =
    (method: string) =>
    (params: Record<string, unknown> = {}) => {
      asked.push({ method, params })

      const answer = answers[at]
      at += 1

      if (answer === undefined) throw new Error(`no scripted answer for ${method}`)
      if (answer instanceof Error) throw answer

      return Promise.resolve(answer)
    }

  const api = {
    account: {
      getPassword: named('account.getPassword'),
      getBotBusinessConnection: named('account.getBotBusinessConnection'),
      createBusinessChatLink: named('account.createBusinessChatLink'),
      editBusinessChatLink: named('account.editBusinessChatLink'),
      deleteBusinessChatLink: named('account.deleteBusinessChatLink'),
      getBusinessChatLinks: named('account.getBusinessChatLinks'),
      updateBusinessIntro: named('account.updateBusinessIntro'),
      updateBusinessWorkHours: named('account.updateBusinessWorkHours'),
    },
    payments: {
      getPaymentForm: named('payments.getPaymentForm'),
      sendStarsForm: named('payments.sendStarsForm'),
      saveStarGift: named('payments.saveStarGift'),
      convertStarGift: named('payments.convertStarGift'),
      upgradeStarGift: named('payments.upgradeStarGift'),
      transferStarGift: named('payments.transferStarGift'),
      updateStarGiftPrice: named('payments.updateStarGiftPrice'),
      toggleStarGiftsPinnedToTop: named('payments.toggleStarGiftsPinnedToTop'),
      getStarGifts: named('payments.getStarGifts'),
      getStarGiftUpgradeAttributes: named('payments.getStarGiftUpgradeAttributes'),
      getResaleStarGifts: named('payments.getResaleStarGifts'),
      getUniqueStarGift: named('payments.getUniqueStarGift'),
      getSavedStarGift: named('payments.getSavedStarGift'),
      getStarGiftWithdrawalUrl: named('payments.getStarGiftWithdrawalUrl'),
      sendStarGiftOffer: named('payments.sendStarGiftOffer'),
      resolveStarGiftOffer: named('payments.resolveStarGiftOffer'),
    },
    premium: {
      applyBoost: named('premium.applyBoost'),
      getMyBoosts: named('premium.getMyBoosts'),
      getBoostsStatus: named('premium.getBoostsStatus'),
    },
  } as unknown as MtprotoApi

  const client: Gifting & Premiuming & { readonly asked: typeof asked; readonly fed: TlValue[] } = {
    api,
    asked,
    fed,
    resolve: () => Promise.resolve(PEER),
    feed: (value) => {
      fed.push(value)

      return Promise.resolve()
    },
    random: (length: number) => new Uint8Array(length).fill(3),
  }

  return client
}

/** The request one method received. */
const sent = (client: ReturnType<typeof fake>, method: string) =>
  client.asked.find((one) => one.method === method)?.params

/** Every method that was asked, in order. */
const order = (client: ReturnType<typeof fake>) => client.asked.map((one) => one.method)

describe('sending and settling gifts', () => {
  it('fetches the form and pays it with the same invoice', async () => {
    // Telegram will not take an invoice directly, and the form identifier is
    // what authorises the charge. Paying a different invoice from the one the
    // form was fetched for is the mistake this rules out.
    const client = fake([FORM, PAID])

    await sendGift(client, '@someone', { giftId: 77n })

    expect(order(client)).toEqual(['payments.getPaymentForm', 'payments.sendStarsForm'])
    const invoice = sent(client, 'payments.getPaymentForm')?.['invoice']
    expect(invoice).toMatchObject({ _: 'inputInvoiceStarGift', gift_id: 77n, peer: PEER })
    expect(sent(client, 'payments.sendStarsForm')).toMatchObject({ form_id: 123n, invoice })
  })

  it('writes anonymity and upgrade as true-or-absent flags', async () => {
    const plain = fake([FORM, PAID])
    await sendGift(plain, '@a', { giftId: 1n, anonymous: false, withUpgrade: false })
    const quiet = sent(plain, 'payments.getPaymentForm')?.['invoice']
    expect(quiet).not.toHaveProperty('hide_name')
    expect(quiet).not.toHaveProperty('include_upgrade')

    const hidden = fake([FORM, PAID])
    await sendGift(hidden, '@a', { giftId: 1n, anonymous: true, withUpgrade: true })
    expect(sent(hidden, 'payments.getPaymentForm')?.['invoice']).toMatchObject({
      hide_name: true,
      include_upgrade: true,
    })
  })

  it('carries a note as text with entities', async () => {
    const client = fake([FORM, PAID])

    await sendGift(client, '@a', {
      giftId: 1n,
      note: { text: 'hi', entities: [{ _: 'messageEntityBold', offset: 0, length: 2 }] },
    })

    expect(sent(client, 'payments.getPaymentForm')?.['invoice']).toMatchObject({
      message: { _: 'textWithEntities', text: 'hi', entities: [{ _: 'messageEntityBold' }] },
    })
  })

  it('refuses a payment answered with something that is not a result', async () => {
    await expect(sendGift(fake([FORM, NOTHING]), '@a', { giftId: 1n })).rejects.toThrow(
      /carries no result/,
    )
  })

  it('names a gift three different ways, as the protocol does', async () => {
    const bySlug = fake([true])
    await decideGift(bySlug, 'a-slug', 'show')
    expect(sent(bySlug, 'payments.saveStarGift')?.['stargift']).toEqual({
      _: 'inputSavedStarGiftSlug',
      slug: 'a-slug',
    })

    const byMessage = fake([true])
    await decideGift(byMessage, { message: 42 }, 'show')
    expect(sent(byMessage, 'payments.saveStarGift')?.['stargift']).toEqual({
      _: 'inputSavedStarGiftUser',
      msg_id: 42,
    })

    const byOwner = fake([true])
    await decideGift(byOwner, { owner: '@channel', saved: 9n }, 'show')
    expect(sent(byOwner, 'payments.saveStarGift')?.['stargift']).toEqual({
      _: 'inputSavedStarGiftChat',
      peer: PEER,
      saved_id: 9n,
    })
  })

  it('shows, hides and converts through the calls each needs', async () => {
    // Showing and hiding are the same call with the flag inverted; converting
    // is a different call, and irreversible.
    const showing = fake([true])
    await decideGift(showing, 'a', 'show')
    expect(sent(showing, 'payments.saveStarGift')).not.toHaveProperty('unsave')

    const hiding = fake([true])
    await decideGift(hiding, 'a', 'hide')
    expect(sent(hiding, 'payments.saveStarGift')).toMatchObject({ unsave: true })

    const converting = fake([true])
    await decideGift(converting, 'a', 'convert')
    expect(order(converting)).toEqual(['payments.convertStarGift'])
  })

  it('raises when Telegram declines a decision', async () => {
    await expect(decideGift(fake([false]), 'a', 'show')).rejects.toThrow(ValidationError)
  })

  it('pays for an upgrade that costs Stars', async () => {
    const client = fake([FORM, PAID])

    await upgradeGift(client, 'a-slug', { keepOriginalDetails: true })

    expect(order(client)).toEqual(['payments.getPaymentForm', 'payments.sendStarsForm'])
    expect(sent(client, 'payments.getPaymentForm')?.['invoice']).toMatchObject({
      _: 'inputInvoiceStarGiftUpgrade',
      keep_original_details: true,
    })
  })

  it('takes the free path when Telegram says there is nothing to pay', async () => {
    // A gift sent with the upgrade already paid for. The refusal is the other
    // branch rather than a failure, and the caller sees no difference.
    const client = fake([new TelegramError('NO_PAYMENT_NEEDED (400)'), NOTHING])

    await upgradeGift(client, 'a-slug')

    expect(order(client)).toEqual(['payments.getPaymentForm', 'payments.upgradeStarGift'])
    expect(sent(client, 'payments.upgradeStarGift')).toMatchObject({
      stargift: { _: 'inputSavedStarGiftSlug', slug: 'a-slug' },
    })
  })

  it('lets a refusal that is not about payment travel', async () => {
    const client = fake([new TelegramError('STARGIFT_INVALID (400)')])

    await expect(upgradeGift(client, 'a-slug')).rejects.toThrow(/STARGIFT_INVALID/)
  })

  it('transfers with a payment, and without one where none is needed', async () => {
    const paying = fake([FORM, PAID])
    await transferGift(paying, 'a-slug', '@someone')
    expect(order(paying)).toEqual(['payments.getPaymentForm', 'payments.sendStarsForm'])

    const free = fake([new TelegramError('NO_PAYMENT_NEEDED (400)'), NOTHING])
    await transferGift(free, 'a-slug', '@someone')
    expect(order(free)).toEqual(['payments.getPaymentForm', 'payments.transferStarGift'])
    expect(sent(free, 'payments.transferStarGift')).toMatchObject({ to_id: PEER })
  })

  it('buys a resale gift, in TON only when asked', async () => {
    const stars = fake([FORM, PAID])
    await buyResaleGift(stars, 'a-slug', 'me')
    expect(sent(stars, 'payments.getPaymentForm')?.['invoice']).not.toHaveProperty('ton')

    const ton = fake([FORM, PAID])
    await buyResaleGift(ton, 'a-slug', 'me', { inTon: true })
    expect(sent(ton, 'payments.getPaymentForm')?.['invoice']).toMatchObject({ ton: true })
  })

  it('takes a gift off sale with a price of zero rather than an absent field', async () => {
    // Telegram has to be told the new price, and "no price" is a price it
    // understands. An absent field would leave it on sale.
    const off = fake([NOTHING])
    await setResalePrice(off, 'a', null)
    expect(sent(off, 'payments.updateStarGiftPrice')).toMatchObject({
      resell_amount: { _: 'starsAmount', amount: 0n, nanos: 0 },
    })

    const on = fake([NOTHING])
    await setResalePrice(on, 'a', 500)
    expect(sent(on, 'payments.updateStarGiftPrice')).toMatchObject({
      resell_amount: { _: 'starsAmount', amount: 500n, nanos: 0 },
    })
  })

  it('keeps the nanostar part of a price that has one', async () => {
    // A price rounded silently is a price silently wrong.
    const client = fake([NOTHING])

    await setResalePrice(client, 'a', { _: 'starsAmount', amount: 12n, nanos: 500_000_000 })

    expect(sent(client, 'payments.updateStarGiftPrice')).toMatchObject({
      resell_amount: { amount: 12n, nanos: 500_000_000 },
    })
  })

  it('refuses a fractional price given as a plain number', async () => {
    // Rather than truncating it, which is the failure mode that costs money.
    await expect(setResalePrice(fake([]), 'a', 12.5)).rejects.toThrow(ValidationError)
  })

  it('takes a large price without losing precision', async () => {
    const client = fake([NOTHING])

    await setResalePrice(client, 'a', 9_007_199_254_740_993n)

    expect(sent(client, 'payments.updateStarGiftPrice')).toMatchObject({
      resell_amount: { amount: 9_007_199_254_740_993n },
    })
  })

  it('prepays an upgrade through a payment form', async () => {
    const client = fake([FORM, PAID])

    await prepayUpgrade(client, '@a', 'a-hash')

    expect(sent(client, 'payments.getPaymentForm')?.['invoice']).toMatchObject({
      _: 'inputInvoiceStarGiftPrepaidUpgrade',
      hash: 'a-hash',
    })
  })

  it('sends the whole pinned set, so an empty list unpins everything', async () => {
    const client = fake([true])

    await setPinnedGifts(client, 'me', [])

    expect(sent(client, 'payments.toggleStarGiftsPinnedToTop')).toMatchObject({ stargift: [] })
  })

  it('leaves out gifts that are no longer of the ordinary shape', async () => {
    const client = fake([
      {
        _: 'payments.starGifts',
        hash: 0,
        gifts: [
          { _: 'starGift', id: 1n },
          { _: 'starGiftUnique', id: 2n },
        ],
        chats: [],
        users: [],
      },
    ])

    const options = await giftOptions(client)

    expect(options).toHaveLength(1)
    expect(options[0]?.id).toBe(1n)
  })

  it('reads an unchanged gift list as empty rather than as unchanged', async () => {
    // Nothing is sent as the hash, so "not modified" cannot mean what it
    // usually means.
    expect(await giftOptions(fake([{ _: 'payments.starGiftsNotModified' }]))).toEqual([])
  })

  it('sorts upgrade attributes into the three kinds a chooser needs', async () => {
    const client = fake([
      {
        _: 'payments.starGiftUpgradePreview',
        attributes: [
          { _: 'starGiftAttributeModel', name: 'm' },
          { _: 'starGiftAttributePattern', name: 'p' },
          { _: 'starGiftAttributeBackdrop', name: 'b' },
          { _: 'starGiftAttributeOriginalDetails' },
        ],
      },
    ])

    const options = await upgradeOptions(client, 1n)

    expect(options.models).toHaveLength(1)
    expect(options.patterns).toHaveLength(1)
    expect(options.backdrops).toHaveLength(1)
  })

  it('asks for resale listings in the order it was told', async () => {
    const byPrice = fake([
      { _: 'payments.resaleStarGifts', count: 0, gifts: [], chats: [], users: [] },
    ])
    await resaleOptions(byPrice, { giftId: 1n, sort: 'price' })
    expect(sent(byPrice, 'payments.getResaleStarGifts')).toMatchObject({ sort_by_price: true })
    expect(sent(byPrice, 'payments.getResaleStarGifts')).not.toHaveProperty('sort_by_num')

    const byNumber = fake([
      { _: 'payments.resaleStarGifts', count: 0, gifts: [], chats: [], users: [] },
    ])
    await resaleOptions(byNumber, { giftId: 1n, sort: 'number' })
    expect(sent(byNumber, 'payments.getResaleStarGifts')).toMatchObject({ sort_by_num: true })
  })

  it('reports the total and the cursor with a page of listings', async () => {
    const client = fake([
      {
        _: 'payments.resaleStarGifts',
        count: 412,
        gifts: [{ _: 'starGiftUnique', id: 2n }],
        next_offset: 'more',
        chats: [],
        users: [],
      },
    ])

    const page = await resaleOptions(client, { giftId: 1n })

    expect(page.total).toBe(412)
    expect(page.next).toBe('more')
    expect(page.gifts).toHaveLength(1)
  })

  it('refuses a slug that does not name a unique gift', async () => {
    const client = fake([
      { _: 'payments.uniqueStarGift', gift: { _: 'starGift', id: 1n }, users: [] },
    ])

    await expect(uniqueGift(client, 'a-slug')).rejects.toThrow(/does not name a unique gift/)
  })

  it('asks nothing to read no saved gifts', async () => {
    const client = fake([])

    expect(await fetchSavedGifts(client, [])).toEqual([])
    expect(client.asked).toHaveLength(0)
  })

  it('proves a password rather than sending one, for a withdrawal', async () => {
    const client = fake([
      {
        _: 'account.password',
        new_algo: { _: 'passwordKdfAlgoUnknown' },
        new_secure_algo: { _: 'securePasswordKdfAlgoUnknown' },
        secure_random: new Uint8Array(0),
      },
      { _: 'payments.starGiftWithdrawalUrl', url: 'https://example.invalid/w' },
    ])

    // The challenge here carries no algorithm, so the proof cannot be computed
    // and the attempt fails — which is the point: what must not happen is the
    // password travelling, and it never reaches a request either way.
    await expect(giftWithdrawalUrl(client, 'a-slug', 'secret')).rejects.toThrow()

    const withdrawal = client.asked.find(
      (one) => one.method === 'payments.getStarGiftWithdrawalUrl',
    )
    expect(withdrawal).toBeUndefined()
    expect(JSON.stringify(client.asked)).not.toContain('secret')
  })

  it('offers with a duration, because an offer that never expires cannot be sent', async () => {
    const standard = fake([NOTHING])
    await offerForGift(standard, '@a', { slug: 's', price: 1000 })
    expect(sent(standard, 'payments.sendStarGiftOffer')).toMatchObject({
      duration: OFFER_STANDS_FOR,
      price: { _: 'starsAmount', amount: 1000n, nanos: 0 },
    })

    const brief = fake([NOTHING])
    await offerForGift(brief, '@a', { slug: 's', price: 1n, duration: 60 })
    expect(sent(brief, 'payments.sendStarGiftOffer')).toMatchObject({ duration: 60 })
  })

  it('settles an offer by the message it arrived as', async () => {
    const client = fake([NOTHING])

    await settleGiftOffer(client, 42)

    expect(sent(client, 'payments.resolveStarGiftOffer')).toEqual({ offer_msg_id: 42 })
    expect(client.fed).toHaveLength(1)
  })
})

describe('boosts', () => {
  const slot = (extra: Record<string, unknown> = {}) => ({
    _: 'myBoost',
    slot: 1,
    date: 0,
    expires: 0,
    ...extra,
  })

  it('spends a slot on a conversation', async () => {
    const client = fake([NOTHING])

    await boost(client, '@channel')

    expect(sent(client, 'premium.applyBoost')).toEqual({ peer: PEER })
  })

  it('reads the slots and what each is spent on', async () => {
    const client = fake([
      { _: 'premium.myBoosts', my_boosts: [slot(), slot({ slot: 2 })], chats: [], users: [] },
    ])

    expect(await boostSlots(client)).toHaveLength(2)
  })

  it('says no differently when there is no subscription', async () => {
    const client = fake([{ _: 'premium.myBoosts', my_boosts: [], chats: [], users: [] }])

    expect(await canBoost(client)).toMatchObject({ can: false, because: 'no-subscription' })
  })

  it('says yes freely when a slot is unspent', async () => {
    const client = fake([
      {
        _: 'premium.myBoosts',
        my_boosts: [slot(), slot({ slot: 2, peer: { _: 'peerChannel', channel_id: 1n } })],
        chats: [],
        users: [],
      },
    ])

    expect(await canBoost(client)).toMatchObject({ can: true, cost: 'a-free-slot', free: 1 })
  })

  it('says yes at somebody else’s expense when every slot is spent but movable', async () => {
    // Worth telling apart: boosting here *removes* a boost from somewhere, and
    // a caller should be able to say so before doing it.
    const client = fake([
      {
        _: 'premium.myBoosts',
        my_boosts: [slot({ peer: { _: 'peerChannel', channel_id: 1n } })],
        chats: [],
        users: [],
      },
    ])

    const chance = await canBoost(client)
    expect(chance).toMatchObject({ can: true, cost: 'moving-one' })
    expect(chance.can && chance.cost === 'moving-one' ? chance.movable : []).toHaveLength(1)
  })

  it('says no when every slot is still cooling down', async () => {
    const client = fake([
      {
        _: 'premium.myBoosts',
        my_boosts: [slot({ peer: { _: 'peerChannel', channel_id: 1n }, cooldown_until_date: 99 })],
        chats: [],
        users: [],
      },
    ])

    expect(await canBoost(client)).toMatchObject({ can: false, because: 'every-slot-cooling' })
  })

  it('reads how boosted a conversation is', async () => {
    const client = fake([
      {
        _: 'premium.boostsStatus',
        level: 3,
        current_level_boosts: 10,
        boosts: 14,
        next_level_boosts: 25,
        boost_url: 'https://t.me/boost/a',
      },
    ])

    const stats = await boostStats(client, '@channel')

    expect(stats.level).toBe(3)
    expect(stats.next_level_boosts).toBe(25)
  })
})

describe('the business surface', () => {
  it('reads a connection out of the updates it answered with', async () => {
    const client = fake([
      {
        _: 'updates',
        updates: [
          {
            _: 'updateBotBusinessConnect',
            connection: { _: 'botBusinessConnection', connection_id: 'c1', user_id: 5n },
          },
        ],
        users: [],
        chats: [],
        date: 0,
        seq: 0,
      },
    ])

    const connection = await businessConnection(client, 'c1')

    expect(connection).toMatchObject({ connection_id: 'c1' })
    expect(client.fed).toHaveLength(1)
  })

  it('refuses when the answer described no connection', async () => {
    await expect(businessConnection(fake([NOTHING]), 'c1')).rejects.toThrow(ValidationError)
  })

  it('makes a link with a message and this account’s own label', async () => {
    const client = fake([{ _: 'businessChatLink', link: 'x', message: 'hi', views: 0 }])

    await createBusinessLink(client, 'hi', { title: 'From the advert' })

    expect(sent(client, 'account.createBusinessChatLink')?.['link']).toMatchObject({
      _: 'inputBusinessChatLink',
      message: 'hi',
      title: 'From the advert',
    })
  })

  it('leaves entities out when a message has none', async () => {
    const plain = fake([{ _: 'businessChatLink', link: 'x', message: 'hi', views: 0 }])
    await createBusinessLink(plain, 'hi')
    expect(sent(plain, 'account.createBusinessChatLink')?.['link']).not.toHaveProperty('entities')

    const formatted = fake([{ _: 'businessChatLink', link: 'x', message: 'hi', views: 0 }])
    await createBusinessLink(formatted, {
      text: 'hi',
      entities: [{ _: 'messageEntityBold', offset: 0, length: 2 }],
    })
    expect(sent(formatted, 'account.createBusinessChatLink')?.['link']).toMatchObject({
      entities: [{ _: 'messageEntityBold' }],
    })
  })

  it('edits a link by its slug', async () => {
    const client = fake([{ _: 'businessChatLink', link: 'x', message: 'bye', views: 3 }])

    await editBusinessLink(client, 'x', 'bye')

    expect(sent(client, 'account.editBusinessChatLink')).toMatchObject({ slug: 'x' })
  })

  it('raises when Telegram declines to delete a link', async () => {
    await expect(deleteBusinessLink(fake([false]), 'x')).rejects.toThrow(ValidationError)
  })

  it('reads every link this account has published', async () => {
    const client = fake([
      {
        _: 'account.businessChatLinks',
        links: [{ _: 'businessChatLink', link: 'x', message: 'hi', views: 2 }],
        chats: [],
        users: [],
      },
    ])

    expect(await businessLinks(client)).toHaveLength(1)
  })

  it('clears an intro by leaving the field out entirely', async () => {
    // An empty intro and no intro are different things: the first shows a
    // blank card, the second shows Telegram's own.
    const clearing = fake([true])
    await setBusinessIntro(clearing, undefined)
    expect(sent(clearing, 'account.updateBusinessIntro')).toEqual({})

    const setting = fake([true])
    await setBusinessIntro(setting, { title: 'Open' })
    expect(sent(setting, 'account.updateBusinessIntro')?.['intro']).toMatchObject({
      title: 'Open',
      description: '',
    })
  })

  it('counts business hours in minutes since Monday', async () => {
    const client = fake([true])

    await setWorkHours(client, {
      timezone: 'Europe/London',
      open: [{ from: 9 * 60, to: 17 * 60 }],
    })

    expect(sent(client, 'account.updateBusinessWorkHours')?.['business_work_hours']).toMatchObject({
      timezone_id: 'Europe/London',
      weekly_open: [{ _: 'businessWeeklyOpen', start_minute: 540, end_minute: 1020 }],
    })
  })

  it('takes the hours down by leaving the field out', async () => {
    const client = fake([true])

    await setWorkHours(client, undefined)

    expect(sent(client, 'account.updateBusinessWorkHours')).toEqual({})
  })

  it('lets a stretch wrap past Sunday midnight, but not around the week', async () => {
    const wrapping = fake([true])
    await setWorkHours(wrapping, {
      timezone: 'UTC',
      open: [{ from: 6 * 24 * 60 + 22 * 60, to: 7 * 24 * 60 + 2 * 60 }],
    })
    expect(sent(wrapping, 'account.updateBusinessWorkHours')).toBeDefined()

    await expect(
      setWorkHours(fake([]), { timezone: 'UTC', open: [{ from: 0, to: 20_000 }] }),
    ).rejects.toThrow(/past Sunday midnight/)
  })

  it('refuses hours that cannot mean anything, before sending them', async () => {
    // The server's refusal names the request rather than the stretch, and days
    // where minutes belong is the easy mistake.
    await expect(setWorkHours(fake([]), { timezone: '', open: [] })).rejects.toThrow(/timezone/)
    await expect(
      setWorkHours(fake([]), { timezone: 'UTC', open: [{ from: 9, to: 9 }] }),
    ).rejects.toThrow(/closes after it opens/)
    await expect(
      setWorkHours(fake([]), { timezone: 'UTC', open: [{ from: 9.5, to: 100 }] }),
    ).rejects.toThrow(/whole minutes/)
    await expect(
      setWorkHours(fake([]), { timezone: 'UTC', open: [{ from: -1, to: 100 }] }),
    ).rejects.toThrow(/somewhere in the week/)
  })
})
