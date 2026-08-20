// GENERATED FILE — do not edit.
// Per-event context field shapes
// Source: Telegram Bot API 10.2, schemas/bot-api/10.2.json

import type { UpdateEventKind } from './events.js'
import type { Animation, Audio, BotSubscriptionUpdated, BusinessBotRights, BusinessConnection, BusinessMessagesDeleted, CallbackQuery, Chat, ChatBackground, ChatBoost, ChatBoostAdded, ChatBoostRemoved, ChatBoostSource, ChatBoostUpdated, ChatInviteLink, ChatJoinRequest, ChatMember, ChatMemberUpdated, ChatOwnerChanged, ChatOwnerLeft, ChatShared, Checklist, ChecklistTasksAdded, ChecklistTasksDone, ChosenInlineResult, CommunityChatAdded, CommunityChatRemoved, Contact, Dice, DirectMessagePriceChanged, DirectMessagesTopic, Document, ExternalReplyInfo, ForumTopicClosed, ForumTopicCreated, ForumTopicEdited, ForumTopicReopened, Game, GeneralForumTopicHidden, GeneralForumTopicUnhidden, GiftInfo, Giveaway, GiveawayCompleted, GiveawayCreated, GiveawayWinners, InlineKeyboardMarkup, InlineQuery, Invoice, LinkPreviewOptions, LivePhoto, Location, ManagedBotCreated, ManagedBotUpdated, MaybeInaccessibleMessage, Message, MessageAutoDeleteTimerChanged, MessageEntity, MessageOrigin, MessageReactionCountUpdated, MessageReactionUpdated, OrderInfo, PaidMediaInfo, PaidMediaPurchased, PaidMessagePriceChanged, PassportData, PhotoSize, Poll, PollAnswer, PollMedia, PollOption, PollOptionAdded, PollOptionDeleted, PreCheckoutQuery, ProximityAlertTriggered, ReactionCount, ReactionType, RefundedPayment, RichMessage, ShippingAddress, ShippingQuery, Sticker, Story, SuccessfulPayment, SuggestedPostApprovalFailed, SuggestedPostApproved, SuggestedPostDeclined, SuggestedPostInfo, SuggestedPostPaid, SuggestedPostRefunded, TextQuote, UniqueGiftInfo, User, UsersShared, Venue, Video, VideoChatEnded, VideoChatParticipantsInvited, VideoChatScheduled, VideoChatStarted, VideoNote, Voice, WebAppData, WriteAccessAllowed } from './types/index.js'

/**
 * Fields carried by `BotSubscriptionUpdated`, projected onto the context for
 * the `subscription` event: `subscription`.
 */
export interface BotSubscriptionUpdatedEventFields {
  /** The whole payload, under a domain name. */
  readonly subscription: BotSubscriptionUpdated

  /** Who caused this. Telegram spells it `user` on this payload. */
  readonly sender: User

  /**
   * Bot-specified invoice payload
   */
  readonly invoice_payload: string
  /**
   * The new state of the subscription. Currently, it can be one of “canceled” if
   * the user canceled the subscription, “active” if the user re-enabled a
   * previously canceled subscription, or “failed” if payment for the
   * subscription failed.
   */
  readonly state: string
}

/**
 * Fields carried by `BusinessConnection`, projected onto the context for the
 * `business_connection` event: `business_connection`.
 */
export interface BusinessConnectionEventFields {
  /** The whole payload, under a domain name. */
  readonly connection: BusinessConnection

  /** Who caused this. Telegram spells it `user` on this payload. */
  readonly sender: User

  /**
   * Unique identifier of the business connection
   */
  readonly id: string
  /**
   * Identifier of a private chat with the user who created the business
   * connection. This number may have more than 32 significant bits and some
   * programming languages may have difficulty/silent defects in interpreting it.
   * But it has at most 52 significant bits, so a 64-bit integer or
   * double-precision float type are safe for storing this identifier.
   */
  readonly user_chat_id: number
  /**
   * Date the connection was established in Unix time
   */
  readonly date: number
  /**
   * Rights of the business bot
   */
  readonly rights?: BusinessBotRights | undefined
  /**
   * True, if the connection is active
   */
  readonly is_enabled: boolean
}

/**
 * Fields carried by `BusinessMessagesDeleted`, projected onto the context for
 * the `business_messages_deleted` event: `business_messages_deleted`.
 */
export interface BusinessMessagesDeletedEventFields {
  /** The whole payload, under a domain name. */
  readonly deletion: BusinessMessagesDeleted

  /**
   * Unique identifier of the business connection
   */
  readonly business_connection_id: string
  /**
   * Information about a chat in the business account. The bot may not have
   * access to the chat or the corresponding user.
   */
  readonly chat: Chat
  /**
   * The list of identifiers of deleted messages in the chat of the business
   * account
   */
  readonly message_ids: number[]
}

/**
 * Fields carried by `CallbackQuery`, projected onto the context for the
 * `callback_query` event: `callback_query`.
 */
