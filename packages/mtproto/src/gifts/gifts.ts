// SPDX-License-Identifier: MIT

/**
 * Star gifts: sending them, keeping them, upgrading them, moving them on.
 *
 * A gift is bought with Stars and given to a peer. What happens next is the
 * part that makes this more than a send: the recipient decides whether it shows
 * on their profile, whether to convert it back to Stars, whether to upgrade it
 * into a unique collectible, and — once unique — whether to sell it, transfer
 * it, or withdraw it out of Telegram entirely.
 *
 * ```
 *   a gift option ──> sent ──> saved ──┬─> converted back to Stars
 *                                      └─> upgraded ──> unique ──┬─> resold
 *                                                                ├─> transferred
 *                                                                └─> withdrawn
 * ```
 *
 * **Anything that costs Stars goes through a payment form.** Telegram will not
 * take an invoice directly: a form is fetched, and the form's identifier is
 * what authorises the charge. So sending, upgrading, transferring and buying
 * are each *two* requests, and the pair belongs together — which is why they
 * are one function here rather than a form helper a caller has to remember to
 * use. Where an operation turns out to cost nothing, Telegram refuses the form
 * with `NO_PAYMENT_NEEDED` and there is a free-of-charge call to make instead;
 * both upgrading and transferring take that path, and both are handled.
 *
 * **A gift is named three different ways** depending on where it is, and the
 * protocol has a separate constructor for each: by the message that delivered
 * it (a gift to a person), by an identifier within a peer (a gift to a
 * channel), or by a slug (a unique gift, which has a public address).
 * {@link GiftRef} is that union, so a caller passes what it has.
 *
 * **Stars are not integers.** An amount is a whole part and a nanostar part,
 * and a price written as a plain number is a whole number of Stars. Prices are
 * therefore taken as either, and a resale price of zero is how a gift is taken
 * off sale — a distinction that matters, because `undefined` there would be
 * "leave it alone" and the two are different requests.
 *
 * Nothing here is a purchase this library makes on its own: every one of these
 * is called because a program asked for it, and every one that spends Stars
 * says so in its name.
 */

import { TelegramError, ValidationError } from '@yuigram/core'
import { applyUpdates, type Chatting } from '../chats/common.js'
import type { FormattedText } from '../format/text.js'
import type {
  TypeInputInvoice,
  TypeInputSavedStarGift,
  TypeSavedStarGift,
  TypeStarGift,
  TypeStarGiftAttribute,
  TypeStarGiftAttributeCounter,
  TypeStarGiftAttributeId,
  TypeStarsAmount,
  TypeTextWithEntities,
  TypeUpdates,
} from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import { randomId, type SentMessage, sentMessage } from '../normalize/sent.js'
import type { TlValue } from '../tl/index.js'

/** What a gift operation needs: the `chats` context plus a deduplication key. */
export interface Gifting extends Chatting {
  /** Bytes for the deduplication key an offer carries. */
  random(length: number): Uint8Array
}

/**
 * How a gift that has already been given is named.
 *
 * - a **slug** — a unique gift, which has a public address of its own;
 * - a **message** — a gift given to a person, named by the message delivering it;
 * - an **owner and number** — a gift given to a channel, numbered within it.
 */
export type GiftRef =
  | string
  | { readonly message: number }
  | { readonly owner: string | PeerRef; readonly saved: bigint }

/** Turn a reference into the constructor the protocol wants for it. */
async function giftRef(client: Gifting, gift: GiftRef): Promise<TypeInputSavedStarGift> {
  if (typeof gift === 'string') return { _: 'inputSavedStarGiftSlug', slug: gift }

  if ('message' in gift) {
    return { _: 'inputSavedStarGiftUser', msg_id: gift.message }
  }

  return {
    _: 'inputSavedStarGiftChat',
    peer: await client.resolve(gift.owner),
    saved_id: gift.saved,
  }
}

/**
 * A price in Stars: a whole number, or a whole part and a nanostar part.
 *
 * Taken as either because a plain number is what a caller almost always has,
 * and losing the fractional part silently would be worse than not offering it.
 */
export type StarsPrice = number | bigint | TypeStarsAmount

