// GENERATED FILE — do not edit.
// Bot API event taxonomy
// Source: Telegram Bot API 10.2, schemas/bot-api/10.2.json

import type { BotSubscriptionUpdated, BusinessConnection, BusinessMessagesDeleted, CallbackQuery, ChatBoostRemoved, ChatBoostUpdated, ChatJoinRequest, ChatMemberUpdated, ChosenInlineResult, InlineQuery, ManagedBotUpdated, Message, MessageReactionCountUpdated, MessageReactionUpdated, PaidMediaPurchased, Poll, PollAnswer, PreCheckoutQuery, ShippingQuery } from './types/index.js'

/**
 * Event kinds produced by a top-level `Update` field.
 */
export type UpdateEventKind =
  | 'business_connection'
  | 'business_message'
  | 'business_message_edited'
  | 'business_messages_deleted'
  | 'callback_query'
  | 'channel_post'
  | 'channel_post_edited'
  | 'chat_boost'
  | 'chat_boost_removed'
  | 'chat_join_request'
  | 'chat_member'
  | 'guest_message'
  | 'inline_query'
  | 'inline_result_chosen'
  | 'managed_bot'
  | 'message'
  | 'message_edited'
  | 'message_reaction'
  | 'message_reaction_count'
  | 'my_chat_member'
  | 'poll'
  | 'poll_answer'
  | 'pre_checkout_query'
  | 'purchased_paid_media'
  | 'shipping_query'
  | 'subscription'

/**
 * Event kinds promoted from a service message. The Bot API delivers each of
 * these as a `message` with the corresponding field set; Yuigram raises them
 * to their own kind so applications do not have to branch inside a message
 * handler.
 */
export type ServiceEventKind =
  | 'auto_delete_timer_changed'
  | 'boost_added'
  | 'channel_created'
  | 'chat_background_set'
  | 'chat_created'
  | 'chat_member_joined'
  | 'chat_member_left'
  | 'chat_migrated_from'
  | 'chat_migrated_to'
  | 'chat_owner_changed'
  | 'chat_owner_left'
  | 'chat_photo_changed'
  | 'chat_photo_deleted'
  | 'chat_shared'
  | 'chat_title_changed'
  | 'checklist_tasks_added'
  | 'checklist_tasks_done'
  | 'community_chat_added'
  | 'community_chat_removed'
  | 'connected_website'
  | 'direct_message_price_changed'
  | 'forum_topic_closed'
  | 'forum_topic_created'
  | 'forum_topic_edited'
  | 'forum_topic_reopened'
  | 'general_forum_topic_hidden'
  | 'general_forum_topic_unhidden'
  | 'gift'
  | 'gift_upgrade_sent'
  | 'giveaway_completed'
  | 'giveaway_created'
  | 'managed_bot_created'
  | 'message_pinned'
  | 'paid_message_price_changed'
  | 'passport_data'
  | 'payment_successful'
  | 'poll_option_added'
  | 'poll_option_deleted'
  | 'proximity_alert'
  | 'refunded_payment'
  | 'suggested_post_approval_failed'
  | 'suggested_post_approved'
  | 'suggested_post_declined'
  | 'suggested_post_paid'
  | 'suggested_post_refunded'
  | 'supergroup_created'
  | 'unique_gift'
  | 'users_shared'
  | 'video_chat_ended'
  | 'video_chat_participants_invited'
  | 'video_chat_scheduled'
  | 'video_chat_started'
  | 'web_app_data'
  | 'write_access_allowed'

/** Every Bot API event kind. */
export type BotEventKind = UpdateEventKind | ServiceEventKind

/**
 * Maps an `Update` field to its event kind.
 */
export const UPDATE_EVENTS = {
  "business_connection": 'business_connection',
  "business_message": 'business_message',
  "edited_business_message": 'business_message_edited',
  "deleted_business_messages": 'business_messages_deleted',
  "callback_query": 'callback_query',
  "channel_post": 'channel_post',
  "edited_channel_post": 'channel_post_edited',
  "chat_boost": 'chat_boost',
  "removed_chat_boost": 'chat_boost_removed',
  "chat_join_request": 'chat_join_request',
  "chat_member": 'chat_member',
  "guest_message": 'guest_message',
  "inline_query": 'inline_query',
  "chosen_inline_result": 'inline_result_chosen',
  "managed_bot": 'managed_bot',
  "message": 'message',
  "edited_message": 'message_edited',
  "message_reaction": 'message_reaction',
  "message_reaction_count": 'message_reaction_count',
  "my_chat_member": 'my_chat_member',
  "poll": 'poll',
  "poll_answer": 'poll_answer',
  "pre_checkout_query": 'pre_checkout_query',
  "purchased_paid_media": 'purchased_paid_media',
  "shipping_query": 'shipping_query',
  "subscription": 'subscription',
} as const satisfies Record<string, UpdateEventKind>

