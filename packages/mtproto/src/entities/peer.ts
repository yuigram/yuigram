/**
 * Reading the people and conversations an answer names.
 *
 * A message says who sent it as `peerUser(5)` — a kind and a number, and
 * nothing a person would recognise. The name belongs to a `User` in the same
 * answer: every reply that carries messages carries `users` and `chats`
 * alongside them, and Telegram expects a client to put the two together.
 *
 * ```
 *   answer.messages[0].from_id ──> peerUser(5)
 *   answer.users            ────> user#31774388 id:5 first_name:"…"
 * ```
 *
 * These views read those two vectors, and {@link PeerIndex} is the join. It is
 * a separate step rather than something threaded through {@link MessageView}
 * for two reasons. A message read from an update has an index; a message read
 * from a stored copy may not, and a view whose accessors work only sometimes is
 * worse than one that never claims to know. And an index is per answer, not per
 * message — building one and reading many messages through it is the shape the
 * data already has.
 *
 * Like every view here, none of this reaches an account, a store or the
 * network. Resolving a peer that the answer did not include is a call, and a
 * call belongs on the client.
 */

import type {
  TypeChat,
  TypeChatAdminRights,
  TypeChatBannedRights,
  TypeChatPhoto,
  TypeEmojiStatus,
  TypePeerColor,
  TypeRestrictionReason,
  TypeUser,
  TypeUsername,
  TypeUserProfilePhoto,
  TypeUserStatus,
} from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'

/**
 * A person, read.
 *
 * `userEmpty` is a hole: a user the account is told about by number without
 * being given anything else. Accessors answer `undefined` there rather than
 * inventing a blank name.
 */
export class UserView {
  /** The value this reads. Everything else is a function of it. */
  readonly raw: TypeUser

  constructor(value: TypeUser) {
    this.raw = value
  }

  /** The number this person is known by. */
  get id(): bigint {
    return this.raw.id
  }

  /** This person as a reference, for comparing against what a message names. */
  get ref(): PeerRef {
    return { kind: 'user', id: this.raw.id }
  }

  /** Whether this is a hole rather than a person the answer described. */
  get isEmpty(): boolean {
    return this.raw._ === 'userEmpty'
  }

  /**
   * The hash that makes this person addressable, where the answer gave one.
   *
   * Absent for a user the account has no standing to address, and not to be
   * trusted when {@link UserView.isPartial} is true.
   */
  get accessHash(): bigint | undefined {
    return this.raw._ === 'user' ? this.raw.access_hash : undefined
  }

  /**
   * Whether the answer described this person only in outline.
   *
   * A partial user arrives as a side effect of something else — a member list,
   * a forward — and its access hash is not valid for addressing it. Storing one
   * over a full record loses the hash that worked.
   */
  get isPartial(): boolean {
    return this.raw._ === 'user' ? this.raw.min === true : false
  }

  /** Whether this is the signed-in account. */
  get isSelf(): boolean {
    return this.raw._ === 'user' ? this.raw.self === true : false
  }

  /** Whether this person is in the account's contacts. */
  get isContact(): boolean {
    return this.raw._ === 'user' ? this.raw.contact === true : false
  }

  /** Whether the two have each other in their contacts. */
  get isMutualContact(): boolean {
    return this.raw._ === 'user' ? this.raw.mutual_contact === true : false
  }

  /** Whether the account has this person in its close-friends list. */
  get isCloseFriend(): boolean {
    return this.raw._ === 'user' ? this.raw.close_friend === true : false
  }

  /** Whether the account was deleted. */
  get isDeleted(): boolean {
    return this.raw._ === 'user' ? this.raw.deleted === true : false
  }

  /** Whether this is a bot rather than a person. */
  get isBot(): boolean {
    return this.raw._ === 'user' ? this.raw.bot === true : false
  }

  /** Whether Telegram has verified the account. */
  get isVerified(): boolean {
    return this.raw._ === 'user' ? this.raw.verified === true : false
  }