export interface CallbackQueryEventFields {
  /** The whole payload, under a domain name. */
  readonly query: CallbackQuery

  /** Who caused this. Telegram spells it `from` on this payload. */
  readonly sender: User

  /**
   * Unique identifier for this query
   */
  readonly id: string
  /**
   * Message sent by the bot with the callback button that originated the query
   */
  readonly message?: MaybeInaccessibleMessage | undefined
  /**
   * Identifier of the message sent via the bot in inline mode, that originated
   * the query
   */
  readonly inline_message_id?: string | undefined
  /**
   * Global identifier, uniquely corresponding to the chat to which the message
   * with the callback button was sent. Useful for high scores in games.
   */
  readonly chat_instance: string
  /**
   * Data associated with the callback button. Be aware that the message
   * originated the query can contain no callback buttons with this data.
   */
  readonly data?: string | undefined
  /**
   * Short name of a Game to be returned, serves as the unique identifier for the
   * game
   */
  readonly game_short_name?: string | undefined
}

/**
 * Fields carried by `ChatBoostRemoved`, projected onto the context for the
 * `chat_boost_removed` event: `chat_boost_removed`.
 */
export interface ChatBoostRemovedEventFields {
  /** The whole payload, under a domain name. */
  readonly removal: ChatBoostRemoved

  /**
   * Chat which was boosted
   */
  readonly chat: Chat
  /**
   * Unique identifier of the boost
   */
  readonly boost_id: string
  /**
   * Point in time (Unix timestamp) when the boost was removed
   */
  readonly remove_date: number
  /**
   * Source of the removed boost
   */
  readonly source: ChatBoostSource
}

/**
 * Fields carried by `ChatBoostUpdated`, projected onto the context for the
 * `chat_boost` event: `chat_boost`.
 */
export interface ChatBoostUpdatedEventFields {
  /** The whole payload, under a domain name. */
  readonly boostUpdate: ChatBoostUpdated

  /**
   * Chat which was boosted
   */
  readonly chat: Chat
  /**
   * Information about the chat boost
   */
  readonly boost: ChatBoost
}

/**
 * Fields carried by `ChatJoinRequest`, projected onto the context for the
 * `chat_join_request` event: `chat_join_request`.
 */
export interface ChatJoinRequestEventFields {
  /** The whole payload, under a domain name. */
  readonly request: ChatJoinRequest

  /** Who caused this. Telegram spells it `from` on this payload. */
  readonly sender: User

  /**
   * Chat to which the request was sent
   */
  readonly chat: Chat
  /**
   * Identifier of a private chat with the user who sent the join request. This
   * number may have more than 32 significant bits and some programming languages
   * may have difficulty/silent defects in interpreting it. But it has at most 52
   * significant bits, so a 64-bit integer or double-precision float type are
   * safe for storing this identifier. The bot can use this identifier for 5
   * minutes to send messages until the join request is processed, assuming no
   * other administrator contacted the user.
   */
  readonly user_chat_id: number
  /**
   * Date the request was sent in Unix time
   */
  readonly date: number
  /**
   * Bio of the user
   */
  readonly bio?: string | undefined
  /**
   * Chat invite link that was used by the user to send the join request
   */
  readonly invite_link?: ChatInviteLink | undefined
  /**
   * Identifier of the join request query; for bots assigned to process join
   * requests only. If present, then the bot must call sendChatJoinRequestWebApp
   * or directly call answerChatJoinRequestQuery within 10 seconds.
   */
  readonly query_id?: string | undefined
}

/**
 * Fields carried by `ChatMemberUpdated`, projected onto the context for 2
 * event kinds: `chat_member`, `my_chat_member`.
 */
export interface ChatMemberUpdatedEventFields {
  /** The whole payload, under a domain name. */
  readonly update: ChatMemberUpdated

  /** Who caused this. Telegram spells it `from` on this payload. */
  readonly sender: User

  /**
   * Chat the user belongs to
   */
  readonly chat: Chat
  /**
   * Date the change was done in Unix time
   */
  readonly date: number
  /**
   * Previous information about the chat member
   */
  readonly old_chat_member: ChatMember
  /**
   * New information about the chat member
   */
  readonly new_chat_member: ChatMember
  /**
   * Chat invite link, which was used by the user to join the chat; for joining
   * by invite link events only
   */
  readonly invite_link?: ChatInviteLink | undefined
  /**
   * True, if the user joined the chat after sending a direct join request
   * without using an invite link and being approved by an administrator
   */
  readonly via_join_request?: boolean | undefined
  /**
   * True, if the user joined the chat via a chat folder invite link
   */
  readonly via_chat_folder_invite_link?: boolean | undefined
}

/**
 * Fields carried by `ChosenInlineResult`, projected onto the context for the
 * `inline_result_chosen` event: `inline_result_chosen`.
 */
export interface ChosenInlineResultEventFields {
  /** The whole payload, under a domain name. */
  readonly chosenResult: ChosenInlineResult

  /** Who caused this. Telegram spells it `from` on this payload. */
  readonly sender: User

