/**
 * Boosts, and the business surface a Premium account can publish.
 *
 * Two things that have nothing to do with each other beyond being what Premium
 * buys, and both are about an account's standing rather than about a
 * conversation.
 *
 * **Boosts are a Premium subscriber's votes.** A subscription comes with slots;
 * each slot can be spent on one channel, and a channel's level is a function of
 * how many it has. A slot spent is not spent for ever — it can be moved after a
 * cooldown — which is why "can this account boost" is a question with three
 * answers rather than two: yes with a free slot, yes by moving one, and no.
 *
 * ```
 *   a subscription ──> slots ──┬─ free      ──> boost anything
 *                              ├─ occupied  ──> move after the cooldown
 *                              └─ cooling   ──> not yet
 * ```
 *
 * **The business surface is what a Premium account shows to people who write
 * to it.** An intro shown above an empty conversation, opening hours in a named
 * timezone, and links that open a conversation with a message already typed.
 * Each has a "take it down" form, and taking one down is an absent value rather
 * than an empty one — `undefined` clears it, which is why every one of these
 * takes the setting as a whole rather than as separate fields.
 */

import { ValidationError } from '@yuigram/core'
import { applyUpdates, type Chatting } from '../chats/common.js'
import type { FormattedText } from '../format/text.js'
import type {
  TypeBotBusinessConnection,
  TypeBusinessChatLink,
  TypeBusinessWeeklyOpen,
  TypeInputDocument,
  TypeInputMedia,
  TypeMyBoost,
} from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'

/** What these need, which is what operating on a conversation needs. */
export type Premiuming = Chatting

/**
 * Spend one of this account's boost slots on a conversation.
 *
 * ```ts
 * await boost(account, '@channel')
 * ```
 *
 * Which slot is Telegram's choice, not this one's: a free slot is used where
 * there is one, and otherwise the oldest that is out of its cooldown. Ask
 * {@link canBoost} first if the answer matters before spending.
 */
export async function boost(client: Premiuming, chat: string | PeerRef): Promise<void> {
  await client.api.premium.applyBoost({ peer: await client.resolve(chat) })
}

/**
 * The boost slots this account has, and what each is spent on.
 *
 * ```ts
 * for (const slot of await boostSlots(account)) console.log(slot.slot, slot.peer)
 * ```
 *
 * A slot with no peer is free. A slot with a `cooldown_until_date` in the
 * future is spent and cannot yet be moved.
 */
export async function boostSlots(client: Premiuming): Promise<TypeMyBoost[]> {
  const answer = await client.api.premium.getMyBoosts()

  return [...answer.my_boosts]
}

/**
 * Whether this account can boost anything, and what it would cost.
 *
 * Tagged by `cost` rather than by counting, so the two kinds of yes are told
 * apart by the type system and not by comparing a number to zero.
 */
export type BoostChance =
  | {
      readonly can: true
      /** Nothing is taken from anywhere: a slot was unspent. */
      readonly cost: 'a-free-slot'
      /** How many are unspent. */
      readonly free: number
      readonly slots: readonly TypeMyBoost[]
    }
  | {
      readonly can: true
      /** Boosting takes the boost away from one of {@link movable}. */
      readonly cost: 'moving-one'
      /** The slots whose boost could be moved. */
      readonly movable: readonly TypeMyBoost[]
      readonly slots: readonly TypeMyBoost[]
    }
  | {
      readonly can: false
      readonly because: 'no-subscription' | 'every-slot-cooling'
      readonly slots: readonly TypeMyBoost[]
    }

/**
 * Whether this account can boost something, and at whose expense.
 *
 * ```ts
 * const chance = await canBoost(account)
 * if (chance.can && chance.cost === 'moving-one') {
 *   // boosting will take the boost away from one of `chance.movable`
 * }
 * ```
 *
 * Three answers rather than two, because "yes" is not one thing. A free slot
 * costs nothing. No free slot but a movable one means boosting *removes* a
 * boost from somewhere else, which a caller should be able to say out loud
 * before doing it. And no slots at all is a different no from every slot still
 * cooling down — the first needs a subscription, the second needs a week.
 */
export async function canBoost(client: Premiuming): Promise<BoostChance> {
  const slots = await boostSlots(client)

  if (slots.length === 0) return { can: false, because: 'no-subscription', slots }

  const free = slots.filter((slot) => slot.peer === undefined)
  if (free.length > 0) return { can: true, cost: 'a-free-slot', free: free.length, slots }

  // A slot with no cooldown is one whose boost can be moved somewhere else.
  const movable = slots.filter((slot) => slot.cooldown_until_date === undefined)
  if (movable.length > 0) return { can: true, cost: 'moving-one', movable, slots }

  return { can: false, because: 'every-slot-cooling', slots }
}

/**
 * How boosted a conversation is, and what the next level needs.
 *
 * ```ts
 * const stats = await boostStats(account, '@channel')
 * console.log(stats.level, stats.boosts, stats.next_level_boosts)
 * ```
 *
 * Also carries whether this account is one of the boosters, and the link that
 * opens the boost sheet — which is the only way to boost from outside a client.
 */
