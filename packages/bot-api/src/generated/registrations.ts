// GENERATED FILE — do not edit.
// Named event registrations (79)
// Source: Telegram Bot API 10.2, schemas/bot-api/10.2.json

import type { ContextFor } from '../events/types.js'
import type { EventHandler } from '../bot.js'

/**
 * A named registration for every event kind. Merged into `Bot`, and installed
 * on its prototype from `REGISTRATIONS` — so the declaration and the runtime
 * are generated from one list and cannot disagree.
 */
export interface GeneratedRegistrations<Ext> {
  /**
   * Service message: auto-delete timer settings changed in the chat. Equivalent
   * to `on('auto_delete_timer_changed', handler)`.
   */
  onAutoDeleteTimerChanged(handler: EventHandler<ContextFor<'auto_delete_timer_changed'> & Ext>): this

  /**
   * Service message: user boosted the chat. Equivalent to `on('boost_added',
   * handler)`.
   */
  onBoostAdded(handler: EventHandler<ContextFor<'boost_added'> & Ext>): this

  /**
   * The bot was connected to or disconnected from a business account, or a user
   * edited an existing connection with the bot. Equivalent to
   * `on('business_connection', handler)`.
   */
  onBusinessConnection(handler: EventHandler<ContextFor<'business_connection'> & Ext>): this

  /**
   * New message from a connected business account. Equivalent to
   * `on('business_message', handler)`.
   */
  onBusinessMessage(handler: EventHandler<ContextFor<'business_message'> & Ext>): this

  /**
   * New version of a message from a connected business account. Equivalent to
   * `on('business_message_edited', handler)`.
   */
  onBusinessMessageEdited(handler: EventHandler<ContextFor<'business_message_edited'> & Ext>): this

  /**
   * Messages were deleted from a connected business account. Equivalent to
   * `on('business_messages_deleted', handler)`.
   */
  onBusinessMessagesDeleted(handler: EventHandler<ContextFor<'business_messages_deleted'> & Ext>): this

  /**
   * Service message: the channel has been created. Equivalent to
   * `on('channel_created', handler)`.
   */
  onChannelCreated(handler: EventHandler<ContextFor<'channel_created'> & Ext>): this

  /**
   * New incoming channel post of any kind - text, photo, sticker, etc.
   * Equivalent to `on('channel_post', handler)`.
   */
  onChannelPost(handler: EventHandler<ContextFor<'channel_post'> & Ext>): this

  /**
   * New version of a channel post that is known to the bot and was edited.
   * Equivalent to `on('channel_post_edited', handler)`.
   */
  onChannelPostEdited(handler: EventHandler<ContextFor<'channel_post_edited'> & Ext>): this

  /**
   * Service message: chat background set. Equivalent to
   * `on('chat_background_set', handler)`.
   */
  onChatBackgroundSet(handler: EventHandler<ContextFor<'chat_background_set'> & Ext>): this

  /**
   * A chat boost was added or changed. Equivalent to `on('chat_boost',
   * handler)`.
   */
  onChatBoost(handler: EventHandler<ContextFor<'chat_boost'> & Ext>): this

  /**
   * A boost was removed from a chat. Equivalent to `on('chat_boost_removed',
   * handler)`.
   */
  onChatBoostRemoved(handler: EventHandler<ContextFor<'chat_boost_removed'> & Ext>): this

  /**
   * Service message: the group has been created. Equivalent to
   * `on('chat_created', handler)`.
   */
  onChatCreated(handler: EventHandler<ContextFor<'chat_created'> & Ext>): this

  /**
   * A request to join the chat has been sent. Equivalent to
   * `on('chat_join_request', handler)`.
   */
  onChatJoinRequest(handler: EventHandler<ContextFor<'chat_join_request'> & Ext>): this

  /**
   * A chat member's status was updated in a chat. Equivalent to
   * `on('chat_member', handler)`.
   */
  onChatMember(handler: EventHandler<ContextFor<'chat_member'> & Ext>): this

