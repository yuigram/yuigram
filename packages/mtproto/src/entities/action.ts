// SPDX-License-Identifier: MPL-2.0

/**
 * Reading what a service message says happened.
 *
 * `MessageAction` is seventy constructors, and each names its fields the way
 * the schema does: a user added is `users: bigint[]`, a peer that came near is
 * a `Peer` constructor, a gift's note is `textWithEntities`. A reader wants
 * none of those shapes. It wants to switch on what happened and read the
 * answer in the forms the rest of an account already speaks.
 *
 * ```
 *   messageActionChatAddUser { users: [5n] }  ──> { kind: 'members-added', users: [{ kind: 'user', id: 5n }] }
 *   messageActionGeoProximityReached          ──> { kind: 'proximity-reached', from, to, distance }
 * ```
 *
 * So each action is read into one variant of {@link ServiceAction}: a `kind`
 * named for what happened, fields in this codebase's spelling, every peer a
 * {@link PeerRef} — which every account method that takes a conversation or a
 * person accepts as it is — and text with formatting as {@link FormattedText}.
 * Photos, gifts, themes and the other values with a view or a use of their own
 * are handed over as they arrived, so `account.download(photoFile(action.photo))`
 * works on a changed chat photo exactly as on a photo message.
 *
 * Every variant keeps the constructor it was read from as `raw`, and a
 * constructor this build of the schema has no reading for is `unsupported`
 * rather than a failure: Telegram adds actions, and a program reading one it
 * does not know should see that it happened.
 *
 * As with every view here: a function of the value alone. It reaches nothing,
 * so it is as safe on a message fetched from history as on one that just
 * arrived.
 */

import type { FormattedText } from '../format/text.js'
import type {
  TypeBotApp,
  TypeChatTheme,
  TypeInputGroupCall,
  TypeMessageAction,
  TypePaymentCharge,
  TypePaymentRequestedInfo,
  TypePhoneCallDiscardReason,
  TypePhoto,
  TypePollAnswer,
  TypeRequestedPeer,
  TypeSecureCredentialsEncrypted,
  TypeSecureValue,
  TypeSecureValueType,
  TypeStarGift,
  TypeStarsAmount,
  TypeTextWithEntities,
  TypeTodoItem,
  TypeWallPaper,
} from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import { peerRefOf } from '../normalize/normalize.js'

/** One constructor of the action union, by its name. */
type Raw<K extends TypeMessageAction['_']> = Extract<TypeMessageAction, { _: K }>

/** Why a call ended, named for what happened rather than for the constructor. */
export type CallEndReason = 'missed' | 'disconnected' | 'hung-up' | 'busy' | 'moved-to-conference'

/** A peer a person picked with a request button, as much as they chose to share. */
export interface SharedPeer {
  readonly peer: PeerRef
  /** A group's or channel's title, where it was shared. */
  readonly title: string | undefined
  readonly firstName: string | undefined
  readonly lastName: string | undefined
  readonly username: string | undefined
  readonly photo: TypePhoto | undefined
}

/** What a payment was for and how much it was, common to sending and receiving one. */
interface Payment {
  /** Three letters, `XTR` for Telegram Stars. */
  readonly currency: string
  /** In the currency's smallest unit. */
  readonly amount: bigint
  /** Whether this payment set a recurring one up. */
  readonly recurringInit: boolean
  /** Whether this payment was one of a recurring series. */
  readonly recurringUsed: boolean
  /** When a subscription paid for runs out, in Unix seconds. */
  readonly subscriptionUntil: number | undefined
}

/** A price paid in a currency, with its equivalent in a cryptocurrency where there is one. */
interface Priced {
  readonly currency: string
  readonly amount: bigint
  readonly cryptoCurrency: string | undefined
  readonly cryptoAmount: bigint | undefined
}

/**
 * What a service message says happened.
 *
 * Switch on `kind`: the compiler narrows the rest. Timestamps are Unix seconds
 * and amounts are in a currency's smallest unit, as everywhere else in an
 * account's reading of Telegram.
 */
