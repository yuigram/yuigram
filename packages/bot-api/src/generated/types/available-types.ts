// GENERATED FILE — do not edit.
// Bot API types: Available types
// Source: Telegram Bot API 10.2, schemas/bot-api/10.2.json

import type { CallbackGame, Game } from './games.js'
import type { Invoice, RefundedPayment, SuccessfulPayment } from './payments.js'
import type { RichMessage } from './rich-messages.js'
import type { Sticker } from './stickers.js'
import type { PassportData } from './telegram-passport.js'

/**
 * This object represents a Telegram user or bot.
 *
 * @see https://corefork.telegram.org/bots/api#user
 */
export interface User {
  /**
   * Unique identifier for this user or bot. This number may have more than 32
   * significant bits and some programming languages may have difficulty/silent
   * defects in interpreting it. But it has at most 52 significant bits, so a
   * 64-bit integer or double-precision float type are safe for storing this
   * identifier.
   */
  readonly id: number

  /**
   * True, if this user is a bot
   */
  readonly is_bot: boolean

  /**
   * User's or bot's first name
   */
  readonly first_name: string

  /**
   * User's or bot's last name
   */
  readonly last_name?: string | undefined

  /**
   * User's or bot's username
   */
  readonly username?: string | undefined

  /**
   * IETF language tag of the user's language
   */
  readonly language_code?: string | undefined

  /**
   * True, if this user is a Telegram Premium user
   */
  readonly is_premium?: true | undefined

  /**
   * True, if this user added the bot to the attachment menu
   */
  readonly added_to_attachment_menu?: true | undefined

  /**
   * True, if the bot can be invited to groups. Returned only in getMe.
   */
  readonly can_join_groups?: boolean | undefined

  /**
   * True, if privacy mode is disabled for the bot. Returned only in getMe.
   */
  readonly can_read_all_group_messages?: boolean | undefined

  /**
   * True, if the bot supports guest queries from chats it is not a member of.
   * Returned only in getMe.
   */
  readonly supports_guest_queries?: boolean | undefined

  /**
   * True, if the bot supports inline queries. Returned only in getMe.
   */
  readonly supports_inline_queries?: boolean | undefined

  /**
   * True, if the bot can be connected to a user account to manage it. Returned
   * only in getMe.
   */
  readonly can_connect_to_business?: boolean | undefined

  /**
   * True, if the bot has a main Web App. Returned only in getMe.
   */
  readonly has_main_web_app?: boolean | undefined

  /**
   * True, if the bot has forum topic mode enabled in private chats. Returned
   * only in getMe.
   */
  readonly has_topics_enabled?: boolean | undefined

  /**
   * True, if the bot allows users to create and delete topics in private chats.
   * Returned only in getMe.
   */
  readonly allows_users_to_create_topics?: boolean | undefined

  /**
   * True, if other bots can be created to be controlled by the bot. Returned
   * only in getMe.
   */
  readonly can_manage_bots?: boolean | undefined

  /**
   * True, if the bot supports join request queries and can be assigned to
   * process them. Returned only in getMe.
   */
  readonly supports_join_request_queries?: boolean | undefined
}

/**
 * This object represents a chat.
 *
 * @see https://corefork.telegram.org/bots/api#chat
 */
export interface Chat {
  /**
   * Unique identifier for this chat. This number may have more than 32
   * significant bits and some programming languages may have difficulty/silent
   * defects in interpreting it. But it has at most 52 significant bits, so a
   * signed 64-bit integer or double-precision float type are safe for storing
   * this identifier.
   */
  readonly id: number

  /**
   * Type of the chat, can be either “private”, “group”, “supergroup” or
   * “channel”
   */
  readonly type: string

  /**
   * Title, for supergroups, channels and group chats
   */
  readonly title?: string | undefined

  /**
   * Username, for private chats, supergroups and channels if available
   */
  readonly username?: string | undefined

  /**
   * First name of the other party in a private chat
   */
  readonly first_name?: string | undefined

  /**
   * Last name of the other party in a private chat
   */
  readonly last_name?: string | undefined

  /**
   * True, if the supergroup chat is a forum (has topics enabled)
   */
  readonly is_forum?: true | undefined

  /**
   * True, if the chat is the direct messages chat of a channel
   */
  readonly is_direct_messages?: true | undefined
}

/**
 * This object contains full information about a chat.
 *
 * @see https://corefork.telegram.org/bots/api#chatfullinfo
 */
export interface ChatFullInfo {
  /**
   * Unique identifier for this chat. This number may have more than 32
   * significant bits and some programming languages may have difficulty/silent
   * defects in interpreting it. But it has at most 52 significant bits, so a
   * signed 64-bit integer or double-precision float type are safe for storing
   * this identifier.
   */
  readonly id: number

  /**
   * Type of the chat, can be either “private”, “group”, “supergroup” or
   * “channel”
   */
  readonly type: string

  /**
   * Title, for supergroups, channels and group chats
   */
  readonly title?: string | undefined

  /**
   * Username, for private chats, supergroups and channels if available
   */
  readonly username?: string | undefined

  /**
   * First name of the other party in a private chat
   */
  readonly first_name?: string | undefined

  /**
   * Last name of the other party in a private chat
   */
  readonly last_name?: string | undefined

  /**
   * True, if the supergroup chat is a forum (has topics enabled)
   */
  readonly is_forum?: true | undefined

  /**
   * True, if the chat is the direct messages chat of a channel
   */
  readonly is_direct_messages?: true | undefined

  /**
   * Identifier of the accent color for the chat name and backgrounds of the chat
   * photo, reply header, and link preview. See accent colors for more details.
   */
  readonly accent_color_id: number

  /**
   * The maximum number of reactions that can be set on a message in the chat
   */
  readonly max_reaction_count: number

  /**
   * Chat photo
   */
  readonly photo?: ChatPhoto | undefined

  /**
   * If non-empty, the list of all active chat usernames; for private chats,
   * supergroups and channels
   */
  readonly active_usernames?: string[] | undefined

  /**
   * For private chats, the date of birth of the user
   */
  readonly birthdate?: Birthdate | undefined

  /**
   * For private chats with business accounts, the intro of the business
   */
  readonly business_intro?: BusinessIntro | undefined

  /**
   * For private chats with business accounts, the location of the business
   */
  readonly business_location?: BusinessLocation | undefined

  /**
   * For private chats with business accounts, the opening hours of the business
   */
  readonly business_opening_hours?: BusinessOpeningHours | undefined

  /**
   * For private chats, the personal channel of the user
   */
  readonly personal_chat?: Chat | undefined

  /**
   * Information about the corresponding channel chat; for direct messages chats
   * only
   */
  readonly parent_chat?: Chat | undefined

  /**
   * List of available reactions allowed in the chat. If omitted, then all emoji
   * reactions are allowed.
   */
  readonly available_reactions?: ReactionType[] | undefined

  /**
   * Custom emoji identifier of the emoji chosen by the chat for the reply header
   * and link preview background
   */
  readonly background_custom_emoji_id?: string | undefined

  /**
   * Identifier of the accent color for the chat's profile background. See
   * profile accent colors for more details.
   */
  readonly profile_accent_color_id?: number | undefined

  /**
   * Custom emoji identifier of the emoji chosen by the chat for its profile
   * background
   */
  readonly profile_background_custom_emoji_id?: string | undefined

  /**
   * Custom emoji identifier of the emoji status of the chat or the other party
   * in a private chat
   */
  readonly emoji_status_custom_emoji_id?: string | undefined

  /**
   * Expiration date of the emoji status of the chat or the other party in a
   * private chat, in Unix time, if any
   */
  readonly emoji_status_expiration_date?: number | undefined

  /**
   * Bio of the other party in a private chat
   */
  readonly bio?: string | undefined

  /**
   * True, if privacy settings of the other party in the private chat allows to
   * use tg://user?id=<user_id> links only in chats with the user
   */
  readonly has_private_forwards?: true | undefined

  /**
   * True, if the privacy settings of the other party restrict sending voice and
   * video note messages in the private chat
   */
  readonly has_restricted_voice_and_video_messages?: true | undefined

  /**
   * True, if users need to join the supergroup before they can send messages
   */
  readonly join_to_send_messages?: true | undefined

  /**
   * True, if all users directly joining the supergroup without using an invite
   * link need to be approved by supergroup administrators
   */
  readonly join_by_request?: true | undefined

  /**
   * Description, for groups, supergroups and channel chats
   */
  readonly description?: string | undefined

  /**
   * Primary invite link, for groups, supergroups and channel chats
   */
  readonly invite_link?: string | undefined

  /**
   * The most recent pinned message (by sending date)
   */
  readonly pinned_message?: Message | undefined

  /**
   * Default chat member permissions, for groups and supergroups
   */
  readonly permissions?: ChatPermissions | undefined

  /**
   * Information about types of gifts that are accepted by the chat or by the
   * corresponding user for private chats
   */
  readonly accepted_gift_types: AcceptedGiftTypes

  /**
   * True, if paid media messages can be sent or forwarded to the channel chat.
   * The field is available only for channel chats.
   */
  readonly can_send_paid_media?: true | undefined

  /**
   * For supergroups, the minimum allowed delay between consecutive messages sent
   * by each unprivileged user; in seconds
   */
  readonly slow_mode_delay?: number | undefined

  /**
   * For supergroups, the minimum number of boosts that a non-administrator user
   * needs to add in order to ignore slow mode and chat permissions
   */
  readonly unrestrict_boost_count?: number | undefined

  /**
   * The time after which all messages sent to the chat will be automatically
   * deleted; in seconds
   */
  readonly message_auto_delete_time?: number | undefined

  /**
   * True, if aggressive anti-spam checks are enabled in the supergroup. The
   * field is only available to chat administrators.
   */
  readonly has_aggressive_anti_spam_enabled?: true | undefined

  /**
   * True, if non-administrators can only get the list of bots and administrators
   * in the chat
   */
  readonly has_hidden_members?: true | undefined

  /**
   * True, if messages from the chat can't be forwarded to other chats
   */
  readonly has_protected_content?: true | undefined

  /**
   * True, if new chat members will have access to old messages; available only
   * to chat administrators
   */
  readonly has_visible_history?: true | undefined

  /**
   * For supergroups, name of the group sticker set
   */
  readonly sticker_set_name?: string | undefined

  /**
   * True, if the bot can change the group sticker set
   */
  readonly can_set_sticker_set?: true | undefined

  /**
   * For supergroups, the name of the group's custom emoji sticker set. Custom
   * emoji from this set can be used by all users and bots in the group.
   */
  readonly custom_emoji_sticker_set_name?: string | undefined

  /**
   * Unique identifier for the linked chat, i.e. the discussion group identifier
   * for a channel and vice versa; for supergroups and channel chats. This
   * identifier may be greater than 32 bits and some programming languages may
   * have difficulty/silent defects in interpreting it. But it is smaller than 52
   * bits, so a signed 64 bit integer or double-precision float type are safe for
   * storing this identifier.
   */
  readonly linked_chat_id?: number | undefined

  /**
   * For supergroups, the location to which the supergroup is connected
   */
  readonly location?: ChatLocation | undefined

  /**
   * For private chats, the rating of the user if any
   */
  readonly rating?: UserRating | undefined

  /**
   * For private chats, the first audio added to the profile of the user
   */
  readonly first_profile_audio?: Audio | undefined

  /**
   * The color scheme based on a unique gift that must be used for the chat's
   * name, message replies and link previews
   */
  readonly unique_gift_colors?: UniqueGiftColors | undefined

  /**
   * The number of Telegram Stars a general user has to pay to send a message to
   * the chat
   */
  readonly paid_message_star_count?: number | undefined

  /**
   * The bot that processes join request queries in the chat. The field is only
   * available to chat administrators.
   */
  readonly guard_bot?: User | undefined

  /**
   * The Community to which the chat belongs
   */
  readonly community?: Community | undefined
}

/**
 * This object represents a message.
 *
 * @see https://corefork.telegram.org/bots/api#message
 */
export interface Message {
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
   * Sender of the message; may be empty for messages sent to channels. For
   * backward compatibility, if the message was sent on behalf of a chat, the
   * field contains a fake sender user in non-channel chats.
   */
  readonly from?: User | undefined

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
 * This object represents a unique message identifier.
 *
 * @see https://corefork.telegram.org/bots/api#messageid
 */
export interface MessageId {
  /**
   * Unique message identifier. In specific instances (e.g., message containing a
   * video sent to a big chat), the server might automatically schedule a message
   * instead of sending it immediately. In such cases, this field will be 0 and
   * the relevant message will be unusable until it is actually sent.
   */
  readonly message_id: number
}

/**
 * This object describes a message that was deleted or is otherwise
 * inaccessible to the bot.
 *
 * @see https://corefork.telegram.org/bots/api#inaccessiblemessage
 */
export interface InaccessibleMessage {
  /**
   * Chat the message belonged to
   */
  readonly chat: Chat

  /**
   * Unique message identifier inside the chat
   */
  readonly message_id: number

  /**
   * Always 0. The field can be used to differentiate regular and inaccessible
   * messages.
   */
  readonly date: number
}

/**
 * This object describes a message that can be inaccessible to the bot. It can
 * be one of
 *
 * @see https://corefork.telegram.org/bots/api#maybeinaccessiblemessage
 */
export type MaybeInaccessibleMessage =
  | InaccessibleMessage
  | Message

/**
 * This object represents one special entity in a text message. For example,
 * hashtags, usernames, URLs, etc.
 *
 * @see https://corefork.telegram.org/bots/api#messageentity
 */
export interface MessageEntity {
  /**
   * Type of the entity. Currently, can be “mention” (@username), “hashtag”
   * (#hashtag or #hashtag@chatusername), “cashtag” ($USD or $USD@chatusername),
   * “bot_command” (/start@jobs_bot), “url” (https://telegram.org), “email”
   * (do-not-reply@telegram.org), “phone_number” (+1-212-555-0123), “bold” (bold
   * text), “italic” (italic text), “underline” (underlined text),
   * “strikethrough” (strikethrough text), “spoiler” (spoiler message),
   * “blockquote” (block quotation), “expandable_blockquote”
   * (collapsed-by-default block quotation), “code” (monowidth string), “pre”
   * (monowidth block), “text_link” (for clickable text URLs), “text_mention”
   * (for users without usernames), “custom_emoji” (for inline custom emoji
   * stickers), or “date_time” (for formatted date and time).
   */
  readonly type: string

  /**
   * Offset in UTF-16 code units to the start of the entity
   */
  readonly offset: number

  /**
   * Length of the entity in UTF-16 code units
   */
  readonly length: number

  /**
   * For “text_link” only, URL that will be opened after user taps on the text
   */
  readonly url?: string | undefined

  /**
   * For “text_mention” only, the mentioned user
   */
  readonly user?: User | undefined

  /**
   * For “pre” only, the programming language of the entity text
   */
  readonly language?: string | undefined

  /**
   * For “custom_emoji” only, unique identifier of the custom emoji. Use
   * getCustomEmojiStickers to get full information about the sticker.
   */
  readonly custom_emoji_id?: string | undefined

  /**
   * For “date_time” only, the Unix time associated with the entity
   */
  readonly unix_time?: number | undefined

  /**
   * For “date_time” only, the string that defines the formatting of the date and
   * time. See date-time entity formatting for more details.
   */
  readonly date_time_format?: string | undefined
}

/**
 * This object contains information about the quoted part of a message that is
 * replied to by the given message.
 *
 * @see https://corefork.telegram.org/bots/api#textquote
 */
export interface TextQuote {
  /**
   * Text of the quoted part of a message that is replied to by the given message
   */
  readonly text: string

  /**
   * Special entities that appear in the quote. Currently, only bold, italic,
   * underline, strikethrough, spoiler, custom_emoji, and date_time entities are
   * kept in quotes.
   */
  readonly entities?: MessageEntity[] | undefined

  /**
   * Approximate quote position in the original message in UTF-16 code units as
   * specified by the sender
   */
  readonly position: number

  /**
   * True, if the quote was chosen manually by the message sender. Otherwise, the
   * quote was added automatically by the server.
   */
  readonly is_manual?: true | undefined
}

/**
 * This object contains information about a message that is being replied to,
 * which may come from another chat or forum topic.
 *
 * @see https://corefork.telegram.org/bots/api#externalreplyinfo
 */
export interface ExternalReplyInfo {
  /**
   * Origin of the message replied to by the given message
   */
  readonly origin: MessageOrigin

  /**
   * Chat the original message belongs to. Available only if the chat is a
   * supergroup or a channel.
   */
  readonly chat?: Chat | undefined

  /**
   * Unique message identifier inside the original chat. Available only if the
   * original chat is a supergroup or a channel.
   */
  readonly message_id?: number | undefined

  /**
   * Options used for link preview generation for the original message, if it is
   * a text message
   */
  readonly link_preview_options?: LinkPreviewOptions | undefined

  /**
   * Message is an animation, information about the animation
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
   * Message is a live photo, information about the live photo
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
   * Message is a scheduled giveaway, information about the giveaway
   */
  readonly giveaway?: Giveaway | undefined

  /**
   * A giveaway with public winners was completed
   */
  readonly giveaway_winners?: GiveawayWinners | undefined

  /**
   * Message is an invoice for a payment, information about the invoice. More
   * about payments »
   */
  readonly invoice?: Invoice | undefined

  /**
   * Message is a shared location, information about the location
   */
  readonly location?: Location | undefined

  /**
   * Message is a native poll, information about the poll
   */
  readonly poll?: Poll | undefined

  /**
   * Message is a venue, information about the venue
   */
  readonly venue?: Venue | undefined
}

/**
 * Describes reply parameters for the message that is being sent.
 *
 * @see https://corefork.telegram.org/bots/api#replyparameters
 */
export interface ReplyParameters {
  /**
   * Identifier of the message that will be replied to in the current chat, or in
   * the chat chat_id if it is specified. Required if ephemeral_message_id isn't
   * specified.
   */
  readonly message_id?: number | undefined

  /**
   * If the message to be replied to is from a different chat, unique identifier
   * for the chat or username of the bot, supergroup or channel in the format
   * @username. Not supported for messages sent on behalf of a business account,
   * messages from channel direct messages chats and ephemeral messages.
   */
  readonly chat_id?: number | string | undefined

  /**
   * Identifier of the incoming ephemeral message that will be replied to in the
   * current chat. A reply to an ephemeral message must itself be an ephemeral
   * message. An ephemeral message may only be replied to within 15 seconds of
   * being sent. Required if message_id isn't specified.
   */
  readonly ephemeral_message_id?: number | undefined

  /**
   * Pass True if the message should be sent even if the specified message to be
   * replied to is not found. Always False for replies in another chat or forum
   * topic, and sent ephemeral messages. Always True for messages sent on behalf
   * of a business account.
   */
  readonly allow_sending_without_reply?: boolean | undefined

  /**
   * Quoted part of the message to be replied to; 0-1024 characters after
   * entities parsing. The quote must be an exact substring of the message to be
   * replied to, including bold, italic, underline, strikethrough, spoiler,
   * custom_emoji, and date_time entities. The message will fail to send if the
   * quote isn't found in the original message. Ignored for ephemeral messages.
   */
  readonly quote?: string | undefined

  /**
   * Mode for parsing entities in the quote. See formatting options for more
   * details.
   */
  readonly quote_parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the quote. It can
   * be specified instead of quote_parse_mode.
   */
  readonly quote_entities?: MessageEntity[] | undefined

  /**
   * Position of the quote in the original message in UTF-16 code units
   */
  readonly quote_position?: number | undefined

  /**
   * Identifier of the specific checklist task to be replied to
   */
  readonly checklist_task_id?: number | undefined

  /**
   * Persistent identifier of the specific poll option to be replied to
   */
  readonly poll_option_id?: string | undefined
}

/**
 * This object describes the origin of a message. It can be one of
 *
 * @see https://corefork.telegram.org/bots/api#messageorigin
 */
export type MessageOrigin =
  | MessageOriginChannel
  | MessageOriginChat
  | MessageOriginHiddenUser
  | MessageOriginUser

/**
 * The message was originally sent by a known user.
 *
 * @see https://corefork.telegram.org/bots/api#messageoriginuser
 */
export interface MessageOriginUser {
  /**
   * Type of the message origin, always “user”
   */
  readonly type: string

  /**
   * Date the message was sent originally in Unix time
   */
  readonly date: number

  /**
   * User that sent the message originally
   */
  readonly sender_user: User
}

/**
 * The message was originally sent by an unknown user.
 *
 * @see https://corefork.telegram.org/bots/api#messageoriginhiddenuser
 */
export interface MessageOriginHiddenUser {
  /**
   * Type of the message origin, always “hidden_user”
   */
  readonly type: string

  /**
   * Date the message was sent originally in Unix time
   */
  readonly date: number

  /**
   * Name of the user that sent the message originally
   */
  readonly sender_user_name: string
}

/**
 * The message was originally sent on behalf of a chat to a group chat.
 *
 * @see https://corefork.telegram.org/bots/api#messageoriginchat
 */
export interface MessageOriginChat {
  /**
   * Type of the message origin, always “chat”
   */
  readonly type: string

  /**
   * Date the message was sent originally in Unix time
   */
  readonly date: number

  /**
   * Chat that sent the message originally
   */
  readonly sender_chat: Chat