  /**
   * New members that were added to the group or supergroup and information about
   * them (the bot itself may be one of these members). Equivalent to
   * `on('chat_member_joined', handler)`.
   */
  onChatMemberJoined(handler: EventHandler<ContextFor<'chat_member_joined'> & Ext>): this

  /**
   * A member was removed from the group, information about them (this member may
   * be the bot itself). Equivalent to `on('chat_member_left', handler)`.
   */
  onChatMemberLeft(handler: EventHandler<ContextFor<'chat_member_left'> & Ext>): this

  /**
   * The supergroup has been migrated from a group with the specified identifier.
   * Equivalent to `on('chat_migrated_from', handler)`.
   */
  onChatMigratedFrom(handler: EventHandler<ContextFor<'chat_migrated_from'> & Ext>): this

  /**
   * The group has been migrated to a supergroup with the specified identifier.
   * Equivalent to `on('chat_migrated_to', handler)`.
   */
  onChatMigratedTo(handler: EventHandler<ContextFor<'chat_migrated_to'> & Ext>): this

  /**
   * Service message: chat owner has changed. Equivalent to
   * `on('chat_owner_changed', handler)`.
   */
  onChatOwnerChanged(handler: EventHandler<ContextFor<'chat_owner_changed'> & Ext>): this

  /**
   * Service message: chat owner has left. Equivalent to `on('chat_owner_left',
   * handler)`.
   */
  onChatOwnerLeft(handler: EventHandler<ContextFor<'chat_owner_left'> & Ext>): this

  /**
   * A chat photo was change to this value. Equivalent to
   * `on('chat_photo_changed', handler)`.
   */
  onChatPhotoChanged(handler: EventHandler<ContextFor<'chat_photo_changed'> & Ext>): this

  /**
   * Service message: the chat photo was deleted. Equivalent to
   * `on('chat_photo_deleted', handler)`.
   */
  onChatPhotoDeleted(handler: EventHandler<ContextFor<'chat_photo_deleted'> & Ext>): this

  /**
   * Service message: a chat was shared with the bot. Equivalent to
   * `on('chat_shared', handler)`.
   */
  onChatShared(handler: EventHandler<ContextFor<'chat_shared'> & Ext>): this

  /**
   * A chat title was changed to this value. Equivalent to
   * `on('chat_title_changed', handler)`.
   */
  onChatTitleChanged(handler: EventHandler<ContextFor<'chat_title_changed'> & Ext>): this

  /**
   * Service message: tasks were added to a checklist. Equivalent to
   * `on('checklist_tasks_added', handler)`.
   */
  onChecklistTasksAdded(handler: EventHandler<ContextFor<'checklist_tasks_added'> & Ext>): this

  /**
   * Service message: some tasks in a checklist were marked as done or not done.
   * Equivalent to `on('checklist_tasks_done', handler)`.
   */
  onChecklistTasksDone(handler: EventHandler<ContextFor<'checklist_tasks_done'> & Ext>): this

  /**
   * Service message: chat added to a Community. Equivalent to
   * `on('community_chat_added', handler)`.
   */
  onCommunityChatAdded(handler: EventHandler<ContextFor<'community_chat_added'> & Ext>): this

  /**
   * Service message: chat removed from a Community. Equivalent to
   * `on('community_chat_removed', handler)`.
   */
  onCommunityChatRemoved(handler: EventHandler<ContextFor<'community_chat_removed'> & Ext>): this

  /**
   * The domain name of the website on which the user has logged in. Equivalent
   * to `on('connected_website', handler)`.
   */
  onConnectedWebsite(handler: EventHandler<ContextFor<'connected_website'> & Ext>): this

  /**
   * Service message: the price for paid messages in the corresponding direct
   * messages chat of a channel has changed. Equivalent to
   * `on('direct_message_price_changed', handler)`.
   */
  onDirectMessagePriceChanged(handler: EventHandler<ContextFor<'direct_message_price_changed'> & Ext>): this

  /**
   * Service message: forum topic closed. Equivalent to `on('forum_topic_closed',
   * handler)`.
   */
  onForumTopicClosed(handler: EventHandler<ContextFor<'forum_topic_closed'> & Ext>): this