export type ServiceAction =
  | { readonly kind: 'empty'; readonly raw: Raw<'messageActionEmpty'> }
  | {
      readonly kind: 'group-created'
      readonly title: string
      readonly users: readonly PeerRef[]
      readonly raw: Raw<'messageActionChatCreate'>
    }
  | {
      readonly kind: 'channel-created'
      readonly title: string
      readonly raw: Raw<'messageActionChannelCreate'>
    }
  | {
      readonly kind: 'title-changed'
      readonly title: string
      readonly raw: Raw<'messageActionChatEditTitle'>
    }
  | {
      readonly kind: 'photo-changed'
      readonly photo: TypePhoto
      readonly raw: Raw<'messageActionChatEditPhoto'>
    }
  | { readonly kind: 'photo-removed'; readonly raw: Raw<'messageActionChatDeletePhoto'> }
  | {
      readonly kind: 'members-added'
      readonly users: readonly PeerRef[]
      readonly raw: Raw<'messageActionChatAddUser'>
    }
  | {
      readonly kind: 'member-removed'
      readonly user: PeerRef
      readonly raw: Raw<'messageActionChatDeleteUser'>
    }
  | {
      readonly kind: 'joined-by-link'
      /** Who made the link. */
      readonly inviter: PeerRef
      readonly raw: Raw<'messageActionChatJoinedByLink'>
    }
  | { readonly kind: 'joined-by-request'; readonly raw: Raw<'messageActionChatJoinedByRequest'> }
  | {
      readonly kind: 'joined-via-community'
      readonly communityId: bigint
      readonly raw: Raw<'messageActionChatJoinedViaCommunity'>
    }
  | {
      readonly kind: 'community-changed'
      /** Absent when the chat left its community. */
      readonly communityId: bigint | undefined
      readonly raw: Raw<'messageActionChangeCommunity'>
    }
  | {
      readonly kind: 'migrated-to'
      /** The supergroup this group became. */
      readonly channel: PeerRef
      readonly raw: Raw<'messageActionChatMigrateTo'>
    }
  | {
      readonly kind: 'migrated-from'
      readonly title: string
      /** The group this supergroup was made from. */
      readonly chat: PeerRef
      readonly raw: Raw<'messageActionChannelMigrateFrom'>
    }
  | {
      readonly kind: 'message-pinned'
      /** The message pinned is the one this replies to. */
      readonly raw: Raw<'messageActionPinMessage'>
    }
  | { readonly kind: 'history-cleared'; readonly raw: Raw<'messageActionHistoryClear'> }
  | {
      readonly kind: 'game-score'
      readonly gameId: bigint
      readonly score: number
      readonly raw: Raw<'messageActionGameScore'>
    }
  | ({
      readonly kind: 'payment-sent'
      readonly invoiceSlug: string | undefined
      readonly raw: Raw<'messageActionPaymentSent'>
    } & Payment)
  | ({
      readonly kind: 'payment-received'
      /** What the bot put in the invoice to recognise it by. */
      readonly payload: Uint8Array
      readonly info: TypePaymentRequestedInfo | undefined
      readonly shippingOptionId: string | undefined
      readonly charge: TypePaymentCharge
      readonly raw: Raw<'messageActionPaymentSentMe'>
    } & Payment)
  | {
      readonly kind: 'payment-refunded'
      readonly peer: PeerRef
      readonly currency: string
      readonly amount: bigint
      readonly payload: Uint8Array | undefined
      readonly charge: TypePaymentCharge
      readonly raw: Raw<'messageActionPaymentRefunded'>
    }
  | {
      readonly kind: 'call'
      readonly callId: bigint
      readonly video: boolean
      /** In seconds, for a call that was answered. */
      readonly duration: number | undefined
      readonly reason: CallEndReason | undefined
      /** Whether nobody answered. */
      readonly missed: boolean
      readonly raw: Raw<'messageActionPhoneCall'>
    }
  | {
      readonly kind: 'conference-call'
      readonly callId: bigint
      readonly missed: boolean
      readonly active: boolean
      readonly video: boolean
      readonly duration: number | undefined
      readonly others: readonly PeerRef[]
      readonly raw: Raw<'messageActionConferenceCall'>
    }
  | {
      readonly kind: 'group-call'
      readonly call: TypeInputGroupCall
      /** In seconds, once the call has ended. */
      readonly duration: number | undefined
      /** Whether this announces the end of the call rather than its start. */
      readonly ended: boolean
      readonly raw: Raw<'messageActionGroupCall'>
    }
  | {
      readonly kind: 'group-call-scheduled'
      readonly call: TypeInputGroupCall
      readonly scheduledFor: number
      readonly raw: Raw<'messageActionGroupCallScheduled'>
    }
  | {
      readonly kind: 'group-call-invite'
      readonly call: TypeInputGroupCall
      readonly users: readonly PeerRef[]
      readonly raw: Raw<'messageActionInviteToGroupCall'>
    }
  | { readonly kind: 'screenshot-taken'; readonly raw: Raw<'messageActionScreenshotTaken'> }
  | {
      readonly kind: 'custom'
      readonly text: string
      readonly raw: Raw<'messageActionCustomAction'>
    }
  | {
      readonly kind: 'bot-allowed'
      readonly attachMenu: boolean
      readonly fromRequest: boolean
      /** The site a person logged in to with the bot. */
      readonly domain: string | undefined
      readonly app: TypeBotApp | undefined
      readonly raw: Raw<'messageActionBotAllowed'>
    }
  | {
      readonly kind: 'passport-data-sent'
      readonly types: readonly TypeSecureValueType[]
      readonly raw: Raw<'messageActionSecureValuesSent'>
    }
  | {
      readonly kind: 'passport-data-received'
      readonly values: readonly TypeSecureValue[]
      readonly credentials: TypeSecureCredentialsEncrypted
      readonly raw: Raw<'messageActionSecureValuesSentMe'>
    }
  | { readonly kind: 'contact-joined'; readonly raw: Raw<'messageActionContactSignUp'> }
  | {
      readonly kind: 'proximity-reached'
      readonly from: PeerRef
      readonly to: PeerRef
      /** In metres. */
      readonly distance: number
      readonly raw: Raw<'messageActionGeoProximityReached'>
    }
  | {
      readonly kind: 'ttl-changed'
      /** How long new messages last, in seconds; `0` when they no longer expire. */
      readonly period: number
      /** The user whose default setting this came from, where it did. */
      readonly autoSettingFrom: PeerRef | undefined
      readonly raw: Raw<'messageActionSetMessagesTTL'>
    }
  | {
      readonly kind: 'theme-changed'
      readonly theme: TypeChatTheme
      readonly raw: Raw<'messageActionSetChatTheme'>
    }
  | {
      readonly kind: 'wallpaper-changed'
      readonly wallpaper: TypeWallPaper
      /** Whether it was set back to one already in use. */
      readonly same: boolean
      readonly forBoth: boolean
      readonly raw: Raw<'messageActionSetChatWallPaper'>
    }
  | {
      readonly kind: 'web-app-data-sent'
      readonly text: string
      readonly raw: Raw<'messageActionWebViewDataSent'>
    }
  | {
      readonly kind: 'web-app-data-received'
      readonly text: string
      readonly data: string
      readonly raw: Raw<'messageActionWebViewDataSentMe'>
    }
  | {
      readonly kind: 'topic-created'
      readonly title: string
      readonly titleMissing: boolean
      readonly iconColor: number
      readonly iconEmojiId: bigint | undefined
      readonly raw: Raw<'messageActionTopicCreate'>
    }
  | {
      readonly kind: 'topic-edited'
      /** Each is present only where it changed. */
      readonly title: string | undefined
      readonly iconEmojiId: bigint | undefined
      readonly closed: boolean | undefined
      readonly hidden: boolean | undefined
      readonly raw: Raw<'messageActionTopicEdit'>
    }
  | {
      readonly kind: 'profile-photo-suggested'
      readonly photo: TypePhoto
      readonly raw: Raw<'messageActionSuggestProfilePhoto'>
    }
  | {
      readonly kind: 'birthday-suggested'
      readonly day: number
      readonly month: number
      readonly year: number | undefined
      readonly raw: Raw<'messageActionSuggestBirthday'>
    }
  | {
      readonly kind: 'peers-shared'
      readonly buttonId: number
      readonly peers: readonly PeerRef[]
      readonly raw: Raw<'messageActionRequestedPeer'>
    }
  | {
      readonly kind: 'peers-shared-with-bot'
      readonly buttonId: number
      readonly peers: readonly SharedPeer[]
      readonly raw: Raw<'messageActionRequestedPeerSentMe'>
    }
  | ({
      readonly kind: 'premium-gifted'
      readonly days: number
      readonly message: FormattedText | undefined
      readonly raw: Raw<'messageActionGiftPremium'>
    } & Priced)
  | {
      readonly kind: 'gift-code'
      readonly viaGiveaway: boolean
      readonly unclaimed: boolean
      readonly boostPeer: PeerRef | undefined
      readonly days: number
      readonly slug: string
      readonly currency: string | undefined
      readonly amount: bigint | undefined
      readonly cryptoCurrency: string | undefined
      readonly cryptoAmount: bigint | undefined
      readonly message: FormattedText | undefined
      readonly raw: Raw<'messageActionGiftCode'>
    }
  | ({
      readonly kind: 'stars-gifted'
      readonly stars: bigint
      readonly transactionId: string | undefined
      readonly raw: Raw<'messageActionGiftStars'>
    } & Priced)
  | ({
      readonly kind: 'ton-gifted'
      readonly transactionId: string | undefined
      readonly raw: Raw<'messageActionGiftTon'>
    } & Priced)
  | {
      readonly kind: 'stars-prize'
      readonly unclaimed: boolean
      readonly stars: bigint
      readonly transactionId: string
      readonly boostPeer: PeerRef
      readonly giveawayMessageId: number
      readonly raw: Raw<'messageActionPrizeStars'>
    }
  | {
      readonly kind: 'giveaway-launched'
      /** For a giveaway of Stars; absent for one of Premium. */
      readonly stars: bigint | undefined
      readonly raw: Raw<'messageActionGiveawayLaunch'>
    }
  | {
      readonly kind: 'giveaway-results'
      readonly ofStars: boolean
      readonly winners: number
      readonly unclaimed: number
      readonly raw: Raw<'messageActionGiveawayResults'>
    }
  | {
      readonly kind: 'boosts-applied'
      readonly boosts: number
      readonly raw: Raw<'messageActionBoostApply'>
    }
  | {
      readonly kind: 'gift-received'
      readonly gift: TypeStarGift
      readonly message: FormattedText | undefined
      readonly from: PeerRef | undefined
      readonly to: PeerRef | undefined
      /** The chat the gift was saved to, where it is not the recipient's profile. */
      readonly peer: PeerRef | undefined
      readonly savedId: bigint | undefined
      readonly nameHidden: boolean
      readonly saved: boolean
      readonly converted: boolean
      readonly upgraded: boolean
      readonly refunded: boolean
      readonly canUpgrade: boolean
      readonly prepaidUpgrade: boolean
      readonly upgradeSeparate: boolean
      readonly auctionAcquired: boolean
      /** What converting it would pay, in Stars. */
      readonly convertStars: bigint | undefined
      readonly upgradeStars: bigint | undefined
      readonly upgradeMessageId: number | undefined
      readonly giftMessageId: number | undefined
      readonly prepaidUpgradeHash: string | undefined
      /** Its number in the series. */
      readonly number: number | undefined
      readonly raw: Raw<'messageActionStarGift'>
    }
  | {
      readonly kind: 'unique-gift-received'
      readonly gift: TypeStarGift
      readonly message: FormattedText | undefined
      readonly from: PeerRef | undefined
      readonly peer: PeerRef | undefined
      readonly savedId: bigint | undefined
      readonly upgrade: boolean
      readonly transferred: boolean
      readonly saved: boolean
      readonly refunded: boolean
      readonly prepaidUpgrade: boolean
      readonly assigned: boolean
      readonly fromOffer: boolean
      readonly craft: boolean
      readonly nameHidden: boolean
      readonly transferStars: bigint | undefined
      readonly resaleAmount: TypeStarsAmount | undefined
      readonly dropOriginalDetailsStars: bigint | undefined
      readonly canExportAt: number | undefined
      readonly canTransferAt: number | undefined
      readonly canResellAt: number | undefined
      readonly canCraftAt: number | undefined
      readonly raw: Raw<'messageActionStarGiftUnique'>
    }
  | {
      readonly kind: 'gift-offer'
      readonly gift: TypeStarGift
      readonly price: TypeStarsAmount
      readonly expiresAt: number
      readonly accepted: boolean
      readonly declined: boolean
      readonly raw: Raw<'messageActionStarGiftPurchaseOffer'>
    }
  | {
      readonly kind: 'gift-offer-declined'
      readonly gift: TypeStarGift
      readonly price: TypeStarsAmount
      readonly expired: boolean
      readonly raw: Raw<'messageActionStarGiftPurchaseOfferDeclined'>
    }
  | {
      readonly kind: 'paid-messages-price'
      readonly stars: bigint
      readonly broadcastAllowed: boolean
      readonly raw: Raw<'messageActionPaidMessagesPrice'>
    }
  | {
      readonly kind: 'paid-messages-refunded'
      readonly count: number
      readonly stars: bigint
      readonly raw: Raw<'messageActionPaidMessagesRefunded'>
    }
  | {
      readonly kind: 'checklist-updated'
      readonly completed: readonly number[]
      readonly incompleted: readonly number[]
      readonly raw: Raw<'messageActionTodoCompletions'>
    }
  | {
      readonly kind: 'checklist-tasks-added'
      readonly tasks: readonly TypeTodoItem[]
      readonly raw: Raw<'messageActionTodoAppendTasks'>
    }
  | {
      readonly kind: 'suggested-post-decision'
      readonly rejected: boolean
      readonly balanceTooLow: boolean
      readonly rejectComment: string | undefined
      readonly scheduledFor: number | undefined
      readonly price: TypeStarsAmount | undefined
      readonly raw: Raw<'messageActionSuggestedPostApproval'>
    }
  | {
      readonly kind: 'suggested-post-paid'
      readonly price: TypeStarsAmount
      readonly raw: Raw<'messageActionSuggestedPostSuccess'>
    }
  | {
      readonly kind: 'suggested-post-refunded'
      readonly payerInitiated: boolean
      readonly raw: Raw<'messageActionSuggestedPostRefund'>
    }
  | {
      readonly kind: 'creator-transfer-pending'
      readonly newCreator: PeerRef
      readonly raw: Raw<'messageActionNewCreatorPending'>
    }
  | {
      readonly kind: 'creator-changed'
      readonly newCreator: PeerRef
      readonly raw: Raw<'messageActionChangeCreator'>
    }
  | {
      readonly kind: 'protection-changed'
      /** Whether forwarding and saving are now refused. */
      readonly enabled: boolean
      readonly previously: boolean
      readonly raw: Raw<'messageActionNoForwardsToggle'>
    }
  | {
      readonly kind: 'protection-requested'
      readonly enabled: boolean
      readonly previously: boolean
      readonly expired: boolean
      readonly raw: Raw<'messageActionNoForwardsRequest'>
    }
  | {
      readonly kind: 'poll-option-added'
      readonly answer: TypePollAnswer
      readonly raw: Raw<'messageActionPollAppendAnswer'>
    }
  | {
      readonly kind: 'poll-option-removed'
      readonly answer: TypePollAnswer
      readonly raw: Raw<'messageActionPollDeleteAnswer'>
    }
  | {
      readonly kind: 'managed-bot-created'
      readonly bot: PeerRef
      readonly raw: Raw<'messageActionManagedBotCreated'>
    }
  | {
      readonly kind: 'unsupported'
      /** An action this build of the schema has no reading for. */
      readonly raw: TypeMessageAction
    }