/** Write a price as the amount the protocol carries. */
function starsAmount(price: StarsPrice): TypeStarsAmount {
  if (typeof price === 'number') {
    if (!Number.isInteger(price)) {
      throw new ValidationError(
        'a price given as a number is a whole number of Stars; pass a `starsAmount` ' +
          'for one with a nanostar part',
      )
    }

    return { _: 'starsAmount', amount: BigInt(price), nanos: 0 }
  }

  if (typeof price === 'bigint') return { _: 'starsAmount', amount: price, nanos: 0 }

  return price
}

/** A note attached to a gift: plain text, or text already formatted. */
export type GiftNote = string | FormattedText

/** Write a note as the value the protocol carries. */
function noteOf(note: GiftNote | undefined): TypeTextWithEntities | undefined {
  if (note === undefined) return undefined
  if (typeof note === 'string') return { _: 'textWithEntities', text: note, entities: [] }

  return { _: 'textWithEntities', text: note.text, entities: [...note.entities] }
}

/**
 * Pay an invoice with Stars.
 *
 * The two requests Telegram requires, kept together: the form has to be fetched
 * before it can be paid, and the form identifier is what authorises the charge.
 * Splitting them would make it possible to pay one form twice or a different
 * one by mistake.
 */
async function payWithStars(client: Gifting, invoice: TypeInputInvoice): Promise<TypeUpdates> {
  const form = await client.api.payments.getPaymentForm({ invoice })
  const paid = await client.api.payments.sendStarsForm({ invoice, form_id: form.form_id })

  if (paid._ !== 'payments.paymentResult') {
    throw new ValidationError(
      `paying with Stars was answered with '${paid._}', which carries no result`,
    )
  }

  return paid.updates
}

/**
 * Pay an invoice, or take the free path where there is nothing to pay.
 *
 * Telegram answers `NO_PAYMENT_NEEDED` when an operation that usually costs
 * Stars does not this time — an upgrade already paid for, a transfer inside a
 * free window. That is not a failure, it is the other branch, and the caller
 * should not have to know which one happened.
 */
async function payOrFree(
  client: Gifting,
  invoice: TypeInputInvoice,
  free: () => Promise<TypeUpdates>,
): Promise<TypeUpdates> {
  try {
    return await payWithStars(client, invoice)
  } catch (error) {
    if (!isRefusal(error, 'NO_PAYMENT_NEEDED')) throw error

    return await free()
  }
}

/** Whether an error is one particular refusal from Telegram. */
function isRefusal(error: unknown, name: string): boolean {
  return error instanceof TelegramError && error.message.startsWith(`${name} (`)
}

/** How a gift is sent. */
export interface NewGift {
  /** Which gift, from {@link giftOptions}. */
  readonly giftId: bigint
  /** A note to go with it. */
  readonly note?: GiftNote
  /** Do not show this account as the sender on the recipient's profile. */
  readonly anonymous?: boolean
  /** Pay for the upgrade to a unique gift at the same time. */
  readonly withUpgrade?: boolean
}

/**
 * Send a gift, paying for it in Stars.
 *
 * ```ts
 * await sendGift(account, '@someone', { giftId, note: 'happy birthday' })
 * ```
 *
 * **This spends Stars.** Two requests: the payment form, then the payment.
 * Answered with the service message the gift produced, so the caller has its
 * identifier — which is also how the gift is named afterwards.
 */
export async function sendGift(
  client: Gifting,
  to: string | PeerRef,
  gift: NewGift,
): Promise<SentMessage> {
  const note = noteOf(gift.note)
  const invoice: TypeInputInvoice = {
    _: 'inputInvoiceStarGift',
    peer: await client.resolve(to),
    gift_id: gift.giftId,
    ...(note === undefined ? {} : { message: note }),
    ...(gift.anonymous === true ? { hide_name: true } : {}),
    ...(gift.withUpgrade === true ? { include_upgrade: true } : {}),
  }

  const updates = await payWithStars(client, invoice)
  await applyUpdates(client, updates)

  return sentMessage(updates, 0n)
}

/** What to do with a gift that has arrived. */
export type GiftVerdict = 'show' | 'hide' | 'convert'

/**
 * Decide what happens to a gift this account was given.
 *
 * ```ts
 * await decideGift(account, { message: 42 }, 'show')
 * ```
 *
 * Three answers and two different requests. Showing and hiding are the same
 * call with the flag inverted — Telegram's field is `unsave`, which is why
 * "hide" rather than "unsave" is the word here. Converting is a different call
 * and is **irreversible**: the gift is destroyed and its Stars are credited.
 */