  /**
   * The unique identifier for the result that was chosen
   */
  readonly result_id: string
  /**
   * Sender location, only for bots that require user location
   */
  readonly location?: Location | undefined
  /**
   * Identifier of the sent inline message. Available only if there is an inline
   * keyboard attached to the message. Will be also received in callback queries
   * and can be used to edit the message.
   */
  readonly inline_message_id?: string | undefined
  /**
   * The query that was used to obtain the result
   */
  readonly query: string
}

/**
 * Fields carried by `InlineQuery`, projected onto the context for the
 * `inline_query` event: `inline_query`.
 */
export interface InlineQueryEventFields {
  /** The whole payload, under a domain name. */
  readonly inlineQuery: InlineQuery

  /** Who caused this. Telegram spells it `from` on this payload. */
  readonly sender: User

  /**
   * Unique identifier for this query
   */
  readonly id: string
  /**
   * Text of the query (up to 256 characters)
   */
  readonly query: string
  /**
   * Offset of the results to be returned, can be controlled by the bot
   */
  readonly offset: string
  /**
   * Type of the chat from which the inline query was sent. Can be either
   * “sender” for a private chat with the inline query sender, “private”,
   * “group”, “supergroup”, or “channel”. The chat type should be always known
   * for requests sent from official clients and most third-party clients, unless
   * the request was sent from a secret chat.
   */
  readonly chat_type?: string | undefined
  /**
   * Sender location, only for bots that request user location
   */
  readonly location?: Location | undefined
}

/**
 * Fields carried by `ManagedBotUpdated`, projected onto the context for the
 * `managed_bot` event: `managed_bot`.
 */
export interface ManagedBotUpdatedEventFields {
  /** The whole payload, under a domain name. */
  readonly update: ManagedBotUpdated

  /** Who caused this. Telegram spells it `user` on this payload. */
  readonly sender: User

  /**
   * Information about the bot. Token of the bot can be fetched using the method
   * getManagedBotToken.
   */
  readonly bot: User
}

/**
 * Fields carried by `Message`, projected onto the context for 7 event kinds:
 * `business_message`, `business_message_edited`, `channel_post`,
 * `channel_post_edited`, `guest_message`, `message`, `message_edited`.
 */
export interface MessageEventFields {
  /** The whole payload, under a domain name. */
  readonly message: Message

  /** Who caused this. Telegram spells it `from` on this payload. */
  readonly sender: User | undefined