/** The names {@link ServiceAction.kind} can take. */
export type ServiceActionKind = ServiceAction['kind']

/** The variant of {@link ServiceAction} with one kind. */
export type ServiceActionOf<K extends ServiceActionKind> = Extract<ServiceAction, { kind: K }>

const user = (id: bigint): PeerRef => ({ kind: 'user', id })

/** Raised inside a reading that meets a peer constructor it cannot place. */
class Unplaced extends Error {}

/**
 * A peer the schema requires, read.
 *
 * A peer constructor newer than this build cannot be placed, and a guess would
 * send a reader's next call to the wrong conversation; the whole action then
 * reads as `unsupported`, which is true.
 */
function required(value: unknown): PeerRef {
  const peer = peerRefOf(value)
  if (peer === undefined) throw new Unplaced()
  return peer
}

function formatted(value: TypeTextWithEntities | undefined): FormattedText | undefined {
  return value === undefined ? undefined : { text: value.text, entities: value.entities }
}

function endReason(value: TypePhoneCallDiscardReason | undefined): CallEndReason | undefined {
  switch (value?._) {
    case undefined:
      return undefined
    case 'phoneCallDiscardReasonMissed':
      return 'missed'
    case 'phoneCallDiscardReasonDisconnect':
      return 'disconnected'
    case 'phoneCallDiscardReasonHangup':
      return 'hung-up'
    case 'phoneCallDiscardReasonBusy':
      return 'busy'
    default:
      return 'moved-to-conference'
  }
}