  /**
   * For messages originally sent by an anonymous chat administrator, original
   * message author signature
   */
  readonly author_signature?: string | undefined
}

/**
 * The message was originally sent to a channel chat.
 *
 * @see https://corefork.telegram.org/bots/api#messageoriginchannel
 */
export interface MessageOriginChannel {
  /**
   * Type of the message origin, always “channel”
   */
  readonly type: string

  /**
   * Date the message was sent originally in Unix time
   */
  readonly date: number

  /**
   * Channel chat to which the message was originally sent
   */
  readonly chat: Chat

  /**
   * Unique message identifier inside the chat
   */
  readonly message_id: number

  /**
   * Signature of the original post author
   */
  readonly author_signature?: string | undefined
}

/**
 * This object represents one size of a photo or a file / sticker thumbnail.
 *
 * @see https://corefork.telegram.org/bots/api#photosize
 */
export interface PhotoSize {
  /**
   * Identifier for this file, which can be used to download or reuse the file
   */
  readonly file_id: string

  /**
   * Unique identifier for this file, which is supposed to be the same over time
   * and for different bots. Can't be used to download or reuse the file.
   */
  readonly file_unique_id: string

  /**
   * Photo width
   */
  readonly width: number

  /**
   * Photo height
   */
  readonly height: number

  /**
   * File size in bytes
   */
  readonly file_size?: number | undefined
}

/**
 * This object represents an animation file (GIF or H.264/MPEG-4 AVC video
 * without sound).
 *
 * @see https://corefork.telegram.org/bots/api#animation
 */
export interface Animation {
  /**
   * Identifier for this file, which can be used to download or reuse the file
   */
  readonly file_id: string

  /**
   * Unique identifier for this file, which is supposed to be the same over time
   * and for different bots. Can't be used to download or reuse the file.
   */
  readonly file_unique_id: string

  /**
   * Video width as defined by the sender
   */
  readonly width: number

  /**
   * Video height as defined by the sender
   */
  readonly height: number

  /**
   * Duration of the video in seconds as defined by the sender
   */
  readonly duration: number

  /**
   * Animation thumbnail as defined by the sender
   */
  readonly thumbnail?: PhotoSize | undefined

  /**
   * Original animation filename as defined by the sender
   */
  readonly file_name?: string | undefined

  /**
   * MIME type of the file as defined by the sender
   */
  readonly mime_type?: string | undefined

  /**
   * File size in bytes. It can be bigger than 2^31 and some programming
   * languages may have difficulty/silent defects in interpreting it. But it has
   * at most 52 significant bits, so a signed 64-bit integer or double-precision
   * float type are safe for storing this value.
   */
  readonly file_size?: number | undefined
}

/**
 * This object represents an audio file to be treated as music by the Telegram
 * clients.
 *
 * @see https://corefork.telegram.org/bots/api#audio
 */
export interface Audio {
  /**
   * Identifier for this file, which can be used to download or reuse the file
   */
  readonly file_id: string

  /**
   * Unique identifier for this file, which is supposed to be the same over time
   * and for different bots. Can't be used to download or reuse the file.
   */
  readonly file_unique_id: string

  /**
   * Duration of the audio in seconds as defined by the sender
   */
  readonly duration: number

  /**
   * Performer of the audio as defined by the sender or by audio tags
   */
  readonly performer?: string | undefined

  /**
   * Title of the audio as defined by the sender or by audio tags
   */
  readonly title?: string | undefined

  /**
   * Original filename as defined by the sender
   */
  readonly file_name?: string | undefined

  /**
   * MIME type of the file as defined by the sender
   */
  readonly mime_type?: string | undefined

  /**
   * File size in bytes. It can be bigger than 2^31 and some programming
   * languages may have difficulty/silent defects in interpreting it. But it has
   * at most 52 significant bits, so a signed 64-bit integer or double-precision
   * float type are safe for storing this value.
   */
  readonly file_size?: number | undefined

  /**
   * Thumbnail of the album cover to which the music file belongs
   */
  readonly thumbnail?: PhotoSize | undefined
}

/**
 * This object represents a general file (as opposed to photos, voice messages
 * and audio files).
 *
 * @see https://corefork.telegram.org/bots/api#document
 */
export interface Document {
  /**
   * Identifier for this file, which can be used to download or reuse the file
   */
  readonly file_id: string

  /**
   * Unique identifier for this file, which is supposed to be the same over time
   * and for different bots. Can't be used to download or reuse the file.
   */
  readonly file_unique_id: string

  /**
   * Document thumbnail as defined by the sender
   */
  readonly thumbnail?: PhotoSize | undefined

  /**
   * Original filename as defined by the sender
   */
  readonly file_name?: string | undefined

  /**
   * MIME type of the file as defined by the sender
   */
  readonly mime_type?: string | undefined

  /**
   * File size in bytes. It can be bigger than 2^31 and some programming
   * languages may have difficulty/silent defects in interpreting it. But it has
   * at most 52 significant bits, so a signed 64-bit integer or double-precision
   * float type are safe for storing this value.
   */
  readonly file_size?: number | undefined
}

/**
 * This object represents a live photo.
 *
 * @see https://corefork.telegram.org/bots/api#livephoto
 */
export interface LivePhoto {
  /**
   * Available sizes of the corresponding static photo
   */
  readonly photo?: PhotoSize[] | undefined

  /**
   * Identifier for the video file which can be used to download or reuse the
   * file
   */
  readonly file_id: string

  /**
   * Unique identifier for the video file which is supposed to be the same over
   * time and for different bots. Can't be used to download or reuse the file.
   */
  readonly file_unique_id: string

  /**
   * Video width as defined by the sender
   */
  readonly width: number

  /**
   * Video height as defined by the sender
   */
  readonly height: number

  /**
   * Duration of the video in seconds as defined by the sender
   */
  readonly duration: number

  /**
   * MIME type of the file as defined by the sender
   */
  readonly mime_type?: string | undefined

  /**
   * File size in bytes. It can be bigger than 2^31 and some programming
   * languages may have difficulty/silent defects in interpreting it. But it has
   * at most 52 significant bits, so a signed 64-bit integer or double-precision
   * float type are safe for storing this value.
   */
  readonly file_size?: number | undefined
}

/**
 * This object represents a story.
 *
 * @see https://corefork.telegram.org/bots/api#story
 */
export interface Story {
  /**
   * Chat that posted the story
   */
  readonly chat: Chat

  /**
   * Unique identifier for the story in the chat
   */
  readonly id: number
}

/**
 * This object represents a video file of a specific quality.
 *
 * @see https://corefork.telegram.org/bots/api#videoquality
 */
export interface VideoQuality {
  /**
   * Identifier for this file, which can be used to download or reuse the file
   */
  readonly file_id: string

  /**
   * Unique identifier for this file, which is supposed to be the same over time
   * and for different bots. Can't be used to download or reuse the file.
   */
  readonly file_unique_id: string

  /**
   * Video width
   */
  readonly width: number

  /**
   * Video height
   */
  readonly height: number

  /**
   * Codec that was used to encode the video, for example, “h264”, “h265”, or
   * “av01”
   */
  readonly codec: string

  /**
   * File size in bytes. It can be bigger than 2^31 and some programming
   * languages may have difficulty/silent defects in interpreting it. But it has
   * at most 52 significant bits, so a signed 64-bit integer or double-precision
   * float type are safe for storing this value.
   */
  readonly file_size?: number | undefined
}

/**
 * This object represents a video file.
 *
 * @see https://corefork.telegram.org/bots/api#video
 */
export interface Video {
  /**
   * Identifier for this file, which can be used to download or reuse the file
   */
  readonly file_id: string

  /**
   * Unique identifier for this file, which is supposed to be the same over time
   * and for different bots. Can't be used to download or reuse the file.
   */
  readonly file_unique_id: string

  /**
   * Video width as defined by the sender
   */
  readonly width: number

  /**
   * Video height as defined by the sender
   */
  readonly height: number

  /**
   * Duration of the video in seconds as defined by the sender
   */
  readonly duration: number

  /**
   * Video thumbnail
   */
  readonly thumbnail?: PhotoSize | undefined

  /**
   * Available sizes of the cover of the video in the message
   */
  readonly cover?: PhotoSize[] | undefined

  /**
   * Timestamp in seconds from which the video will play in the message
   */
  readonly start_timestamp?: number | undefined

  /**
   * List of available qualities of the video
   */
  readonly qualities?: VideoQuality[] | undefined

  /**
   * Original filename as defined by the sender
   */
  readonly file_name?: string | undefined

  /**
   * MIME type of the file as defined by the sender
   */
  readonly mime_type?: string | undefined

  /**
   * File size in bytes. It can be bigger than 2^31 and some programming
   * languages may have difficulty/silent defects in interpreting it. But it has
   * at most 52 significant bits, so a signed 64-bit integer or double-precision
   * float type are safe for storing this value.
   */
  readonly file_size?: number | undefined
}

/**
 * This object represents a video message (available in Telegram apps as of
 * v.4.0).
 *
 * @see https://corefork.telegram.org/bots/api#videonote
 */
export interface VideoNote {
  /**
   * Identifier for this file, which can be used to download or reuse the file
   */
  readonly file_id: string

  /**
   * Unique identifier for this file, which is supposed to be the same over time
   * and for different bots. Can't be used to download or reuse the file.
   */
  readonly file_unique_id: string

  /**
   * Video width and height (diameter of the video message) as defined by the
   * sender
   */
  readonly length: number

  /**
   * Duration of the video in seconds as defined by the sender
   */
  readonly duration: number

  /**
   * Video thumbnail
   */
  readonly thumbnail?: PhotoSize | undefined

  /**
   * File size in bytes
   */
  readonly file_size?: number | undefined
}

/**
 * This object represents a voice note.
 *
 * @see https://corefork.telegram.org/bots/api#voice
 */
export interface Voice {
  /**
   * Identifier for this file, which can be used to download or reuse the file
   */
  readonly file_id: string

  /**
   * Unique identifier for this file, which is supposed to be the same over time
   * and for different bots. Can't be used to download or reuse the file.
   */
  readonly file_unique_id: string

  /**
   * Duration of the audio in seconds as defined by the sender
   */
  readonly duration: number

  /**
   * MIME type of the file as defined by the sender
   */
  readonly mime_type?: string | undefined

  /**
   * File size in bytes. It can be bigger than 2^31 and some programming
   * languages may have difficulty/silent defects in interpreting it. But it has
   * at most 52 significant bits, so a signed 64-bit integer or double-precision
   * float type are safe for storing this value.
   */
  readonly file_size?: number | undefined
}

/**
 * Describes the paid media added to a message.
 *
 * @see https://corefork.telegram.org/bots/api#paidmediainfo
 */
export interface PaidMediaInfo {
  /**
   * The number of Telegram Stars that must be paid to buy access to the media
   */
  readonly star_count: number

  /**
   * Information about the paid media
   */
  readonly paid_media: PaidMedia[]
}

/**
 * This object describes paid media. Currently, it can be one of
 *
 * @see https://corefork.telegram.org/bots/api#paidmedia
 */
export type PaidMedia =
  | PaidMediaLivePhoto
  | PaidMediaPhoto
  | PaidMediaPreview
  | PaidMediaVideo

/**
 * The paid media is a live photo.
 *
 * @see https://corefork.telegram.org/bots/api#paidmedialivephoto
 */
export interface PaidMediaLivePhoto {
  /**
   * Type of the paid media, always “live_photo”
   */
  readonly type: string

  /**
   * The photo
   */
  readonly live_photo: LivePhoto
}

/**
 * The paid media is a photo.
 *
 * @see https://corefork.telegram.org/bots/api#paidmediaphoto
 */
export interface PaidMediaPhoto {
  /**
   * Type of the paid media, always “photo”
   */
  readonly type: string

  /**
   * The photo
   */
  readonly photo: PhotoSize[]
}

/**
 * The paid media isn't available before the payment.
 *
 * @see https://corefork.telegram.org/bots/api#paidmediapreview
 */
export interface PaidMediaPreview {
  /**
   * Type of the paid media, always “preview”
   */
  readonly type: string

  /**
   * Media width as defined by the sender
   */
  readonly width?: number | undefined

  /**
   * Media height as defined by the sender
   */
  readonly height?: number | undefined

  /**
   * Duration of the media in seconds as defined by the sender
   */
  readonly duration?: number | undefined
}

/**
 * The paid media is a video.
 *
 * @see https://corefork.telegram.org/bots/api#paidmediavideo
 */
export interface PaidMediaVideo {
  /**
   * Type of the paid media, always “video”
   */
  readonly type: string

  /**
   * The video
   */
  readonly video: Video
}

/**
 * This object represents a phone contact.
 *
 * @see https://corefork.telegram.org/bots/api#contact
 */
export interface Contact {
  /**
   * Contact's phone number
   */
  readonly phone_number: string

  /**
   * Contact's first name
   */
  readonly first_name: string

  /**
   * Contact's last name
   */
  readonly last_name?: string | undefined

  /**
   * Contact's user identifier in Telegram. This number may have more than 32
   * significant bits and some programming languages may have difficulty/silent
   * defects in interpreting it. But it has at most 52 significant bits, so a
   * 64-bit integer or double-precision float type are safe for storing this
   * identifier.
   */
  readonly user_id?: number | undefined

  /**
   * Additional data about the contact in the form of a vCard
   */
  readonly vcard?: string | undefined
}

/**
 * This object represents an animated emoji that displays a random value.
 *
 * @see https://corefork.telegram.org/bots/api#dice
 */
export interface Dice {
  /**
   * Emoji on which the dice throw animation is based
   */
  readonly emoji: string

  /**
   * Value of the dice, 1-6 for “”, “” and “” base emoji, 1-5 for “” and “” base
   * emoji, 1-64 for “” base emoji
   */
  readonly value: number
}

/**
 * Represents an HTTP link.
 *
 * @see https://corefork.telegram.org/bots/api#link
 */
export interface Link {
  /**
   * URL of the link
   */
  readonly url: string
}

/**
 * At most one of the optional fields can be present in any given object.
 *
 * @see https://corefork.telegram.org/bots/api#pollmedia
 */
export interface PollMedia {
  /**
   * Media is an animation, information about the animation
   */
  readonly animation?: Animation | undefined

  /**
   * Media is an audio file, information about the file; currently, can't be
   * received in a poll option
   */
  readonly audio?: Audio | undefined

  /**
   * Media is a general file, information about the file; currently, can't be
   * received in a poll option
   */
  readonly document?: Document | undefined

  /**
   * The HTTP link attached to the poll option
   */
  readonly link?: Link | undefined

  /**
   * Media is a live photo, information about the live photo
   */
  readonly live_photo?: LivePhoto | undefined

  /**
   * Media is a shared location, information about the location
   */
  readonly location?: Location | undefined

  /**
   * Media is a photo, available sizes of the photo
   */
  readonly photo?: PhotoSize[] | undefined

  /**
   * Media is a sticker, information about the sticker; currently, for poll
   * options only
   */
  readonly sticker?: Sticker | undefined

  /**
   * Media is a venue, information about the venue
   */
  readonly venue?: Venue | undefined

  /**
   * Media is a video, information about the video
   */
  readonly video?: Video | undefined
}

/**
 * This object represents the content of a poll description or a quiz
 * explanation to be sent. It should be one of
 *
 * @see https://corefork.telegram.org/bots/api#inputpollmedia
 */
export type InputPollMedia =
  | InputMediaAnimation
  | InputMediaAudio
  | InputMediaDocument
  | InputMediaLivePhoto
  | InputMediaLocation
  | InputMediaPhoto
  | InputMediaVenue
  | InputMediaVideo

/**
 * This object represents the content of a poll option to be sent. It should be
 * one of
 *
 * @see https://corefork.telegram.org/bots/api#inputpolloptionmedia
 */
export type InputPollOptionMedia =
  | InputMediaAnimation
  | InputMediaLink
  | InputMediaLivePhoto
  | InputMediaLocation
  | InputMediaPhoto
  | InputMediaSticker
  | InputMediaVenue
  | InputMediaVideo

/**
 * This object contains information about one answer option in a poll.
 *
 * @see https://corefork.telegram.org/bots/api#polloption
 */
export interface PollOption {
  /**
   * Unique identifier of the option, persistent on option addition and deletion
   */
  readonly persistent_id: string

  /**
   * Option text, 1-100 characters
   */
  readonly text: string

  /**
   * Special entities that appear in the option text. Currently, only custom
   * emoji entities are allowed in poll option texts
   */
  readonly text_entities?: MessageEntity[] | undefined

  /**
   * Media added to the poll option
   */
  readonly media?: PollMedia | undefined

  /**
   * Number of users who voted for this option; may be 0 if unknown
   */
  readonly voter_count: number

  /**
   * User who added the option; omitted if the option wasn't added by a user
   * after poll creation
   */
  readonly added_by_user?: User | undefined

  /**
   * Chat that added the option; omitted if the option wasn't added by a chat
   * after poll creation
   */
  readonly added_by_chat?: Chat | undefined

  /**
   * Point in time (Unix timestamp) when the option was added; omitted if the
   * option existed in the original poll
   */
  readonly addition_date?: number | undefined
}

/**
 * This object contains information about one answer option in a poll to be
 * sent.
 *
 * @see https://corefork.telegram.org/bots/api#inputpolloption
 */
export interface InputPollOption {
  /**
   * Option text, 1-100 characters
   */
  readonly text: string

  /**
   * Mode for parsing entities in the text. See formatting options for more
   * details. Currently, only custom emoji entities are allowed.
   */
  readonly text_parse_mode?: string | undefined

  /**
   * A JSON-serialized list of special entities that appear in the poll option
   * text. It can be specified instead of text_parse_mode.
   */
  readonly text_entities?: MessageEntity[] | undefined

  /**
   * Media added to the poll option
   */
  readonly media?: InputPollOptionMedia | undefined
}

/**
 * This object represents an answer of a user in a non-anonymous poll.
 *
 * @see https://corefork.telegram.org/bots/api#pollanswer
 */
export interface PollAnswer {
  /**
   * Unique poll identifier
   */
  readonly poll_id: string

  /**
   * The chat that changed the answer to the poll, if the voter is anonymous
   */
  readonly voter_chat?: Chat | undefined

  /**
   * The user that changed the answer to the poll, if the voter isn't anonymous
   */
  readonly user?: User | undefined

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
 * This object contains information about a poll.
 *
 * @see https://corefork.telegram.org/bots/api#poll
 */
export interface Poll {
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
 * Describes a task in a checklist.
 *
 * @see https://corefork.telegram.org/bots/api#checklisttask
 */
export interface ChecklistTask {
  /**
   * Unique identifier of the task
   */
  readonly id: number

  /**
   * Text of the task
   */
  readonly text: string

  /**
   * Special entities that appear in the task text
   */
  readonly text_entities?: MessageEntity[] | undefined

  /**
   * User that completed the task; omitted if the task wasn't completed by a user
   */
  readonly completed_by_user?: User | undefined

  /**
   * Chat that completed the task; omitted if the task wasn't completed by a chat
   */
  readonly completed_by_chat?: Chat | undefined

  /**
   * Point in time (Unix timestamp) when the task was completed; 0 if the task
   * wasn't completed
   */
  readonly completion_date?: number | undefined
}

/**
 * Describes a checklist.
 *
 * @see https://corefork.telegram.org/bots/api#checklist
 */
export interface Checklist {
  /**
   * Title of the checklist
   */
  readonly title: string

  /**
   * Special entities that appear in the checklist title
   */
  readonly title_entities?: MessageEntity[] | undefined

  /**
   * List of tasks in the checklist
   */
  readonly tasks: ChecklistTask[]

  /**
   * True, if users other than the creator of the list can add tasks to the list
   */
  readonly others_can_add_tasks?: true | undefined

  /**
   * True, if users other than the creator of the list can mark tasks as done or
   * not done
   */
  readonly others_can_mark_tasks_as_done?: true | undefined
}

/**
 * Describes a task to add to a checklist.
 *
 * @see https://corefork.telegram.org/bots/api#inputchecklisttask
 */
export interface InputChecklistTask {
  /**
   * Unique identifier of the task; must be positive and unique among all task
   * identifiers currently present in the checklist
   */
  readonly id: number

  /**
   * Text of the task; 1-100 characters after entities parsing
   */
  readonly text: string

  /**
   * Mode for parsing entities in the text. See formatting options for more
   * details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the text, which can be specified
   * instead of parse_mode. Currently, only bold, italic, underline,
   * strikethrough, spoiler, custom_emoji, and date_time entities are allowed.
   */
  readonly text_entities?: MessageEntity[] | undefined
}

/**
 * Describes a checklist to create.
 *
 * @see https://corefork.telegram.org/bots/api#inputchecklist
 */
export interface InputChecklist {
  /**
   * Title of the checklist; 1-255 characters after entities parsing
   */
  readonly title: string

  /**
   * Mode for parsing entities in the title. See formatting options for more
   * details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the title, which can be specified
   * instead of parse_mode. Currently, only bold, italic, underline,
   * strikethrough, spoiler, custom_emoji, and date_time entities are allowed.
   */
  readonly title_entities?: MessageEntity[] | undefined

  /**
   * List of 1-30 tasks in the checklist
   */
  readonly tasks: InputChecklistTask[]