  /** Whether it is a Telegram support account. */
  get isSupport(): boolean {
    return this.raw._ === 'user' ? this.raw.support === true : false
  }

  /** Whether it has been reported as impersonating someone. */
  get isScam(): boolean {
    return this.raw._ === 'user' ? this.raw.scam === true : false
  }

  /** Whether it has been reported as a fake of a real person or organisation. */
  get isFake(): boolean {
    return this.raw._ === 'user' ? this.raw.fake === true : false
  }

  /** Whether it is withheld somewhere. See {@link UserView.restrictions}. */
  get isRestricted(): boolean {
    return this.raw._ === 'user' ? this.raw.restricted === true : false
  }

  /** Whether the account has Premium. */
  get isPremium(): boolean {
    return this.raw._ === 'user' ? this.raw.premium === true : false
  }

  /** The given name, where the account has one. */
  get firstName(): string | undefined {
    return this.raw._ === 'user' ? this.raw.first_name : undefined
  }

  /** The family name, where the account has one. */
  get lastName(): string | undefined {
    return this.raw._ === 'user' ? this.raw.last_name : undefined
  }

  /** The main handle, where the account has one. */
  get username(): string | undefined {
    return this.raw._ === 'user' ? this.raw.username : undefined
  }

  /**
   * Every handle the account holds, where it holds more than one.
   *
   * The main one is in {@link UserView.username}. This carries the rest, each
   * with whether it is active, and is absent for an account with only the one.
   */
  get usernames(): readonly TypeUsername[] | undefined {
    return this.raw._ === 'user' ? this.raw.usernames : undefined
  }

  /** The phone number, where the account shares it. */
  get phone(): string | undefined {
    return this.raw._ === 'user' ? this.raw.phone : undefined
  }

  /**
   * A name to show.
   *
   * Both names where there are two, whichever exists where there is one, the
   * handle for an account with no name at all, and the number for a user the
   * answer described only by number. Never empty, because a caller showing this
   * has nothing to fall back to.
   */
  get displayName(): string {
    const first = this.firstName
    const last = this.lastName

    if (first !== undefined && last !== undefined) return `${first} ${last}`
    if (first !== undefined) return first
    if (last !== undefined) return last

    return this.username ?? String(this.raw.id)
  }

  /** The profile picture, where the account has one. */
  get photo(): TypeUserProfilePhoto | undefined {
    return this.raw._ === 'user' ? this.raw.photo : undefined
  }

  /** When the account was last seen, where the account shares it. */
  get status(): TypeUserStatus | undefined {
    return this.raw._ === 'user' ? this.raw.status : undefined
  }

  /** The emoji shown beside the name, where one is set. */
  get emojiStatus(): TypeEmojiStatus | undefined {
    return this.raw._ === 'user' ? this.raw.emoji_status : undefined
  }

  /** The colour chosen for the name and message accents, where one is chosen. */
  get color(): TypePeerColor | undefined {
    return this.raw._ === 'user' ? this.raw.color : undefined
  }

  /** The colour chosen for the profile page, where one is chosen. */
  get profileColor(): TypePeerColor | undefined {
    return this.raw._ === 'user' ? this.raw.profile_color : undefined
  }

  /** The account's language, where it is known. */
  get langCode(): string | undefined {
    return this.raw._ === 'user' ? this.raw.lang_code : undefined
  }

  /** Why the account is withheld, and where. */
  get restrictions(): readonly TypeRestrictionReason[] | undefined {
    return this.raw._ === 'user' ? this.raw.restriction_reason : undefined
  }

  /** What sending a message to this account costs, in stars, where it costs anything. */
  get sendPaidMessagesStars(): bigint | undefined {
    return this.raw._ === 'user' ? this.raw.send_paid_messages_stars : undefined
  }