export async function decideGift(
  client: Gifting,
  gift: GiftRef,
  verdict: GiftVerdict,
): Promise<void> {
  const named = await giftRef(client, gift)

  const done =
    verdict === 'convert'
      ? await client.api.payments.convertStarGift({ stargift: named })
      : await client.api.payments.saveStarGift({
          stargift: named,
          ...(verdict === 'hide' ? { unsave: true } : {}),
        })

  if (!done) throw new ValidationError(`Telegram declined to ${verdict} the gift`)
}

/**
 * Upgrade a gift into a unique collectible.
 *
 * ```ts
 * await upgradeGift(account, { message: 42 })
 * ```
 *
 * **This may spend Stars.** A gift sent with `withUpgrade` has already been
 * paid for, and Telegram says so by refusing the payment form — in which case
 * the free call is made instead, and the caller sees no difference.
 *
 * `keepOriginalDetails` keeps the sender and the note visible on the upgraded
 * gift. Off by default, matching what the protocol does with the field absent.
 */
export async function upgradeGift(
  client: Gifting,
  gift: GiftRef,
  options?: { readonly keepOriginalDetails?: boolean },
): Promise<SentMessage> {
  const named = await giftRef(client, gift)
  const keep = options?.keepOriginalDetails === true

  const updates = await payOrFree(
    client,
    {
      _: 'inputInvoiceStarGiftUpgrade',
      stargift: named,
      ...(keep ? { keep_original_details: true } : {}),
    },
    async () =>
      await client.api.payments.upgradeStarGift({
        stargift: named,
        ...(keep ? { keep_original_details: true } : {}),
      }),
  )

  await applyUpdates(client, updates)

  return sentMessage(updates, 0n)
}

/**
 * Give a unique gift to somebody else.
 *
 * ```ts
 * await transferGift(account, 'some-slug', '@someone')
 * ```
 *
 * **This may spend Stars.** A transfer inside Telegram's free window costs
 * nothing, which the server signals by refusing the form; outside it there is a
 * fee. Both paths end with the gift belonging to the recipient.
 */
export async function transferGift(
  client: Gifting,
  gift: GiftRef,
  to: string | PeerRef,
): Promise<SentMessage> {
  const named = await giftRef(client, gift)
  const recipient = await client.resolve(to)

  const updates = await payOrFree(
    client,
    { _: 'inputInvoiceStarGiftTransfer', stargift: named, to_id: recipient },
    async () => await client.api.payments.transferStarGift({ stargift: named, to_id: recipient }),
  )

  await applyUpdates(client, updates)

  return sentMessage(updates, 0n)
}

/**
 * Buy a unique gift somebody has put up for resale.
 *
 * ```ts
 * await buyResaleGift(account, 'some-slug', 'me')
 * ```
 *
 * **This spends Stars**, or TON where `inTon` is set and the seller accepts it.
 * The gift goes to `to`, which need not be this account — buying one as a
 * present is the same operation.
 */
export async function buyResaleGift(
  client: Gifting,
  slug: string,
  to: string | PeerRef,
  options?: { readonly inTon?: boolean },
): Promise<SentMessage> {
  const updates = await payWithStars(client, {
    _: 'inputInvoiceStarGiftResale',
    slug,
    to_id: await client.resolve(to),
    ...(options?.inTon === true ? { ton: true } : {}),
  })

  await applyUpdates(client, updates)

  return sentMessage(updates, 0n)
}

/**
 * Put a unique gift up for resale, or take it off sale.
 *
 * ```ts
 * await setResalePrice(account, 'some-slug', 500)   // on sale
 * await setResalePrice(account, 'some-slug', null)  // off sale
 * ```
 *
 * `null` is how a gift comes off sale, and it is a price of zero rather than an
 * absent field — Telegram has to be told the new price, and "no price" is a
 * price it understands.
 */
export async function setResalePrice(
  client: Gifting,
  gift: GiftRef,
  price: StarsPrice | null,
): Promise<void> {
  const answer = await client.api.payments.updateStarGiftPrice({
    stargift: await giftRef(client, gift),
    resell_amount: price === null ? { _: 'starsAmount', amount: 0n, nanos: 0 } : starsAmount(price),
  })

  await applyUpdates(client, answer)
}

/**
 * Pay in advance for somebody else's gift to be upgradeable.
 *
 * ```ts
 * await prepayUpgrade(account, '@someone', hash)
 * ```
 *
 * **This spends Stars.** The `hash` comes from the gift that is being prepaid
 * for, which is where Telegram publishes it.
 */