  /**
   * Pass True if other users can add tasks to the checklist
   */
  readonly others_can_add_tasks?: boolean | undefined

  /**
   * Pass True if other users can mark tasks as done or not done in the checklist
   */
  readonly others_can_mark_tasks_as_done?: boolean | undefined
}

/**
 * This object represents a point on the map.
 *
 * @see https://corefork.telegram.org/bots/api#location
 */
export interface Location {
  /**
   * Latitude as defined by the sender
   */
  readonly latitude: number

  /**
   * Longitude as defined by the sender
   */
  readonly longitude: number

  /**
   * The radius of uncertainty for the location, measured in meters; 0-1500
   */
  readonly horizontal_accuracy?: number | undefined

  /**
   * Time relative to the message sending date, during which the location can be
   * updated; in seconds. For active live locations only.
   */
  readonly live_period?: number | undefined

  /**
   * The direction in which user is moving, in degrees; 1-360. For active live
   * locations only.
   */
  readonly heading?: number | undefined

  /**
   * The maximum distance for proximity alerts about approaching another chat
   * member, in meters. For sent live locations only.
   */
  readonly proximity_alert_radius?: number | undefined
}

/**
 * This object represents a venue.
 *
 * @see https://corefork.telegram.org/bots/api#venue
 */
export interface Venue {
  /**
   * Venue location. Can't be a live location.
   */
  readonly location: Location

  /**
   * Name of the venue
   */
  readonly title: string

  /**
   * Address of the venue
   */
  readonly address: string

  /**
   * Foursquare identifier of the venue
   */
  readonly foursquare_id?: string | undefined

  /**
   * Foursquare type of the venue. (For example, “arts_entertainment/default”,
   * “arts_entertainment/aquarium” or “food/icecream”.)
   */
  readonly foursquare_type?: string | undefined

  /**
   * Google Places identifier of the venue
   */
  readonly google_place_id?: string | undefined

  /**
   * Google Places type of the venue. (See supported types.)
   */
  readonly google_place_type?: string | undefined
}

/**
 * Describes data sent from a Web App to the bot.
 *
 * @see https://corefork.telegram.org/bots/api#webappdata
 */
export interface WebAppData {
  /**
   * The data. Be aware that a bad client can send arbitrary data in this field.
   */
  readonly data: string

  /**
   * Text of the web_app keyboard button from which the Web App was opened. Be
   * aware that a bad client can send arbitrary data in this field.
   */
  readonly button_text: string
}

/**
 * This object represents the content of a service message, sent whenever a
 * user in the chat triggers a proximity alert set by another user.
 *
 * @see https://corefork.telegram.org/bots/api#proximityalerttriggered
 */
export interface ProximityAlertTriggered {
  /**
   * User that triggered the alert
   */
  readonly traveler: User

  /**
   * User that set the alert
   */
  readonly watcher: User

  /**
   * The distance between the users
   */
  readonly distance: number
}

/**
 * This object represents a service message about a change in auto-delete timer
 * settings.
 *
 * @see https://corefork.telegram.org/bots/api#messageautodeletetimerchanged
 */
export interface MessageAutoDeleteTimerChanged {
  /**
   * New auto-delete time for messages in the chat; in seconds
   */
  readonly message_auto_delete_time: number
}

/**
 * This object contains information about the bot that was created to be
 * managed by the current bot.
 *
 * @see https://corefork.telegram.org/bots/api#managedbotcreated
 */
export interface ManagedBotCreated {
  /**
   * Information about the bot. The bot's token can be fetched using the method
   * getManagedBotToken.
   */
  readonly bot: User
}

/**
 * This object contains information about the creation, token update, or owner
 * update of a bot that is managed by the current bot.
 *
 * @see https://corefork.telegram.org/bots/api#managedbotupdated
 */
export interface ManagedBotUpdated {
  /**
   * User that created the bot
   */
  readonly user: User

  /**
   * Information about the bot. Token of the bot can be fetched using the method
   * getManagedBotToken.
   */
  readonly bot: User
}

/**
 * This object contains information about changes to a user payment
 * subscription toward the current bot.
 *
 * @see https://corefork.telegram.org/bots/api#botsubscriptionupdated
 */
export interface BotSubscriptionUpdated {
  /**
   * User who subscribed for payments toward the bot
   */
  readonly user: User

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
 * Describes a service message about an option added to a poll.
 *
 * @see https://corefork.telegram.org/bots/api#polloptionadded
 */
export interface PollOptionAdded {
  /**
   * Message containing the poll to which the option was added, if known. Note
   * that the Message object in this field will not contain the reply_to_message
   * field even if it itself is a reply.
   */
  readonly poll_message?: MaybeInaccessibleMessage | undefined

  /**
   * Unique identifier of the added option
   */
  readonly option_persistent_id: string

  /**
   * Option text
   */
  readonly option_text: string

  /**
   * Special entities that appear in the option_text
   */
  readonly option_text_entities?: MessageEntity[] | undefined
}

/**
 * Describes a service message about an option deleted from a poll.
 *
 * @see https://corefork.telegram.org/bots/api#polloptiondeleted
 */
export interface PollOptionDeleted {
  /**
   * Message containing the poll from which the option was deleted, if known.
   * Note that the Message object in this field will not contain the
   * reply_to_message field even if it itself is a reply.
   */
  readonly poll_message?: MaybeInaccessibleMessage | undefined

  /**
   * Unique identifier of the deleted option
   */
  readonly option_persistent_id: string

  /**
   * Option text
   */
  readonly option_text: string

  /**
   * Special entities that appear in the option_text
   */
  readonly option_text_entities?: MessageEntity[] | undefined
}

/**
 * This object represents a service message about a user boosting a chat.
 *
 * @see https://corefork.telegram.org/bots/api#chatboostadded
 */
export interface ChatBoostAdded {
  /**
   * Number of boosts added by the user
   */
  readonly boost_count: number
}

/**
 * This object describes the way a background is filled based on the selected
 * colors. Currently, it can be one of
 *
 * @see https://corefork.telegram.org/bots/api#backgroundfill
 */
export type BackgroundFill =
  | BackgroundFillFreeformGradient
  | BackgroundFillGradient
  | BackgroundFillSolid

/**
 * The background is filled using the selected color.
 *
 * @see https://corefork.telegram.org/bots/api#backgroundfillsolid
 */
export interface BackgroundFillSolid {
  /**
   * Type of the background fill, always “solid”
   */
  readonly type: string

  /**
   * The color of the background fill in the RGB24 format
   */
  readonly color: number
}

/**
 * The background is a gradient fill.
 *
 * @see https://corefork.telegram.org/bots/api#backgroundfillgradient
 */
export interface BackgroundFillGradient {
  /**
   * Type of the background fill, always “gradient”
   */
  readonly type: string

  /**
   * Top color of the gradient in the RGB24 format
   */
  readonly top_color: number

  /**
   * Bottom color of the gradient in the RGB24 format
   */
  readonly bottom_color: number

  /**
   * Clockwise rotation angle of the background fill in degrees; 0-359
   */
  readonly rotation_angle: number
}

/**
 * The background is a freeform gradient that rotates after every message in
 * the chat.
 *
 * @see https://corefork.telegram.org/bots/api#backgroundfillfreeformgradient
 */
export interface BackgroundFillFreeformGradient {
  /**
   * Type of the background fill, always “freeform_gradient”
   */
  readonly type: string

  /**
   * A list of the 3 or 4 base colors that are used to generate the freeform
   * gradient in the RGB24 format
   */
  readonly colors: number[]
}

/**
 * This object describes the type of a background. Currently, it can be one of
 *
 * @see https://corefork.telegram.org/bots/api#backgroundtype
 */
export type BackgroundType =
  | BackgroundTypeChatTheme
  | BackgroundTypeFill
  | BackgroundTypePattern
  | BackgroundTypeWallpaper

/**
 * The background is automatically filled based on the selected colors.
 *
 * @see https://corefork.telegram.org/bots/api#backgroundtypefill
 */
export interface BackgroundTypeFill {
  /**
   * Type of the background, always “fill”
   */
  readonly type: string

  /**
   * The background fill
   */
  readonly fill: BackgroundFill

  /**
   * Dimming of the background in dark themes, as a percentage; 0-100
   */
  readonly dark_theme_dimming: number
}

/**
 * The background is a wallpaper in the JPEG format.
 *
 * @see https://corefork.telegram.org/bots/api#backgroundtypewallpaper
 */
export interface BackgroundTypeWallpaper {
  /**
   * Type of the background, always “wallpaper”
   */
  readonly type: string

  /**
   * Document with the wallpaper
   */
  readonly document: Document

  /**
   * Dimming of the background in dark themes, as a percentage; 0-100
   */
  readonly dark_theme_dimming: number

  /**
   * True, if the wallpaper is downscaled to fit in a 450x450 square and then
   * box-blurred with radius 12
   */
  readonly is_blurred?: true | undefined

  /**
   * True, if the background moves slightly when the device is tilted
   */
  readonly is_moving?: true | undefined
}

/**
 * The background is a .PNG or .TGV (gzipped subset of SVG with MIME type
 * “application/x-tgwallpattern”) pattern to be combined with the background
 * fill chosen by the user.
 *
 * @see https://corefork.telegram.org/bots/api#backgroundtypepattern
 */
export interface BackgroundTypePattern {
  /**
   * Type of the background, always “pattern”
   */
  readonly type: string

  /**
   * Document with the pattern
   */
  readonly document: Document

  /**
   * The background fill that is combined with the pattern
   */
  readonly fill: BackgroundFill

  /**
   * Intensity of the pattern when it is shown above the filled background; 0-100
   */
  readonly intensity: number

  /**
   * True, if the background fill must be applied only to the pattern itself. All
   * other pixels are black in this case. For dark themes only.
   */
  readonly is_inverted?: true | undefined

  /**
   * True, if the background moves slightly when the device is tilted
   */
  readonly is_moving?: true | undefined
}

/**
 * The background is taken directly from a built-in chat theme.
 *
 * @see https://corefork.telegram.org/bots/api#backgroundtypechattheme
 */
export interface BackgroundTypeChatTheme {
  /**
   * Type of the background, always “chat_theme”
   */
  readonly type: string

  /**
   * Name of the chat theme, which is usually an emoji
   */
  readonly theme_name: string
}

/**
 * This object represents a chat background.
 *
 * @see https://corefork.telegram.org/bots/api#chatbackground
 */
export interface ChatBackground {
  /**
   * Type of the background
   */
  readonly type: BackgroundType
}

/**
 * Describes a service message about checklist tasks marked as done or not
 * done.
 *
 * @see https://corefork.telegram.org/bots/api#checklisttasksdone
 */
export interface ChecklistTasksDone {
  /**
   * Message containing the checklist whose tasks were marked as done or not
   * done. Note that the Message object in this field will not contain the
   * reply_to_message field even if it itself is a reply.
   */
  readonly checklist_message?: Message | undefined

  /**
   * Identifiers of the tasks that were marked as done
   */
  readonly marked_as_done_task_ids?: number[] | undefined

  /**
   * Identifiers of the tasks that were marked as not done
   */
  readonly marked_as_not_done_task_ids?: number[] | undefined
}

/**
 * Describes a service message about tasks added to a checklist.
 *
 * @see https://corefork.telegram.org/bots/api#checklisttasksadded
 */
export interface ChecklistTasksAdded {
  /**
   * Message containing the checklist to which the tasks were added. Note that
   * the Message object in this field will not contain the reply_to_message field
   * even if it itself is a reply.
   */
  readonly checklist_message?: Message | undefined

  /**
   * List of tasks added to the checklist
   */
  readonly tasks: ChecklistTask[]
}

/**
 * Describes a service message about a chat being added to a community.
 *
 * @see https://corefork.telegram.org/bots/api#communitychatadded
 */
export interface CommunityChatAdded {
  /**
   * The new community to which the chat belongs
   */
  readonly community: Community
}

/**
 * Describes a service message about a chat being removed from a community.
 * Currently holds no information.
 *
 * @see https://corefork.telegram.org/bots/api#communitychatremoved
 */
// biome-ignore lint/suspicious/noEmptyInterface: Telegram documents this type as carrying no fields
export interface CommunityChatRemoved {}

/**
 * This object represents a service message about a new forum topic created in
 * the chat.
 *
 * @see https://corefork.telegram.org/bots/api#forumtopiccreated
 */
export interface ForumTopicCreated {
  /**
   * Name of the topic
   */
  readonly name: string

  /**
   * Color of the topic icon in RGB format
   */
  readonly icon_color: number

  /**
   * Unique identifier of the custom emoji shown as the topic icon
   */
  readonly icon_custom_emoji_id?: string | undefined

  /**
   * True, if the name of the topic wasn't specified explicitly by its creator
   * and likely needs to be changed by the bot
   */
  readonly is_name_implicit?: true | undefined
}

/**
 * This object represents a service message about a forum topic closed in the
 * chat. Currently holds no information.
 *
 * @see https://corefork.telegram.org/bots/api#forumtopicclosed
 */
// biome-ignore lint/suspicious/noEmptyInterface: Telegram documents this type as carrying no fields
export interface ForumTopicClosed {}

/**
 * This object represents a service message about an edited forum topic.
 *
 * @see https://corefork.telegram.org/bots/api#forumtopicedited
 */
export interface ForumTopicEdited {
  /**
   * New name of the topic, if it was edited
   */
  readonly name?: string | undefined

  /**
   * New identifier of the custom emoji shown as the topic icon, if it was
   * edited; an empty string if the icon was removed
   */
  readonly icon_custom_emoji_id?: string | undefined
}

/**
 * This object represents a service message about a forum topic reopened in the
 * chat. Currently holds no information.
 *
 * @see https://corefork.telegram.org/bots/api#forumtopicreopened
 */
// biome-ignore lint/suspicious/noEmptyInterface: Telegram documents this type as carrying no fields
export interface ForumTopicReopened {}

/**
 * This object represents a service message about General forum topic hidden in
 * the chat. Currently holds no information.
 *
 * @see https://corefork.telegram.org/bots/api#generalforumtopichidden
 */
// biome-ignore lint/suspicious/noEmptyInterface: Telegram documents this type as carrying no fields
export interface GeneralForumTopicHidden {}

/**
 * This object represents a service message about General forum topic unhidden
 * in the chat. Currently holds no information.
 *
 * @see https://corefork.telegram.org/bots/api#generalforumtopicunhidden
 */
// biome-ignore lint/suspicious/noEmptyInterface: Telegram documents this type as carrying no fields
export interface GeneralForumTopicUnhidden {}

/**
 * This object contains information about a user that was shared with the bot
 * using a KeyboardButtonRequestUsers button.
 *
 * @see https://corefork.telegram.org/bots/api#shareduser
 */
export interface SharedUser {
  /**
   * Identifier of the shared user. This number may have more than 32 significant
   * bits and some programming languages may have difficulty/silent defects in
   * interpreting it. But it has at most 52 significant bits, so 64-bit integers
   * or double-precision float types are safe for storing these identifiers. The
   * bot may not have access to the user and could be unable to use this
   * identifier, unless the user is already known to the bot by some other means.
   */
  readonly user_id: number

  /**
   * First name of the user, if the name was requested by the bot
   */
  readonly first_name?: string | undefined

  /**
   * Last name of the user, if the name was requested by the bot
   */
  readonly last_name?: string | undefined

  /**
   * Username of the user, if the username was requested by the bot
   */
  readonly username?: string | undefined

  /**
   * Available sizes of the chat photo, if the photo was requested by the bot
   */
  readonly photo?: PhotoSize[] | undefined
}

/**
 * This object contains information about the users whose identifiers were
 * shared with the bot using a KeyboardButtonRequestUsers button.
 *
 * @see https://corefork.telegram.org/bots/api#usersshared
 */
export interface UsersShared {
  /**
   * Identifier of the request
   */
  readonly request_id: number

  /**
   * Information about users shared with the bot
   */
  readonly users: SharedUser[]
}

/**
 * This object contains information about a chat that was shared with the bot
 * using a KeyboardButtonRequestChat button.
 *
 * @see https://corefork.telegram.org/bots/api#chatshared
 */
export interface ChatShared {
  /**
   * Identifier of the request
   */
  readonly request_id: number

  /**
   * Identifier of the shared chat. This number may have more than 32 significant
   * bits and some programming languages may have difficulty/silent defects in
   * interpreting it. But it has at most 52 significant bits, so a 64-bit integer
   * or double-precision float type are safe for storing this identifier. The bot
   * may not have access to the chat and could be unable to use this identifier,
   * unless the chat is already known to the bot by some other means.
   */
  readonly chat_id: number

  /**
   * Title of the chat, if the title was requested by the bot
   */
  readonly title?: string | undefined

  /**
   * Username of the chat, if the username was requested by the bot and available
   */
  readonly username?: string | undefined

  /**
   * Available sizes of the chat photo, if the photo was requested by the bot
   */
  readonly photo?: PhotoSize[] | undefined
}

/**
 * This object represents a service message about a user allowing a bot to
 * write messages after adding it to the attachment menu, launching a Web App
 * from a link, or accepting an explicit request from a Web App sent by the
 * method requestWriteAccess.
 *
 * @see https://corefork.telegram.org/bots/api#writeaccessallowed
 */
export interface WriteAccessAllowed {
  /**
   * True, if the access was granted after the user accepted an explicit request
   * from a Web App sent by the method requestWriteAccess
   */
  readonly from_request?: boolean | undefined

  /**
   * Name of the Web App, if the access was granted when the Web App was launched
   * from a link
   */
  readonly web_app_name?: string | undefined

  /**
   * True, if the access was granted when the bot was added to the attachment or
   * side menu
   */
  readonly from_attachment_menu?: boolean | undefined
}

/**
 * This object represents a service message about a video chat scheduled in the
 * chat.
 *
 * @see https://corefork.telegram.org/bots/api#videochatscheduled
 */
export interface VideoChatScheduled {
  /**
   * Point in time (Unix timestamp) when the video chat is supposed to be started
   * by a chat administrator
   */
  readonly start_date: number
}

/**
 * This object represents a service message about a video chat started in the
 * chat. Currently holds no information.
 *
 * @see https://corefork.telegram.org/bots/api#videochatstarted
 */
// biome-ignore lint/suspicious/noEmptyInterface: Telegram documents this type as carrying no fields
export interface VideoChatStarted {}

/**
 * This object represents a service message about a video chat ended in the
 * chat.
 *
 * @see https://corefork.telegram.org/bots/api#videochatended
 */
export interface VideoChatEnded {
  /**
   * Video chat duration in seconds
   */
  readonly duration: number
}

/**
 * This object represents a service message about new members invited to a
 * video chat.
 *
 * @see https://corefork.telegram.org/bots/api#videochatparticipantsinvited
 */
export interface VideoChatParticipantsInvited {
  /**
   * New members that were invited to the video chat
   */
  readonly users: User[]
}

/**
 * Describes a service message about a change in the price of paid messages
 * within a chat.
 *
 * @see https://corefork.telegram.org/bots/api#paidmessagepricechanged
 */
export interface PaidMessagePriceChanged {
  /**
   * The new number of Telegram Stars that must be paid by non-administrator
   * users of the supergroup chat for each sent message
   */
  readonly paid_message_star_count: number
}

/**
 * Describes a service message about a change in the price of direct messages
 * sent to a channel chat.
 *
 * @see https://corefork.telegram.org/bots/api#directmessagepricechanged
 */
export interface DirectMessagePriceChanged {
  /**
   * True, if direct messages are enabled for the channel chat; False otherwise
   */
  readonly are_direct_messages_enabled: boolean

  /**
   * The new number of Telegram Stars that must be paid by users for each direct
   * message sent to the channel. Does not apply to users who have been exempted
   * by administrators. Defaults to 0.
   */
  readonly direct_message_star_count?: number | undefined
}

/**
 * Describes a service message about the approval of a suggested post.
 *
 * @see https://corefork.telegram.org/bots/api#suggestedpostapproved
 */
export interface SuggestedPostApproved {
  /**
   * Message containing the suggested post. Note that the Message object in this
   * field will not contain the reply_to_message field even if it itself is a
   * reply.
   */
  readonly suggested_post_message?: Message | undefined

  /**
   * Amount paid for the post
   */
  readonly price?: SuggestedPostPrice | undefined

  /**
   * Date when the post will be published
   */
  readonly send_date: number
}

/**
 * Describes a service message about the failed approval of a suggested post.
 * Currently, only caused by insufficient user funds at the time of approval.
 *
 * @see https://corefork.telegram.org/bots/api#suggestedpostapprovalfailed
 */
export interface SuggestedPostApprovalFailed {
  /**
   * Message containing the suggested post whose approval has failed. Note that
   * the Message object in this field will not contain the reply_to_message field
   * even if it itself is a reply.
   */
  readonly suggested_post_message?: Message | undefined

  /**
   * Expected price of the post
   */
  readonly price: SuggestedPostPrice
}

/**
 * Describes a service message about the rejection of a suggested post.
 *
 * @see https://corefork.telegram.org/bots/api#suggestedpostdeclined
 */
export interface SuggestedPostDeclined {
  /**
   * Message containing the suggested post. Note that the Message object in this
   * field will not contain the reply_to_message field even if it itself is a
   * reply.
   */
  readonly suggested_post_message?: Message | undefined