  /** The newest story this account has posted, where it posts stories. */
  get storiesMaxId(): number | undefined {
    return this.raw._ === 'user' ? this.raw.stories_max_id?.max_id : undefined
  }

  /** Whether one of this account's stories is being broadcast live. */
  get hasLiveStory(): boolean {
    return this.raw._ === 'user' ? this.raw.stories_max_id?.live === true : false
  }

  /** Whether the account's stories are hidden from the main list. */
  get storiesHidden(): boolean {
    return this.raw._ === 'user' ? this.raw.stories_hidden === true : false
  }

  /**
   * Whether the answer withheld the account's stories.
   *
   * Distinct from having none: this says the answer did not carry them, so
   * {@link UserView.storiesMaxId} says nothing either way.
   */
  get storiesUnavailable(): boolean {
    return this.raw._ === 'user' ? this.raw.stories_unavailable === true : false
  }

  /** Whether writing to this account first requires Premium. */
  get contactRequiresPremium(): boolean {
    return this.raw._ === 'user' ? this.raw.contact_require_premium === true : false
  }

  /**
   * Which revision of the bot's description the answer knows.
   *
   * Present only for a bot. A cached description is out of date when this rises.
   */
  get botInfoVersion(): number | undefined {
    return this.raw._ === 'user' ? this.raw.bot_info_version : undefined
  }

  /** The placeholder a bot asks to show in the inline field, where it asks. */
  get botInlinePlaceholder(): string | undefined {
    return this.raw._ === 'user' ? this.raw.bot_inline_placeholder : undefined
  }

  /** Whether a bot receives every message in a group rather than only commands. */
  get botReadsAllGroupMessages(): boolean {
    return this.raw._ === 'user' ? this.raw.bot_chat_history === true : false
  }

  /** Whether a bot refuses to be added to groups. */
  get botRefusesGroups(): boolean {
    return this.raw._ === 'user' ? this.raw.bot_nochats === true : false
  }

  /** Whether a bot asks for the user's location with inline queries. */
  get botWantsGeo(): boolean {
    return this.raw._ === 'user' ? this.raw.bot_inline_geo === true : false
  }

  /** Whether this account may change the bot's settings. */
  get botCanEdit(): boolean {
    return this.raw._ === 'user' ? this.raw.bot_can_edit === true : false
  }

  /** Whether a bot offers business features. */
  get botHasBusiness(): boolean {
    return this.raw._ === 'user' ? this.raw.bot_business === true : false
  }

  /** Whether a bot has a main mini app. */
  get botHasMainApp(): boolean {
    return this.raw._ === 'user' ? this.raw.bot_has_main_app === true : false
  }

  /** Whether a bot can be added to the attachment menu. */
  get botHasAttachMenu(): boolean {
    return this.raw._ === 'user' ? this.raw.bot_attach_menu === true : false
  }

  /** Whether this account has enabled a bot's attachment-menu entry. */
  get botAttachMenuEnabled(): boolean {
    return this.raw._ === 'user' ? this.raw.attach_menu_enabled === true : false
  }

  /** Whether a bot sees forum topics as topics. */
  get botViewsForum(): boolean {
    return this.raw._ === 'user' ? this.raw.bot_forum_view === true : false
  }

  /** Whether a bot may manage forum topics. */
  get botManagesForumTopics(): boolean {
    return this.raw._ === 'user' ? this.raw.bot_forum_can_manage_topics === true : false
  }

  /** Roughly how many accounts use this bot each month, where it is reported. */
  get botActiveUsers(): number | undefined {
    return this.raw._ === 'user' ? this.raw.bot_active_users : undefined
  }

  /** The icon of whoever vouched for this account, where someone did. */
  get verifiedByIcon(): bigint | undefined {
    return this.raw._ === 'user' ? this.raw.bot_verification_icon : undefined
  }