  /**
   * Unique message identifier inside this chat; 0 for ephemeral messages. In
   * specific instances (e.g., a message containing a video sent to a big chat),
   * the server might automatically schedule a message instead of sending it
   * immediately. In such cases, this field will be 0 and the relevant message
   * will be unusable until it is actually sent.
   */
  readonly message_id: number
  /**
   * Unique identifier of a message thread or forum topic to which the message
   * belongs; for supergroups and private chats only
   */
  readonly message_thread_id?: number | undefined
  /**
   * Information about the direct messages chat topic that contains the message
   */
  readonly direct_messages_topic?: DirectMessagesTopic | undefined
  /**
   * Sender of the message when sent on behalf of a chat. For example, the
   * supergroup itself for messages sent by its anonymous administrators or a
   * linked channel for messages automatically forwarded to the channel's
   * discussion group. For backward compatibility, if the message was sent on
   * behalf of a chat, the field from contains a fake sender user in non-channel
   * chats.
   */
  readonly sender_chat?: Chat | undefined
  /**
   * If the sender of the message boosted the chat, the number of boosts added by
   * the user
   */
  readonly sender_boost_count?: number | undefined
  /**
   * The bot that actually sent the message on behalf of the business account.
   * Available only for outgoing messages sent on behalf of the connected
   * business account.
   */
  readonly sender_business_bot?: User | undefined
  /**
   * Tag or custom title of the sender of the message; for supergroups only
   */
  readonly sender_tag?: string | undefined
  /**
   * For ephemeral messages, the user who received the message
   */
  readonly receiver_user?: User | undefined
  /**
   * For ephemeral messages, identifier of the ephemeral message inside this
   * chat. The identifier may be reused for another ephemeral message after the
   * message is deleted or expires.
   */
  readonly ephemeral_message_id?: number | undefined
  /**
   * Date the message was sent in Unix time. It is always a positive number,
   * representing a valid date.
   */
  readonly date: number
  /**
   * The unique identifier for the guest query. Use this identifier with the
   * method answerGuestQuery to send a response message. If non-empty, the
   * message belongs to the chat where the guest bot was summoned, which may not
   * coincide with other existing bot chats sharing the same identifier.
   */
  readonly guest_query_id?: string | undefined
  /**
   * Unique identifier of the business connection from which the message was
   * received. If non-empty, the message belongs to a chat of the corresponding
   * business account that is independent from any potential bot chat which might
   * share the same identifier.
   */
  readonly business_connection_id?: string | undefined
  /**
   * Chat the message belongs to
   */
  readonly chat: Chat
  /**
   * Information about the original message for forwarded messages
   */
  readonly forward_origin?: MessageOrigin | undefined
  /**
   * True, if the message is sent to a topic in a forum supergroup or a private
   * chat with the bot
   */
  readonly is_topic_message?: true | undefined
  /**
   * True, if the message is a channel post that was automatically forwarded to
   * the connected discussion group
   */
  readonly is_automatic_forward?: true | undefined
  /**
   * For replies in the same chat and message thread, the original message. Note
   * that the Message object in this field will not contain further
   * reply_to_message fields even if it itself is a reply. If the message is a
   * reply to an ephemeral message, then this field may be omitted.
   */
  readonly reply_to_message?: Message | undefined
  /**
   * Information about the message that is being replied to, which may come from
   * another chat or forum topic
   */
  readonly external_reply?: ExternalReplyInfo | undefined
  /**
   * For replies that quote part of the original message, the quoted part of the
   * message
   */
  readonly quote?: TextQuote | undefined
  /**
   * For replies to a story, the original story
   */
  readonly reply_to_story?: Story | undefined
  /**
   * Identifier of the specific checklist task that is being replied to
   */
  readonly reply_to_checklist_task_id?: number | undefined
  /**
   * Persistent identifier of the specific poll option that is being replied to
   */
  readonly reply_to_poll_option_id?: string | undefined
  /**
   * Bot through which the message was sent
   */
  readonly via_bot?: User | undefined
  /**
   * For a message sent by a guest bot, this is the user whose original message
   * triggered the bot's response
   */
  readonly guest_bot_caller_user?: User | undefined
  /**
   * For a message sent by a guest bot, this is the chat whose original message
   * triggered the bot's response
   */
  readonly guest_bot_caller_chat?: Chat | undefined
  /**
   * Date the message was last edited in Unix time
   */
  readonly edit_date?: number | undefined
  /**
   * True, if the message can't be forwarded
   */
  readonly has_protected_content?: true | undefined
  /**
   * True, if the message was sent by an implicit action, for example, as an away
   * or a greeting business message, or as a scheduled message
   */
  readonly is_from_offline?: true | undefined
  /**
   * True, if the message is a paid post. Note that such posts must not be
   * deleted for 24 hours to receive the payment and can't be edited.
   */
  readonly is_paid_post?: true | undefined
  /**
   * The unique identifier inside this chat of a media message group this message
   * belongs to
   */
  readonly media_group_id?: string | undefined
  /**
   * Signature of the post author for messages in channels, or the custom title
   * of an anonymous group administrator
   */
  readonly author_signature?: string | undefined
  /**
   * The number of Telegram Stars that were paid by the sender of the message to
   * send it
   */
  readonly paid_star_count?: number | undefined
  /**
   * For text messages, the actual UTF-8 text of the message
   */
  readonly text?: string | undefined
  /**
   * For text messages, special entities like usernames, URLs, bot commands, etc.
   * that appear in the text
   */
  readonly entities?: MessageEntity[] | undefined
  /**
   * Options used for link preview generation for the message, if it is a text
   * message and link preview options were changed
   */
  readonly link_preview_options?: LinkPreviewOptions | undefined
  /**
   * Information about suggested post parameters if the message is a suggested
   * post in a channel direct messages chat. If the message is an approved or
   * declined suggested post, then it can't be edited.
   */
  readonly suggested_post_info?: SuggestedPostInfo | undefined
  /**
   * Unique identifier of the message effect added to the message
   */
  readonly effect_id?: string | undefined
  /**
   * Message is a rich formatted message
   */
  readonly rich_message?: RichMessage | undefined
  /**
   * Message is an animation, information about the animation. For backward
   * compatibility, when this field is set, the document field will also be set.
   */
  readonly animation?: Animation | undefined
  /**
   * Message is an audio file, information about the file
   */
  readonly audio?: Audio | undefined
  /**
   * Message is a general file, information about the file
   */
  readonly document?: Document | undefined
  /**
   * Message is a live photo, information about the live photo. For backward
   * compatibility, when this field is set, the photo field will also be set.
   */
  readonly live_photo?: LivePhoto | undefined
  /**
   * Message contains paid media; information about the paid media
   */
  readonly paid_media?: PaidMediaInfo | undefined
  /**
   * Message is a photo, available sizes of the photo
   */
  readonly photo?: PhotoSize[] | undefined
  /**
   * Message is a sticker, information about the sticker
   */
  readonly sticker?: Sticker | undefined
  /**
   * Message is a forwarded story
   */
  readonly story?: Story | undefined
  /**
   * Message is a video, information about the video
   */
  readonly video?: Video | undefined
  /**
   * Message is a video note, information about the video message
   */
  readonly video_note?: VideoNote | undefined
  /**
   * Message is a voice message, information about the file
   */
  readonly voice?: Voice | undefined
  /**
   * Caption for the animation, audio, document, paid media, photo, video or
   * voice
   */
  readonly caption?: string | undefined
  /**
   * For messages with a caption, special entities like usernames, URLs, bot
   * commands, etc. that appear in the caption
   */
  readonly caption_entities?: MessageEntity[] | undefined
  /**
   * True, if the caption must be shown above the message media
   */
  readonly show_caption_above_media?: true | undefined
  /**
   * True, if the message media is covered by a spoiler animation
   */
  readonly has_media_spoiler?: true | undefined
  /**
   * Message is a checklist
   */
  readonly checklist?: Checklist | undefined
  /**
   * Message is a shared contact, information about the contact
   */
  readonly contact?: Contact | undefined
  /**
   * Message is a dice with random value
   */
  readonly dice?: Dice | undefined
  /**
   * Message is a game, information about the game. More about games »
   */
  readonly game?: Game | undefined
  /**
   * Message is a native poll, information about the poll
   */
  readonly poll?: Poll | undefined
  /**
   * Message is a venue, information about the venue. For backward compatibility,
   * when this field is set, the location field will also be set.
   */
  readonly venue?: Venue | undefined
  /**
   * Message is a shared location, information about the location
   */
  readonly location?: Location | undefined
  /**
   * New members that were added to the group or supergroup and information about
   * them (the bot itself may be one of these members)
   */
  readonly new_chat_members?: User[] | undefined
  /**
   * A member was removed from the group, information about them (this member may
   * be the bot itself)
   */
  readonly left_chat_member?: User | undefined
  /**
   * Service message: chat owner has left
   */
  readonly chat_owner_left?: ChatOwnerLeft | undefined
  /**
   * Service message: chat owner has changed
   */
  readonly chat_owner_changed?: ChatOwnerChanged | undefined
  /**
   * A chat title was changed to this value
   */
  readonly new_chat_title?: string | undefined
  /**
   * A chat photo was change to this value
   */
  readonly new_chat_photo?: PhotoSize[] | undefined
  /**
   * Service message: the chat photo was deleted
   */
  readonly delete_chat_photo?: true | undefined
  /**
   * Service message: the group has been created
   */
  readonly group_chat_created?: true | undefined
  /**
   * Service message: the supergroup has been created. This field can't be
   * received in a message coming through updates, because bot can't be a member
   * of a supergroup when it is created. It can only be found in reply_to_message
   * if someone replies to a very first message in a directly created supergroup.
   */
  readonly supergroup_chat_created?: true | undefined
  /**
   * Service message: the channel has been created. This field can't be received
   * in a message coming through updates, because bot can't be a member of a
   * channel when it is created. It can only be found in reply_to_message if
   * someone replies to a very first message in a channel.
   */
  readonly channel_chat_created?: true | undefined
  /**
   * Service message: auto-delete timer settings changed in the chat
   */
  readonly message_auto_delete_timer_changed?: MessageAutoDeleteTimerChanged | undefined
  /**
   * The group has been migrated to a supergroup with the specified identifier.
   * This number may have more than 32 significant bits and some programming
   * languages may have difficulty/silent defects in interpreting it. But it has
   * at most 52 significant bits, so a signed 64-bit integer or double-precision
   * float type are safe for storing this identifier.
   */
  readonly migrate_to_chat_id?: number | undefined
  /**
   * The supergroup has been migrated from a group with the specified identifier.
   * This number may have more than 32 significant bits and some programming
   * languages may have difficulty/silent defects in interpreting it. But it has
   * at most 52 significant bits, so a signed 64-bit integer or double-precision
   * float type are safe for storing this identifier.
   */
  readonly migrate_from_chat_id?: number | undefined
  /**
   * Specified message was pinned. Note that the Message object in this field
   * will not contain further reply_to_message fields even if it itself is a
   * reply.
   */
  readonly pinned_message?: MaybeInaccessibleMessage | undefined
  /**
   * Message is an invoice for a payment, information about the invoice. More
   * about payments »
   */
  readonly invoice?: Invoice | undefined
  /**
   * Message is a service message about a successful payment, information about
   * the payment. More about payments »
   */
  readonly successful_payment?: SuccessfulPayment | undefined
  /**
   * Message is a service message about a refunded payment, information about the
   * payment. More about payments »
   */
  readonly refunded_payment?: RefundedPayment | undefined
  /**
   * Service message: users were shared with the bot
   */
  readonly users_shared?: UsersShared | undefined
  /**
   * Service message: a chat was shared with the bot
   */
  readonly chat_shared?: ChatShared | undefined
  /**
   * Service message: a regular gift was sent or received
   */
  readonly gift?: GiftInfo | undefined
  /**
   * Service message: a unique gift was sent or received
   */
  readonly unique_gift?: UniqueGiftInfo | undefined
  /**
   * Service message: upgrade of a gift was purchased after the gift was sent
   */
  readonly gift_upgrade_sent?: GiftInfo | undefined
  /**
   * The domain name of the website on which the user has logged in. More about
   * Telegram Login »
   */
  readonly connected_website?: string | undefined
  /**
   * Service message: the user allowed the bot to write messages after adding it
   * to the attachment or side menu, launching a Web App from a link, or
   * accepting an explicit request from a Web App sent by the method
   * requestWriteAccess
   */
  readonly write_access_allowed?: WriteAccessAllowed | undefined
  /**
   * Telegram Passport data
   */
  readonly passport_data?: PassportData | undefined
  /**
   * Service message: a user in the chat triggered another user's proximity alert
   * while sharing Live Location
   */
  readonly proximity_alert_triggered?: ProximityAlertTriggered | undefined
  /**
   * Service message: user boosted the chat
   */
  readonly boost_added?: ChatBoostAdded | undefined
  /**
   * Service message: chat background set
   */
  readonly chat_background_set?: ChatBackground | undefined
  /**
   * Service message: some tasks in a checklist were marked as done or not done
   */
  readonly checklist_tasks_done?: ChecklistTasksDone | undefined
  /**
   * Service message: tasks were added to a checklist
   */
  readonly checklist_tasks_added?: ChecklistTasksAdded | undefined
  /**
   * Service message: chat added to a Community
   */
  readonly community_chat_added?: CommunityChatAdded | undefined
  /**
   * Service message: chat removed from a Community
   */
  readonly community_chat_removed?: CommunityChatRemoved | undefined
  /**
   * Service message: the price for paid messages in the corresponding direct
   * messages chat of a channel has changed
   */
  readonly direct_message_price_changed?: DirectMessagePriceChanged | undefined
  /**
   * Service message: forum topic created
   */
  readonly forum_topic_created?: ForumTopicCreated | undefined
  /**
   * Service message: forum topic edited
   */
  readonly forum_topic_edited?: ForumTopicEdited | undefined
  /**
   * Service message: forum topic closed
   */
  readonly forum_topic_closed?: ForumTopicClosed | undefined
  /**
   * Service message: forum topic reopened
   */
  readonly forum_topic_reopened?: ForumTopicReopened | undefined
  /**
   * Service message: the 'General' forum topic hidden
   */
  readonly general_forum_topic_hidden?: GeneralForumTopicHidden | undefined
  /**
   * Service message: the 'General' forum topic unhidden
   */
  readonly general_forum_topic_unhidden?: GeneralForumTopicUnhidden | undefined
  /**
   * Service message: a scheduled giveaway was created
   */
  readonly giveaway_created?: GiveawayCreated | undefined
  /**
   * The message is a scheduled giveaway message
   */
  readonly giveaway?: Giveaway | undefined
  /**
   * A giveaway with public winners was completed
   */
  readonly giveaway_winners?: GiveawayWinners | undefined
  /**
   * Service message: a giveaway without public winners was completed
   */
  readonly giveaway_completed?: GiveawayCompleted | undefined
  /**
   * Service message: user created a bot that will be managed by the current bot
   */
  readonly managed_bot_created?: ManagedBotCreated | undefined
  /**
   * Service message: the price for paid messages has changed in the chat
   */
  readonly paid_message_price_changed?: PaidMessagePriceChanged | undefined
  /**
   * Service message: answer option was added to a poll
   */
  readonly poll_option_added?: PollOptionAdded | undefined
  /**
   * Service message: answer option was deleted from a poll
   */
  readonly poll_option_deleted?: PollOptionDeleted | undefined
  /**
   * Service message: a suggested post was approved
   */
  readonly suggested_post_approved?: SuggestedPostApproved | undefined
  /**
   * Service message: approval of a suggested post has failed
   */
  readonly suggested_post_approval_failed?: SuggestedPostApprovalFailed | undefined
  /**
   * Service message: a suggested post was declined
   */
  readonly suggested_post_declined?: SuggestedPostDeclined | undefined
  /**
   * Service message: payment for a suggested post was received
   */
  readonly suggested_post_paid?: SuggestedPostPaid | undefined
  /**
   * Service message: payment for a suggested post was refunded
   */
  readonly suggested_post_refunded?: SuggestedPostRefunded | undefined
  /**
   * Service message: video chat scheduled
   */
  readonly video_chat_scheduled?: VideoChatScheduled | undefined
  /**
   * Service message: video chat started
   */
  readonly video_chat_started?: VideoChatStarted | undefined
  /**
   * Service message: video chat ended
   */
  readonly video_chat_ended?: VideoChatEnded | undefined
  /**
   * Service message: new participants invited to a video chat
   */
  readonly video_chat_participants_invited?: VideoChatParticipantsInvited | undefined
  /**
   * Service message: data sent by a Web App
   */
  readonly web_app_data?: WebAppData | undefined
  /**
   * Inline keyboard attached to the message. login_url buttons are represented
   * as ordinary url buttons.
   */
  readonly reply_markup?: InlineKeyboardMarkup | undefined
}