function sharedPeer(value: TypeRequestedPeer): SharedPeer {
  const common = {
    title: undefined,
    firstName: undefined,
    lastName: undefined,
    username: undefined,
    photo: value.photo,
  }
  switch (value._) {
    case 'requestedPeerUser':
      return {
        ...common,
        peer: user(value.user_id),
        firstName: value.first_name,
        lastName: value.last_name,
        username: value.username,
      }
    case 'requestedPeerChat':
      return { ...common, peer: { kind: 'chat', id: value.chat_id }, title: value.title }
    default:
      return {
        ...common,
        peer: { kind: 'channel', id: value.channel_id },
        title: value.title,
        username: value.username,
      }
  }
}

/**
 * What a service message says happened.
 *
 * `undefined` for nothing, so a message's `action` field can be passed as it is.
 * An action the schema here has no reading for comes back as `unsupported`,
 * with the value as `raw`.
 */
export function readAction(value: TypeMessageAction | undefined): ServiceAction | undefined {
  if (value === undefined) return undefined
  try {
    return readKnown(value) ?? readMore(value) ?? { kind: 'unsupported', raw: value }
  } catch (error) {
    if (error instanceof Unplaced) return { kind: 'unsupported', raw: value }
    throw error
  }
}

/** The actions about a conversation itself: who is in it, what it is called, where it went. */
function readKnown(raw: TypeMessageAction): ServiceAction | undefined {
  switch (raw._) {
    case 'messageActionEmpty':
      return { kind: 'empty', raw }
    case 'messageActionChatCreate':
      return { kind: 'group-created', title: raw.title, users: raw.users.map(user), raw }
    case 'messageActionChannelCreate':
      return { kind: 'channel-created', title: raw.title, raw }
    case 'messageActionChatEditTitle':
      return { kind: 'title-changed', title: raw.title, raw }
    case 'messageActionChatEditPhoto':
      return { kind: 'photo-changed', photo: raw.photo, raw }
    case 'messageActionChatDeletePhoto':
      return { kind: 'photo-removed', raw }
    case 'messageActionChatAddUser':
      return { kind: 'members-added', users: raw.users.map(user), raw }
    case 'messageActionChatDeleteUser':
      return { kind: 'member-removed', user: user(raw.user_id), raw }
    case 'messageActionChatJoinedByLink':
      return { kind: 'joined-by-link', inviter: user(raw.inviter_id), raw }
    case 'messageActionChatJoinedByRequest':
      return { kind: 'joined-by-request', raw }
    case 'messageActionChatJoinedViaCommunity':
      return { kind: 'joined-via-community', communityId: raw.community_id, raw }
    case 'messageActionChangeCommunity':
      return { kind: 'community-changed', communityId: raw.community_id, raw }
    case 'messageActionChatMigrateTo':
      return { kind: 'migrated-to', channel: { kind: 'channel', id: raw.channel_id }, raw }
    case 'messageActionChannelMigrateFrom':
      return {
        kind: 'migrated-from',
        title: raw.title,
        chat: { kind: 'chat', id: raw.chat_id },
        raw,
      }
    case 'messageActionPinMessage':
      return { kind: 'message-pinned', raw }
    case 'messageActionHistoryClear':
      return { kind: 'history-cleared', raw }
    case 'messageActionScreenshotTaken':
      return { kind: 'screenshot-taken', raw }
    case 'messageActionCustomAction':
      return { kind: 'custom', text: raw.message, raw }
    case 'messageActionContactSignUp':
      return { kind: 'contact-joined', raw }
    case 'messageActionSetMessagesTTL':
      return {
        kind: 'ttl-changed',
        period: raw.period,
        autoSettingFrom:
          raw.auto_setting_from === undefined ? undefined : user(raw.auto_setting_from),
        raw,
      }
    case 'messageActionSetChatTheme':
      return { kind: 'theme-changed', theme: raw.theme, raw }
    case 'messageActionSetChatWallPaper':
      return {
        kind: 'wallpaper-changed',
        wallpaper: raw.wallpaper,
        same: raw.same === true,
        forBoth: raw.for_both === true,
        raw,
      }
    case 'messageActionTopicCreate':
      return {
        kind: 'topic-created',
        title: raw.title,
        titleMissing: raw.title_missing === true,
        iconColor: raw.icon_color,
        iconEmojiId: raw.icon_emoji_id,
        raw,
      }
    case 'messageActionTopicEdit':
      return {
        kind: 'topic-edited',
        title: raw.title,
        iconEmojiId: raw.icon_emoji_id,
        closed: raw.closed,
        hidden: raw.hidden,
        raw,
      }
    case 'messageActionNewCreatorPending':
      return { kind: 'creator-transfer-pending', newCreator: user(raw.new_creator_id), raw }
    case 'messageActionChangeCreator':
      return { kind: 'creator-changed', newCreator: user(raw.new_creator_id), raw }
    case 'messageActionNoForwardsToggle':
      return {
        kind: 'protection-changed',
        enabled: raw.new_value,
        previously: raw.prev_value,
        raw,
      }
    case 'messageActionNoForwardsRequest':
      return {
        kind: 'protection-requested',
        enabled: raw.new_value,
        previously: raw.prev_value,
        expired: raw.expired === true,
        raw,
      }
    case 'messageActionBoostApply':
      return { kind: 'boosts-applied', boosts: raw.boosts, raw }
    case 'messageActionManagedBotCreated':
      return { kind: 'managed-bot-created', bot: user(raw.bot_id), raw }
    default:
      return readCalls(raw)
  }
}