export async function prepayUpgrade(
  client: Gifting,
  peer: string | PeerRef,
  hash: string,
): Promise<SentMessage> {
  const updates = await payWithStars(client, {
    _: 'inputInvoiceStarGiftPrepaidUpgrade',
    peer: await client.resolve(peer),
    hash,
  })

  await applyUpdates(client, updates)

  return sentMessage(updates, 0n)
}

/**
 * Pin gifts to the top of a profile, replacing whatever was pinned.
 *
 * ```ts
 * await setPinnedGifts(account, 'me', [{ message: 42 }])
 * ```
 *
 * The list given is the whole pinned set, not an addition to it — so passing an
 * empty list unpins everything, which is the only way to say that.
 */
export async function setPinnedGifts(
  client: Gifting,
  peer: string | PeerRef,
  gifts: readonly GiftRef[],
): Promise<void> {
  const named: TypeInputSavedStarGift[] = []
  for (const gift of gifts) named.push(await giftRef(client, gift))

  const done = await client.api.payments.toggleStarGiftsPinnedToTop({
    peer: await client.resolve(peer),
    stargift: named,
  })

  if (!done) throw new ValidationError('Telegram declined to change the pinned gifts')
}

/**
 * The gifts that can be bought right now.
 *
 * ```ts
 * for (const option of await giftOptions(account)) console.log(option.id)
 * ```
 *
 * Only the ordinary ones: the answer also carries gifts that are no longer of
 * that shape, and those are left out rather than handed back as options that
 * cannot be sent.
 */
export async function giftOptions(client: Gifting): Promise<TypeStarGift[]> {
  const answer = await client.api.payments.getStarGifts({ hash: 0 })

  if (answer._ === 'payments.starGiftsNotModified') {
    // Answered when nothing has changed since the hash the caller sent. Nothing
    // is sent here, so it means the list is empty rather than unchanged.
    return []
  }

  return answer.gifts.filter((gift) => gift._ === 'starGift')
}

/** The three kinds of attribute a unique gift is assembled from. */
export interface UpgradeOptions {
  /** The figures a gift may become. */
  readonly models: TypeStarGiftAttribute[]
  /** The patterns behind it. */
  readonly patterns: TypeStarGiftAttribute[]
  /** The background colours. */
  readonly backdrops: TypeStarGiftAttribute[]
}

/**
 * What a gift could turn into if it were upgraded.
 *
 * ```ts
 * const { models } = await upgradeOptions(account, giftId)
 * ```
 *
 * Sorted into the three kinds, because a flat list of attributes is not what
 * anybody wants to look at: an upgrade picks one of each, and the caller is
 * showing three choosers.
 */
export async function upgradeOptions(client: Gifting, giftId: bigint): Promise<UpgradeOptions> {
  const answer = await client.api.payments.getStarGiftUpgradeAttributes({ gift_id: giftId })
  const options: UpgradeOptions = { models: [], patterns: [], backdrops: [] }

  for (const attribute of answer.attributes) {
    if (attribute._ === 'starGiftAttributeModel') options.models.push(attribute)
    else if (attribute._ === 'starGiftAttributePattern') options.patterns.push(attribute)
    else if (attribute._ === 'starGiftAttributeBackdrop') options.backdrops.push(attribute)
  }

  return options
}

/** One page of gifts on sale, and where the next page starts. */
export interface ResalePage {
  /** The gifts on this page. */
  readonly gifts: TypeStarGift[]
  /** How many there are altogether. */
  readonly total: number
  /** What to pass as `from` for the next page, absent at the end. */
  readonly next: string | undefined
  /**
   * Every attribute the gifts on sale have, where the answer described them.
   *
   * What a marketplace filters by: the models, patterns and backdrops that
   * exist for this gift, each with its rarity. Telegram sends the index once
   * and then leaves it out of later answers — see {@link ResalePage.attributesHash}.
   */
  readonly attributes?: readonly TypeStarGiftAttribute[]
  /**
   * The index's version.
   *
   * Passed back as {@link ResaleQuery.attributesHash} on later pages so the
   * index is not resent; an answer that leaves the index out is saying the one
   * already held is current.
   */
  readonly attributesHash?: bigint
  /** How many listings each attribute appears on, where the answer counted. */
  readonly counters?: readonly TypeStarGiftAttributeCounter[]
}