/**
 * Fields carried by `MessageReactionCountUpdated`, projected onto the context
 * for the `message_reaction_count` event: `message_reaction_count`.
 */
export interface MessageReactionCountUpdatedEventFields {
  /** The whole payload, under a domain name. */
  readonly reactionCount: MessageReactionCountUpdated

  /**
   * The chat containing the message
   */
  readonly chat: Chat
  /**
   * Unique message identifier inside the chat
   */
  readonly message_id: number
  /**
   * Date of the change in Unix time
   */
  readonly date: number
  /**
   * List of reactions that are present on the message
   */
  readonly reactions: ReactionCount[]
}

/**
 * Fields carried by `MessageReactionUpdated`, projected onto the context for
 * the `message_reaction` event: `message_reaction`.
 */
export interface MessageReactionUpdatedEventFields {
  /** The whole payload, under a domain name. */
  readonly reaction: MessageReactionUpdated

  /** Who caused this. Telegram spells it `user` on this payload. */
  readonly sender: User | undefined

  /**
   * The chat containing the message the user reacted to
   */
  readonly chat: Chat
  /**
   * Unique identifier of the message inside the chat
   */
  readonly message_id: number
  /**
   * The chat on behalf of which the reaction was changed, if the user is
   * anonymous
   */
  readonly actor_chat?: Chat | undefined
  /**
   * Date of the change in Unix time
   */
  readonly date: number
  /**
   * Previous list of reaction types that were set by the user
   */
  readonly old_reaction: ReactionType[]
  /**
   * New list of reaction types that have been set by the user
   */
  readonly new_reaction: ReactionType[]
}