/** Calls, games, bots, polls, checklists and what people shared. */
function readCalls(raw: TypeMessageAction): ServiceAction | undefined {
  switch (raw._) {
    case 'messageActionPhoneCall': {
      const reason = endReason(raw.reason)
      return {
        kind: 'call',
        callId: raw.call_id,
        video: raw.video === true,
        duration: raw.duration,
        reason,
        missed: reason === 'missed',
        raw,
      }
    }
    case 'messageActionConferenceCall':
      return {
        kind: 'conference-call',
        callId: raw.call_id,
        missed: raw.missed === true,
        active: raw.active === true,
        video: raw.video === true,
        duration: raw.duration,
        others: (raw.other_participants ?? []).map(required),
        raw,
      }
    case 'messageActionGroupCall':
      return {
        kind: 'group-call',
        call: raw.call,
        duration: raw.duration,
        ended: raw.duration !== undefined,
        raw,
      }
    case 'messageActionGroupCallScheduled':
      return {
        kind: 'group-call-scheduled',
        call: raw.call,
        scheduledFor: raw.schedule_date,
        raw,
      }
    case 'messageActionInviteToGroupCall':
      return { kind: 'group-call-invite', call: raw.call, users: raw.users.map(user), raw }
    case 'messageActionGameScore':
      return { kind: 'game-score', gameId: raw.game_id, score: raw.score, raw }
    case 'messageActionBotAllowed':
      return {
        kind: 'bot-allowed',
        attachMenu: raw.attach_menu === true,
        fromRequest: raw.from_request === true,
        domain: raw.domain,
        app: raw.app,
        raw,
      }
    case 'messageActionWebViewDataSent':
      return { kind: 'web-app-data-sent', text: raw.text, raw }
    case 'messageActionWebViewDataSentMe':
      return { kind: 'web-app-data-received', text: raw.text, data: raw.data, raw }
    case 'messageActionSecureValuesSent':
      return { kind: 'passport-data-sent', types: raw.types, raw }
    case 'messageActionSecureValuesSentMe':
      return {
        kind: 'passport-data-received',
        values: raw.values,
        credentials: raw.credentials,
        raw,
      }
    case 'messageActionGeoProximityReached':
      return {
        kind: 'proximity-reached',
        from: required(raw.from_id),
        to: required(raw.to_id),
        distance: raw.distance,
        raw,
      }
    case 'messageActionSuggestProfilePhoto':
      return { kind: 'profile-photo-suggested', photo: raw.photo, raw }
    case 'messageActionSuggestBirthday':
      return {
        kind: 'birthday-suggested',
        day: raw.birthday.day,
        month: raw.birthday.month,
        year: raw.birthday.year,
        raw,
      }
    case 'messageActionRequestedPeer':
      return {
        kind: 'peers-shared',
        buttonId: raw.button_id,
        peers: raw.peers.map(required),
        raw,
      }
    case 'messageActionRequestedPeerSentMe':
      return {
        kind: 'peers-shared-with-bot',
        buttonId: raw.button_id,
        peers: raw.peers.map(sharedPeer),
        raw,
      }
    case 'messageActionPollAppendAnswer':
      return { kind: 'poll-option-added', answer: raw.answer, raw }
    case 'messageActionPollDeleteAnswer':
      return { kind: 'poll-option-removed', answer: raw.answer, raw }
    case 'messageActionTodoCompletions':
      return {
        kind: 'checklist-updated',
        completed: raw.completed,
        incompleted: raw.incompleted,
        raw,
      }
    case 'messageActionTodoAppendTasks':
      return { kind: 'checklist-tasks-added', tasks: raw.list, raw }
    default:
      return undefined
  }
}