export async function boostStats(client: Premiuming, chat: string | PeerRef) {
  return await client.api.premium.getBoostsStatus({ peer: await client.resolve(chat) })
}

/**
 * The connection a business account granted a bot.
 *
 * ```ts
 * const connection = await businessConnection(account, id)
 * ```
 *
 * For a bot rather than for a person: the identifier arrives with the update
 * that announced the connection, and this reads its current state — which
 * rights it carries and whether it is still enabled. The answer is a container
 * of updates, so it reaches the account's own handlers as well.
 */
export async function businessConnection(
  client: Premiuming,
  connectionId: string,
): Promise<TypeBotBusinessConnection> {
  const answer = await client.api.account.getBotBusinessConnection({
    connection_id: connectionId,
  })

  await applyUpdates(client, answer)

  for (const update of updatesOf(answer)) {
    if (update['_'] !== 'updateBotBusinessConnect') continue

    const connection = update['connection']
    if (typeof connection === 'object' && connection !== null) {
      return connection as TypeBotBusinessConnection
    }
  }

  throw new ValidationError(`Telegram described no business connection for '${connectionId}'`)
}

/** The updates an answer carried, whatever shape of container it was. */
function updatesOf(answer: unknown): readonly Record<string, unknown>[] {
  if (typeof answer !== 'object' || answer === null) return []

  const carried = (answer as Record<string, unknown>)['updates']

  return Array.isArray(carried) ? (carried as Record<string, unknown>[]) : []
}

/** The message a business link opens a conversation with. */
export type LinkMessage = string | FormattedText

/** Split a message into the two fields the request carries. */
function messageOf(message: LinkMessage) {
  if (typeof message === 'string') return { message, entities: undefined }

  return {
    message: message.text,
    entities: message.entities.length === 0 ? undefined : message.entities,
  }
}

/**
 * Make a link that opens a conversation with this account, pre-filled.
 *
 * ```ts
 * const link = await createBusinessLink(account, 'Hello, I saw your ad', {
 *   title: 'From the advert',
 * })
 * ```
 *
 * The title is this account's own label for the link — it is shown in the list
 * of links, not to whoever follows one. Answered with the link, whose `link`
 * field is the address to publish and whose `views` starts at zero.
 */
export async function createBusinessLink(
  client: Premiuming,
  message: LinkMessage,
  options?: { readonly title?: string },
): Promise<TypeBusinessChatLink> {
  const { message: text, entities } = messageOf(message)

  return await client.api.account.createBusinessChatLink({
    link: {
      _: 'inputBusinessChatLink',
      message: text,
      ...(entities === undefined ? {} : { entities }),
      ...(options?.title === undefined ? {} : { title: options.title }),
    },
  })
}

/**
 * Change what one of this account's business links says.
 *
 * ```ts
 * await editBusinessLink(account, slug, 'Hello again')
 * ```
 *
 * The slug is the `link` of a link already made. Both fields are replaced
 * rather than merged: a link is a small enough thing that a partial edit would
 * be more confusing than rewriting it.
 */
export async function editBusinessLink(
  client: Premiuming,
  slug: string,
  message: LinkMessage,
  options?: { readonly title?: string },
): Promise<TypeBusinessChatLink> {
  const { message: text, entities } = messageOf(message)

  return await client.api.account.editBusinessChatLink({
    slug,
    link: {
      _: 'inputBusinessChatLink',
      message: text,
      ...(entities === undefined ? {} : { entities }),
      ...(options?.title === undefined ? {} : { title: options.title }),
    },
  })
}

/**
 * Take one of this account's business links down.
 *
 * ```ts
 * await deleteBusinessLink(account, slug)
 * ```
 *
 * Anybody who follows it afterwards reaches an ordinary conversation with this
 * account rather than a pre-filled one.
 */
export async function deleteBusinessLink(client: Premiuming, slug: string): Promise<void> {
  const done = await client.api.account.deleteBusinessChatLink({ slug })

  if (!done) throw new ValidationError(`Telegram declined to delete the business link '${slug}'`)
}

/**
 * Every business link this account has published.
 *
 * ```ts
 * for (const link of await businessLinks(account)) console.log(link.link, link.views)
 * ```
 */
export async function businessLinks(client: Premiuming): Promise<TypeBusinessChatLink[]> {
  const answer = await client.api.account.getBusinessChatLinks()

  return [...answer.links]
}

/** What is shown above an empty conversation with a business account. */
export interface BusinessIntro {
  /** A heading. */
  readonly title?: string
  /** A line or two under it. */
  readonly description?: string
  /**
   * A sticker to show with it: one Telegram already holds, or media to hand
   * over first — an upload, or a URL for Telegram to fetch.
   */
  readonly sticker?: TypeInputDocument | TypeInputMedia
}

/**
 * The document a sticker is, handing media over to Telegram where it is not one
 * yet.
 *
 * Stored against this account rather than sent anywhere, which is the one way
 * to turn bytes into a document without a message existing.
 */