/**
 * Fields carried by `PaidMediaPurchased`, projected onto the context for the
 * `purchased_paid_media` event: `purchased_paid_media`.
 */
export interface PaidMediaPurchasedEventFields {
  /** The whole payload, under a domain name. */
  readonly purchase: PaidMediaPurchased

  /** Who caused this. Telegram spells it `from` on this payload. */
  readonly sender: User

  /**
   * Bot-specified paid media payload
   */
  readonly paid_media_payload: string
}

/**
 * Fields carried by `PollAnswer`, projected onto the context for the
 * `poll_answer` event: `poll_answer`.
 */
export interface PollAnswerEventFields {
  /** The whole payload, under a domain name. */
  readonly answer: PollAnswer

  /** Who caused this. Telegram spells it `user` on this payload. */
  readonly sender: User | undefined

  /**
   * Unique poll identifier
   */
  readonly poll_id: string
  /**
   * The chat that changed the answer to the poll, if the voter is anonymous
   */
  readonly voter_chat?: Chat | undefined
  /**
   * 0-based identifiers of chosen answer options. May be empty if the vote was
   * retracted.
   */
  readonly option_ids: number[]
  /**
   * Persistent identifiers of the chosen answer options. May be empty if the
   * vote was retracted.
   */
  readonly option_persistent_ids: string[]
}