/**
 * Which attributes a listing must have to be shown.
 *
 * Models and patterns are named by the document each is drawn from, backdrops
 * by their own identifiers — the identifiers the attribute index reports. How
 * several of them combine is Telegram's to apply.
 */
export interface ResaleAttributes {
  readonly model?: readonly bigint[]
  readonly pattern?: readonly bigint[]
  readonly backdrop?: readonly number[]
}

/** How resale listings are asked for. */
export interface ResaleQuery {
  /** Which gift's listings. */
  readonly giftId: bigint
  /** Order by price, or by the number stamped on the gift. */
  readonly sort?: 'price' | 'number'
  /** Only the ones the attributes name. */
  readonly attributes?: ResaleAttributes
  /** The index version a caller already holds, so it is not sent again. */
  readonly attributesHash?: bigint
  /** Only listings that can be used in a craft. */
  readonly forCraft?: boolean
  /** Only listings priced in Stars, leaving out the ones priced in TON. */
  readonly starsOnly?: boolean
  /** Where to continue from, out of a previous page's `next`. */
  readonly from?: string
  /** How many to ask for. Telegram's maximum when not said. */
  readonly limit?: number
}

/** The attribute identifiers a query filters by, as the request carries them. */
function attributeIds(attributes: ResaleAttributes): TypeStarGiftAttributeId[] {
  return [
    ...(attributes.model ?? []).map((id) => ({
      _: 'starGiftAttributeIdModel' as const,
      document_id: id,
    })),
    ...(attributes.pattern ?? []).map((id) => ({
      _: 'starGiftAttributeIdPattern' as const,
      document_id: id,
    })),
    ...(attributes.backdrop ?? []).map((id) => ({
      _: 'starGiftAttributeIdBackdrop' as const,
      backdrop_id: id,
    })),
  ]
}

/**
 * The unique gifts of one kind that are currently for sale.
 *
 * ```ts
 * const page = await resaleOptions(account, { giftId, sort: 'price' })
 * ```
 *
 * A page rather than a walk, because the cursor here is opaque and the total is
 * part of what a caller wants — a marketplace shows "412 for sale" as well as
 * the first twenty.
 */
export async function resaleOptions(client: Gifting, query: ResaleQuery): Promise<ResalePage> {
  const wanted = query.attributes === undefined ? [] : attributeIds(query.attributes)

  const answer = await client.api.payments.getResaleStarGifts({
    gift_id: query.giftId,
    offset: query.from ?? '',
    limit: query.limit ?? 100,
    ...(query.sort === 'price' ? { sort_by_price: true } : {}),
    ...(query.sort === 'number' ? { sort_by_num: true } : {}),
    ...(query.forCraft === true ? { for_craft: true as const } : {}),
    ...(query.starsOnly === true ? { stars_only: true as const } : {}),
    ...(wanted.length === 0 ? {} : { attributes: wanted }),
    ...(query.attributesHash === undefined ? {} : { attributes_hash: query.attributesHash }),
  })

  return {
    gifts: answer.gifts.filter((gift) => gift._ === 'starGiftUnique'),
    total: answer.count,
    next: answer.next_offset,
    ...(answer.attributes === undefined ? {} : { attributes: answer.attributes }),
    ...(answer.attributes_hash === undefined ? {} : { attributesHash: answer.attributes_hash }),
    ...(answer.counters === undefined ? {} : { counters: answer.counters }),
  }
}

/**
 * Read one unique gift by its public address.
 *
 * ```ts
 * const gift = await uniqueGift(account, 'some-slug')
 * ```
 *
 * Refused when the slug names something that is not a unique gift, rather than
 * handed back as one: a caller that asked for a collectible and got an ordinary
 * gift record would read the wrong fields off it.
 */
export async function uniqueGift(client: Gifting, slug: string): Promise<TypeStarGift> {
  const answer = await client.api.payments.getUniqueStarGift({ slug })

  if (answer.gift._ !== 'starGiftUnique') {
    throw new ValidationError(`'${slug}' does not name a unique gift`)
  }

  return answer.gift
}

/**
 * What a unique gift is currently reckoned to be worth.
 *
 * ```ts
 * const value = await giftValue(account, 'some-slug')
 * ```
 *
 * Telegram's own figure, in whatever currencies it quotes. Not a price: the
 * gift may not be for sale at all, and what it would fetch is a different
 * question from what somebody is asking for it.
 */