  /**
   * Comment with which the post was declined
   */
  readonly comment?: string | undefined
}

/**
 * Describes a service message about a successful payment for a suggested post.
 *
 * @see https://corefork.telegram.org/bots/api#suggestedpostpaid
 */
export interface SuggestedPostPaid {
  /**
   * Message containing the suggested post. Note that the Message object in this
   * field will not contain the reply_to_message field even if it itself is a
   * reply.
   */
  readonly suggested_post_message?: Message | undefined

  /**
   * Currency in which the payment was made. Currently, one of “XTR” for Telegram
   * Stars or “TON” for TON grams.
   */
  readonly currency: string

  /**
   * The amount of the currency that was received by the channel in nanograms;
   * for payments in TON grams only
   */
  readonly amount?: number | undefined

  /**
   * The amount of Telegram Stars that was received by the channel; for payments
   * in Telegram Stars only
   */
  readonly star_amount?: StarAmount | undefined
}

/**
 * Describes a service message about a payment refund for a suggested post.
 *
 * @see https://corefork.telegram.org/bots/api#suggestedpostrefunded
 */
export interface SuggestedPostRefunded {
  /**
   * Message containing the suggested post. Note that the Message object in this
   * field will not contain the reply_to_message field even if it itself is a
   * reply.
   */
  readonly suggested_post_message?: Message | undefined

  /**
   * Reason for the refund. Currently, one of “post_deleted” if the post was
   * deleted within 24 hours of being posted or removed from scheduled messages
   * without being posted, or “payment_refunded” if the payer refunded their
   * payment.
   */
  readonly reason: string
}

/**
 * This object represents a service message about the creation of a scheduled
 * giveaway.
 *
 * @see https://corefork.telegram.org/bots/api#giveawaycreated
 */
export interface GiveawayCreated {
  /**
   * The number of Telegram Stars to be split between giveaway winners; for
   * Telegram Star giveaways only
   */
  readonly prize_star_count?: number | undefined
}

/**
 * This object represents a message about a scheduled giveaway.
 *
 * @see https://corefork.telegram.org/bots/api#giveaway
 */
export interface Giveaway {
  /**
   * The list of chats which the user must join to participate in the giveaway
   */
  readonly chats: Chat[]

  /**
   * Point in time (Unix timestamp) when winners of the giveaway will be selected
   */
  readonly winners_selection_date: number

  /**
   * The number of users which are supposed to be selected as winners of the
   * giveaway
   */
  readonly winner_count: number

  /**
   * True, if only users who join the chats after the giveaway started should be
   * eligible to win
   */
  readonly only_new_members?: true | undefined

  /**
   * True, if the list of giveaway winners will be visible to everyone
   */
  readonly has_public_winners?: true | undefined

  /**
   * Description of additional giveaway prize
   */
  readonly prize_description?: string | undefined

  /**
   * A list of two-letter ISO 3166-1 alpha-2 country codes indicating the
   * countries from which eligible users for the giveaway must come. If empty,
   * then all users can participate in the giveaway. Users with a phone number
   * that was bought on Fragment can always participate in giveaways.
   */
  readonly country_codes?: string[] | undefined

  /**
   * The number of Telegram Stars to be split between giveaway winners; for
   * Telegram Star giveaways only
   */
  readonly prize_star_count?: number | undefined

  /**
   * The number of months the Telegram Premium subscription won from the giveaway
   * will be active for; for Telegram Premium giveaways only
   */
  readonly premium_subscription_month_count?: number | undefined
}

/**
 * This object represents a message about the completion of a giveaway with
 * public winners.
 *
 * @see https://corefork.telegram.org/bots/api#giveawaywinners
 */
export interface GiveawayWinners {
  /**
   * The chat that created the giveaway
   */
  readonly chat: Chat

  /**
   * Identifier of the message with the giveaway in the chat
   */
  readonly giveaway_message_id: number

  /**
   * Point in time (Unix timestamp) when winners of the giveaway were selected
   */
  readonly winners_selection_date: number

  /**
   * Total number of winners in the giveaway
   */
  readonly winner_count: number

  /**
   * List of up to 100 winners of the giveaway
   */
  readonly winners: User[]

  /**
   * The number of other chats the user had to join in order to be eligible for
   * the giveaway
   */
  readonly additional_chat_count?: number | undefined

  /**
   * The number of Telegram Stars that were split between giveaway winners; for
   * Telegram Star giveaways only
   */
  readonly prize_star_count?: number | undefined

  /**
   * The number of months the Telegram Premium subscription won from the giveaway
   * will be active for; for Telegram Premium giveaways only
   */
  readonly premium_subscription_month_count?: number | undefined

  /**
   * Number of undistributed prizes
   */
  readonly unclaimed_prize_count?: number | undefined

  /**
   * True, if only users who had joined the chats after the giveaway started were
   * eligible to win
   */
  readonly only_new_members?: true | undefined

  /**
   * True, if the giveaway was canceled because the payment for it was refunded
   */
  readonly was_refunded?: true | undefined

  /**
   * Description of additional giveaway prize
   */
  readonly prize_description?: string | undefined
}

/**
 * This object represents a service message about the completion of a giveaway
 * without public winners.
 *
 * @see https://corefork.telegram.org/bots/api#giveawaycompleted
 */
export interface GiveawayCompleted {
  /**
   * Number of winners in the giveaway
   */
  readonly winner_count: number

  /**
   * Number of undistributed prizes
   */
  readonly unclaimed_prize_count?: number | undefined

  /**
   * Message with the giveaway that was completed, if it wasn't deleted
   */
  readonly giveaway_message?: Message | undefined

  /**
   * True, if the giveaway is a Telegram Star giveaway. Otherwise, currently, the
   * giveaway is a Telegram Premium giveaway.
   */
  readonly is_star_giveaway?: true | undefined
}

/**
 * Describes the options used for link preview generation.
 *
 * @see https://corefork.telegram.org/bots/api#linkpreviewoptions
 */
export interface LinkPreviewOptions {
  /**
   * True, if the link preview is disabled
   */
  readonly is_disabled?: boolean | undefined

  /**
   * URL to use for the link preview. If empty, then the first URL found in the
   * message text will be used.
   */
  readonly url?: string | undefined

  /**
   * True, if the media in the link preview is supposed to be shrunk; ignored if
   * the URL isn't explicitly specified or media size change isn't supported for
   * the preview
   */
  readonly prefer_small_media?: boolean | undefined

  /**
   * True, if the media in the link preview is supposed to be enlarged; ignored
   * if the URL isn't explicitly specified or media size change isn't supported
   * for the preview
   */
  readonly prefer_large_media?: boolean | undefined

  /**
   * True, if the link preview must be shown above the message text; otherwise,
   * the link preview will be shown below the message text
   */
  readonly show_above_text?: boolean | undefined
}

/**
 * Describes the price of a suggested post.
 *
 * @see https://corefork.telegram.org/bots/api#suggestedpostprice
 */
export interface SuggestedPostPrice {
  /**
   * Currency in which the post will be paid. Currently, must be one of “XTR” for
   * Telegram Stars or “TON” for TON grams.
   */
  readonly currency: string

  /**
   * The amount of the currency that will be paid for the post in the smallest
   * units of the currency, i.e. Telegram Stars or nanograms. Currently, price in
   * Telegram Stars must be between 5 and 100000, and price in nanograms must be
   * between 10000000 and 10000000000000.
   */
  readonly amount: number
}

/**
 * Contains information about a suggested post.
 *
 * @see https://corefork.telegram.org/bots/api#suggestedpostinfo
 */
export interface SuggestedPostInfo {
  /**
   * State of the suggested post. Currently, it can be one of “pending”,
   * “approved”, “declined”.
   */
  readonly state: string

  /**
   * Proposed price of the post. If the field is omitted, then the post is
   * unpaid.
   */
  readonly price?: SuggestedPostPrice | undefined

  /**
   * Proposed send date of the post. If the field is omitted, then the post can
   * be published at any time within 30 days at the sole discretion of the user
   * or administrator who approves it.
   */
  readonly send_date?: number | undefined
}

/**
 * Contains parameters of a post that is being suggested by the bot.
 *
 * @see https://corefork.telegram.org/bots/api#suggestedpostparameters
 */
export interface SuggestedPostParameters {
  /**
   * Proposed price for the post. If the field is omitted, then the post is
   * unpaid.
   */
  readonly price?: SuggestedPostPrice | undefined

  /**
   * Proposed send date of the post. If specified, then the date must be between
   * 300 second and 2678400 seconds (30 days) in the future. If the field is
   * omitted, then the post can be published at any time within 30 days at the
   * sole discretion of the user who approves it.
   */
  readonly send_date?: number | undefined
}

/**
 * Describes a topic of a direct messages chat.
 *
 * @see https://corefork.telegram.org/bots/api#directmessagestopic
 */
export interface DirectMessagesTopic {
  /**
   * Unique identifier of the topic. This number may have more than 32
   * significant bits and some programming languages may have difficulty/silent
   * defects in interpreting it. But it has at most 52 significant bits, so a
   * 64-bit integer or double-precision float type are safe for storing this
   * identifier.
   */
  readonly topic_id: number

  /**
   * Information about the user that created the topic. Currently, it is always
   * present.
   */
  readonly user?: User | undefined
}

/**
 * This object represent a user's profile pictures.
 *
 * @see https://corefork.telegram.org/bots/api#userprofilephotos
 */
export interface UserProfilePhotos {
  /**
   * Total number of profile pictures the target user has
   */
  readonly total_count: number

  /**
   * Requested profile pictures (in up to 4 sizes each)
   */
  readonly photos: PhotoSize[][]
}

/**
 * This object represents the audios displayed on a user's profile.
 *
 * @see https://corefork.telegram.org/bots/api#userprofileaudios
 */
export interface UserProfileAudios {
  /**
   * Total number of profile audios for the target user
   */
  readonly total_count: number

  /**
   * Requested profile audios
   */
  readonly audios: Audio[]
}

/**
 * This object represents a file ready to be downloaded. The file can be
 * downloaded via the link
 * https://api.telegram.org/file/bot<token>/<file_path>. It is guaranteed that
 * the link will be valid for at least 1 hour. When the link expires, a new one
 * can be requested by calling getFile. The maximum file size to download is 20
 * MB
 *
 * @see https://corefork.telegram.org/bots/api#file
 */
export interface File {
  /**
   * Identifier for this file, which can be used to download or reuse the file
   */
  readonly file_id: string

  /**
   * Unique identifier for this file, which is supposed to be the same over time
   * and for different bots. Can't be used to download or reuse the file.
   */
  readonly file_unique_id: string

  /**
   * File size in bytes. It can be bigger than 2^31 and some programming
   * languages may have difficulty/silent defects in interpreting it. But it has
   * at most 52 significant bits, so a signed 64-bit integer or double-precision
   * float type are safe for storing this value.
   */
  readonly file_size?: number | undefined

  /**
   * File path. Use https://api.telegram.org/file/bot<token>/<file_path> to get
   * the file.
   */
  readonly file_path?: string | undefined
}

/**
 * Describes a Web App.
 *
 * @see https://corefork.telegram.org/bots/api#webappinfo
 */
export interface WebAppInfo {
  /**
   * An HTTPS URL of a Web App to be opened with additional data as specified in
   * Initializing Web Apps
   */
  readonly url: string
}

/**
 * This object represents a custom keyboard with reply options (see
 * Introduction to bots for details and examples). Not supported in channels
 * and for messages sent on behalf of a business account.
 *
 * @see https://corefork.telegram.org/bots/api#replykeyboardmarkup
 */
export interface ReplyKeyboardMarkup {
  /**
   * Array of button rows, each represented by an Array of KeyboardButton objects
   */
  readonly keyboard: KeyboardButton[][]

  /**
   * Requests clients to always show the keyboard when the regular keyboard is
   * hidden. Defaults to False, in which case the custom keyboard can be hidden
   * and opened with a keyboard icon.
   */
  readonly is_persistent?: boolean | undefined

  /**
   * Requests clients to resize the keyboard vertically for optimal fit (e.g.,
   * make the keyboard smaller if there are just two rows of buttons). Defaults
   * to False, in which case the custom keyboard is always of the same height as
   * the app's standard keyboard.
   */
  readonly resize_keyboard?: boolean | undefined

  /**
   * Requests clients to hide the keyboard as soon as it's been used. The
   * keyboard will still be available, but clients will automatically display the
   * usual letter-keyboard in the chat - the user can press a special button in
   * the input field to see the custom keyboard again. Defaults to False.
   */
  readonly one_time_keyboard?: boolean | undefined

  /**
   * The placeholder to be shown in the input field when the keyboard is active;
   * 1-64 characters
   */
  readonly input_field_placeholder?: string | undefined

  /**
   * Use this parameter if you want to show the keyboard to specific users only.
   * Targets: 1) users that are @mentioned in the text of the Message object; 2)
   * if the bot's message is a reply to a message in the same chat and forum
   * topic, sender of the original message. Example: A user requests to change
   * the bot's language, bot replies to the request with a keyboard to select the
   * new language. Other users in the group don't see the keyboard.
   */
  readonly selective?: boolean | undefined
}

/**
 * This object represents one button of the reply keyboard. At most one of the
 * fields other than text, icon_custom_emoji_id, and style must be used to
 * specify the type of the button. For simple text buttons, String can be used
 * instead of this object to specify the button text.
 *
 * @see https://corefork.telegram.org/bots/api#keyboardbutton
 */
export interface KeyboardButton {
  /**
   * Text of the button. If none of the fields other than text,
   * icon_custom_emoji_id, and style are used, it will be sent as a message when
   * the button is pressed.
   */
  readonly text: string

  /**
   * Unique identifier of the custom emoji shown before the text of the button.
   * Can only be used by bots that purchased additional usernames on Fragment or
   * in the messages directly sent by the bot to private, group and supergroup
   * chats if the owner of the bot has a Telegram Premium subscription.
   */
  readonly icon_custom_emoji_id?: string | undefined

  /**
   * Style of the button. Must be one of “danger” (red), “success” (green) or
   * “primary” (blue). If omitted, then an app-specific style is used.
   */
  readonly style?: string | undefined

  /**
   * If specified, pressing the button will open a list of suitable users.
   * Identifiers of selected users will be sent to the bot in a “users_shared”
   * service message. Available in private chats only.
   */
  readonly request_users?: KeyboardButtonRequestUsers | undefined

  /**
   * If specified, pressing the button will open a list of suitable chats.
   * Tapping on a chat will send its identifier to the bot in a “chat_shared”
   * service message. Available in private chats only.
   */
  readonly request_chat?: KeyboardButtonRequestChat | undefined

  /**
   * If specified, pressing the button will ask the user to create and share a
   * bot that will be managed by the current bot. Available for bots that enabled
   * management of other bots in the @BotFather Mini App. Available in private
   * chats only.
   */
  readonly request_managed_bot?: KeyboardButtonRequestManagedBot | undefined

  /**
   * If True, the user's phone number will be sent as a contact when the button
   * is pressed. Available in private chats only.
   */
  readonly request_contact?: boolean | undefined

  /**
   * If True, the user's current location will be sent when the button is
   * pressed. Available in private chats only.
   */
  readonly request_location?: boolean | undefined

  /**
   * If specified, the user will be asked to create a poll and send it to the bot
   * when the button is pressed. Available in private chats only.
   */
  readonly request_poll?: KeyboardButtonPollType | undefined

  /**
   * If specified, the described Web App will be launched when the button is
   * pressed. The Web App will be able to send a “web_app_data” service message.
   * Available in private chats only.
   */
  readonly web_app?: WebAppInfo | undefined
}

/**
 * This object defines the criteria used to request suitable users. Information
 * about the selected users will be shared with the bot when the corresponding
 * button is pressed. More about requesting users »
 *
 * @see https://corefork.telegram.org/bots/api#keyboardbuttonrequestusers
 */
export interface KeyboardButtonRequestUsers {
  /**
   * Signed 32-bit identifier of the request that will be received back in the
   * UsersShared object. Must be unique within the message.
   */
  readonly request_id: number

  /**
   * Pass True to request bots, pass False to request regular users. If not
   * specified, no additional restrictions are applied.
   */
  readonly user_is_bot?: boolean | undefined

  /**
   * Pass True to request premium users, pass False to request non-premium users.
   * If not specified, no additional restrictions are applied.
   */
  readonly user_is_premium?: boolean | undefined

  /**
   * The maximum number of users to be selected; 1-10. Defaults to 1.
   */
  readonly max_quantity?: number | undefined

  /**
   * Pass True to request the users' first and last names
   */
  readonly request_name?: boolean | undefined

  /**
   * Pass True to request the users' usernames
   */
  readonly request_username?: boolean | undefined

  /**
   * Pass True to request the users' photos
   */
  readonly request_photo?: boolean | undefined
}

/**
 * This object defines the criteria used to request a suitable chat.
 * Information about the selected chat will be shared with the bot when the
 * corresponding button is pressed. The bot will be granted requested rights in
 * the chat if appropriate. More about requesting chats ».
 *
 * @see https://corefork.telegram.org/bots/api#keyboardbuttonrequestchat
 */
export interface KeyboardButtonRequestChat {
  /**
   * Signed 32-bit identifier of the request, which will be received back in the
   * ChatShared object. Must be unique within the message.
   */
  readonly request_id: number

  /**
   * Pass True to request a channel chat, pass False to request a group or a
   * supergroup chat
   */
  readonly chat_is_channel: boolean

  /**
   * Pass True to request a forum supergroup, pass False to request a non-forum
   * chat. If not specified, no additional restrictions are applied.
   */
  readonly chat_is_forum?: boolean | undefined

  /**
   * Pass True to request a supergroup or a channel with a username, pass False
   * to request a chat without a username. If not specified, no additional
   * restrictions are applied.
   */
  readonly chat_has_username?: boolean | undefined

  /**
   * Pass True to request a chat owned by the user. Otherwise, no additional
   * restrictions are applied.
   */
  readonly chat_is_created?: boolean | undefined

  /**
   * A JSON-serialized object listing the required administrator rights of the
   * user in the chat. The rights must be a superset of bot_administrator_rights.
   * If not specified, no additional restrictions are applied.
   */
  readonly user_administrator_rights?: ChatAdministratorRights | undefined

  /**
   * A JSON-serialized object listing the required administrator rights of the
   * bot in the chat. The rights must be a subset of user_administrator_rights.
   * If not specified, no additional restrictions are applied.
   */
  readonly bot_administrator_rights?: ChatAdministratorRights | undefined

  /**
   * Pass True to request a chat with the bot as a member. Otherwise, no
   * additional restrictions are applied.
   */
  readonly bot_is_member?: boolean | undefined

  /**
   * Pass True to request the chat's title
   */
  readonly request_title?: boolean | undefined

  /**
   * Pass True to request the chat's username
   */
  readonly request_username?: boolean | undefined

  /**
   * Pass True to request the chat's photo
   */
  readonly request_photo?: boolean | undefined
}

/**
 * This object defines the parameters for the creation of a managed bot.
 * Information about the created bot will be shared with the bot using the
 * update managed_bot and a Message with the field managed_bot_created.
 *
 * @see https://corefork.telegram.org/bots/api#keyboardbuttonrequestmanagedbot
 */
export interface KeyboardButtonRequestManagedBot {
  /**
   * Signed 32-bit identifier of the request. Must be unique within the message.
   */
  readonly request_id: number

  /**
   * Suggested name for the bot
   */
  readonly suggested_name?: string | undefined

  /**
   * Suggested username for the bot
   */
  readonly suggested_username?: string | undefined
}

/**
 * This object represents type of a poll, which is allowed to be created and
 * sent when the corresponding button is pressed.
 *
 * @see https://corefork.telegram.org/bots/api#keyboardbuttonpolltype
 */
export interface KeyboardButtonPollType {
  /**
   * If quiz is passed, the user will be allowed to create only polls in the quiz
   * mode. If regular is passed, only regular polls will be allowed. Otherwise,
   * the user will be allowed to create a poll of any type.
   */
  readonly type?: string | undefined
}

/**
 * Upon receiving a message with this object, Telegram clients will remove the
 * current custom keyboard and display the default letter-keyboard. By default,
 * custom keyboards are displayed until a new keyboard is sent by a bot. An
 * exception is made for one-time keyboards that are hidden immediately after
 * the user presses a button (see ReplyKeyboardMarkup). Not supported in
 * channels and for messages sent on behalf of a business account.
 *
 * @see https://corefork.telegram.org/bots/api#replykeyboardremove
 */
export interface ReplyKeyboardRemove {
  /**
   * Requests clients to remove the custom keyboard (user will not be able to
   * summon this keyboard; if you want to hide the keyboard from sight but keep
   * it accessible, use one_time_keyboard in ReplyKeyboardMarkup)
   */
  readonly remove_keyboard: true