  /**
   * Service message: forum topic created. Equivalent to
   * `on('forum_topic_created', handler)`.
   */
  onForumTopicCreated(handler: EventHandler<ContextFor<'forum_topic_created'> & Ext>): this

  /**
   * Service message: forum topic edited. Equivalent to `on('forum_topic_edited',
   * handler)`.
   */
  onForumTopicEdited(handler: EventHandler<ContextFor<'forum_topic_edited'> & Ext>): this

  /**
   * Service message: forum topic reopened. Equivalent to
   * `on('forum_topic_reopened', handler)`.
   */
  onForumTopicReopened(handler: EventHandler<ContextFor<'forum_topic_reopened'> & Ext>): this

  /**
   * Service message: the 'General' forum topic hidden. Equivalent to
   * `on('general_forum_topic_hidden', handler)`.
   */
  onGeneralForumTopicHidden(handler: EventHandler<ContextFor<'general_forum_topic_hidden'> & Ext>): this

  /**
   * Service message: the 'General' forum topic unhidden. Equivalent to
   * `on('general_forum_topic_unhidden', handler)`.
   */
  onGeneralForumTopicUnhidden(handler: EventHandler<ContextFor<'general_forum_topic_unhidden'> & Ext>): this

  /**
   * Service message: a regular gift was sent or received. Equivalent to
   * `on('gift', handler)`.
   */
  onGift(handler: EventHandler<ContextFor<'gift'> & Ext>): this

  /**
   * Service message: upgrade of a gift was purchased after the gift was sent.
   * Equivalent to `on('gift_upgrade_sent', handler)`.
   */
  onGiftUpgradeSent(handler: EventHandler<ContextFor<'gift_upgrade_sent'> & Ext>): this

  /**
   * Service message: a giveaway without public winners was completed. Equivalent
   * to `on('giveaway_completed', handler)`.
   */
  onGiveawayCompleted(handler: EventHandler<ContextFor<'giveaway_completed'> & Ext>): this

  /**
   * Service message: a scheduled giveaway was created. Equivalent to
   * `on('giveaway_created', handler)`.
   */
  onGiveawayCreated(handler: EventHandler<ContextFor<'giveaway_created'> & Ext>): this

  /**
   * New guest message. Equivalent to `on('guest_message', handler)`.
   */
  onGuestMessage(handler: EventHandler<ContextFor<'guest_message'> & Ext>): this

  /**
   * New incoming inline query. Equivalent to `on('inline_query', handler)`.
   */
  onInlineQuery(handler: EventHandler<ContextFor<'inline_query'> & Ext>): this

  /**
   * The result of an inline query that was chosen by a user and sent to their
   * chat partner. Equivalent to `on('inline_result_chosen', handler)`.
   */
  onInlineResultChosen(handler: EventHandler<ContextFor<'inline_result_chosen'> & Ext>): this

  /**
   * A new bot was created to be managed by the bot, or token or owner of a
   * managed bot was changed. Equivalent to `on('managed_bot', handler)`.
   */
  onManagedBot(handler: EventHandler<ContextFor<'managed_bot'> & Ext>): this

  /**
   * Service message: user created a bot that will be managed by the current bot.
   * Equivalent to `on('managed_bot_created', handler)`.
   */
  onManagedBotCreated(handler: EventHandler<ContextFor<'managed_bot_created'> & Ext>): this

  /**
   * New incoming message of any kind - text, photo, sticker, etc. Equivalent to
   * `on('message', handler)`.
   */
  onMessage(handler: EventHandler<ContextFor<'message'> & Ext>): this

  /**
   * New version of a message that is known to the bot and was edited. Equivalent
   * to `on('message_edited', handler)`.
   */
  onMessageEdited(handler: EventHandler<ContextFor<'message_edited'> & Ext>): this

  /**
   * Specified message was pinned. Equivalent to `on('message_pinned', handler)`.
   */
  onMessagePinned(handler: EventHandler<ContextFor<'message_pinned'> & Ext>): this