/**
 * Fields carried by `Poll`, projected onto the context for the `poll` event:
 * `poll`.
 */
export interface PollEventFields {
  /** The whole payload, under a domain name. */
  readonly poll: Poll

  /**
   * Unique poll identifier
   */
  readonly id: string
  /**
   * Poll question, 1-300 characters
   */
  readonly question: string
  /**
   * Special entities that appear in the question. Currently, only custom emoji
   * entities are allowed in poll questions
   */
  readonly question_entities?: MessageEntity[] | undefined
  /**
   * List of poll options
   */
  readonly options: PollOption[]
  /**
   * Total number of users that voted in the poll
   */
  readonly total_voter_count: number
  /**
   * True, if the poll is closed
   */
  readonly is_closed: boolean
  /**
   * True, if the poll is anonymous
   */
  readonly is_anonymous: boolean
  /**
   * Poll type, currently can be “regular” or “quiz”
   */
  readonly type: string
  /**
   * True, if the poll allows multiple answers
   */
  readonly allows_multiple_answers: boolean
  /**
   * True, if the poll allows to change the chosen answer options
   */
  readonly allows_revoting: boolean
  /**
   * True if voting is limited to users who have been members of the chat where
   * the poll was originally sent for more than 24 hours
   */
  readonly members_only: boolean
  /**
   * A list of two-letter ISO 3166-1 alpha-2 country codes indicating the
   * countries from which users can vote in the poll. The country code “FT” is
   * used for users with anonymous numbers. If omitted, then users from any
   * country can participate in the poll.
   */
  readonly country_codes?: string[] | undefined
  /**
   * Array of 0-based identifiers of the correct answer options. Available only
   * for polls in quiz mode which are closed or were sent (not forwarded) by the
   * bot or to the private chat with the bot.
   */
  readonly correct_option_ids?: number[] | undefined
  /**
   * Text that is shown when a user chooses an incorrect answer or taps on the
   * lamp icon in a quiz-style poll, 0-200 characters
   */
  readonly explanation?: string | undefined
  /**
   * Special entities like usernames, URLs, bot commands, etc. that appear in the
   * explanation
   */
  readonly explanation_entities?: MessageEntity[] | undefined
  /**
   * Media added to the quiz explanation
   */
  readonly explanation_media?: PollMedia | undefined
  /**
   * Amount of time in seconds the poll will be active after creation
   */
  readonly open_period?: number | undefined
  /**
   * Point in time (Unix timestamp) when the poll will be automatically closed
   */
  readonly close_date?: number | undefined
  /**
   * Description of the poll; for polls inside the Message object only
   */
  readonly description?: string | undefined
  /**
   * Special entities like usernames, URLs, bot commands, etc. that appear in the
   * description
   */
  readonly description_entities?: MessageEntity[] | undefined
  /**
   * Media added to the poll description; for polls inside the Message object
   * only
   */
  readonly media?: PollMedia | undefined
}