  /**
   * Whether a cached photo may be kept when this record replaces an older one.
   *
   * Set on a partial user to say its photo is the real one even though the rest
   * of the record is an outline.
   */
  get applyPartialPhoto(): boolean {
    return this.raw._ === 'user' ? this.raw.apply_min_photo === true : false
  }

  /** The value again, so serializing a view serializes what it reads. */
  toJSON(): TypeUser {
    return this.raw
  }
}

/**
 * Which of the five a conversation is.
 *
 * Telegram puts basic groups, supergroups and broadcast channels in one union,
 * separated by flags rather than by constructor, so this is the question a
 * reader actually has.
 */
export type ChatForm = 'group' | 'supergroup' | 'broadcast' | 'community' | 'forbidden' | 'empty'

/**
 * A conversation with more than one person in it, read.
 *
 * The `Chat` union holds five constructors covering three different things: a
 * basic group, a supergroup or broadcast channel, and two kinds of hole — one
 * for a conversation the account was removed from, one for a conversation named
 * by number alone. {@link ChatView.form} is the single question that separates
 * them.
 */
export class ChatView {
  /** The value this reads. Everything else is a function of it. */
  readonly raw: TypeChat

  constructor(value: TypeChat) {
    this.raw = value
  }

  /** The number this conversation is known by. */
  get id(): bigint {
    return this.raw.id
  }

  /**
   * This conversation as a reference, for comparing against what a message
   * names.
   *
   * A basic group and a channel are different kinds even where their numbers
   * would collide, which is why this carries both halves.
   */
  get ref(): PeerRef {
    return { kind: this.isAddressedAsChannel ? 'channel' : 'chat', id: this.raw.id }
  }

  /** Which of the five this is. */
  get form(): ChatForm {
    switch (this.raw._) {
      case 'chatEmpty':
        return 'empty'
      case 'chatForbidden':
      case 'channelForbidden':
      case 'communityForbidden':
        return 'forbidden'
      case 'chat':
        return 'group'
      case 'community':
        return 'community'
      default:
        return this.raw.megagroup === true ? 'supergroup' : 'broadcast'
    }
  }

  /**
   * Whether this is a channel or supergroup rather than a basic group.
   *
   * A community is not one. It is addressed the same way — see
   * {@link ChatView.isAddressedAsChannel} — but it is a separate construct with
   * its own membership and its own methods, and a reader asking this question
   * is asking whether it may treat this as a channel, which it may not.
   */
  get isChannel(): boolean {
    return this.raw._ === 'channel' || this.raw._ === 'channelForbidden'
  }

  /**
   * Whether this is a community rather than a conversation.
   *
   * A community holds conversations; it is not one. Nothing is posted in it, it
   * has no history, and the calls that operate on it are its own — so a reader
   * that has one in hand and treats it as a supergroup will address the wrong
   * thing. {@link ChatView.form} says the same; this is the narrowing question.
   */
  get isCommunity(): boolean {
    return this.raw._ === 'community' || this.raw._ === 'communityForbidden'
  }

  /**
   * Whether addressing it takes an identifier and an access hash.
   *
   * True of a channel and of a community alike: both are named by
   * `inputChannel`, and a basic group by number alone. This is the question the
   * peer store answers with `kind`, kept separate from {@link ChatView.isChannel}
   * because the two stopped meaning the same thing when communities arrived.
   */
  get isAddressedAsChannel(): boolean {
    return this.isChannel || this.isCommunity
  }

  /** Whether this is a hole rather than a conversation the answer described. */
  get isEmpty(): boolean {
    return this.raw._ === 'chatEmpty'
  }

  /**
   * Whether the account cannot see inside.
   *
   * A forbidden conversation carries its title and nothing else: enough to show
   * that something is there, not enough to read it.
   */
  get isForbidden(): boolean {
    return (
      this.raw._ === 'chatForbidden' ||
      this.raw._ === 'channelForbidden' ||
      this.raw._ === 'communityForbidden'
    )
  }