  /**
   * A reaction to a message was changed by a user. Equivalent to
   * `on('message_reaction', handler)`.
   */
  onMessageReaction(handler: EventHandler<ContextFor<'message_reaction'> & Ext>): this

  /**
   * Reactions to a message with anonymous reactions were changed. Equivalent to
   * `on('message_reaction_count', handler)`.
   */
  onMessageReactionCount(handler: EventHandler<ContextFor<'message_reaction_count'> & Ext>): this

  /**
   * The bot's chat member status was updated in a chat. Equivalent to
   * `on('my_chat_member', handler)`.
   */
  onMyChatMember(handler: EventHandler<ContextFor<'my_chat_member'> & Ext>): this

  /**
   * Service message: the price for paid messages has changed in the chat.
   * Equivalent to `on('paid_message_price_changed', handler)`.
   */
  onPaidMessagePriceChanged(handler: EventHandler<ContextFor<'paid_message_price_changed'> & Ext>): this

  /**
   * Telegram Passport data. Equivalent to `on('passport_data', handler)`.
   */
  onPassportData(handler: EventHandler<ContextFor<'passport_data'> & Ext>): this

  /**
   * Message is a service message about a successful payment, information about
   * the payment. Equivalent to `on('payment_successful', handler)`.
   */
  onPaymentSuccessful(handler: EventHandler<ContextFor<'payment_successful'> & Ext>): this

  /**
   * New poll state. Equivalent to `on('poll', handler)`.
   */
  onPoll(handler: EventHandler<ContextFor<'poll'> & Ext>): this

  /**
   * A user changed their answer in a non-anonymous poll. Equivalent to
   * `on('poll_answer', handler)`.
   */
  onPollAnswer(handler: EventHandler<ContextFor<'poll_answer'> & Ext>): this

  /**
   * Service message: answer option was added to a poll. Equivalent to
   * `on('poll_option_added', handler)`.
   */
  onPollOptionAdded(handler: EventHandler<ContextFor<'poll_option_added'> & Ext>): this

  /**
   * Service message: answer option was deleted from a poll. Equivalent to
   * `on('poll_option_deleted', handler)`.
   */
  onPollOptionDeleted(handler: EventHandler<ContextFor<'poll_option_deleted'> & Ext>): this

  /**
   * New incoming pre-checkout query. Equivalent to `on('pre_checkout_query',
   * handler)`.
   */
  onPreCheckoutQuery(handler: EventHandler<ContextFor<'pre_checkout_query'> & Ext>): this

  /**
   * Service message: a user in the chat triggered another user's proximity alert
   * while sharing Live Location. Equivalent to `on('proximity_alert', handler)`.
   */
  onProximityAlert(handler: EventHandler<ContextFor<'proximity_alert'> & Ext>): this

  /**
   * A user purchased paid media with a non-empty payload sent by the bot in a
   * non-channel chat. Equivalent to `on('purchased_paid_media', handler)`.
   */
  onPurchasedPaidMedia(handler: EventHandler<ContextFor<'purchased_paid_media'> & Ext>): this

  /**
   * Message is a service message about a refunded payment, information about the
   * payment. Equivalent to `on('refunded_payment', handler)`.
   */
  onRefundedPayment(handler: EventHandler<ContextFor<'refunded_payment'> & Ext>): this

  /**
   * New incoming shipping query. Equivalent to `on('shipping_query', handler)`.
   */
  onShippingQuery(handler: EventHandler<ContextFor<'shipping_query'> & Ext>): this

  /**
   * User payment subscription has changed. Equivalent to `on('subscription',
   * handler)`.
   */
  onSubscription(handler: EventHandler<ContextFor<'subscription'> & Ext>): this

  /**
   * Service message: approval of a suggested post has failed. Equivalent to
   * `on('suggested_post_approval_failed', handler)`.
   */
  onSuggestedPostApprovalFailed(handler: EventHandler<ContextFor<'suggested_post_approval_failed'> & Ext>): this

  /**
   * Service message: a suggested post was approved. Equivalent to
   * `on('suggested_post_approved', handler)`.
   */
  onSuggestedPostApproved(handler: EventHandler<ContextFor<'suggested_post_approved'> & Ext>): this