/** Money: payments, gifts, giveaways, paid messages and suggested posts. */
function readMore(raw: TypeMessageAction): ServiceAction | undefined {
  switch (raw._) {
    case 'messageActionPaymentSent':
      return {
        kind: 'payment-sent',
        currency: raw.currency,
        amount: raw.total_amount,
        invoiceSlug: raw.invoice_slug,
        recurringInit: raw.recurring_init === true,
        recurringUsed: raw.recurring_used === true,
        subscriptionUntil: raw.subscription_until_date,
        raw,
      }
    case 'messageActionPaymentSentMe':
      return {
        kind: 'payment-received',
        currency: raw.currency,
        amount: raw.total_amount,
        payload: raw.payload,
        info: raw.info,
        shippingOptionId: raw.shipping_option_id,
        charge: raw.charge,
        recurringInit: raw.recurring_init === true,
        recurringUsed: raw.recurring_used === true,
        subscriptionUntil: raw.subscription_until_date,
        raw,
      }
    case 'messageActionPaymentRefunded':
      return {
        kind: 'payment-refunded',
        peer: required(raw.peer),
        currency: raw.currency,
        amount: raw.total_amount,
        payload: raw.payload,
        charge: raw.charge,
        raw,
      }
    case 'messageActionGiftPremium':
      return {
        kind: 'premium-gifted',
        currency: raw.currency,
        amount: raw.amount,
        cryptoCurrency: raw.crypto_currency,
        cryptoAmount: raw.crypto_amount,
        days: raw.days,
        message: formatted(raw.message),
        raw,
      }
    case 'messageActionGiftCode':
      return {
        kind: 'gift-code',
        viaGiveaway: raw.via_giveaway === true,
        unclaimed: raw.unclaimed === true,
        boostPeer: peerRefOf(raw.boost_peer),
        days: raw.days,
        slug: raw.slug,
        currency: raw.currency,
        amount: raw.amount,
        cryptoCurrency: raw.crypto_currency,
        cryptoAmount: raw.crypto_amount,
        message: formatted(raw.message),
        raw,
      }
    case 'messageActionGiftStars':
      return {
        kind: 'stars-gifted',
        currency: raw.currency,
        amount: raw.amount,
        cryptoCurrency: raw.crypto_currency,
        cryptoAmount: raw.crypto_amount,
        stars: raw.stars,
        transactionId: raw.transaction_id,
        raw,
      }
    case 'messageActionGiftTon':
      return {
        kind: 'ton-gifted',
        currency: raw.currency,
        amount: raw.amount,
        cryptoCurrency: raw.crypto_currency,
        cryptoAmount: raw.crypto_amount,
        transactionId: raw.transaction_id,
        raw,
      }
    case 'messageActionPrizeStars':
      return {
        kind: 'stars-prize',
        unclaimed: raw.unclaimed === true,
        stars: raw.stars,
        transactionId: raw.transaction_id,
        boostPeer: required(raw.boost_peer),
        giveawayMessageId: raw.giveaway_msg_id,
        raw,
      }
    case 'messageActionGiveawayLaunch':
      return { kind: 'giveaway-launched', stars: raw.stars, raw }
    case 'messageActionGiveawayResults':
      return {
        kind: 'giveaway-results',
        ofStars: raw.stars === true,
        winners: raw.winners_count,
        unclaimed: raw.unclaimed_count,
        raw,
      }
    case 'messageActionPaidMessagesPrice':
      return {
        kind: 'paid-messages-price',
        stars: raw.stars,
        broadcastAllowed: raw.broadcast_messages_allowed === true,
        raw,
      }
    case 'messageActionPaidMessagesRefunded':
      return { kind: 'paid-messages-refunded', count: raw.count, stars: raw.stars, raw }
    case 'messageActionSuggestedPostApproval':
      return {
        kind: 'suggested-post-decision',
        rejected: raw.rejected === true,
        balanceTooLow: raw.balance_too_low === true,
        rejectComment: raw.reject_comment,
        scheduledFor: raw.schedule_date,
        price: raw.price,
        raw,
      }
    case 'messageActionSuggestedPostSuccess':
      return { kind: 'suggested-post-paid', price: raw.price, raw }
    case 'messageActionSuggestedPostRefund':
      return { kind: 'suggested-post-refunded', payerInitiated: raw.payer_initiated === true, raw }
    default:
      return readGifts(raw)
  }
}