/**
 * Maps a service-message field on `Message` to its event kind. Order matters:
 * the first field present wins, and a message carrying none of them is an
 * ordinary message.
 */
export const SERVICE_EVENTS = {
  "message_auto_delete_timer_changed": 'auto_delete_timer_changed',
  "boost_added": 'boost_added',
  "channel_chat_created": 'channel_created',
  "chat_background_set": 'chat_background_set',
  "group_chat_created": 'chat_created',
  "new_chat_members": 'chat_member_joined',
  "left_chat_member": 'chat_member_left',
  "migrate_from_chat_id": 'chat_migrated_from',
  "migrate_to_chat_id": 'chat_migrated_to',
  "chat_owner_changed": 'chat_owner_changed',
  "chat_owner_left": 'chat_owner_left',
  "new_chat_photo": 'chat_photo_changed',
  "delete_chat_photo": 'chat_photo_deleted',
  "chat_shared": 'chat_shared',
  "new_chat_title": 'chat_title_changed',
  "checklist_tasks_added": 'checklist_tasks_added',
  "checklist_tasks_done": 'checklist_tasks_done',
  "community_chat_added": 'community_chat_added',
  "community_chat_removed": 'community_chat_removed',
  "connected_website": 'connected_website',
  "direct_message_price_changed": 'direct_message_price_changed',
  "forum_topic_closed": 'forum_topic_closed',
  "forum_topic_created": 'forum_topic_created',
  "forum_topic_edited": 'forum_topic_edited',
  "forum_topic_reopened": 'forum_topic_reopened',
  "general_forum_topic_hidden": 'general_forum_topic_hidden',
  "general_forum_topic_unhidden": 'general_forum_topic_unhidden',
  "gift": 'gift',
  "gift_upgrade_sent": 'gift_upgrade_sent',
  "giveaway_completed": 'giveaway_completed',
  "giveaway_created": 'giveaway_created',
  "managed_bot_created": 'managed_bot_created',
  "pinned_message": 'message_pinned',
  "paid_message_price_changed": 'paid_message_price_changed',
  "passport_data": 'passport_data',
  "successful_payment": 'payment_successful',
  "poll_option_added": 'poll_option_added',
  "poll_option_deleted": 'poll_option_deleted',
  "proximity_alert_triggered": 'proximity_alert',
  "refunded_payment": 'refunded_payment',
  "suggested_post_approval_failed": 'suggested_post_approval_failed',
  "suggested_post_approved": 'suggested_post_approved',
  "suggested_post_declined": 'suggested_post_declined',
  "suggested_post_paid": 'suggested_post_paid',
  "suggested_post_refunded": 'suggested_post_refunded',
  "supergroup_chat_created": 'supergroup_created',
  "unique_gift": 'unique_gift',
  "users_shared": 'users_shared',
  "video_chat_ended": 'video_chat_ended',
  "video_chat_participants_invited": 'video_chat_participants_invited',
  "video_chat_scheduled": 'video_chat_scheduled',
  "video_chat_started": 'video_chat_started',
  "web_app_data": 'web_app_data',
  "write_access_allowed": 'write_access_allowed',
} as const satisfies Record<string, ServiceEventKind>

/**
 * The payload type carried by each top-level update kind.
 */
export interface UpdatePayloads {
  "business_connection": BusinessConnection
  "business_message": Message
  "business_message_edited": Message
  "business_messages_deleted": BusinessMessagesDeleted
  "callback_query": CallbackQuery
  "channel_post": Message
  "channel_post_edited": Message
  "chat_boost": ChatBoostUpdated
  "chat_boost_removed": ChatBoostRemoved
  "chat_join_request": ChatJoinRequest
  "chat_member": ChatMemberUpdated
  "guest_message": Message
  "inline_query": InlineQuery
  "inline_result_chosen": ChosenInlineResult
  "managed_bot": ManagedBotUpdated
  "message": Message
  "message_edited": Message
  "message_reaction": MessageReactionUpdated
  "message_reaction_count": MessageReactionCountUpdated
  "my_chat_member": ChatMemberUpdated
  "poll": Poll
  "poll_answer": PollAnswer
  "pre_checkout_query": PreCheckoutQuery
  "purchased_paid_media": PaidMediaPurchased
  "shipping_query": ShippingQuery
  "subscription": BotSubscriptionUpdated
}

/**
 * Update fields whose payload is a `Message`, and so may carry a service
 * marker. Only these are scanned for promotion.
 */