  /**
   * Service message: a suggested post was declined. Equivalent to
   * `on('suggested_post_declined', handler)`.
   */
  onSuggestedPostDeclined(handler: EventHandler<ContextFor<'suggested_post_declined'> & Ext>): this

  /**
   * Service message: payment for a suggested post was received. Equivalent to
   * `on('suggested_post_paid', handler)`.
   */
  onSuggestedPostPaid(handler: EventHandler<ContextFor<'suggested_post_paid'> & Ext>): this

  /**
   * Service message: payment for a suggested post was refunded. Equivalent to
   * `on('suggested_post_refunded', handler)`.
   */
  onSuggestedPostRefunded(handler: EventHandler<ContextFor<'suggested_post_refunded'> & Ext>): this

  /**
   * Service message: the supergroup has been created. Equivalent to
   * `on('supergroup_created', handler)`.
   */
  onSupergroupCreated(handler: EventHandler<ContextFor<'supergroup_created'> & Ext>): this

  /**
   * Service message: a unique gift was sent or received. Equivalent to
   * `on('unique_gift', handler)`.
   */
  onUniqueGift(handler: EventHandler<ContextFor<'unique_gift'> & Ext>): this

  /**
   * Service message: users were shared with the bot. Equivalent to
   * `on('users_shared', handler)`.
   */
  onUsersShared(handler: EventHandler<ContextFor<'users_shared'> & Ext>): this

  /**
   * Service message: video chat ended. Equivalent to `on('video_chat_ended',
   * handler)`.
   */
  onVideoChatEnded(handler: EventHandler<ContextFor<'video_chat_ended'> & Ext>): this

  /**
   * Service message: new participants invited to a video chat. Equivalent to
   * `on('video_chat_participants_invited', handler)`.
   */
  onVideoChatParticipantsInvited(handler: EventHandler<ContextFor<'video_chat_participants_invited'> & Ext>): this

  /**
   * Service message: video chat scheduled. Equivalent to
   * `on('video_chat_scheduled', handler)`.
   */
  onVideoChatScheduled(handler: EventHandler<ContextFor<'video_chat_scheduled'> & Ext>): this

  /**
   * Service message: video chat started. Equivalent to `on('video_chat_started',
   * handler)`.
   */
  onVideoChatStarted(handler: EventHandler<ContextFor<'video_chat_started'> & Ext>): this

  /**
   * Service message: data sent by a Web App. Equivalent to `on('web_app_data',
   * handler)`.
   */
  onWebAppData(handler: EventHandler<ContextFor<'web_app_data'> & Ext>): this

  /**
   * Service message: the user allowed the bot to write messages after adding it
   * to the attachment or side menu, launching a Web App from a link, or
   * accepting an explicit request from a Web App sent by the method
   * requestWriteAccess. Equivalent to `on('write_access_allowed', handler)`.
   */
  onWriteAccessAllowed(handler: EventHandler<ContextFor<'write_access_allowed'> & Ext>): this
}

/**
 * Method name to event kind, for installing the registrations above. Ordered
 * by method name, so the emitted file is stable across regenerations.
 */