async function stickerOf(
  client: Premiuming,
  sticker: TypeInputDocument | TypeInputMedia,
): Promise<TypeInputDocument> {
  if (sticker._ === 'inputDocument' || sticker._ === 'inputDocumentEmpty') return sticker

  const { storeMedia } = await import('../messaging/compose.js')
  const held = await storeMedia(client, { _: 'inputPeerSelf' }, sticker)

  if (held._ !== 'inputMediaDocument') {
    throw new ValidationError(`a sticker is a document, and Telegram stored this as '${held._}'`)
  }

  return held.id
}

/**
 * Set what people see before they have written anything, or take it down.
 *
 * ```ts
 * await setBusinessIntro(account, { title: 'Open 9–5', description: 'Ask away' })
 * await setBusinessIntro(account, undefined) // back to Telegram's own
 * ```
 *
 * `undefined` clears it, which is why the intro is taken as a whole rather than
 * as fields: there would otherwise be no way to say "none" that is not also a
 * way to say "leave it". Within an intro the title and description default to
 * empty, which is what Telegram requires — the fields are not optional to it.
 */
export async function setBusinessIntro(
  client: Premiuming,
  intro: BusinessIntro | undefined,
): Promise<void> {
  const sticker = intro?.sticker === undefined ? undefined : await stickerOf(client, intro.sticker)

  const done = await client.api.account.updateBusinessIntro({
    ...(intro === undefined
      ? {}
      : {
          intro: {
            _: 'inputBusinessIntro' as const,
            title: intro.title ?? '',
            description: intro.description ?? '',
            ...(sticker === undefined ? {} : { sticker }),
          },
        }),
  })

  if (!done) throw new ValidationError('Telegram declined to change the business intro')
}

/** Minutes past midnight on Monday, which is how Telegram counts the week. */
const MINUTES_IN_A_WEEK = 7 * 24 * 60

/** One stretch of the week during which a business is open. */
export interface OpenHours {
  /** When it opens, as minutes since Monday 00:00. */
  readonly from: number
  /** When it closes, as minutes since Monday 00:00. */
  readonly to: number
}

/** When a business is open, and where in the world it is. */
export interface WorkHours {
  /** The timezone the hours are in, as a Telegram timezone identifier. */
  readonly timezone: string
  /** The stretches during which it is open. */
  readonly open: readonly OpenHours[]
}

/**
 * Publish when this account is open for business, or take the hours down.
 *
 * ```ts
 * await setWorkHours(account, {
 *   timezone: 'Europe/London',
 *   open: [{ from: 9 * 60, to: 17 * 60 }], // Monday, 09:00 to 17:00
 * })
 * ```
 *
 * The week is counted in **minutes since Monday 00:00**, which is how the
 * protocol counts it — so Tuesday at nine is `24 * 60 + 9 * 60`. A stretch may
 * run past the end of the week and wrap, which is how a business open on Sunday
 * evening into Monday morning is expressed, so the upper bound allows for it.
 *
 * `undefined` takes the hours down.
 */
export async function setWorkHours(
  client: Premiuming,
  hours: WorkHours | undefined,
): Promise<void> {
  if (hours !== undefined) check(hours)

  const done = await client.api.account.updateBusinessWorkHours({
    ...(hours === undefined
      ? {}
      : {
          business_work_hours: {
            _: 'businessWorkHours' as const,
            timezone_id: hours.timezone,
            weekly_open: hours.open.map(
              (one): TypeBusinessWeeklyOpen => ({
                _: 'businessWeeklyOpen',
                start_minute: one.from,
                end_minute: one.to,
              }),
            ),
          },
        }),
  })

  if (!done) throw new ValidationError('Telegram declined to change the business hours')
}

/**
 * Refuse hours that cannot mean anything, before sending them.
 *
 * Checked here because the server's refusal names the request rather than the
 * stretch, and a caller that got the minutes of the week wrong — days instead
 * of minutes is the easy mistake — learns nothing from it.
 */
function check(hours: WorkHours): void {
  if (hours.timezone.length === 0) {
    throw new ValidationError('business hours need the timezone they are in')
  }

  for (const one of hours.open) {
    if (!Number.isInteger(one.from) || !Number.isInteger(one.to)) {
      throw new ValidationError('business hours are whole minutes since Monday 00:00')
    }

    if (one.from < 0 || one.from >= MINUTES_IN_A_WEEK) {
      throw new ValidationError(
        `a business opens somewhere in the week: ${one.from} is not between 0 and ` +
          `${MINUTES_IN_A_WEEK - 1} minutes after Monday 00:00`,
      )
    }

    if (one.to <= one.from) {
      throw new ValidationError(
        `a business closes after it opens: ${one.to} is not after ${one.from}`,
      )
    }

    // A stretch may run past Sunday midnight and wrap into Monday, which is why
    // the end is allowed a week and a day rather than a week.
    if (one.to > MINUTES_IN_A_WEEK + 24 * 60) {
      throw new ValidationError(
        `a stretch may wrap past the end of the week but not around it: ${one.to} is more ` +
          'than a day past Sunday midnight',
      )
    }
  }
}