  /** The name shown for it, where the answer carried one. */
  get title(): string | undefined {
    return this.raw._ === 'chatEmpty' ? undefined : this.raw.title
  }

  /**
   * The hash that makes this conversation addressable, where the answer gave
   * one.
   *
   * Only a channel has one; a basic group is addressed by number alone.
   */
  get accessHash(): bigint | undefined {
    switch (this.raw._) {
      case 'channel':
      case 'channelForbidden':
      case 'community':
      case 'communityForbidden':
        return this.raw.access_hash
      default:
        return undefined
    }
  }

  /**
   * Whether the answer described this conversation only in outline.
   *
   * As for a person: the access hash on a partial record is not valid for
   * addressing it.
   */
  get isPartial(): boolean {
    return this.raw._ === 'channel' || this.raw._ === 'community' ? this.raw.min === true : false
  }

  /** The main handle, where the conversation has one. */
  get username(): string | undefined {
    return this.raw._ === 'channel' ? this.raw.username : undefined
  }

  /** Every handle it holds, where it holds more than one. */
  get usernames(): readonly TypeUsername[] | undefined {
    return this.raw._ === 'channel' ? this.raw.usernames : undefined
  }

  /** The picture, where it has one. */
  get photo(): TypeChatPhoto | undefined {
    if (this.raw._ === 'chat' || this.raw._ === 'channel' || this.raw._ === 'community') {
      return this.raw.photo
    }

    return undefined
  }

  /** When it was created, in Unix seconds, where the answer says. */
  get date(): number | undefined {
    if (this.raw._ === 'chat' || this.raw._ === 'channel' || this.raw._ === 'community') {
      return this.raw.date
    }

    return undefined
  }

  /** How many people are in it, where the answer counts them. */
  get memberCount(): number | undefined {
    if (this.raw._ === 'chat') return this.raw.participants_count
    if (this.raw._ === 'channel') return this.raw.participants_count

    return undefined
  }

  /** Whether the account created it. */
  get isCreator(): boolean {
    if (this.raw._ === 'chat' || this.raw._ === 'channel' || this.raw._ === 'community') {
      return this.raw.creator === true
    }

    return false
  }

  /** Whether the account has left. */
  get hasLeft(): boolean {
    if (this.raw._ === 'chat' || this.raw._ === 'channel' || this.raw._ === 'community') {
      return this.raw.left === true
    }

    return false
  }

  /**
   * Whether a community is shown collapsed in the conversation list.
   *
   * A community's own field, and the one {@link toggleCommunityCollapsed}
   * changes. Absent rather than false for anything that is not a community, so
   * a reader cannot mistake "not applicable" for "expanded".
   */
  get isCollapsedInDialogs(): boolean | undefined {
    return this.raw._ === 'community' ? this.raw.collapsed_in_dialogs === true : undefined
  }

  /**
   * Whether a basic group was closed down.
   *
   * Usually because it was upgraded to a supergroup, in which case
   * {@link ChatView.migratedTo} names what replaced it.
   */
  get isDeactivated(): boolean {
    return this.raw._ === 'chat' ? this.raw.deactivated === true : false
  }

  /** Whether it is a broadcast channel rather than a group of any kind. */
  get isBroadcast(): boolean {
    if (this.raw._ === 'channel' || this.raw._ === 'channelForbidden') {
      return this.raw.broadcast === true
    }

    return false
  }

  /** Whether it is a supergroup rather than a broadcast channel or basic group. */
  get isSupergroup(): boolean {
    if (this.raw._ === 'channel' || this.raw._ === 'channelForbidden') {
      return this.raw.megagroup === true
    }

    return false
  }

  /** Whether it is a broadcast group — a supergroup that only admins may post in. */
  get isGigagroup(): boolean {
    return this.raw._ === 'channel' ? this.raw.gigagroup === true : false
  }

  /** Whether it is organised into topics. */
  get isForum(): boolean {
    return this.raw._ === 'channel' ? this.raw.forum === true : false
  }