export async function giftValue(client: Gifting, slug: string) {
  return await client.api.payments.getUniqueStarGiftValueInfo({ slug })
}

/**
 * Read particular saved gifts by reference.
 *
 * ```ts
 * const [gift] = await fetchSavedGifts(account, [{ message: 42 }])
 * ```
 *
 * The list Telegram answers with, in its order. Unlike the other batched reads
 * here this is not positional: the protocol answers with the gifts it found and
 * says nothing about which request each came from, so inventing an alignment
 * would be inventing information.
 */
export async function fetchSavedGifts(
  client: Gifting,
  gifts: readonly GiftRef[],
): Promise<TypeSavedStarGift[]> {
  if (gifts.length === 0) return []

  const named: TypeInputSavedStarGift[] = []
  for (const gift of gifts) named.push(await giftRef(client, gift))

  const answer = await client.api.payments.getSavedStarGift({ stargift: named })

  return [...answer.gifts]
}

/**
 * A link for taking a unique gift out of Telegram, onto the blockchain.
 *
 * ```ts
 * const url = await giftWithdrawalUrl(account, 'some-slug', 'my-two-factor-password')
 * ```
 *
 * The password is required by the protocol rather than by this: withdrawing a
 * collectible is irreversible, so Telegram asks the owner to prove they are at
 * the keyboard. The password is used to compute a proof and is never sent.
 */
export async function giftWithdrawalUrl(
  client: Gifting,
  gift: GiftRef,
  password: string,
): Promise<string> {
  // Loaded when a withdrawal happens rather than on the way up: this reaches
  // SRP, and taking a gift out of Telegram is not something most programs do.
  const { passwordProof, readPasswordChallenge } = await import('../auth/password.js')
  const challenge = readPasswordChallenge(
    (await client.api.account.getPassword()) as unknown as TlValue,
  )

  const answer = await client.api.payments.getStarGiftWithdrawalUrl({
    stargift: await giftRef(client, gift),
    password: await passwordProof(password, challenge),
  })

  return answer.url
}

/**
 * How long an offer stands when the caller does not say.
 *
 * A day. The field is required by the request, so something has to be sent, and
 * an offer that expires is better than one that does not: Stars are committed
 * for as long as it stands.
 */
export const OFFER_STANDS_FOR = 86_400

/** How a gift is offered to somebody who owns it. */
export interface GiftOffer {
  /** The unique gift being offered for. */
  readonly slug: string
  /** What is being offered, in Stars. */
  readonly price: StarsPrice
  /**
   * How long the offer stands, in seconds.
   *
   * Required by the protocol rather than optional, so an offer with no duration
   * given is one that stands for {@link OFFER_STANDS_FOR} — an offer with no
   * expiry is not something the request can express.
   */
  readonly duration?: number
  /** Stars to pay for the message carrying it, where the peer charges for those. */
  readonly forPaidMessages?: bigint
}

/**
 * Offer to buy a unique gift from whoever owns it.
 *
 * ```ts
 * await offerForGift(account, '@someone', { slug, price: 1000 })
 * ```
 *
 * An offer is a message rather than a payment: nothing is spent until the owner
 * accepts, and accepting is {@link settleGiftOffer} on their side. Answered
 * with the message that carried it.
 */
export async function offerForGift(
  client: Gifting,
  to: string | PeerRef,
  offer: GiftOffer,
): Promise<SentMessage> {
  const key = randomId((length) => client.random(length))
  const answer = await client.api.payments.sendStarGiftOffer({
    peer: await client.resolve(to),
    slug: offer.slug,
    price: starsAmount(offer.price),
    random_id: key,
    duration: offer.duration ?? OFFER_STANDS_FOR,
    ...(offer.forPaidMessages === undefined ? {} : { allow_paid_stars: offer.forPaidMessages }),
  })

  await applyUpdates(client, answer)

  return sentMessage(answer, key)
}

/**
 * Accept an offer somebody made for a gift this account owns.
 *
 * ```ts
 * await settleGiftOffer(account, 42)
 * ```
 *
 * The number is the message the offer arrived as. Settling it is what moves the
 * gift and the Stars; until then the offer is only a message.
 */
export async function settleGiftOffer(client: Gifting, message: number): Promise<SentMessage> {
  const answer = await client.api.payments.resolveStarGiftOffer({ offer_msg_id: message })

  await applyUpdates(client, answer)

  return sentMessage(answer, 0n)
}