  /**
   * Use this parameter if you want to remove the keyboard for specific users
   * only. Targets: 1) users that are @mentioned in the text of the Message
   * object; 2) if the bot's message is a reply to a message in the same chat and
   * forum topic, sender of the original message. Example: A user votes in a
   * poll, bot returns confirmation message in reply to the vote and removes the
   * keyboard for that user, while still showing the keyboard with poll options
   * to users who haven't voted yet.
   */
  readonly selective?: boolean | undefined
}

/**
 * This object represents an inline keyboard that appears right next to the
 * message it belongs to.
 *
 * @see https://corefork.telegram.org/bots/api#inlinekeyboardmarkup
 */
export interface InlineKeyboardMarkup {
  /**
   * Array of button rows, each represented by an Array of InlineKeyboardButton
   * objects
   */
  readonly inline_keyboard: InlineKeyboardButton[][]
}

/**
 * This object represents one button of an inline keyboard. Exactly one of the
 * fields other than text, icon_custom_emoji_id, and style must be used to
 * specify the type of the button.
 *
 * @see https://corefork.telegram.org/bots/api#inlinekeyboardbutton
 */
export interface InlineKeyboardButton {
  /**
   * Label text on the button
   */
  readonly text: string

  /**
   * Unique identifier of the custom emoji shown before the text of the button.
   * Can only be used by bots that purchased additional usernames on Fragment or
   * in the messages directly sent by the bot to private, group and supergroup
   * chats if the owner of the bot has a Telegram Premium subscription.
   */
  readonly icon_custom_emoji_id?: string | undefined

  /**
   * Style of the button. Must be one of “danger” (red), “success” (green) or
   * “primary” (blue). If omitted, then an app-specific style is used.
   */
  readonly style?: string | undefined

  /**
   * HTTP or tg:// URL to be opened when the button is pressed. Links
   * tg://user?id=<user_id> can be used to mention a user by their identifier
   * without using a username, if this is allowed by their privacy settings.
   */
  readonly url?: string | undefined

  /**
   * Data to be sent in a callback query to the bot when the button is pressed,
   * 1-64 bytes
   */
  readonly callback_data?: string | undefined

  /**
   * Description of the Web App that will be launched when the user presses the
   * button. The Web App will be able to send an arbitrary message on behalf of
   * the user using the method answerWebAppQuery. Available only in private chats
   * between a user and the bot. Not supported for messages sent on behalf of a
   * business account.
   */
  readonly web_app?: WebAppInfo | undefined

  /**
   * An HTTPS URL used to automatically authorize the user. Can be used as a
   * replacement for the Telegram Login Widget.
   */
  readonly login_url?: LoginUrl | undefined

  /**
   * If set, pressing the button will prompt the user to select one of their
   * chats, open that chat and insert the bot's username and the specified inline
   * query in the input field. May be empty, in which case just the bot's
   * username will be inserted. Not supported for messages sent in channel direct
   * messages chats and on behalf of a business account.
   */
  readonly switch_inline_query?: string | undefined

  /**
   * If set, pressing the button will insert the bot's username and the specified
   * inline query in the current chat's input field. May be empty, in which case
   * only the bot's username will be inserted. This offers a quick way for the
   * user to open your bot in inline mode in the same chat - good for selecting
   * something from multiple options. Not supported in channels and for messages
   * sent in channel direct messages chats and on behalf of a business account.
   */
  readonly switch_inline_query_current_chat?: string | undefined

  /**
   * If set, pressing the button will prompt the user to select one of their
   * chats of the specified type, open that chat and insert the bot's username
   * and the specified inline query in the input field. Not supported for
   * messages sent in channel direct messages chats and on behalf of a business
   * account.
   */
  readonly switch_inline_query_chosen_chat?: SwitchInlineQueryChosenChat | undefined

  /**
   * Description of the button that copies the specified text to the clipboard
   */
  readonly copy_text?: CopyTextButton | undefined

  /**
   * Description of the game that will be launched when the user presses the
   * button. NOTE: This type of button must always be the first button in the
   * first row.
   */
  readonly callback_game?: CallbackGame | undefined

  /**
   * Specify True, to send a Pay button. Substrings “” and “XTR” in the buttons's
   * text will be replaced with a Telegram Star icon. NOTE: This type of button
   * must always be the first button in the first row and can only be used in
   * invoice messages.
   */
  readonly pay?: boolean | undefined
}

/**
 * This object represents a parameter of the inline keyboard button used to
 * automatically authorize a user. Serves as a great replacement for the
 * Telegram Login Widget when the user is coming from Telegram. All the user
 * needs to do is tap/click a button and confirm that they want to log in:
 * Telegram apps support these buttons as of version 5.7. Sample bot:
 * @discussbot
 *
 * @see https://corefork.telegram.org/bots/api#loginurl
 */
export interface LoginUrl {
  /**
   * An HTTPS URL to be opened with user authorization data added to the query
   * string when the button is pressed. If the user refuses to provide
   * authorization data, the original URL without information about the user will
   * be opened. The data added is the same as described in Receiving
   * authorization data. NOTE: You must always check the hash of the received
   * data to verify the authentication and the integrity of the data as described
   * in Checking authorization.
   */
  readonly url: string

  /**
   * New text of the button in forwarded messages
   */
  readonly forward_text?: string | undefined

  /**
   * Username of a bot, which will be used for user authorization. See Setting up
   * a bot for more details. If not specified, the current bot's username will be
   * assumed. The url's domain must be the same as the domain linked with the
   * bot. See Linking your domain to the bot for more details.
   */
  readonly bot_username?: string | undefined

  /**
   * Pass True to request the permission for your bot to send messages to the
   * user
   */
  readonly request_write_access?: boolean | undefined
}

/**
 * This object represents an inline button that switches the current user to
 * inline mode in a chosen chat, with an optional default inline query.
 *
 * @see https://corefork.telegram.org/bots/api#switchinlinequerychosenchat
 */
export interface SwitchInlineQueryChosenChat {
  /**
   * The default inline query to be inserted in the input field. If left empty,
   * only the bot's username will be inserted.
   */
  readonly query?: string | undefined

  /**
   * True, if private chats with users can be chosen
   */
  readonly allow_user_chats?: boolean | undefined

  /**
   * True, if private chats with bots can be chosen
   */
  readonly allow_bot_chats?: boolean | undefined

  /**
   * True, if group and supergroup chats can be chosen
   */
  readonly allow_group_chats?: boolean | undefined

  /**
   * True, if channel chats can be chosen
   */
  readonly allow_channel_chats?: boolean | undefined
}

/**
 * This object represents an inline keyboard button that copies specified text
 * to the clipboard.
 *
 * @see https://corefork.telegram.org/bots/api#copytextbutton
 */
export interface CopyTextButton {
  /**
   * The text to be copied to the clipboard; 1-256 characters
   */
  readonly text: string
}

/**
 * This object represents an incoming callback query from a callback button in
 * an inline keyboard. If the button that originated the query was attached to
 * a message sent by the bot, the field message will be present. If the button
 * was attached to a message sent via the bot (in inline mode), the field
 * inline_message_id will be present. Exactly one of the fields data or
 * game_short_name will be present.
 *
 * @see https://corefork.telegram.org/bots/api#callbackquery
 */
export interface CallbackQuery {
  /**
   * Unique identifier for this query
   */
  readonly id: string

  /**
   * Sender
   */
  readonly from: User

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
 * Upon receiving a message with this object, Telegram clients will display a
 * reply interface to the user (act as if the user has selected the bot's
 * message and tapped 'Reply'). This can be extremely useful if you want to
 * create user-friendly step-by-step interfaces without having to sacrifice
 * privacy mode. Not supported in channels and for messages sent on behalf of a
 * user account.
 *
 * @see https://corefork.telegram.org/bots/api#forcereply
 */
export interface ForceReply {
  /**
   * Shows reply interface to the user, as if they manually selected the bot's
   * message and tapped 'Reply'
   */
  readonly force_reply: true

  /**
   * The placeholder to be shown in the input field when the reply is active;
   * 1-64 characters
   */
  readonly input_field_placeholder?: string | undefined

  /**
   * Use this parameter if you want to force reply from specific users only.
   * Targets: 1) users that are @mentioned in the text of the Message object; 2)
   * if the bot's message is a reply to a message in the same chat and forum
   * topic, sender of the original message.
   */
  readonly selective?: boolean | undefined
}

/**
 * Represents a community (a group of chats).
 *
 * @see https://corefork.telegram.org/bots/api#community
 */
export interface Community {
  /**
   * Unique identifier for this community. This number may have more than 32
   * significant bits and some programming languages may have difficulty/silent
   * defects in interpreting it. But it has at most 52 significant bits, so a
   * signed 64-bit integer or double-precision float type are safe for storing
   * this identifier.
   */
  readonly id: number

  /**
   * Name of the community
   */
  readonly name: string
}

/**
 * This object represents a chat photo.
 *
 * @see https://corefork.telegram.org/bots/api#chatphoto
 */
export interface ChatPhoto {
  /**
   * File identifier of small (160x160) chat photo. This file_id can be used only
   * for photo download and only for as long as the photo is not changed.
   */
  readonly small_file_id: string

  /**
   * Unique file identifier of small (160x160) chat photo, which is supposed to
   * be the same over time and for different bots. Can't be used to download or
   * reuse the file.
   */
  readonly small_file_unique_id: string

  /**
   * File identifier of big (640x640) chat photo. This file_id can be used only
   * for photo download and only for as long as the photo is not changed.
   */
  readonly big_file_id: string

  /**
   * Unique file identifier of big (640x640) chat photo, which is supposed to be
   * the same over time and for different bots. Can't be used to download or
   * reuse the file.
   */
  readonly big_file_unique_id: string
}

/**
 * Represents an invite link for a chat.
 *
 * @see https://corefork.telegram.org/bots/api#chatinvitelink
 */
export interface ChatInviteLink {
  /**
   * The invite link. If the link was created by another chat administrator, then
   * the second part of the link will be replaced with “…”.
   */
  readonly invite_link: string

  /**
   * Creator of the link
   */
  readonly creator: User

  /**
   * True, if users joining the chat via the link need to be approved by chat
   * administrators
   */
  readonly creates_join_request: boolean

  /**
   * True, if the link is primary
   */
  readonly is_primary: boolean

  /**
   * True, if the link is revoked
   */
  readonly is_revoked: boolean

  /**
   * Invite link name
   */
  readonly name?: string | undefined

  /**
   * Point in time (Unix timestamp) when the link will expire or has been expired
   */
  readonly expire_date?: number | undefined

  /**
   * The maximum number of users that can be members of the chat simultaneously
   * after joining the chat via this invite link; 1-99999
   */
  readonly member_limit?: number | undefined

  /**
   * Number of pending join requests created using this link
   */
  readonly pending_join_request_count?: number | undefined

  /**
   * The number of seconds the subscription will be active for before the next
   * payment
   */
  readonly subscription_period?: number | undefined

  /**
   * The amount of Telegram Stars a user must pay initially and after each
   * subsequent subscription period to be a member of the chat using the link
   */
  readonly subscription_price?: number | undefined
}

/**
 * Represents the rights of an administrator in a chat.
 *
 * @see https://corefork.telegram.org/bots/api#chatadministratorrights
 */
export interface ChatAdministratorRights {
  /**
   * True, if the user's presence in the chat is hidden
   */
  readonly is_anonymous: boolean

  /**
   * True, if the administrator can access the chat event log, get boost list,
   * see hidden supergroup and channel members, report spam messages, ignore slow
   * mode, and send messages to the chat without paying Telegram Stars. Implied
   * by any other administrator privilege.
   */
  readonly can_manage_chat: boolean

  /**
   * True, if the administrator can delete messages of other users
   */
  readonly can_delete_messages: boolean

  /**
   * True, if the administrator can manage video chats
   */
  readonly can_manage_video_chats: boolean

  /**
   * True, if the administrator can restrict, ban or unban chat members, or
   * access supergroup statistics
   */
  readonly can_restrict_members: boolean

  /**
   * True, if the administrator can add new administrators with a subset of their
   * own privileges or demote administrators that they have promoted, directly or
   * indirectly (promoted by administrators that were appointed by the user)
   */
  readonly can_promote_members: boolean

  /**
   * True, if the user is allowed to change the chat title, photo and other
   * settings
   */
  readonly can_change_info: boolean

  /**
   * True, if the user is allowed to invite new users to the chat
   */
  readonly can_invite_users: boolean

  /**
   * True, if the administrator can post stories to the chat
   */
  readonly can_post_stories: boolean

  /**
   * True, if the administrator can edit stories posted by other users, post
   * stories to the chat page, pin chat stories, and access the chat's story
   * archive
   */
  readonly can_edit_stories: boolean

  /**
   * True, if the administrator can delete stories posted by other users
   */
  readonly can_delete_stories: boolean

  /**
   * True, if the administrator can post messages in the channel, approve
   * suggested posts, or access channel statistics; for channels only
   */
  readonly can_post_messages?: boolean | undefined

  /**
   * True, if the administrator can edit messages of other users and can pin
   * messages; for channels only
   */
  readonly can_edit_messages?: boolean | undefined

  /**
   * True, if the user is allowed to pin messages; for groups and supergroups
   * only
   */
  readonly can_pin_messages?: boolean | undefined

  /**
   * True, if the user is allowed to create, rename, close, and reopen forum
   * topics; for supergroups only
   */
  readonly can_manage_topics?: boolean | undefined

  /**
   * True, if the administrator can manage direct messages of the channel and
   * decline suggested posts; for channels only
   */
  readonly can_manage_direct_messages?: boolean | undefined

  /**
   * True, if the administrator can edit the tags of regular members; for groups
   * and supergroups only. If omitted, defaults to the value of can_pin_messages.
   */
  readonly can_manage_tags?: boolean | undefined
}

/**
 * This object represents changes in the status of a chat member.
 *
 * @see https://corefork.telegram.org/bots/api#chatmemberupdated
 */
export interface ChatMemberUpdated {
  /**
   * Chat the user belongs to
   */
  readonly chat: Chat

  /**
   * Performer of the action, which resulted in the change
   */
  readonly from: User

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
 * This object contains information about one member of a chat. Currently, the
 * following 6 types of chat members are supported:
 *
 * @see https://corefork.telegram.org/bots/api#chatmember
 */
export type ChatMember =
  | ChatMemberAdministrator
  | ChatMemberBanned
  | ChatMemberLeft
  | ChatMemberMember
  | ChatMemberOwner
  | ChatMemberRestricted

/**
 * Represents a chat member that owns the chat and has all administrator
 * privileges.
 *
 * @see https://corefork.telegram.org/bots/api#chatmemberowner
 */
export interface ChatMemberOwner {
  /**
   * The member's status in the chat, always “creator”
   */
  readonly status: string

  /**
   * Information about the user
   */
  readonly user: User

  /**
   * True, if the user's presence in the chat is hidden
   */
  readonly is_anonymous: boolean

  /**
   * Custom title for this user
   */
  readonly custom_title?: string | undefined
}

/**
 * Represents a chat member that has some additional privileges.
 *
 * @see https://corefork.telegram.org/bots/api#chatmemberadministrator
 */
export interface ChatMemberAdministrator {
  /**
   * The member's status in the chat, always “administrator”
   */
  readonly status: string

  /**
   * Information about the user
   */
  readonly user: User

  /**
   * True, if the bot is allowed to edit administrator privileges of that user
   */
  readonly can_be_edited: boolean

  /**
   * True, if the user's presence in the chat is hidden
   */
  readonly is_anonymous: boolean

  /**
   * True, if the administrator can access the chat event log, get boost list,
   * see hidden supergroup and channel members, report spam messages, ignore slow
   * mode, and send messages to the chat without paying Telegram Stars. Implied
   * by any other administrator privilege.
   */
  readonly can_manage_chat: boolean

  /**
   * True, if the administrator can delete messages of other users
   */
  readonly can_delete_messages: boolean

  /**
   * True, if the administrator can manage video chats
   */
  readonly can_manage_video_chats: boolean

  /**
   * True, if the administrator can restrict, ban or unban chat members, or
   * access supergroup statistics
   */
  readonly can_restrict_members: boolean

  /**
   * True, if the administrator can add new administrators with a subset of their
   * own privileges or demote administrators that they have promoted, directly or
   * indirectly (promoted by administrators that were appointed by the user)
   */
  readonly can_promote_members: boolean

  /**
   * True, if the user is allowed to change the chat title, photo and other
   * settings
   */
  readonly can_change_info: boolean

  /**
   * True, if the user is allowed to invite new users to the chat
   */
  readonly can_invite_users: boolean

  /**
   * True, if the administrator can post stories to the chat
   */
  readonly can_post_stories: boolean

  /**
   * True, if the administrator can edit stories posted by other users, post
   * stories to the chat page, pin chat stories, and access the chat's story
   * archive
   */
  readonly can_edit_stories: boolean

  /**
   * True, if the administrator can delete stories posted by other users
   */
  readonly can_delete_stories: boolean

  /**
   * True, if the administrator can post messages in the channel, approve
   * suggested posts, or access channel statistics; for channels only
   */
  readonly can_post_messages?: boolean | undefined

  /**
   * True, if the administrator can edit messages of other users and can pin
   * messages; for channels only
   */
  readonly can_edit_messages?: boolean | undefined

  /**
   * True, if the user is allowed to pin messages; for groups and supergroups
   * only
   */
  readonly can_pin_messages?: boolean | undefined

  /**
   * True, if the user is allowed to create, rename, close, and reopen forum
   * topics; for supergroups only
   */
  readonly can_manage_topics?: boolean | undefined

  /**
   * True, if the administrator can manage direct messages of the channel and
   * decline suggested posts; for channels only
   */
  readonly can_manage_direct_messages?: boolean | undefined

  /**
   * True, if the administrator can edit the tags of regular members; for groups
   * and supergroups only. If omitted, defaults to the value of can_pin_messages.
   */
  readonly can_manage_tags?: boolean | undefined

  /**
   * Custom title for this user
   */
  readonly custom_title?: string | undefined
}

/**
 * Represents a chat member that has no additional privileges or restrictions.
 *
 * @see https://corefork.telegram.org/bots/api#chatmembermember
 */
export interface ChatMemberMember {
  /**
   * The member's status in the chat, always “member”
   */
  readonly status: string

  /**
   * Tag of the member
   */
  readonly tag?: string | undefined

  /**
   * Information about the user
   */
  readonly user: User

  /**
   * Date when the user's subscription will expire; Unix time
   */
  readonly until_date?: number | undefined
}

/**
 * Represents a chat member that is under certain restrictions in the chat.
 * Supergroups only.
 *
 * @see https://corefork.telegram.org/bots/api#chatmemberrestricted
 */
export interface ChatMemberRestricted {
  /**
   * The member's status in the chat, always “restricted”
   */
  readonly status: string

  /**
   * Tag of the member
   */
  readonly tag?: string | undefined

  /**
   * Information about the user
   */
  readonly user: User

  /**
   * True, if the user is a member of the chat at the moment of the request
   */
  readonly is_member: boolean

  /**
   * True, if the user is allowed to send text messages, rich messages, contacts,
   * giveaways, giveaway winners, invoices, locations and venues
   */
  readonly can_send_messages: boolean

  /**
   * True, if the user is allowed to send audios
   */
  readonly can_send_audios: boolean

  /**
   * True, if the user is allowed to send documents
   */
  readonly can_send_documents: boolean

  /**
   * True, if the user is allowed to send photos
   */
  readonly can_send_photos: boolean

  /**
   * True, if the user is allowed to send videos
   */
  readonly can_send_videos: boolean

  /**
   * True, if the user is allowed to send video notes
   */
  readonly can_send_video_notes: boolean

  /**
   * True, if the user is allowed to send voice notes
   */
  readonly can_send_voice_notes: boolean

  /**
   * True, if the user is allowed to send polls and checklists
   */
  readonly can_send_polls: boolean

  /**
   * True, if the user is allowed to send animations, games, stickers and use
   * inline bots
   */
  readonly can_send_other_messages: boolean

  /**
   * True, if the user is allowed to add web page previews to their messages
   */
  readonly can_add_web_page_previews: boolean

  /**
   * True, if the user is allowed to react to messages
   */
  readonly can_react_to_messages: boolean

  /**
   * True, if the user is allowed to edit their own tag
   */
  readonly can_edit_tag: boolean

  /**
   * True, if the user is allowed to change the chat title, photo and other
   * settings
   */
  readonly can_change_info: boolean

  /**
   * True, if the user is allowed to invite new users to the chat
   */
  readonly can_invite_users: boolean

  /**
   * True, if the user is allowed to pin messages
   */
  readonly can_pin_messages: boolean

  /**
   * True, if the user is allowed to create forum topics
   */
  readonly can_manage_topics: boolean

  /**
   * Date when restrictions will be lifted for this user; Unix time. If 0, then
   * the user is restricted forever.
   */
  readonly until_date: number
}

/**
 * Represents a chat member that isn't currently a member of the chat, but may
 * join it themselves.
 *
 * @see https://corefork.telegram.org/bots/api#chatmemberleft
 */
export interface ChatMemberLeft {
  /**
   * The member's status in the chat, always “left”
   */
  readonly status: string

  /**
   * Information about the user
   */
  readonly user: User
}

/**
 * Represents a chat member that was banned in the chat and can't return to the
 * chat or view chat messages.
 *
 * @see https://corefork.telegram.org/bots/api#chatmemberbanned
 */
export interface ChatMemberBanned {
  /**
   * The member's status in the chat, always “kicked”
   */
  readonly status: string

  /**
   * Information about the user
   */
  readonly user: User