  /** Whether topics are shown as tabs rather than as a list. */
  get hasForumTabs(): boolean {
    return this.raw._ === 'channel' ? this.raw.forum_tabs === true : false
  }

  /** Whether it is a direct-messages channel attached to another. */
  get isMonoforum(): boolean {
    if (this.raw._ === 'channel' || this.raw._ === 'channelForbidden') {
      return this.raw.monoforum === true
    }

    return false
  }

  /** The channel this one carries direct messages for, where it carries any. */
  get linkedMonoforumId(): bigint | undefined {
    return this.raw._ === 'channel' ? this.raw.linked_monoforum_id : undefined
  }

  /** Whether Telegram has verified it. */
  get isVerified(): boolean {
    return this.raw._ === 'channel' ? this.raw.verified === true : false
  }

  /** Whether it has been reported as impersonating someone. */
  get isScam(): boolean {
    return this.raw._ === 'channel' ? this.raw.scam === true : false
  }

  /** Whether it has been reported as a fake of a real organisation. */
  get isFake(): boolean {
    return this.raw._ === 'channel' ? this.raw.fake === true : false
  }

  /** Whether it is withheld somewhere. See {@link ChatView.restrictions}. */
  get isRestricted(): boolean {
    return this.raw._ === 'channel' ? this.raw.restricted === true : false
  }

  /** Why it is withheld, and where. */
  get restrictions(): readonly TypeRestrictionReason[] | undefined {
    return this.raw._ === 'channel' ? this.raw.restriction_reason : undefined
  }

  /** Whether forwarding out of it is refused. */
  get isContentProtected(): boolean {
    if (this.raw._ === 'chat' || this.raw._ === 'channel') return this.raw.noforwards === true

    return false
  }

  /** Whether it has a discussion group or a channel it discusses. */
  get hasLinkedChat(): boolean {
    return this.raw._ === 'channel' ? this.raw.has_link === true : false
  }

  /** Whether it has a location attached. */
  get hasGeo(): boolean {
    return this.raw._ === 'channel' ? this.raw.has_geo === true : false
  }

  /** Whether posts are signed with their author's name. */
  get signsMessages(): boolean {
    return this.raw._ === 'channel' ? this.raw.signatures === true : false
  }

  /** Whether a signed post links to the author's profile. */
  get signaturesShowProfile(): boolean {
    return this.raw._ === 'channel' ? this.raw.signature_profiles === true : false
  }

  /** Whether posts are offered translated. */
  get hasAutotranslation(): boolean {
    return this.raw._ === 'channel' ? this.raw.autotranslation === true : false
  }

  /** Whether messages may be sent to it from its linked channel. */
  get allowsBroadcastMessages(): boolean {
    return this.raw._ === 'channel' ? this.raw.broadcast_messages_allowed === true : false
  }

  /** Whether a wait between messages is enforced. */
  get hasSlowMode(): boolean {
    return this.raw._ === 'channel' ? this.raw.slowmode_enabled === true : false
  }

  /** Whether joining is required before writing. */
  get requiresJoinToSend(): boolean {
    return this.raw._ === 'channel' ? this.raw.join_to_send === true : false
  }

  /** Whether joining needs approval. */
  get requiresJoinRequest(): boolean {
    return this.raw._ === 'channel' ? this.raw.join_request === true : false
  }

  /** Whether a group call is running. */
  get hasActiveCall(): boolean {
    if (this.raw._ === 'chat' || this.raw._ === 'channel') return this.raw.call_active === true

    return false
  }

  /** Whether anyone is in the group call. */
  get callHasParticipants(): boolean {
    if (this.raw._ === 'chat' || this.raw._ === 'channel') return this.raw.call_not_empty === true

    return false
  }

  /** What the account may do as an administrator, where it is one. */
  get adminRights(): TypeChatAdminRights | undefined {
    if (this.raw._ === 'chat' || this.raw._ === 'channel' || this.raw._ === 'community') {
      return this.raw.admin_rights
    }

    return undefined
  }