export const MESSAGE_FIELDS: ReadonlySet<string> = new Set([
  'business_message',
  'channel_post',
  'edited_business_message',
  'edited_channel_post',
  'edited_message',
  'guest_message',
  'message',
])

/**
 * Every event kind whose payload is a `Message`. Anything matching text -
 * commands, text filters - must consider all of them, or it silently ignores
 * the kinds it forgot.
 */
export const MESSAGE_KINDS = [
  'business_message',
  'business_message_edited',
  'channel_post',
  'channel_post_edited',
  'guest_message',
  'message',
  'message_edited',
] as const satisfies readonly UpdateEventKind[]

/**
 * For every event kind, the `Update` fields a subscription must name.
 * `allowed_updates` takes Telegram’s update type names, which are the `Update`
 * field names rather than Yuigram kinds; a service kind is a message carrying
 * a marker, so it maps to every field that can deliver one.
 */
export const KIND_SUBSCRIPTIONS: Readonly<Record<string, readonly string[]>> = {
  'auto_delete_timer_changed': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'boost_added': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'business_connection': ['business_connection'],
  'business_message': ['business_message'],
  'business_message_edited': ['edited_business_message'],
  'business_messages_deleted': ['deleted_business_messages'],
  'callback_query': ['callback_query'],
  'channel_created': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'channel_post': ['channel_post'],
  'channel_post_edited': ['edited_channel_post'],
  'chat_background_set': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'chat_boost': ['chat_boost'],
  'chat_boost_removed': ['removed_chat_boost'],
  'chat_created': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'chat_join_request': ['chat_join_request'],
  'chat_member': ['chat_member'],
  'chat_member_joined': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'chat_member_left': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'chat_migrated_from': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'chat_migrated_to': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'chat_owner_changed': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'chat_owner_left': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'chat_photo_changed': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'chat_photo_deleted': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'chat_shared': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'chat_title_changed': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'checklist_tasks_added': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'checklist_tasks_done': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'community_chat_added': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'community_chat_removed': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'connected_website': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'direct_message_price_changed': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'forum_topic_closed': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'forum_topic_created': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'forum_topic_edited': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'forum_topic_reopened': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'general_forum_topic_hidden': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'general_forum_topic_unhidden': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'gift': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'gift_upgrade_sent': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'giveaway_completed': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'giveaway_created': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'guest_message': ['guest_message'],
  'inline_query': ['inline_query'],
  'inline_result_chosen': ['chosen_inline_result'],
  'managed_bot': ['managed_bot'],
  'managed_bot_created': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'message': ['message'],
  'message_edited': ['edited_message'],
  'message_pinned': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'message_reaction': ['message_reaction'],
  'message_reaction_count': ['message_reaction_count'],
  'my_chat_member': ['my_chat_member'],
  'paid_message_price_changed': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'passport_data': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'payment_successful': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'poll': ['poll'],
  'poll_answer': ['poll_answer'],
  'poll_option_added': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'poll_option_deleted': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'pre_checkout_query': ['pre_checkout_query'],
  'proximity_alert': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'purchased_paid_media': ['purchased_paid_media'],
  'refunded_payment': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'shipping_query': ['shipping_query'],
  'subscription': ['subscription'],
  'suggested_post_approval_failed': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'suggested_post_approved': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'suggested_post_declined': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'suggested_post_paid': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'suggested_post_refunded': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'supergroup_created': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'unique_gift': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'users_shared': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'video_chat_ended': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'video_chat_participants_invited': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'video_chat_scheduled': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'video_chat_started': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'web_app_data': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
  'write_access_allowed': ['business_message', 'channel_post', 'edited_business_message', 'edited_channel_post', 'edited_message', 'guest_message', 'message'],
}

/**
 * Every Telegram update type, for a subscription that must not narrow.
 * Omitting `allowed_updates` is not equivalent: Telegram reuses whatever a
 * previous run configured, and its default excludes chat member and reaction
 * updates entirely.
 */
export const ALL_UPDATE_TYPES: readonly string[] = [
  'business_connection',
  'business_message',
  'edited_business_message',
  'deleted_business_messages',
  'callback_query',
  'channel_post',
  'edited_channel_post',
  'chat_boost',
  'removed_chat_boost',
  'chat_join_request',
  'chat_member',
  'guest_message',
  'inline_query',
  'chosen_inline_result',
  'managed_bot',
  'message',
  'edited_message',
  'message_reaction',
  'message_reaction_count',
  'my_chat_member',
  'poll',
  'poll_answer',
  'pre_checkout_query',
  'purchased_paid_media',
  'shipping_query',
  'subscription',
]