  /**
   * Date when restrictions will be lifted for this user; Unix time. If 0, then
   * the user is banned forever.
   */
  readonly until_date: number
}

/**
 * Represents a join request sent to a chat.
 *
 * @see https://corefork.telegram.org/bots/api#chatjoinrequest
 */
export interface ChatJoinRequest {
  /**
   * Chat to which the request was sent
   */
  readonly chat: Chat

  /**
   * User that sent the join request
   */
  readonly from: User

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
 * Describes actions that a non-administrator user is allowed to take in a
 * chat.
 *
 * @see https://corefork.telegram.org/bots/api#chatpermissions
 */
export interface ChatPermissions {
  /**
   * True, if the user is allowed to send text messages, rich messages, contacts,
   * giveaways, giveaway winners, invoices, locations and venues
   */
  readonly can_send_messages?: boolean | undefined

  /**
   * True, if the user is allowed to send audios
   */
  readonly can_send_audios?: boolean | undefined

  /**
   * True, if the user is allowed to send documents
   */
  readonly can_send_documents?: boolean | undefined

  /**
   * True, if the user is allowed to send photos
   */
  readonly can_send_photos?: boolean | undefined

  /**
   * True, if the user is allowed to send videos
   */
  readonly can_send_videos?: boolean | undefined

  /**
   * True, if the user is allowed to send video notes
   */
  readonly can_send_video_notes?: boolean | undefined

  /**
   * True, if the user is allowed to send voice notes
   */
  readonly can_send_voice_notes?: boolean | undefined

  /**
   * True, if the user is allowed to send polls and checklists
   */
  readonly can_send_polls?: boolean | undefined

  /**
   * True, if the user is allowed to send animations, games, stickers and use
   * inline bots
   */
  readonly can_send_other_messages?: boolean | undefined

  /**
   * True, if the user is allowed to add web page previews to their messages
   */
  readonly can_add_web_page_previews?: boolean | undefined

  /**
   * True, if the user is allowed to react to messages. If omitted, defaults to
   * the value of can_send_messages.
   */
  readonly can_react_to_messages?: boolean | undefined

  /**
   * True, if the user is allowed to edit their own tag. If omitted, defaults to
   * the value of can_pin_messages.
   */
  readonly can_edit_tag?: boolean | undefined

  /**
   * True, if the user is allowed to change the chat title, photo and other
   * settings. Ignored in public supergroups.
   */
  readonly can_change_info?: boolean | undefined

  /**
   * True, if the user is allowed to invite new users to the chat
   */
  readonly can_invite_users?: boolean | undefined

  /**
   * True, if the user is allowed to pin messages. Ignored in public supergroups.
   */
  readonly can_pin_messages?: boolean | undefined

  /**
   * True, if the user is allowed to create forum topics. If omitted, defaults to
   * the value of can_pin_messages.
   */
  readonly can_manage_topics?: boolean | undefined
}

/**
 * Describes the birthdate of a user.
 *
 * @see https://corefork.telegram.org/bots/api#birthdate
 */
export interface Birthdate {
  /**
   * Day of the user's birth; 1-31
   */
  readonly day: number

  /**
   * Month of the user's birth; 1-12
   */
  readonly month: number

  /**
   * Year of the user's birth
   */
  readonly year?: number | undefined
}

/**
 * Contains information about the start page settings of a Telegram Business
 * account.
 *
 * @see https://corefork.telegram.org/bots/api#businessintro
 */
export interface BusinessIntro {
  /**
   * Title text of the business intro
   */
  readonly title?: string | undefined

  /**
   * Message text of the business intro
   */
  readonly message?: string | undefined

  /**
   * Sticker of the business intro
   */
  readonly sticker?: Sticker | undefined
}

/**
 * Contains information about the location of a Telegram Business account.
 *
 * @see https://corefork.telegram.org/bots/api#businesslocation
 */
export interface BusinessLocation {
  /**
   * Address of the business
   */
  readonly address: string

  /**
   * Location of the business
   */
  readonly location?: Location | undefined
}

/**
 * Describes an interval of time during which a business is open.
 *
 * @see https://corefork.telegram.org/bots/api#businessopeninghoursinterval
 */
export interface BusinessOpeningHoursInterval {
  /**
   * The minute's sequence number in a week, starting on Monday, marking the
   * start of the time interval during which the business is open; 0 - 7 * 24 *
   * 60
   */
  readonly opening_minute: number

  /**
   * The minute's sequence number in a week, starting on Monday, marking the end
   * of the time interval during which the business is open; 0 - 8 * 24 * 60
   */
  readonly closing_minute: number
}

/**
 * Describes the opening hours of a business.
 *
 * @see https://corefork.telegram.org/bots/api#businessopeninghours
 */
export interface BusinessOpeningHours {
  /**
   * Unique name of the time zone for which the opening hours are defined
   */
  readonly time_zone_name: string

  /**
   * List of time intervals describing business opening hours
   */
  readonly opening_hours: BusinessOpeningHoursInterval[]
}

/**
 * This object describes the rating of a user based on their Telegram Star
 * spendings.
 *
 * @see https://corefork.telegram.org/bots/api#userrating
 */
export interface UserRating {
  /**
   * Current level of the user, indicating their reliability when purchasing
   * digital goods and services. A higher level suggests a more trustworthy
   * customer; a negative level is likely reason for concern.
   */
  readonly level: number

  /**
   * Numerical value of the user's rating; the higher the rating, the better
   */
  readonly rating: number

  /**
   * The rating value required to get the current level
   */
  readonly current_level_rating: number

  /**
   * The rating value required to get to the next level; omitted if the maximum
   * level was reached
   */
  readonly next_level_rating?: number | undefined
}

/**
 * Describes the position of a clickable area within a story.
 *
 * @see https://corefork.telegram.org/bots/api#storyareaposition
 */
export interface StoryAreaPosition {
  /**
   * The abscissa of the area's center, as a percentage of the media width
   */
  readonly x_percentage: number

  /**
   * The ordinate of the area's center, as a percentage of the media height
   */
  readonly y_percentage: number

  /**
   * The width of the area's rectangle, as a percentage of the media width
   */
  readonly width_percentage: number

  /**
   * The height of the area's rectangle, as a percentage of the media height
   */
  readonly height_percentage: number

  /**
   * The clockwise rotation angle of the rectangle, in degrees; 0-360
   */
  readonly rotation_angle: number

  /**
   * The radius of the rectangle corner rounding, as a percentage of the media
   * width
   */
  readonly corner_radius_percentage: number
}

/**
 * Describes the physical address of a location.
 *
 * @see https://corefork.telegram.org/bots/api#locationaddress
 */
export interface LocationAddress {
  /**
   * The two-letter ISO 3166-1 alpha-2 country code of the country where the
   * location is located
   */
  readonly country_code: string

  /**
   * State of the location
   */
  readonly state?: string | undefined

  /**
   * City of the location
   */
  readonly city?: string | undefined

  /**
   * Street address of the location
   */
  readonly street?: string | undefined
}

/**
 * Describes the type of a clickable area on a story. Currently, it can be one
 * of
 *
 * @see https://corefork.telegram.org/bots/api#storyareatype
 */
export type StoryAreaType =
  | StoryAreaTypeLink
  | StoryAreaTypeLocation
  | StoryAreaTypeSuggestedReaction
  | StoryAreaTypeUniqueGift
  | StoryAreaTypeWeather

/**
 * Describes a story area pointing to a location. Currently, a story can have
 * up to 10 location areas.
 *
 * @see https://corefork.telegram.org/bots/api#storyareatypelocation
 */
export interface StoryAreaTypeLocation {
  /**
   * Type of the area, always “location”
   */
  readonly type: string

  /**
   * Location latitude in degrees
   */
  readonly latitude: number

  /**
   * Location longitude in degrees
   */
  readonly longitude: number

  /**
   * Address of the location
   */
  readonly address?: LocationAddress | undefined
}

/**
 * Describes a story area pointing to a suggested reaction. Currently, a story
 * can have up to 5 suggested reaction areas.
 *
 * @see https://corefork.telegram.org/bots/api#storyareatypesuggestedreaction
 */
export interface StoryAreaTypeSuggestedReaction {
  /**
   * Type of the area, always “suggested_reaction”
   */
  readonly type: string

  /**
   * Type of the reaction
   */
  readonly reaction_type: ReactionType

  /**
   * Pass True if the reaction area has a dark background
   */
  readonly is_dark?: boolean | undefined

  /**
   * Pass True if reaction area corner is flipped
   */
  readonly is_flipped?: boolean | undefined
}

/**
 * Describes a story area pointing to an HTTP or tg:// link. Currently, a story
 * can have up to 3 link areas.
 *
 * @see https://corefork.telegram.org/bots/api#storyareatypelink
 */
export interface StoryAreaTypeLink {
  /**
   * Type of the area, always “link”
   */
  readonly type: string

  /**
   * HTTP or tg:// URL to be opened when the area is clicked
   */
  readonly url: string
}

/**
 * Describes a story area containing weather information. Currently, a story
 * can have up to 3 weather areas.
 *
 * @see https://corefork.telegram.org/bots/api#storyareatypeweather
 */
export interface StoryAreaTypeWeather {
  /**
   * Type of the area, always “weather”
   */
  readonly type: string

  /**
   * Temperature, in degree Celsius
   */
  readonly temperature: number

  /**
   * Emoji representing the weather
   */
  readonly emoji: string

  /**
   * A color of the area background in the ARGB format
   */
  readonly background_color: number
}

/**
 * Describes a story area pointing to a unique gift. Currently, a story can
 * have at most 1 unique gift area.
 *
 * @see https://corefork.telegram.org/bots/api#storyareatypeuniquegift
 */
export interface StoryAreaTypeUniqueGift {
  /**
   * Type of the area, always “unique_gift”
   */
  readonly type: string

  /**
   * Unique name of the gift
   */
  readonly name: string
}

/**
 * Describes a clickable area on a story media.
 *
 * @see https://corefork.telegram.org/bots/api#storyarea
 */
export interface StoryArea {
  /**
   * Position of the area
   */
  readonly position: StoryAreaPosition

  /**
   * Type of the area
   */
  readonly type: StoryAreaType
}

/**
 * Represents a location to which a chat is connected.
 *
 * @see https://corefork.telegram.org/bots/api#chatlocation
 */
export interface ChatLocation {
  /**
   * The location to which the supergroup is connected. Can't be a live location.
   */
  readonly location: Location

  /**
   * Location address; 1-64 characters, as defined by the chat owner
   */
  readonly address: string
}

/**
 * This object describes the type of a reaction. Currently, it can be one of
 *
 * @see https://corefork.telegram.org/bots/api#reactiontype
 */
export type ReactionType =
  | ReactionTypeCustomEmoji
  | ReactionTypeEmoji
  | ReactionTypePaid

/**
 * The reaction is based on an emoji.
 *
 * @see https://corefork.telegram.org/bots/api#reactiontypeemoji
 */
export interface ReactionTypeEmoji {
  /**
   * Type of the reaction, always “emoji”
   */
  readonly type: string

  /**
   * Reaction emoji. Currently, it can be one of "", "", "", "", "", "", "", "",
   * "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
   * "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
   * "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
   * "", "", "", "", "", "", "", "".
   */
  readonly emoji: string
}

/**
 * The reaction is based on a custom emoji.
 *
 * @see https://corefork.telegram.org/bots/api#reactiontypecustomemoji
 */
export interface ReactionTypeCustomEmoji {
  /**
   * Type of the reaction, always “custom_emoji”
   */
  readonly type: string

  /**
   * Custom emoji identifier
   */
  readonly custom_emoji_id: string
}

/**
 * The reaction is paid.
 *
 * @see https://corefork.telegram.org/bots/api#reactiontypepaid
 */
export interface ReactionTypePaid {
  /**
   * Type of the reaction, always “paid”
   */
  readonly type: string
}

/**
 * Represents a reaction added to a message along with the number of times it
 * was added.
 *
 * @see https://corefork.telegram.org/bots/api#reactioncount
 */
export interface ReactionCount {
  /**
   * Type of the reaction
   */
  readonly type: ReactionType

  /**
   * Number of times the reaction was added
   */
  readonly total_count: number
}

/**
 * This object represents a change of a reaction on a message performed by a
 * user.
 *
 * @see https://corefork.telegram.org/bots/api#messagereactionupdated
 */
export interface MessageReactionUpdated {
  /**
   * The chat containing the message the user reacted to
   */
  readonly chat: Chat

  /**
   * Unique identifier of the message inside the chat
   */
  readonly message_id: number

  /**
   * The user that changed the reaction, if the user isn't anonymous
   */
  readonly user?: User | undefined

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
 * This object represents reaction changes on a message with anonymous
 * reactions.
 *
 * @see https://corefork.telegram.org/bots/api#messagereactioncountupdated
 */
export interface MessageReactionCountUpdated {
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
 * This object represents a forum topic.
 *
 * @see https://corefork.telegram.org/bots/api#forumtopic
 */
export interface ForumTopic {
  /**
   * Unique identifier of the forum topic
   */
  readonly message_thread_id: number

  /**
   * Name of the topic
   */
  readonly name: string

  /**
   * Color of the topic icon in RGB format
   */
  readonly icon_color: number

  /**
   * Unique identifier of the custom emoji shown as the topic icon
   */
  readonly icon_custom_emoji_id?: string | undefined

  /**
   * True, if the name of the topic wasn't specified explicitly by its creator
   * and likely needs to be changed by the bot
   */
  readonly is_name_implicit?: true | undefined
}

/**
 * This object describes the background of a gift.
 *
 * @see https://corefork.telegram.org/bots/api#giftbackground
 */
export interface GiftBackground {
  /**
   * Center color of the background in RGB format
   */
  readonly center_color: number

  /**
   * Edge color of the background in RGB format
   */
  readonly edge_color: number

  /**
   * Text color of the background in RGB format
   */
  readonly text_color: number
}

/**
 * This object represents a gift that can be sent by the bot.
 *
 * @see https://corefork.telegram.org/bots/api#gift
 */
export interface Gift {
  /**
   * Unique identifier of the gift
   */
  readonly id: string

  /**
   * The sticker that represents the gift
   */
  readonly sticker: Sticker

  /**
   * The number of Telegram Stars that must be paid to send the sticker
   */
  readonly star_count: number

  /**
   * The number of Telegram Stars that must be paid to upgrade the gift to a
   * unique one
   */
  readonly upgrade_star_count?: number | undefined

  /**
   * True, if the gift can only be purchased by Telegram Premium subscribers
   */
  readonly is_premium?: true | undefined

  /**
   * True, if the gift can be used (after being upgraded) to customize a user's
   * appearance
   */
  readonly has_colors?: true | undefined

  /**
   * The total number of gifts of this type that can be sent by all users; for
   * limited gifts only
   */
  readonly total_count?: number | undefined

  /**
   * The number of remaining gifts of this type that can be sent by all users;
   * for limited gifts only
   */
  readonly remaining_count?: number | undefined

  /**
   * The total number of gifts of this type that can be sent by the bot; for
   * limited gifts only
   */
  readonly personal_total_count?: number | undefined

  /**
   * The number of remaining gifts of this type that can be sent by the bot; for
   * limited gifts only
   */
  readonly personal_remaining_count?: number | undefined

  /**
   * Background of the gift
   */
  readonly background?: GiftBackground | undefined

  /**
   * The total number of different unique gifts that can be obtained by upgrading
   * the gift
   */
  readonly unique_gift_variant_count?: number | undefined

  /**
   * Information about the chat that published the gift
   */
  readonly publisher_chat?: Chat | undefined
}

/**
 * This object represent a list of gifts.
 *
 * @see https://corefork.telegram.org/bots/api#gifts
 */
export interface Gifts {
  /**
   * The list of gifts
   */
  readonly gifts: Gift[]
}

/**
 * This object describes the model of a unique gift.
 *
 * @see https://corefork.telegram.org/bots/api#uniquegiftmodel
 */
export interface UniqueGiftModel {
  /**
   * Name of the model
   */
  readonly name: string

  /**
   * The sticker that represents the unique gift
   */
  readonly sticker: Sticker

  /**
   * The number of unique gifts that receive this model for every 1000 gift
   * upgrades. Always 0 for crafted gifts.
   */
  readonly rarity_per_mille: number

  /**
   * Rarity of the model if it is a crafted model. Currently, can be “uncommon”,
   * “rare”, “epic”, or “legendary”.
   */
  readonly rarity?: string | undefined
}

/**
 * This object describes the symbol shown on the pattern of a unique gift.
 *
 * @see https://corefork.telegram.org/bots/api#uniquegiftsymbol
 */
export interface UniqueGiftSymbol {
  /**
   * Name of the symbol
   */
  readonly name: string

  /**
   * The sticker that represents the unique gift
   */
  readonly sticker: Sticker

  /**
   * The number of unique gifts that receive this model for every 1000 gifts
   * upgraded
   */
  readonly rarity_per_mille: number
}

/**
 * This object describes the colors of the backdrop of a unique gift.
 *
 * @see https://corefork.telegram.org/bots/api#uniquegiftbackdropcolors
 */
export interface UniqueGiftBackdropColors {
  /**
   * The color in the center of the backdrop in RGB format
   */
  readonly center_color: number

  /**
   * The color on the edges of the backdrop in RGB format
   */
  readonly edge_color: number

  /**
   * The color to be applied to the symbol in RGB format
   */
  readonly symbol_color: number

  /**
   * The color for the text on the backdrop in RGB format
   */
  readonly text_color: number
}

/**
 * This object describes the backdrop of a unique gift.
 *
 * @see https://corefork.telegram.org/bots/api#uniquegiftbackdrop
 */
export interface UniqueGiftBackdrop {
  /**
   * Name of the backdrop
   */
  readonly name: string

  /**
   * Colors of the backdrop
   */
  readonly colors: UniqueGiftBackdropColors

  /**
   * The number of unique gifts that receive this backdrop for every 1000 gifts
   * upgraded
   */
  readonly rarity_per_mille: number
}

/**
 * This object contains information about the color scheme for a user's name,
 * message replies and link previews based on a unique gift.
 *
 * @see https://corefork.telegram.org/bots/api#uniquegiftcolors
 */
export interface UniqueGiftColors {
  /**
   * Custom emoji identifier of the unique gift's model
   */
  readonly model_custom_emoji_id: string

  /**
   * Custom emoji identifier of the unique gift's symbol
   */
  readonly symbol_custom_emoji_id: string

  /**
   * Main color used in light themes; RGB format
   */
  readonly light_theme_main_color: number

  /**
   * List of 1-3 additional colors used in light themes; RGB format
   */
  readonly light_theme_other_colors: number[]

  /**
   * Main color used in dark themes; RGB format
   */
  readonly dark_theme_main_color: number

  /**
   * List of 1-3 additional colors used in dark themes; RGB format
   */
  readonly dark_theme_other_colors: number[]
}

/**
 * This object describes a unique gift that was upgraded from a regular gift.
 *
 * @see https://corefork.telegram.org/bots/api#uniquegift
 */
export interface UniqueGift {
  /**
   * Identifier of the regular gift from which the gift was upgraded
   */
  readonly gift_id: string

  /**
   * Human-readable name of the regular gift from which this unique gift was
   * upgraded
   */
  readonly base_name: string

  /**
   * Unique name of the gift. This name can be used in https://t.me/nft/... links
   * and story areas.
   */
  readonly name: string

  /**
   * Unique number of the upgraded gift among gifts upgraded from the same
   * regular gift
   */
  readonly number: number

  /**
   * Model of the gift
   */
  readonly model: UniqueGiftModel

  /**
   * Symbol of the gift
   */
  readonly symbol: UniqueGiftSymbol

  /**
   * Backdrop of the gift
   */
  readonly backdrop: UniqueGiftBackdrop

  /**
   * True, if the original regular gift was exclusively purchaseable by Telegram
   * Premium subscribers
   */
  readonly is_premium?: true | undefined

  /**
   * True, if the gift was used to craft another gift and isn't available anymore
   */
  readonly is_burned?: true | undefined

  /**
   * True, if the gift is assigned from the TON blockchain and can't be resold or
   * transferred in Telegram
   */
  readonly is_from_blockchain?: true | undefined

  /**
   * The color scheme that can be used by the gift's owner for the chat's name,
   * replies to messages and link previews; for business account gifts and gifts
   * that are currently on sale only
   */
  readonly colors?: UniqueGiftColors | undefined

  /**
   * Information about the chat that published the gift
   */
  readonly publisher_chat?: Chat | undefined
}

/**
 * Describes a service message about a regular gift that was sent or received.
 *
 * @see https://corefork.telegram.org/bots/api#giftinfo
 */
export interface GiftInfo {
  /**
   * Information about the gift
   */
  readonly gift: Gift

  /**
   * Unique identifier of the received gift for the bot; only present for gifts
   * received on behalf of business accounts
   */
  readonly owned_gift_id?: string | undefined

  /**
   * Number of Telegram Stars that can be claimed by the receiver by converting
   * the gift; omitted if conversion to Telegram Stars is impossible
   */
  readonly convert_star_count?: number | undefined

  /**
   * Number of Telegram Stars that were prepaid for the ability to upgrade the
   * gift
   */
  readonly prepaid_upgrade_star_count?: number | undefined