  /** What the account is barred from doing, where it is barred from anything. */
  get bannedRights(): TypeChatBannedRights | undefined {
    return this.raw._ === 'channel' ? this.raw.banned_rights : undefined
  }

  /** What everyone is barred from doing by default. */
  get defaultBannedRights(): TypeChatBannedRights | undefined {
    if (this.raw._ === 'chat' || this.raw._ === 'channel' || this.raw._ === 'community') {
      return this.raw.default_banned_rights
    }

    return undefined
  }

  /** The supergroup a basic group became, where it became one. */
  get migratedTo(): TypeChat['_'] extends never ? never : bigint | undefined {
    if (this.raw._ !== 'chat') return undefined

    const target = this.raw.migrated_to

    return target?._ === 'inputChannel' || target?._ === 'inputChannelFromMessage'
      ? target.channel_id
      : undefined
  }

  /** The colour chosen for the name and message accents, where one is chosen. */
  get color(): TypePeerColor | undefined {
    return this.raw._ === 'channel' ? this.raw.color : undefined
  }

  /** The colour chosen for the profile page, where one is chosen. */
  get profileColor(): TypePeerColor | undefined {
    return this.raw._ === 'channel' ? this.raw.profile_color : undefined
  }

  /** The emoji shown beside the name, where one is set. */
  get emojiStatus(): TypeEmojiStatus | undefined {
    return this.raw._ === 'channel' ? this.raw.emoji_status : undefined
  }

  /** How many boosts it has been given, where it counts them. */
  get boostLevel(): number | undefined {
    return this.raw._ === 'channel' ? this.raw.level : undefined
  }

  /** When a paid subscription to it runs out, where the account has one. */
  get subscriptionUntil(): number | undefined {
    return this.raw._ === 'channel' ? this.raw.subscription_until_date : undefined
  }

  /** What sending a message to it costs, in stars, where it costs anything. */
  get sendPaidMessagesStars(): bigint | undefined {
    return this.raw._ === 'channel' ? this.raw.send_paid_messages_stars : undefined
  }

  /** The newest story it has posted, where it posts stories. */
  get storiesMaxId(): number | undefined {
    return this.raw._ === 'channel' ? this.raw.stories_max_id?.max_id : undefined
  }

  /** Whether one of its stories is being broadcast live. */
  get hasLiveStory(): boolean {
    return this.raw._ === 'channel' ? this.raw.stories_max_id?.live === true : false
  }

  /**
   * Whether its stories are hidden from the main list.
   *
   * `undefined` where the record does not say. A partial record carries a
   * companion flag marking this one as unpopulated, and reading `false` off an
   * absent flag would turn "not told" into "no".
   */
  get storiesHidden(): boolean | undefined {
    if (this.raw._ !== 'channel') return undefined
    if (this.raw.stories_hidden_min === true) return undefined

    return this.raw.stories_hidden === true
  }

  /** Whether the answer withheld its stories. */
  get storiesUnavailable(): boolean {
    return this.raw._ === 'channel' ? this.raw.stories_unavailable === true : false
  }

  /** The icon of whoever vouched for it, where someone did. */
  get verifiedByIcon(): bigint | undefined {
    return this.raw._ === 'channel' ? this.raw.bot_verification_icon : undefined
  }

  /** When access to a forbidden channel is restored, where it is temporary. */
  get forbiddenUntil(): number | undefined {
    return this.raw._ === 'channelForbidden' ? this.raw.until_date : undefined
  }

  /**
   * How many times a basic group's member list has changed.
   *
   * Telegram uses this to decide whether a cached list is stale. It is a
   * bookkeeping number rather than a fact about the conversation, which is why
   * nothing else here exposes it — a reader comparing two of them is doing the
   * cache's job.
   */
  get participantsVersion(): number | undefined {
    return this.raw._ === 'chat' ? this.raw.version : undefined
  }