export const REGISTRATIONS: ReadonlyArray<readonly [method: string, kind: string]> = [
  ['onAutoDeleteTimerChanged', 'auto_delete_timer_changed'],
  ['onBoostAdded', 'boost_added'],
  ['onBusinessConnection', 'business_connection'],
  ['onBusinessMessage', 'business_message'],
  ['onBusinessMessageEdited', 'business_message_edited'],
  ['onBusinessMessagesDeleted', 'business_messages_deleted'],
  ['onChannelCreated', 'channel_created'],
  ['onChannelPost', 'channel_post'],
  ['onChannelPostEdited', 'channel_post_edited'],
  ['onChatBackgroundSet', 'chat_background_set'],
  ['onChatBoost', 'chat_boost'],
  ['onChatBoostRemoved', 'chat_boost_removed'],
  ['onChatCreated', 'chat_created'],
  ['onChatJoinRequest', 'chat_join_request'],
  ['onChatMember', 'chat_member'],
  ['onChatMemberJoined', 'chat_member_joined'],
  ['onChatMemberLeft', 'chat_member_left'],
  ['onChatMigratedFrom', 'chat_migrated_from'],
  ['onChatMigratedTo', 'chat_migrated_to'],
  ['onChatOwnerChanged', 'chat_owner_changed'],
  ['onChatOwnerLeft', 'chat_owner_left'],
  ['onChatPhotoChanged', 'chat_photo_changed'],
  ['onChatPhotoDeleted', 'chat_photo_deleted'],
  ['onChatShared', 'chat_shared'],
  ['onChatTitleChanged', 'chat_title_changed'],
  ['onChecklistTasksAdded', 'checklist_tasks_added'],
  ['onChecklistTasksDone', 'checklist_tasks_done'],
  ['onCommunityChatAdded', 'community_chat_added'],
  ['onCommunityChatRemoved', 'community_chat_removed'],
  ['onConnectedWebsite', 'connected_website'],
  ['onDirectMessagePriceChanged', 'direct_message_price_changed'],
  ['onForumTopicClosed', 'forum_topic_closed'],
  ['onForumTopicCreated', 'forum_topic_created'],
  ['onForumTopicEdited', 'forum_topic_edited'],
  ['onForumTopicReopened', 'forum_topic_reopened'],
  ['onGeneralForumTopicHidden', 'general_forum_topic_hidden'],
  ['onGeneralForumTopicUnhidden', 'general_forum_topic_unhidden'],
  ['onGift', 'gift'],
  ['onGiftUpgradeSent', 'gift_upgrade_sent'],
  ['onGiveawayCompleted', 'giveaway_completed'],
  ['onGiveawayCreated', 'giveaway_created'],
  ['onGuestMessage', 'guest_message'],
  ['onInlineQuery', 'inline_query'],
  ['onInlineResultChosen', 'inline_result_chosen'],
  ['onManagedBot', 'managed_bot'],
  ['onManagedBotCreated', 'managed_bot_created'],
  ['onMessage', 'message'],
  ['onMessageEdited', 'message_edited'],
  ['onMessagePinned', 'message_pinned'],
  ['onMessageReaction', 'message_reaction'],
  ['onMessageReactionCount', 'message_reaction_count'],
  ['onMyChatMember', 'my_chat_member'],
  ['onPaidMessagePriceChanged', 'paid_message_price_changed'],
  ['onPassportData', 'passport_data'],
  ['onPaymentSuccessful', 'payment_successful'],
  ['onPoll', 'poll'],
  ['onPollAnswer', 'poll_answer'],
  ['onPollOptionAdded', 'poll_option_added'],
  ['onPollOptionDeleted', 'poll_option_deleted'],
  ['onPreCheckoutQuery', 'pre_checkout_query'],
  ['onProximityAlert', 'proximity_alert'],
  ['onPurchasedPaidMedia', 'purchased_paid_media'],
  ['onRefundedPayment', 'refunded_payment'],
  ['onShippingQuery', 'shipping_query'],
  ['onSubscription', 'subscription'],
  ['onSuggestedPostApprovalFailed', 'suggested_post_approval_failed'],
  ['onSuggestedPostApproved', 'suggested_post_approved'],
  ['onSuggestedPostDeclined', 'suggested_post_declined'],
  ['onSuggestedPostPaid', 'suggested_post_paid'],
  ['onSuggestedPostRefunded', 'suggested_post_refunded'],
  ['onSupergroupCreated', 'supergroup_created'],
  ['onUniqueGift', 'unique_gift'],
  ['onUsersShared', 'users_shared'],
  ['onVideoChatEnded', 'video_chat_ended'],
  ['onVideoChatParticipantsInvited', 'video_chat_participants_invited'],
  ['onVideoChatScheduled', 'video_chat_scheduled'],
  ['onVideoChatStarted', 'video_chat_started'],
  ['onWebAppData', 'web_app_data'],
  ['onWriteAccessAllowed', 'write_access_allowed'],
]