/**
 * Fields carried by `PreCheckoutQuery`, projected onto the context for the
 * `pre_checkout_query` event: `pre_checkout_query`.
 */
export interface PreCheckoutQueryEventFields {
  /** The whole payload, under a domain name. */
  readonly preCheckoutQuery: PreCheckoutQuery

  /** Who caused this. Telegram spells it `from` on this payload. */
  readonly sender: User

  /**
   * Unique query identifier
   */
  readonly id: string
  /**
   * Three-letter ISO 4217 currency code, or “XTR” for payments in Telegram Stars
   */
  readonly currency: string
  /**
   * Total price in the smallest units of the currency (integer, not
   * float/double). For example, for a price of US$ 1.45 pass amount = 145. See
   * the exp parameter in currencies.json, it shows the number of digits past the
   * decimal point for each currency (2 for the majority of currencies).
   */
  readonly total_amount: number
  /**
   * Bot-specified invoice payload
   */
  readonly invoice_payload: string
  /**
   * Identifier of the shipping option chosen by the user
   */
  readonly shipping_option_id?: string | undefined
  /**
   * Order information provided by the user
   */
  readonly order_info?: OrderInfo | undefined
}

/**
 * Fields carried by `ShippingQuery`, projected onto the context for the
 * `shipping_query` event: `shipping_query`.
 */
export interface ShippingQueryEventFields {
  /** The whole payload, under a domain name. */
  readonly shippingQuery: ShippingQuery

  /** Who caused this. Telegram spells it `from` on this payload. */
  readonly sender: User

  /**
   * Unique query identifier
   */
  readonly id: string
  /**
   * Bot-specified invoice payload
   */
  readonly invoice_payload: string
  /**
   * User specified shipping address
   */
  readonly shipping_address: ShippingAddress
}

/**
 * Maps an event kind to the fields its context carries. Registration selects
 * the shape, so a handler for one kind never sees another kind’s optionality.
 */
export interface EventFieldsByKind {
  'business_connection': BusinessConnectionEventFields
  'business_message': MessageEventFields
  'business_message_edited': MessageEventFields
  'business_messages_deleted': BusinessMessagesDeletedEventFields
  'callback_query': CallbackQueryEventFields
  'channel_post': MessageEventFields
  'channel_post_edited': MessageEventFields
  'chat_boost': ChatBoostUpdatedEventFields
  'chat_boost_removed': ChatBoostRemovedEventFields
  'chat_join_request': ChatJoinRequestEventFields
  'chat_member': ChatMemberUpdatedEventFields
  'guest_message': MessageEventFields
  'inline_query': InlineQueryEventFields
  'inline_result_chosen': ChosenInlineResultEventFields
  'managed_bot': ManagedBotUpdatedEventFields
  'message': MessageEventFields
  'message_edited': MessageEventFields
  'message_reaction': MessageReactionUpdatedEventFields
  'message_reaction_count': MessageReactionCountUpdatedEventFields
  'my_chat_member': ChatMemberUpdatedEventFields
  'poll': PollEventFields
  'poll_answer': PollAnswerEventFields
  'pre_checkout_query': PreCheckoutQueryEventFields
  'purchased_paid_media': PaidMediaPurchasedEventFields
  'shipping_query': ShippingQueryEventFields
  'subscription': BotSubscriptionUpdatedEventFields
}

/**
 * The domain name each event kind stores its payload under. Generated so the
 * runtime and the types cannot disagree.
 */
export const PAYLOAD_ALIASES = {
  'business_connection': 'connection',
  'business_message': 'message',
  'business_message_edited': 'message',
  'business_messages_deleted': 'deletion',
  'callback_query': 'query',
  'channel_post': 'message',
  'channel_post_edited': 'message',
  'chat_boost': 'boostUpdate',
  'chat_boost_removed': 'removal',
  'chat_join_request': 'request',
  'chat_member': 'update',
  'guest_message': 'message',
  'inline_query': 'inlineQuery',
  'inline_result_chosen': 'chosenResult',
  'managed_bot': 'update',
  'message': 'message',
  'message_edited': 'message',
  'message_reaction': 'reaction',
  'message_reaction_count': 'reactionCount',
  'my_chat_member': 'update',
  'poll': 'poll',
  'poll_answer': 'answer',
  'pre_checkout_query': 'preCheckoutQuery',
  'purchased_paid_media': 'purchase',
  'shipping_query': 'shippingQuery',
  'subscription': 'subscription',
} as const satisfies Readonly<Record<UpdateEventKind, string>>
