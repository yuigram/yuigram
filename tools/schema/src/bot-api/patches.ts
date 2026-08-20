/**
 * Deliberate deviations from the documentation.
 *
 * Every entry here records something the generator cannot derive, with the
 * reason it cannot. Keeping them in one reviewed file — rather than as special
 * cases scattered through the parser — makes each divergence explicit and
 * attributable, and makes it obvious when one becomes obsolete.
 */

/**
 * Service-message fields the description rule does not catch.
 *
 * Telegram marks service messages by opening the description with "Service
 * message:", which covers 45 fields on `Message`. These predate that
 * convention and are described in prose instead, so they have to be listed.
 *
 * New service messages follow the convention and are detected automatically;
 * this list should shrink over time rather than grow.
 */
export const LEGACY_SERVICE_FIELDS: ReadonlyMap<string, string> = new Map([
  ['new_chat_members', 'predates the "Service message:" convention'],
  ['left_chat_member', 'predates the "Service message:" convention'],
  ['new_chat_title', 'predates the "Service message:" convention'],
  ['new_chat_photo', 'predates the "Service message:" convention'],
  ['pinned_message', 'predates the "Service message:" convention'],
  ['migrate_to_chat_id', 'predates the "Service message:" convention'],
  ['migrate_from_chat_id', 'predates the "Service message:" convention'],
  ['passport_data', 'described as data rather than as a service message'],
  ['connected_website', 'described as a domain name rather than as a service message'],
])

/**
 * Event names that differ from the field that carries them.
 *
 * Yuigram groups related events under a common prefix so they sort and
 * autocomplete together — `chat_member_joined` beside `chat_member_left`,
 * rather than `new_chat_members` beside `left_chat_member`. The field name is
 * kept where it already reads well.
 *
 * See docs/events.md §2 for the naming rules.
 */
export const EVENT_NAME_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ['new_chat_members', 'chat_member_joined'],
  ['left_chat_member', 'chat_member_left'],
  ['new_chat_title', 'chat_title_changed'],
  ['new_chat_photo', 'chat_photo_changed'],
  ['delete_chat_photo', 'chat_photo_deleted'],
  ['group_chat_created', 'chat_created'],
  ['supergroup_chat_created', 'supergroup_created'],
  ['channel_chat_created', 'channel_created'],
  ['migrate_to_chat_id', 'chat_migrated_to'],
  ['migrate_from_chat_id', 'chat_migrated_from'],
  ['pinned_message', 'message_pinned'],
  ['successful_payment', 'payment_successful'],
  ['message_auto_delete_timer_changed', 'auto_delete_timer_changed'],
  ['proximity_alert_triggered', 'proximity_alert'],
])

/**
 * Top-level `Update` fields renamed for the event taxonomy.
 *
 * Telegram scatters the message family — `message`, `edited_message`,
 * `channel_post`. Subject-first naming groups them, so a developer scanning
 * autocomplete sees the whole family at once.
 */
export const UPDATE_NAME_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ['edited_message', 'message_edited'],
  ['edited_channel_post', 'channel_post_edited'],
  ['edited_business_message', 'business_message_edited'],
  ['deleted_business_messages', 'business_messages_deleted'],
  ['chosen_inline_result', 'inline_result_chosen'],
  ['removed_chat_boost', 'chat_boost_removed'],
])

/**
 * Fields documented as always present that are absent in practice.
 *
 * Trusting the documentation here produces types that claim a value can never
 * be undefined, which then throws at runtime on a shape Telegram genuinely
 * sends. Empty for now; entries are added when a real payload disproves the
 * documentation.
 */
export const OPTIONALITY_OVERRIDES: ReadonlyMap<string, string> = new Map<string, string>()