  /**
   * True, if the gift's upgrade was purchased after the gift was sent
   */
  readonly is_upgrade_separate?: true | undefined

  /**
   * True, if the gift can be upgraded to a unique gift
   */
  readonly can_be_upgraded?: true | undefined

  /**
   * Text of the message that was added to the gift
   */
  readonly text?: string | undefined

  /**
   * Special entities that appear in the text
   */
  readonly entities?: MessageEntity[] | undefined

  /**
   * True, if the sender and gift text are shown only to the gift receiver;
   * otherwise, everyone will be able to see them
   */
  readonly is_private?: true | undefined

  /**
   * Unique number reserved for this gift when upgraded. See the number field in
   * UniqueGift.
   */
  readonly unique_gift_number?: number | undefined
}

/**
 * Describes a service message about a unique gift that was sent or received.
 *
 * @see https://corefork.telegram.org/bots/api#uniquegiftinfo
 */
export interface UniqueGiftInfo {
  /**
   * Information about the gift
   */
  readonly gift: UniqueGift

  /**
   * Origin of the gift. Currently, either “upgrade” for gifts upgraded from
   * regular gifts, “transfer” for gifts transferred from other users or
   * channels, “resale” for gifts bought from other users, “gifted_upgrade” for
   * upgrades purchased after the gift was sent, or “offer” for gifts bought or
   * sold through gift purchase offers.
   */
  readonly origin: string

  /**
   * For gifts bought from other users, the currency in which the payment for the
   * gift was done. Currently, one of “XTR” for Telegram Stars or “TON” for TON
   * grams.
   */
  readonly last_resale_currency?: string | undefined

  /**
   * For gifts bought from other users, the price paid for the gift in either
   * Telegram Stars or nanograms
   */
  readonly last_resale_amount?: number | undefined

  /**
   * Unique identifier of the received gift for the bot; only present for gifts
   * received on behalf of business accounts
   */
  readonly owned_gift_id?: string | undefined

  /**
   * Number of Telegram Stars that must be paid to transfer the gift; omitted if
   * the bot cannot transfer the gift
   */
  readonly transfer_star_count?: number | undefined

  /**
   * Point in time (Unix timestamp) when the gift can be transferred. If it is in
   * the past, then the gift can be transferred now.
   */
  readonly next_transfer_date?: number | undefined
}

/**
 * This object describes a gift received and owned by a user or a chat.
 * Currently, it can be one of
 *
 * @see https://corefork.telegram.org/bots/api#ownedgift
 */
export type OwnedGift =
  | OwnedGiftRegular
  | OwnedGiftUnique

/**
 * Describes a regular gift owned by a user or a chat.
 *
 * @see https://corefork.telegram.org/bots/api#ownedgiftregular
 */
export interface OwnedGiftRegular {
  /**
   * Type of the gift, always “regular”
   */
  readonly type: string

  /**
   * Information about the regular gift
   */
  readonly gift: Gift

  /**
   * Unique identifier of the gift for the bot; for gifts received on behalf of
   * business accounts only
   */
  readonly owned_gift_id?: string | undefined

  /**
   * Sender of the gift if it is a known user
   */
  readonly sender_user?: User | undefined

  /**
   * Date the gift was sent in Unix time
   */
  readonly send_date: number

  /**
   * Text of the message that was added to the gift
   */
  readonly text?: string | undefined

  /**
   * Special entities that appear in the text
   */
  readonly entities?: MessageEntity[] | undefined

  /**
   * True, if the sender and gift text are shown only to the gift receiver;
   * otherwise, everyone will be able to see them
   */
  readonly is_private?: true | undefined

  /**
   * True, if the gift is displayed on the account's profile page; for gifts
   * received on behalf of business accounts only
   */
  readonly is_saved?: true | undefined

  /**
   * True, if the gift can be upgraded to a unique gift; for gifts received on
   * behalf of business accounts only
   */
  readonly can_be_upgraded?: true | undefined

  /**
   * True, if the gift was refunded and isn't available anymore
   */
  readonly was_refunded?: true | undefined

  /**
   * Number of Telegram Stars that can be claimed by the receiver instead of the
   * gift; omitted if the gift cannot be converted to Telegram Stars; for gifts
   * received on behalf of business accounts only
   */
  readonly convert_star_count?: number | undefined

  /**
   * Number of Telegram Stars that were paid for the ability to upgrade the gift
   */
  readonly prepaid_upgrade_star_count?: number | undefined

  /**
   * True, if the gift's upgrade was purchased after the gift was sent; for gifts
   * received on behalf of business accounts only
   */
  readonly is_upgrade_separate?: true | undefined

  /**
   * Unique number reserved for this gift when upgraded. See the number field in
   * UniqueGift.
   */
  readonly unique_gift_number?: number | undefined
}

/**
 * Describes a unique gift received and owned by a user or a chat.
 *
 * @see https://corefork.telegram.org/bots/api#ownedgiftunique
 */
export interface OwnedGiftUnique {
  /**
   * Type of the gift, always “unique”
   */
  readonly type: string

  /**
   * Information about the unique gift
   */
  readonly gift: UniqueGift

  /**
   * Unique identifier of the received gift for the bot; for gifts received on
   * behalf of business accounts only
   */
  readonly owned_gift_id?: string | undefined

  /**
   * Sender of the gift if it is a known user
   */
  readonly sender_user?: User | undefined

  /**
   * Date the gift was sent in Unix time
   */
  readonly send_date: number

  /**
   * True, if the gift is displayed on the account's profile page; for gifts
   * received on behalf of business accounts only
   */
  readonly is_saved?: true | undefined

  /**
   * True, if the gift can be transferred to another owner; for gifts received on
   * behalf of business accounts only
   */
  readonly can_be_transferred?: true | undefined

  /**
   * Number of Telegram Stars that must be paid to transfer the gift; omitted if
   * the bot cannot transfer the gift
   */
  readonly transfer_star_count?: number | undefined

  /**
   * Point in time (Unix timestamp) when the gift can be transferred. If it is in
   * the past, then the gift can be transferred now.
   */
  readonly next_transfer_date?: number | undefined
}

/**
 * Contains the list of gifts received and owned by a user or a chat.
 *
 * @see https://corefork.telegram.org/bots/api#ownedgifts
 */
export interface OwnedGifts {
  /**
   * The total number of gifts owned by the user or the chat
   */
  readonly total_count: number

  /**
   * The list of gifts
   */
  readonly gifts: OwnedGift[]

  /**
   * Offset for the next request. If empty, then there are no more results.
   */
  readonly next_offset?: string | undefined
}

/**
 * This object describes the access settings of a bot.
 *
 * @see https://corefork.telegram.org/bots/api#botaccesssettings
 */
export interface BotAccessSettings {
  /**
   * True, if only selected users can access the bot. The bot's owner can always
   * access it.
   */
  readonly is_access_restricted: boolean

  /**
   * The list of other users who have access to the bot if the access is
   * restricted
   */
  readonly added_users?: User[] | undefined
}

/**
 * This object describes the types of gifts that can be gifted to a user or a
 * chat.
 *
 * @see https://corefork.telegram.org/bots/api#acceptedgifttypes
 */
export interface AcceptedGiftTypes {
  /**
   * True, if unlimited regular gifts are accepted
   */
  readonly unlimited_gifts: boolean

  /**
   * True, if limited regular gifts are accepted
   */
  readonly limited_gifts: boolean

  /**
   * True, if unique gifts or gifts that can be upgraded to unique for free are
   * accepted
   */
  readonly unique_gifts: boolean

  /**
   * True, if a Telegram Premium subscription is accepted
   */
  readonly premium_subscription: boolean

  /**
   * True, if transfers of unique gifts from channels are accepted
   */
  readonly gifts_from_channels: boolean
}

/**
 * Describes an amount of Telegram Stars.
 *
 * @see https://corefork.telegram.org/bots/api#staramount
 */
export interface StarAmount {
  /**
   * Integer amount of Telegram Stars, rounded to 0; can be negative
   */
  readonly amount: number

  /**
   * The number of 1/1000000000 shares of Telegram Stars; from -999999999 to
   * 999999999; can be negative if and only if amount is non-positive
   */
  readonly nanostar_amount?: number | undefined
}

/**
 * This object represents a bot command.
 *
 * @see https://corefork.telegram.org/bots/api#botcommand
 */
export interface BotCommand {
  /**
   * Text of the command; 1-32 characters. Can contain only lowercase English
   * letters, digits and underscores.
   */
  readonly command: string

  /**
   * Description of the command; 1-256 characters
   */
  readonly description: string

  /**
   * True, if the command sends an ephemeral message, which can be seen only by
   * the sender of the message and the bot
   */
  readonly is_ephemeral?: boolean | undefined
}

/**
 * This object represents the scope to which bot commands are applied.
 * Currently, the following 7 scopes are supported:
 *
 * @see https://corefork.telegram.org/bots/api#botcommandscope
 */
export type BotCommandScope =
  | BotCommandScopeAllChatAdministrators
  | BotCommandScopeAllGroupChats
  | BotCommandScopeAllPrivateChats
  | BotCommandScopeChat
  | BotCommandScopeChatAdministrators
  | BotCommandScopeChatMember
  | BotCommandScopeDefault

/**
 * Represents the default scope of bot commands. Default commands are used if
 * no commands with a narrower scope are specified for the user.
 *
 * @see https://corefork.telegram.org/bots/api#botcommandscopedefault
 */
export interface BotCommandScopeDefault {
  /**
   * Scope type, must be default
   */
  readonly type: string
}

/**
 * Represents the scope of bot commands, covering all private chats.
 *
 * @see https://corefork.telegram.org/bots/api#botcommandscopeallprivatechats
 */
export interface BotCommandScopeAllPrivateChats {
  /**
   * Scope type, must be all_private_chats
   */
  readonly type: string
}

/**
 * Represents the scope of bot commands, covering all group and supergroup
 * chats.
 *
 * @see https://corefork.telegram.org/bots/api#botcommandscopeallgroupchats
 */
export interface BotCommandScopeAllGroupChats {
  /**
   * Scope type, must be all_group_chats
   */
  readonly type: string
}

/**
 * Represents the scope of bot commands, covering all group and supergroup chat
 * administrators.
 *
 * @see https://corefork.telegram.org/bots/api#botcommandscopeallchatadministrators
 */
export interface BotCommandScopeAllChatAdministrators {
  /**
   * Scope type, must be all_chat_administrators
   */
  readonly type: string
}

/**
 * Represents the scope of bot commands, covering a specific chat.
 *
 * @see https://corefork.telegram.org/bots/api#botcommandscopechat
 */
export interface BotCommandScopeChat {
  /**
   * Scope type, must be chat
   */
  readonly type: string

  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username. Channel direct messages chats and channel chats
   * aren't supported.
   */
  readonly chat_id: number | string
}

/**
 * Represents the scope of bot commands, covering all administrators of a
 * specific group or supergroup chat.
 *
 * @see https://corefork.telegram.org/bots/api#botcommandscopechatadministrators
 */
export interface BotCommandScopeChatAdministrators {
  /**
   * Scope type, must be chat_administrators
   */
  readonly type: string

  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username. Channel direct messages chats and channel chats
   * aren't supported.
   */
  readonly chat_id: number | string
}

/**
 * Represents the scope of bot commands, covering a specific member of a group
 * or supergroup chat.
 *
 * @see https://corefork.telegram.org/bots/api#botcommandscopechatmember
 */
export interface BotCommandScopeChatMember {
  /**
   * Scope type, must be chat_member
   */
  readonly type: string

  /**
   * Unique identifier for the target chat or username of the target supergroup
   * in the format @username. Channel direct messages chats and channel chats
   * aren't supported.
   */
  readonly chat_id: number | string

  /**
   * Unique identifier of the target user
   */
  readonly user_id: number
}

/**
 * This object represents the bot's name.
 *
 * @see https://corefork.telegram.org/bots/api#botname
 */
export interface BotName {
  /**
   * The bot's name
   */
  readonly name: string
}

/**
 * This object represents the bot's description.
 *
 * @see https://corefork.telegram.org/bots/api#botdescription
 */
export interface BotDescription {
  /**
   * The bot's description
   */
  readonly description: string
}

/**
 * This object represents the bot's short description.
 *
 * @see https://corefork.telegram.org/bots/api#botshortdescription
 */
export interface BotShortDescription {
  /**
   * The bot's short description
   */
  readonly short_description: string
}

/**
 * This object describes the bot's menu button in a private chat. It should be
 * one of If a menu button other than MenuButtonDefault is set for a private
 * chat, then it is applied in the chat. Otherwise the default menu button is
 * applied. By default, the menu button opens the list of bot commands.
 *
 * @see https://corefork.telegram.org/bots/api#menubutton
 */
export type MenuButton =
  | MenuButtonCommands
  | MenuButtonDefault
  | MenuButtonWebApp

/**
 * Represents a menu button, which opens the bot's list of commands.
 *
 * @see https://corefork.telegram.org/bots/api#menubuttoncommands
 */
export interface MenuButtonCommands {
  /**
   * Type of the button, must be commands
   */
  readonly type: string
}

/**
 * Represents a menu button, which launches a Web App.
 *
 * @see https://corefork.telegram.org/bots/api#menubuttonwebapp
 */
export interface MenuButtonWebApp {
  /**
   * Type of the button, must be web_app
   */
  readonly type: string

  /**
   * Text on the button
   */
  readonly text: string

  /**
   * Description of the Web App that will be launched when the user presses the
   * button. The Web App will be able to send an arbitrary message on behalf of
   * the user using the method answerWebAppQuery. Alternatively, a t.me link to a
   * Web App of the bot can be specified in the object instead of the Web App's
   * URL, in which case the Web App will be opened as if the user pressed the
   * link.
   */
  readonly web_app: WebAppInfo
}

/**
 * Describes that no specific value for the menu button was set.
 *
 * @see https://corefork.telegram.org/bots/api#menubuttondefault
 */
export interface MenuButtonDefault {
  /**
   * Type of the button, must be default
   */
  readonly type: string
}

/**
 * This object describes the source of a chat boost. It can be one of
 *
 * @see https://corefork.telegram.org/bots/api#chatboostsource
 */
export type ChatBoostSource =
  | ChatBoostSourceGiftCode
  | ChatBoostSourceGiveaway
  | ChatBoostSourcePremium

/**
 * The boost was obtained by subscribing to Telegram Premium or by gifting a
 * Telegram Premium subscription to another user.
 *
 * @see https://corefork.telegram.org/bots/api#chatboostsourcepremium
 */
export interface ChatBoostSourcePremium {
  /**
   * Source of the boost, always “premium”
   */
  readonly source: string

  /**
   * User that boosted the chat
   */
  readonly user: User
}

/**
 * The boost was obtained by the creation of Telegram Premium gift codes to
 * boost a chat. Each such code boosts the chat 4 times for the duration of the
 * corresponding Telegram Premium subscription.
 *
 * @see https://corefork.telegram.org/bots/api#chatboostsourcegiftcode
 */
export interface ChatBoostSourceGiftCode {
  /**
   * Source of the boost, always “gift_code”
   */
  readonly source: string

  /**
   * User for which the gift code was created
   */
  readonly user: User
}

/**
 * The boost was obtained by the creation of a Telegram Premium or a Telegram
 * Star giveaway. This boosts the chat 4 times for the duration of the
 * corresponding Telegram Premium subscription for Telegram Premium giveaways
 * and prize_star_count / 500 times for one year for Telegram Star giveaways.
 *
 * @see https://corefork.telegram.org/bots/api#chatboostsourcegiveaway
 */
export interface ChatBoostSourceGiveaway {
  /**
   * Source of the boost, always “giveaway”
   */
  readonly source: string

  /**
   * Identifier of a message in the chat with the giveaway; the message could
   * have been deleted already. May be 0 if the message isn't sent yet.
   */
  readonly giveaway_message_id: number

  /**
   * User that won the prize in the giveaway if any; for Telegram Premium
   * giveaways only
   */
  readonly user?: User | undefined

  /**
   * The number of Telegram Stars to be split between giveaway winners; for
   * Telegram Star giveaways only
   */
  readonly prize_star_count?: number | undefined

  /**
   * True, if the giveaway was completed, but there was no user to win the prize
   */
  readonly is_unclaimed?: true | undefined
}

/**
 * This object contains information about a chat boost.
 *
 * @see https://corefork.telegram.org/bots/api#chatboost
 */
export interface ChatBoost {
  /**
   * Unique identifier of the boost
   */
  readonly boost_id: string

  /**
   * Point in time (Unix timestamp) when the chat was boosted
   */
  readonly add_date: number

  /**
   * Point in time (Unix timestamp) when the boost will automatically expire,
   * unless the booster's Telegram Premium subscription is prolonged
   */
  readonly expiration_date: number

  /**
   * Source of the added boost
   */
  readonly source: ChatBoostSource
}

/**
 * This object represents a boost added to a chat or changed.
 *
 * @see https://corefork.telegram.org/bots/api#chatboostupdated
 */
export interface ChatBoostUpdated {
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
 * This object represents a boost removed from a chat.
 *
 * @see https://corefork.telegram.org/bots/api#chatboostremoved
 */
export interface ChatBoostRemoved {
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
 * Describes a service message about the chat owner leaving the chat.
 *
 * @see https://corefork.telegram.org/bots/api#chatownerleft
 */
export interface ChatOwnerLeft {
  /**
   * The user who will become the new owner of the chat if the previous owner
   * does not return to the chat
   */
  readonly new_owner?: User | undefined
}

/**
 * Describes a service message about an ownership change in the chat.
 *
 * @see https://corefork.telegram.org/bots/api#chatownerchanged
 */
export interface ChatOwnerChanged {
  /**
   * The new owner of the chat
   */
  readonly new_owner: User
}

/**
 * This object represents a list of boosts added to a chat by a user.
 *
 * @see https://corefork.telegram.org/bots/api#userchatboosts
 */
export interface UserChatBoosts {
  /**
   * The list of boosts added to the chat by the user
   */
  readonly boosts: ChatBoost[]
}

/**
 * Represents the rights of a business bot.
 *
 * @see https://corefork.telegram.org/bots/api#businessbotrights
 */
export interface BusinessBotRights {
  /**
   * True, if the bot can send and edit messages in the private chats that had
   * incoming messages in the last 24 hours
   */
  readonly can_reply?: true | undefined

  /**
   * True, if the bot can mark incoming private messages as read
   */
  readonly can_read_messages?: true | undefined

  /**
   * True, if the bot can delete messages sent by the bot
   */
  readonly can_delete_sent_messages?: true | undefined

  /**
   * True, if the bot can delete all private messages in managed chats
   */
  readonly can_delete_all_messages?: true | undefined

  /**
   * True, if the bot can edit the first and last name of the business account
   */
  readonly can_edit_name?: true | undefined

  /**
   * True, if the bot can edit the bio of the business account
   */
  readonly can_edit_bio?: true | undefined

  /**
   * True, if the bot can edit the profile photo of the business account
   */
  readonly can_edit_profile_photo?: true | undefined

  /**
   * True, if the bot can edit the username of the business account
   */
  readonly can_edit_username?: true | undefined

  /**
   * True, if the bot can change the privacy settings pertaining to gifts for the
   * business account
   */
  readonly can_change_gift_settings?: true | undefined

  /**
   * True, if the bot can view gifts and the amount of Telegram Stars owned by
   * the business account
   */
  readonly can_view_gifts_and_stars?: true | undefined

  /**
   * True, if the bot can convert regular gifts owned by the business account to
   * Telegram Stars
   */
  readonly can_convert_gifts_to_stars?: true | undefined

  /**
   * True, if the bot can transfer and upgrade gifts owned by the business
   * account
   */
  readonly can_transfer_and_upgrade_gifts?: true | undefined

  /**
   * True, if the bot can transfer Telegram Stars received by the business
   * account to its own account, or use them to upgrade and transfer gifts
   */
  readonly can_transfer_stars?: true | undefined

  /**
   * True, if the bot can post, edit and delete stories on behalf of the business
   * account
   */
  readonly can_manage_stories?: true | undefined
}

/**
 * Describes the connection of the bot with a business account.
 *
 * @see https://corefork.telegram.org/bots/api#businessconnection
 */
export interface BusinessConnection {
  /**
   * Unique identifier of the business connection
   */
  readonly id: string

  /**
   * Business account user that created the business connection
   */
  readonly user: User

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
 * This object is received when messages are deleted from a connected business
 * account.
 *
 * @see https://corefork.telegram.org/bots/api#businessmessagesdeleted
 */
export interface BusinessMessagesDeleted {
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
 * Describes an inline message sent by a Web App on behalf of a user.
 *
 * @see https://corefork.telegram.org/bots/api#sentwebappmessage
 */
export interface SentWebAppMessage {
  /**
   * Identifier of the sent inline message. Available only if there is an inline
   * keyboard attached to the message.
   */
  readonly inline_message_id?: string | undefined
}

/**
 * Describes an inline message sent by a guest bot.
 *
 * @see https://corefork.telegram.org/bots/api#sentguestmessage
 */
export interface SentGuestMessage {
  /**
   * Identifier of the sent inline message
   */
  readonly inline_message_id: string
}

/**
 * Describes an inline message to be sent by a user of a Mini App.
 *
 * @see https://corefork.telegram.org/bots/api#preparedinlinemessage
 */
export interface PreparedInlineMessage {
  /**
   * Unique identifier of the prepared message
   */
  readonly id: string