  /** The value again, so serializing a view serializes what it reads. */
  toJSON(): TypeChat {
    return this.raw
  }
}

/** Read a person. Takes what an answer carries, including nothing. */
export function readUser(value: TypeUser | undefined): UserView | undefined {
  return value === undefined ? undefined : new UserView(value)
}

/** Read a conversation. Takes what an answer carries, including nothing. */
export function readChat(value: TypeChat | undefined): ChatView | undefined {
  return value === undefined ? undefined : new ChatView(value)
}

/** What an answer that names people and conversations looks like. */
export interface PeerBearing {
  readonly users?: readonly TypeUser[]
  readonly chats?: readonly TypeChat[]
}

/**
 * The people and conversations one answer named, addressable by reference.
 *
 * Built once per answer and read many times. Lookups go by {@link PeerRef}, so
 * a number that means a person and a number that means a group stay apart even
 * where the numbers are equal.
 *
 * ```ts
 * const people = readPeers(answer)
 *
 * for (const value of answer.messages) {
 *   const message = readMessage(value)
 *   const sender = people.user(message?.sender)
 *
 *   console.log(sender?.displayName, message?.text)
 * }
 * ```
 *
 * A reference the answer did not describe reads as `undefined`. That is not a
 * failure to look it up: the answer did not carry it, and finding out means
 * asking, which is a call on the client rather than a lookup here.
 */
export class PeerIndex {
  readonly #users = new Map<bigint, UserView>()
  readonly #chats = new Map<bigint, ChatView>()
  readonly #channels = new Map<bigint, ChatView>()

  constructor(source: PeerBearing) {
    for (const value of source.users ?? []) {
      this.#users.set(value.id, new UserView(value))
    }

    for (const value of source.chats ?? []) {
      const view = new ChatView(value)
      const into = view.isChannel ? this.#channels : this.#chats

      into.set(value.id, view)
    }
  }

  /** How many people and conversations the answer described. */
  get size(): number {
    return this.#users.size + this.#chats.size + this.#channels.size
  }

  /** Everyone the answer described. */
  users(): IterableIterator<UserView> {
    return this.#users.values()
  }

  /** Every conversation the answer described, groups and channels alike. */
  chats(): IterableIterator<ChatView> {
    const groups = this.#chats.values()
    const channels = this.#channels.values()

    return (function* both() {
      yield* groups
      yield* channels
    })()
  }

  /** The person a reference names, where the answer described one. */
  user(ref: PeerRef | undefined): UserView | undefined {
    return ref?.kind === 'user' ? this.#users.get(ref.id) : undefined
  }

  /** The conversation a reference names, where the answer described one. */
  chat(ref: PeerRef | undefined): ChatView | undefined {
    if (ref === undefined) return undefined
    if (ref.kind === 'channel') return this.#channels.get(ref.id)

    return ref.kind === 'chat' ? this.#chats.get(ref.id) : undefined
  }

  /**
   * Whatever a reference names, without knowing which of the two it is.
   *
   * For a reader that has a reference off a message and wants a name for it.
   */
  get(ref: PeerRef | undefined): UserView | ChatView | undefined {
    return this.user(ref) ?? this.chat(ref)
  }

  /**
   * A name to show for whatever a reference names.
   *
   * The person's name, the conversation's title, or `undefined` where the
   * answer described neither — which is the case a caller has to handle, and
   * an invented placeholder would hide.
   */
  name(ref: PeerRef | undefined): string | undefined {
    const found = this.get(ref)
    if (found === undefined) return undefined

    return found instanceof UserView ? found.displayName : found.title
  }
}

/**
 * Index the people and conversations an answer named.
 *
 * Works on anything carrying `users` and `chats`, which is every answer that
 * carries messages and every update container.
 */
export function readPeers(source: PeerBearing): PeerIndex {
  return new PeerIndex(source)
}