/** Star gifts, and offers to buy them. */
function readGifts(raw: TypeMessageAction): ServiceAction | undefined {
  switch (raw._) {
    case 'messageActionStarGift':
      return {
        kind: 'gift-received',
        gift: raw.gift,
        message: formatted(raw.message),
        from: peerRefOf(raw.from_id),
        to: peerRefOf(raw.to_id),
        peer: peerRefOf(raw.peer),
        savedId: raw.saved_id,
        nameHidden: raw.name_hidden === true,
        saved: raw.saved === true,
        converted: raw.converted === true,
        upgraded: raw.upgraded === true,
        refunded: raw.refunded === true,
        canUpgrade: raw.can_upgrade === true,
        prepaidUpgrade: raw.prepaid_upgrade === true,
        upgradeSeparate: raw.upgrade_separate === true,
        auctionAcquired: raw.auction_acquired === true,
        convertStars: raw.convert_stars,
        upgradeStars: raw.upgrade_stars,
        upgradeMessageId: raw.upgrade_msg_id,
        giftMessageId: raw.gift_msg_id,
        prepaidUpgradeHash: raw.prepaid_upgrade_hash,
        number: raw.gift_num,
        raw,
      }
    case 'messageActionStarGiftUnique':
      return {
        kind: 'unique-gift-received',
        gift: raw.gift,
        message: formatted(raw.message),
        from: peerRefOf(raw.from_id),
        peer: peerRefOf(raw.peer),
        savedId: raw.saved_id,
        upgrade: raw.upgrade === true,
        transferred: raw.transferred === true,
        saved: raw.saved === true,
        refunded: raw.refunded === true,
        prepaidUpgrade: raw.prepaid_upgrade === true,
        assigned: raw.assigned === true,
        fromOffer: raw.from_offer === true,
        craft: raw.craft === true,
        nameHidden: raw.name_hidden === true,
        transferStars: raw.transfer_stars,
        resaleAmount: raw.resale_amount,
        dropOriginalDetailsStars: raw.drop_original_details_stars,
        canExportAt: raw.can_export_at,
        canTransferAt: raw.can_transfer_at,
        canResellAt: raw.can_resell_at,
        canCraftAt: raw.can_craft_at,
        raw,
      }
    case 'messageActionStarGiftPurchaseOffer':
      return {
        kind: 'gift-offer',
        gift: raw.gift,
        price: raw.price,
        expiresAt: raw.expires_at,
        accepted: raw.accepted === true,
        declined: raw.declined === true,
        raw,
      }
    case 'messageActionStarGiftPurchaseOfferDeclined':
      return {
        kind: 'gift-offer-declined',
        gift: raw.gift,
        price: raw.price,
        expired: raw.expired === true,
        raw,
      }
    default:
      return undefined
  }
}