  /**
   * Expiration date of the prepared message, in Unix time. Expired prepared
   * messages can no longer be used.
   */
  readonly expiration_date: number
}

/**
 * Describes a keyboard button to be used by a user of a Mini App.
 *
 * @see https://corefork.telegram.org/bots/api#preparedkeyboardbutton
 */
export interface PreparedKeyboardButton {
  /**
   * Unique identifier of the keyboard button
   */
  readonly id: string
}

/**
 * Describes why a request was unsuccessful.
 *
 * @see https://corefork.telegram.org/bots/api#responseparameters
 */
export interface ResponseParameters {
  /**
   * The group has been migrated to a supergroup with the specified identifier.
   * This number may have more than 32 significant bits and some programming
   * languages may have difficulty/silent defects in interpreting it. But it has
   * at most 52 significant bits, so a signed 64-bit integer or double-precision
   * float type are safe for storing this identifier.
   */
  readonly migrate_to_chat_id?: number | undefined

  /**
   * In case of exceeding flood control, the number of seconds left to wait
   * before the request can be repeated
   */
  readonly retry_after?: number | undefined
}

/**
 * This object represents the content of a media message to be sent. It should
 * be one of
 *
 * @see https://corefork.telegram.org/bots/api#inputmedia
 */
export type InputMedia =
  | InputMediaAnimation
  | InputMediaAudio
  | InputMediaDocument
  | InputMediaLivePhoto
  | InputMediaPhoto
  | InputMediaVideo

/**
 * Represents an animation file (GIF or H.264/MPEG-4 AVC video without sound)
 * to be sent.
 *
 * @see https://corefork.telegram.org/bots/api#inputmediaanimation
 */
export interface InputMediaAnimation {
  /**
   * Type of the media, must be animation
   */
  readonly type: string

  /**
   * File to send. Pass a file_id to send a file that exists on the Telegram
   * servers (recommended), pass an HTTP URL for Telegram to get a file from the
   * Internet, or pass “attach://<file_attach_name>” to upload a new one using
   * multipart/form-data under <file_attach_name> name. More information on
   * Sending Files »
   */
  readonly media: string

  /**
   * Thumbnail of the file sent; can be ignored if thumbnail generation for the
   * file is supported server-side. The thumbnail should be in JPEG format and
   * less than 200 kB in size. A thumbnail's width and height should not exceed
   * 320. Ignored if the file is not uploaded using multipart/form-data.
   * Thumbnails can't be reused and can be only uploaded as a new file, so you
   * can pass “attach://<file_attach_name>” if the thumbnail was uploaded using
   * multipart/form-data under <file_attach_name>. More information on Sending
   * Files »
   */
  readonly thumbnail?: string | undefined

  /**
   * Caption of the animation to be sent, 0-1024 characters after entities
   * parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the animation caption. See formatting options
   * for more details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media
   */
  readonly show_caption_above_media?: boolean | undefined

  /**
   * Animation width
   */
  readonly width?: number | undefined

  /**
   * Animation height
   */
  readonly height?: number | undefined

  /**
   * Animation duration in seconds
   */
  readonly duration?: number | undefined

  /**
   * Pass True if the animation needs to be covered with a spoiler animation
   */
  readonly has_spoiler?: boolean | undefined
}

/**
 * Represents an audio file to be treated as music to be sent.
 *
 * @see https://corefork.telegram.org/bots/api#inputmediaaudio
 */
export interface InputMediaAudio {
  /**
   * Type of the media, must be audio
   */
  readonly type: string

  /**
   * File to send. Pass a file_id to send a file that exists on the Telegram
   * servers (recommended), pass an HTTP URL for Telegram to get a file from the
   * Internet, or pass “attach://<file_attach_name>” to upload a new one using
   * multipart/form-data under <file_attach_name> name. More information on
   * Sending Files »
   */
  readonly media: string

  /**
   * Thumbnail of the file sent; can be ignored if thumbnail generation for the
   * file is supported server-side. The thumbnail should be in JPEG format and
   * less than 200 kB in size. A thumbnail's width and height should not exceed
   * 320. Ignored if the file is not uploaded using multipart/form-data.
   * Thumbnails can't be reused and can be only uploaded as a new file, so you
   * can pass “attach://<file_attach_name>” if the thumbnail was uploaded using
   * multipart/form-data under <file_attach_name>. More information on Sending
   * Files »
   */
  readonly thumbnail?: string | undefined

  /**
   * Caption of the audio to be sent, 0-1024 characters after entities parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the audio caption. See formatting options for
   * more details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Duration of the audio in seconds
   */
  readonly duration?: number | undefined

  /**
   * Performer of the audio
   */
  readonly performer?: string | undefined

  /**
   * Title of the audio
   */
  readonly title?: string | undefined
}

/**
 * Represents a general file to be sent.
 *
 * @see https://corefork.telegram.org/bots/api#inputmediadocument
 */
export interface InputMediaDocument {
  /**
   * Type of the media, must be document
   */
  readonly type: string

  /**
   * File to send. Pass a file_id to send a file that exists on the Telegram
   * servers (recommended), pass an HTTP URL for Telegram to get a file from the
   * Internet, or pass “attach://<file_attach_name>” to upload a new one using
   * multipart/form-data under <file_attach_name> name. More information on
   * Sending Files »
   */
  readonly media: string

  /**
   * Thumbnail of the file sent; can be ignored if thumbnail generation for the
   * file is supported server-side. The thumbnail should be in JPEG format and
   * less than 200 kB in size. A thumbnail's width and height should not exceed
   * 320. Ignored if the file is not uploaded using multipart/form-data.
   * Thumbnails can't be reused and can be only uploaded as a new file, so you
   * can pass “attach://<file_attach_name>” if the thumbnail was uploaded using
   * multipart/form-data under <file_attach_name>. More information on Sending
   * Files »
   */
  readonly thumbnail?: string | undefined

  /**
   * Caption of the document to be sent, 0-1024 characters after entities parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the document caption. See formatting options
   * for more details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Disables automatic server-side content type detection for files uploaded
   * using multipart/form-data. Always True, if the document is sent as part of
   * an album.
   */
  readonly disable_content_type_detection?: boolean | undefined
}

/**
 * Represents an HTTP link to be sent.
 *
 * @see https://corefork.telegram.org/bots/api#inputmedialink
 */
export interface InputMediaLink {
  /**
   * Type of the media, must be link
   */
  readonly type: string

  /**
   * HTTP URL of the link
   */
  readonly url: string
}

/**
 * Represents a live photo to be sent.
 *
 * @see https://corefork.telegram.org/bots/api#inputmedialivephoto
 */
export interface InputMediaLivePhoto {
  /**
   * Type of the media, must be live_photo
   */
  readonly type: string

  /**
   * Video of the live photo to send. Pass a file_id to send a file that exists
   * on the Telegram servers (recommended) or pass “attach://<file_attach_name>”
   * to upload a new one using multipart/form-data under <file_attach_name> name.
   * More information on Sending Files ». Sending live photos by a URL is
   * currently unsupported.
   */
  readonly media: string

  /**
   * The static photo to send. Pass a file_id to send a file that exists on the
   * Telegram servers (recommended) or pass “attach://<file_attach_name>” to
   * upload a new one using multipart/form-data under <file_attach_name> name.
   * More information on Sending Files ». Sending live photos by a URL is
   * currently unsupported.
   */
  readonly photo: string

  /**
   * Caption of the live photo to be sent, 0-1024 characters after entities
   * parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the live photo caption. See formatting options
   * for more details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media
   */
  readonly show_caption_above_media?: boolean | undefined

  /**
   * Pass True if the live photo needs to be covered with a spoiler animation
   */
  readonly has_spoiler?: boolean | undefined
}

/**
 * Represents a location to be sent.
 *
 * @see https://corefork.telegram.org/bots/api#inputmedialocation
 */
export interface InputMediaLocation {
  /**
   * Type of the media, must be location
   */
  readonly type: string

  /**
   * Latitude of the location
   */
  readonly latitude: number

  /**
   * Longitude of the location
   */
  readonly longitude: number

  /**
   * The radius of uncertainty for the location, measured in meters; 0-1500
   */
  readonly horizontal_accuracy?: number | undefined
}

/**
 * Represents a photo to be sent.
 *
 * @see https://corefork.telegram.org/bots/api#inputmediaphoto
 */
export interface InputMediaPhoto {
  /**
   * Type of the media, must be photo
   */
  readonly type: string

  /**
   * File to send. Pass a file_id to send a file that exists on the Telegram
   * servers (recommended), pass an HTTP URL for Telegram to get a file from the
   * Internet, or pass “attach://<file_attach_name>” to upload a new one using
   * multipart/form-data under <file_attach_name> name. More information on
   * Sending Files »
   */
  readonly media: string

  /**
   * Caption of the photo to be sent, 0-1024 characters after entities parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the photo caption. See formatting options for
   * more details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media
   */
  readonly show_caption_above_media?: boolean | undefined

  /**
   * Pass True if the photo needs to be covered with a spoiler animation
   */
  readonly has_spoiler?: boolean | undefined
}

/**
 * Represents a sticker file to be sent.
 *
 * @see https://corefork.telegram.org/bots/api#inputmediasticker
 */
export interface InputMediaSticker {
  /**
   * Type of the media, must be sticker
   */
  readonly type: string

  /**
   * File to send. Pass a file_id to send a file that exists on the Telegram
   * servers (recommended), pass an HTTP URL for Telegram to get a .WEBP sticker
   * from the Internet, or pass “attach://<file_attach_name>” to upload a new
   * .WEBP, .TGS, or .WEBM sticker using multipart/form-data under
   * <file_attach_name> name. More information on Sending Files »
   */
  readonly media: string

  /**
   * Emoji associated with the sticker; only for just uploaded stickers
   */
  readonly emoji?: string | undefined
}

/**
 * Represents a venue to be sent.
 *
 * @see https://corefork.telegram.org/bots/api#inputmediavenue
 */
export interface InputMediaVenue {
  /**
   * Type of the media, must be venue
   */
  readonly type: string

  /**
   * Latitude of the location
   */
  readonly latitude: number

  /**
   * Longitude of the location
   */
  readonly longitude: number

  /**
   * Name of the venue
   */
  readonly title: string

  /**
   * Address of the venue
   */
  readonly address: string

  /**
   * Foursquare identifier of the venue
   */
  readonly foursquare_id?: string | undefined

  /**
   * Foursquare type of the venue, if known. (For example,
   * “arts_entertainment/default”, “arts_entertainment/aquarium” or
   * “food/icecream”.)
   */
  readonly foursquare_type?: string | undefined

  /**
   * Google Places identifier of the venue
   */
  readonly google_place_id?: string | undefined

  /**
   * Google Places type of the venue. (See supported types.)
   */
  readonly google_place_type?: string | undefined
}

/**
 * Represents a video to be sent.
 *
 * @see https://corefork.telegram.org/bots/api#inputmediavideo
 */
export interface InputMediaVideo {
  /**
   * Type of the media, must be video
   */
  readonly type: string

  /**
   * File to send. Pass a file_id to send a file that exists on the Telegram
   * servers (recommended), pass an HTTP URL for Telegram to get a file from the
   * Internet, or pass “attach://<file_attach_name>” to upload a new one using
   * multipart/form-data under <file_attach_name> name. More information on
   * Sending Files »
   */
  readonly media: string

  /**
   * Thumbnail of the file sent; can be ignored if thumbnail generation for the
   * file is supported server-side. The thumbnail should be in JPEG format and
   * less than 200 kB in size. A thumbnail's width and height should not exceed
   * 320. Ignored if the file is not uploaded using multipart/form-data.
   * Thumbnails can't be reused and can be only uploaded as a new file, so you
   * can pass “attach://<file_attach_name>” if the thumbnail was uploaded using
   * multipart/form-data under <file_attach_name>. More information on Sending
   * Files »
   */
  readonly thumbnail?: string | undefined

  /**
   * Cover for the video in the message. Pass a file_id to send a file that
   * exists on the Telegram servers (recommended), pass an HTTP URL for Telegram
   * to get a file from the Internet, or pass “attach://<file_attach_name>” to
   * upload a new one using multipart/form-data under <file_attach_name> name.
   * More information on Sending Files »
   */
  readonly cover?: string | undefined

  /**
   * Start timestamp for the video in the message
   */
  readonly start_timestamp?: number | undefined

  /**
   * Caption of the video to be sent, 0-1024 characters after entities parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the video caption. See formatting options for
   * more details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Pass True if the caption must be shown above the message media
   */
  readonly show_caption_above_media?: boolean | undefined

  /**
   * Video width
   */
  readonly width?: number | undefined

  /**
   * Video height
   */
  readonly height?: number | undefined

  /**
   * Video duration in seconds
   */
  readonly duration?: number | undefined

  /**
   * Pass True if the uploaded video is suitable for streaming
   */
  readonly supports_streaming?: boolean | undefined

  /**
   * Pass True if the video needs to be covered with a spoiler animation
   */
  readonly has_spoiler?: boolean | undefined
}

/**
 * Represents a voice message file to be sent.
 *
 * @see https://corefork.telegram.org/bots/api#inputmediavoicenote
 */
export interface InputMediaVoiceNote {
  /**
   * Type of the media, must be voice_note
   */
  readonly type: string

  /**
   * File to send. Pass a file_id to send a file that exists on the Telegram
   * servers (recommended), pass an HTTP URL for Telegram to get a file from the
   * Internet, or pass "attach://<file_attach_name>" to upload a new one using
   * multipart/form-data under <file_attach_name> name. More information on
   * Sending Files »
   */
  readonly media: string

  /**
   * Caption of the voice message to be sent, 0-1024 characters after entities
   * parsing
   */
  readonly caption?: string | undefined

  /**
   * Mode for parsing entities in the voice message caption. See formatting
   * options for more details.
   */
  readonly parse_mode?: string | undefined

  /**
   * List of special entities that appear in the caption, which can be specified
   * instead of parse_mode
   */
  readonly caption_entities?: MessageEntity[] | undefined

  /**
   * Duration of the voice message in seconds
   */
  readonly duration?: number | undefined
}

/**
 * This object describes the paid media to be sent. Currently, it can be one of
 *
 * @see https://corefork.telegram.org/bots/api#inputpaidmedia
 */
export type InputPaidMedia =
  | InputPaidMediaLivePhoto
  | InputPaidMediaPhoto
  | InputPaidMediaVideo

/**
 * The paid media to send is a live photo.
 *
 * @see https://corefork.telegram.org/bots/api#inputpaidmedialivephoto
 */
export interface InputPaidMediaLivePhoto {
  /**
   * Type of the media, must be live_photo
   */
  readonly type: string

  /**
   * Video of the live photo to send. Pass a file_id to send a file that exists
   * on the Telegram servers (recommended) or pass “attach://<file_attach_name>”
   * to upload a new one using multipart/form-data under <file_attach_name> name.
   * More information on Sending Files ». Sending live photos by a URL is
   * currently unsupported.
   */
  readonly media: string

  /**
   * The static photo to send. Pass a file_id to send a file that exists on the
   * Telegram servers (recommended) or pass “attach://<file_attach_name>” to
   * upload a new one using multipart/form-data under <file_attach_name> name.
   * More information on Sending Files ». Sending live photos by a URL is
   * currently unsupported.
   */
  readonly photo: string
}

/**
 * The paid media to send is a photo.
 *
 * @see https://corefork.telegram.org/bots/api#inputpaidmediaphoto
 */
export interface InputPaidMediaPhoto {
  /**
   * Type of the media, must be photo
   */
  readonly type: string

  /**
   * File to send. Pass a file_id to send a file that exists on the Telegram
   * servers (recommended), pass an HTTP URL for Telegram to get a file from the
   * Internet, or pass “attach://<file_attach_name>” to upload a new one using
   * multipart/form-data under <file_attach_name> name. More information on
   * Sending Files »
   */
  readonly media: string
}

/**
 * The paid media to send is a video.
 *
 * @see https://corefork.telegram.org/bots/api#inputpaidmediavideo
 */
export interface InputPaidMediaVideo {
  /**
   * Type of the media, must be video
   */
  readonly type: string

  /**
   * File to send. Pass a file_id to send a file that exists on the Telegram
   * servers (recommended), pass an HTTP URL for Telegram to get a file from the
   * Internet, or pass “attach://<file_attach_name>” to upload a new one using
   * multipart/form-data under <file_attach_name> name. More information on
   * Sending Files »
   */
  readonly media: string

  /**
   * Thumbnail of the file sent; can be ignored if thumbnail generation for the
   * file is supported server-side. The thumbnail should be in JPEG format and
   * less than 200 kB in size. A thumbnail's width and height should not exceed
   * 320. Ignored if the file is not uploaded using multipart/form-data.
   * Thumbnails can't be reused and can be only uploaded as a new file, so you
   * can pass “attach://<file_attach_name>” if the thumbnail was uploaded using
   * multipart/form-data under <file_attach_name>. More information on Sending
   * Files »
   */
  readonly thumbnail?: string | undefined

  /**
   * Cover for the video in the message. Pass a file_id to send a file that
   * exists on the Telegram servers (recommended), pass an HTTP URL for Telegram
   * to get a file from the Internet, or pass “attach://<file_attach_name>” to
   * upload a new one using multipart/form-data under <file_attach_name> name.
   * More information on Sending Files »
   */
  readonly cover?: string | undefined

  /**
   * Start timestamp for the video in the message
   */
  readonly start_timestamp?: number | undefined

  /**
   * Video width
   */
  readonly width?: number | undefined

  /**
   * Video height
   */
  readonly height?: number | undefined

  /**
   * Video duration in seconds
   */
  readonly duration?: number | undefined

  /**
   * Pass True if the uploaded video is suitable for streaming
   */
  readonly supports_streaming?: boolean | undefined
}

/**
 * This object describes a profile photo to set. Currently, it can be one of
 *
 * @see https://corefork.telegram.org/bots/api#inputprofilephoto
 */
export type InputProfilePhoto =
  | InputProfilePhotoAnimated
  | InputProfilePhotoStatic

/**
 * A static profile photo in the .JPG format.
 *
 * @see https://corefork.telegram.org/bots/api#inputprofilephotostatic
 */
export interface InputProfilePhotoStatic {
  /**
   * Type of the profile photo, must be static
   */
  readonly type: string

  /**
   * The static profile photo. Profile photos can't be reused and can only be
   * uploaded as a new file, so you can pass “attach://<file_attach_name>” if the
   * photo was uploaded using multipart/form-data under <file_attach_name>. More
   * information on Sending Files »
   */
  readonly photo: string
}

/**
 * An animated profile photo in the MPEG4 format.
 *
 * @see https://corefork.telegram.org/bots/api#inputprofilephotoanimated
 */
export interface InputProfilePhotoAnimated {
  /**
   * Type of the profile photo, must be animated
   */
  readonly type: string

  /**
   * The animated profile photo. Profile photos can't be reused and can only be
   * uploaded as a new file, so you can pass “attach://<file_attach_name>” if the
   * photo was uploaded using multipart/form-data under <file_attach_name>. More
   * information on Sending Files »
   */
  readonly animation: string

  /**
   * Timestamp in seconds of the frame that will be used as the static profile
   * photo. Defaults to 0.0.
   */
  readonly main_frame_timestamp?: number | undefined
}

/**
 * This object describes the content of a story to post. Currently, it can be
 * one of
 *
 * @see https://corefork.telegram.org/bots/api#inputstorycontent
 */
export type InputStoryContent =
  | InputStoryContentPhoto
  | InputStoryContentVideo

/**
 * Describes a photo to post as a story.
 *
 * @see https://corefork.telegram.org/bots/api#inputstorycontentphoto
 */
export interface InputStoryContentPhoto {
  /**
   * Type of the content, must be photo
   */
  readonly type: string

  /**
   * The photo to post as a story. The photo must be of the size 1080x1920 and
   * must not exceed 10 MB. The photo can't be reused and can only be uploaded as
   * a new file, so you can pass “attach://<file_attach_name>” if the photo was
   * uploaded using multipart/form-data under <file_attach_name>. More
   * information on Sending Files »
   */
  readonly photo: string
}

/**
 * Describes a video to post as a story.
 *
 * @see https://corefork.telegram.org/bots/api#inputstorycontentvideo
 */
export interface InputStoryContentVideo {
  /**
   * Type of the content, must be video
   */
  readonly type: string

  /**
   * The video to post as a story. The video must be of the size 720x1280,
   * streamable, encoded with H.265 codec, with key frames added each second in
   * the MPEG4 format, and must not exceed 30 MB. The video can't be reused and
   * can only be uploaded as a new file, so you can pass
   * “attach://<file_attach_name>” if the video was uploaded using
   * multipart/form-data under <file_attach_name>. More information on Sending
   * Files »
   */
  readonly video: string

  /**
   * Precise duration of the video in seconds; 0-60
   */
  readonly duration?: number | undefined

  /**
   * Timestamp in seconds of the frame that will be used as the static cover for
   * the story. Defaults to 0.0.
   */
  readonly cover_frame_timestamp?: number | undefined

  /**
   * Pass True if the video has no sound
   */
  readonly is_animation?: boolean | undefined
}
