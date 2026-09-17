// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 229, schemas/tl/api.229.tl

import type * as root_c$ from '../root/c.js'
import type * as root_d$ from '../root/d.js'
import type * as root_g$ from '../root/g.js'
import type * as root_i$ from '../root/i.js'
import type * as root_m$ from '../root/m.js'
import type * as root_n$ from '../root/n.js'
import type * as root_r$ from '../root/r.js'
import type * as root_s$ from '../root/s.js'
import type * as root_t$ from '../root/t.js'
import type * as root_v$ from '../root/v.js'
import type { TlObject } from '../../../../tl/object.js'

/** `page#98657f0d` */
export interface Page {
  readonly _: 'page'
  readonly part?: true
  readonly rtl?: true
  readonly v2?: true
  readonly url: string
  readonly blocks: readonly TypePageBlock[]
  readonly photos: readonly TypePhoto[]
  readonly documents: readonly root_d$.TypeDocument[]
  readonly views?: number
}

/** `pageBlockAnchor#ce0d37b0` */
export interface PageBlockAnchor {
  readonly _: 'pageBlockAnchor'
  readonly name: string
}

/** `pageBlockAudio#804361ea` */
export interface PageBlockAudio {
  readonly _: 'pageBlockAudio'
  readonly audio_id: bigint
  readonly caption: TypePageCaption
}

/** `pageBlockAuthorDate#baafe5e0` */
export interface PageBlockAuthorDate {
  readonly _: 'pageBlockAuthorDate'
  readonly author: root_r$.TypeRichText
  readonly published_date: number
}

/** `pageBlockBlockquote#66d1670b` */
export interface PageBlockBlockquote {
  readonly _: 'pageBlockBlockquote'
  readonly collapsed?: true
  readonly text: root_r$.TypeRichText
  readonly caption: root_r$.TypeRichText
}

/** `pageBlockBlockquoteBlocks#0e6e47c4` */
export interface PageBlockBlockquoteBlocks {
  readonly _: 'pageBlockBlockquoteBlocks'
  readonly blocks: readonly TypePageBlock[]
  readonly caption: root_r$.TypeRichText
}

/** `pageBlockButtonRow#6d640318` */
export interface PageBlockButtonRow {
  readonly _: 'pageBlockButtonRow'
  readonly align_left?: true
  readonly align_center?: true
  readonly align_right?: true
  readonly buttons: readonly TypePageButton[]
}

/** `pageBlockChannel#ef1751b5` */
export interface PageBlockChannel {
  readonly _: 'pageBlockChannel'
  readonly channel: root_c$.TypeChat
}

/** `pageBlockCollage#65a0fa4d` */
export interface PageBlockCollage {
  readonly _: 'pageBlockCollage'
  readonly items: readonly TypePageBlock[]
  readonly caption: TypePageCaption
}

/** `pageBlockCover#39f23300` */
export interface PageBlockCover {
  readonly _: 'pageBlockCover'
  readonly cover: TypePageBlock
}

/** `pageBlockDetails#76768bed` */
export interface PageBlockDetails {
  readonly _: 'pageBlockDetails'
  readonly open?: true
  readonly blocks: readonly TypePageBlock[]
  readonly title: root_r$.TypeRichText
}

/** `pageBlockDivider#db20b188` */
export interface PageBlockDivider {
  readonly _: 'pageBlockDivider'
}

/** `pageBlockDocument#38fa3ba3` */
export interface PageBlockDocument {
  readonly _: 'pageBlockDocument'
  readonly document_id: bigint
  readonly caption: TypePageCaption
}

/** `pageBlockEmbed#a8718dc5` */
export interface PageBlockEmbed {
  readonly _: 'pageBlockEmbed'
  readonly full_width?: true
  readonly allow_scrolling?: true
  readonly url?: string
  readonly html?: string
  readonly poster_photo_id?: bigint
  readonly w?: number
  readonly h?: number
  readonly caption: TypePageCaption
}

/** `pageBlockEmbedPost#f259a80b` */
export interface PageBlockEmbedPost {
  readonly _: 'pageBlockEmbedPost'
  readonly url: string
  readonly webpage_id: bigint
  readonly author_photo_id: bigint
  readonly author: string
  readonly date: number
  readonly blocks: readonly TypePageBlock[]
  readonly caption: TypePageCaption
}

/** `pageBlockFooter#48870999` */
export interface PageBlockFooter {
  readonly _: 'pageBlockFooter'
  readonly text: root_r$.TypeRichText
}

/** `pageBlockHeader#bfd064ec` */
export interface PageBlockHeader {
  readonly _: 'pageBlockHeader'
  readonly text: root_r$.TypeRichText
}

/** `pageBlockHeading1#baff072f` */
export interface PageBlockHeading1 {
  readonly _: 'pageBlockHeading1'
  readonly text: root_r$.TypeRichText
}

/** `pageBlockHeading2#096b2aec` */
export interface PageBlockHeading2 {
  readonly _: 'pageBlockHeading2'
  readonly text: root_r$.TypeRichText
}

/** `pageBlockHeading3#67e731ad` */
export interface PageBlockHeading3 {
  readonly _: 'pageBlockHeading3'
  readonly text: root_r$.TypeRichText
}

/** `pageBlockHeading4#b532772b` */
export interface PageBlockHeading4 {
  readonly _: 'pageBlockHeading4'
  readonly text: root_r$.TypeRichText
}

/** `pageBlockHeading5#dbbe6c6a` */
export interface PageBlockHeading5 {
  readonly _: 'pageBlockHeading5'
  readonly text: root_r$.TypeRichText
}

/** `pageBlockHeading6#682a41a9` */
export interface PageBlockHeading6 {
  readonly _: 'pageBlockHeading6'
  readonly text: root_r$.TypeRichText
}

/** `pageBlockKicker#1e148390` */
export interface PageBlockKicker {
  readonly _: 'pageBlockKicker'
  readonly text: root_r$.TypeRichText
}

/** `pageBlockList#e4e88011` */
export interface PageBlockList {
  readonly _: 'pageBlockList'
  readonly items: readonly TypePageListItem[]
}

/** `pageBlockMap#a44f3ef6` */
export interface PageBlockMap {
  readonly _: 'pageBlockMap'
  readonly geo: root_g$.TypeGeoPoint
  readonly zoom: number
  readonly w: number
  readonly h: number
  readonly caption: TypePageCaption
}

/** `pageBlockMath#59080c20` */
export interface PageBlockMath {
  readonly _: 'pageBlockMath'
  readonly source: string
}

/** `pageBlockOrderedList#1fd6f6c1` */
export interface PageBlockOrderedList {
  readonly _: 'pageBlockOrderedList'
  readonly reversed?: true
  readonly items: readonly TypePageListOrderedItem[]
  readonly start?: number
  readonly type?: string
}

/** `pageBlockParagraph#467a0766` */
export interface PageBlockParagraph {
  readonly _: 'pageBlockParagraph'
  readonly text: root_r$.TypeRichText
}

/** `pageBlockPhoto#1759c560` */
export interface PageBlockPhoto {
  readonly _: 'pageBlockPhoto'
  readonly spoiler?: true
  readonly photo_id: bigint
  readonly caption: TypePageCaption
  readonly url?: string
  readonly webpage_id?: bigint
}

/** `pageBlockPreformatted#c070d93e` */
export interface PageBlockPreformatted {
  readonly _: 'pageBlockPreformatted'
  readonly text: root_r$.TypeRichText
  readonly language: string
}

/** `pageBlockPullquote#4f4456d3` */
export interface PageBlockPullquote {
  readonly _: 'pageBlockPullquote'
  readonly text: root_r$.TypeRichText
  readonly caption: root_r$.TypeRichText
}

/** `pageBlockRelatedArticles#16115a96` */
export interface PageBlockRelatedArticles {
  readonly _: 'pageBlockRelatedArticles'
  readonly title: root_r$.TypeRichText
  readonly articles: readonly TypePageRelatedArticle[]
}

/** `pageBlockSlideshow#031f9590` */
export interface PageBlockSlideshow {
  readonly _: 'pageBlockSlideshow'
  readonly items: readonly TypePageBlock[]
  readonly caption: TypePageCaption
}

/** `pageBlockSubheader#f12bb6e1` */
export interface PageBlockSubheader {
  readonly _: 'pageBlockSubheader'
  readonly text: root_r$.TypeRichText
}

/** `pageBlockSubtitle#8ffa9a1f` */
export interface PageBlockSubtitle {
  readonly _: 'pageBlockSubtitle'
  readonly text: root_r$.TypeRichText
}

/** `pageBlockTable#bf4dea82` */
export interface PageBlockTable {
  readonly _: 'pageBlockTable'
  readonly bordered?: true
  readonly striped?: true
  readonly compact?: true
  readonly title: root_r$.TypeRichText
  readonly rows: readonly TypePageTableRow[]
}

/** `pageBlockThinking#3c29a3e2` */
export interface PageBlockThinking {
  readonly _: 'pageBlockThinking'
  readonly text: root_r$.TypeRichText
}

/** `pageBlockTitle#70abc3fd` */
export interface PageBlockTitle {
  readonly _: 'pageBlockTitle'
  readonly text: root_r$.TypeRichText
}

/** `pageBlockUnsupported#13567e8a` */
export interface PageBlockUnsupported {
  readonly _: 'pageBlockUnsupported'
}

/** `pageBlockVideo#7c8fe7b6` */
export interface PageBlockVideo {
  readonly _: 'pageBlockVideo'
  readonly autoplay?: true
  readonly loop?: true
  readonly spoiler?: true
  readonly video_id: bigint
  readonly caption: TypePageCaption
}

/** `pageButton#692a5488` */
export interface PageButton {
  readonly _: 'pageButton'
  readonly text: root_r$.TypeRichText
  readonly type: root_i$.TypeInlineButtonType
  readonly style?: root_r$.TypeRichButtonStyle
}

/** `pageCaption#6f747657` */
export interface PageCaption {
  readonly _: 'pageCaption'
  readonly text: root_r$.TypeRichText
  readonly credit: root_r$.TypeRichText
}

/** `pageListItemBlocks#63ca67aa` */
export interface PageListItemBlocks {
  readonly _: 'pageListItemBlocks'
  readonly checkbox?: true
  readonly checked?: true
  readonly blocks: readonly TypePageBlock[]
}

/** `pageListItemText#2f58683c` */
export interface PageListItemText {
  readonly _: 'pageListItemText'
  readonly checkbox?: true
  readonly checked?: true
  readonly text: root_r$.TypeRichText
}

/** `pageListOrderedItemBlocks#8ff2d5f0` */
export interface PageListOrderedItemBlocks {
  readonly _: 'pageListOrderedItemBlocks'
  readonly checkbox?: true
  readonly checked?: true
  readonly num?: string
  readonly blocks: readonly TypePageBlock[]
  readonly value?: number
  readonly type?: string
}

/** `pageListOrderedItemText#15031189` */
export interface PageListOrderedItemText {
  readonly _: 'pageListOrderedItemText'
  readonly checkbox?: true
  readonly checked?: true
  readonly num?: string
  readonly text: root_r$.TypeRichText
  readonly value?: number
  readonly type?: string
}

/** `pageRelatedArticle#b390dc08` */
export interface PageRelatedArticle {
  readonly _: 'pageRelatedArticle'
  readonly url: string
  readonly webpage_id: bigint
  readonly title?: string
  readonly description?: string
  readonly photo_id?: bigint
  readonly author?: string
  readonly published_date?: number
}

/** `pageTableCell#34566b6a` */
export interface PageTableCell {
  readonly _: 'pageTableCell'
  readonly header?: true
  readonly align_center?: true
  readonly align_right?: true
  readonly valign_middle?: true
  readonly valign_bottom?: true
  readonly text?: root_r$.TypeRichText
  readonly colspan?: number
  readonly rowspan?: number
}

/** `pageTableRow#e0c0c5e5` */
export interface PageTableRow {
  readonly _: 'pageTableRow'
  readonly cells: readonly TypePageTableCell[]
}

/** `paidReactionPrivacyAnonymous#1f0c1ad9` */
export interface PaidReactionPrivacyAnonymous {
  readonly _: 'paidReactionPrivacyAnonymous'
}

/** `paidReactionPrivacyDefault#206ad49e` */
export interface PaidReactionPrivacyDefault {
  readonly _: 'paidReactionPrivacyDefault'
}

/** `paidReactionPrivacyPeer#dc6cfcf0` */
export interface PaidReactionPrivacyPeer {
  readonly _: 'paidReactionPrivacyPeer'
  readonly peer: root_i$.TypeInputPeer
}

/** `passkey#98613ebf` */
export interface Passkey {
  readonly _: 'passkey'
  readonly id: string
  readonly name: string
  readonly date: number
  readonly software_emoji_id?: bigint
  readonly last_usage_date?: number
}

/** `passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow#3a912d4a` */
export interface PasswordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow {
  readonly _: 'passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow'
  readonly salt1: Uint8Array
  readonly salt2: Uint8Array
  readonly g: number
  readonly p: Uint8Array
}

/** `passwordKdfAlgoUnknown#d45ab096` */
export interface PasswordKdfAlgoUnknown {
  readonly _: 'passwordKdfAlgoUnknown'
}

/** `paymentCharge#ea02c27e` */
export interface PaymentCharge {
  readonly _: 'paymentCharge'
  readonly id: string
  readonly provider_charge_id: string
}

/** `paymentFormMethod#88f8f21b` */
export interface PaymentFormMethod {
  readonly _: 'paymentFormMethod'
  readonly url: string
  readonly title: string
}

/** `paymentRequestedInfo#909c3f94` */
export interface PaymentRequestedInfo {
  readonly _: 'paymentRequestedInfo'
  readonly name?: string
  readonly phone?: string
  readonly email?: string
  readonly shipping_address?: TypePostAddress
}

/** `paymentSavedCredentialsCard#cdc27a1f` */
export interface PaymentSavedCredentialsCard {
  readonly _: 'paymentSavedCredentialsCard'
  readonly id: string
  readonly title: string
}

/** `peerBlocked#e8fd8014` */
export interface PeerBlocked {
  readonly _: 'peerBlocked'
  readonly peer_id: TypePeer
  readonly date: number
}

/** `peerChannel#a2a5371e` */
export interface PeerChannel {
  readonly _: 'peerChannel'
  readonly channel_id: bigint
}

/** `peerChat#36c6019a` */
export interface PeerChat {
  readonly _: 'peerChat'
  readonly chat_id: bigint
}

/** `peerColor#b54b5acf` */
export interface PeerColor {
  readonly _: 'peerColor'
  readonly color?: number
  readonly background_emoji_id?: bigint
}

/** `peerColorCollectible#b9c0639a` */
export interface PeerColorCollectible {
  readonly _: 'peerColorCollectible'
  readonly collectible_id: bigint
  readonly gift_emoji_id: bigint
  readonly background_emoji_id: bigint
  readonly accent_color: number
  readonly colors: readonly number[]
  readonly dark_accent_color?: number
  readonly dark_colors?: readonly number[]
}

/** `peerLocated#ca461b5d` */
export interface PeerLocated {
  readonly _: 'peerLocated'
  readonly peer: TypePeer
  readonly expires: number
  readonly distance: number
}

/** `peerNotifySettings#99622c0c` */
export interface PeerNotifySettings {
  readonly _: 'peerNotifySettings'
  readonly show_previews?: boolean
  readonly silent?: boolean
  readonly mute_until?: number
  readonly ios_sound?: root_n$.TypeNotificationSound
  readonly android_sound?: root_n$.TypeNotificationSound
  readonly other_sound?: root_n$.TypeNotificationSound
  readonly stories_muted?: boolean
  readonly stories_hide_sender?: boolean
  readonly stories_ios_sound?: root_n$.TypeNotificationSound
  readonly stories_android_sound?: root_n$.TypeNotificationSound
  readonly stories_other_sound?: root_n$.TypeNotificationSound
}

/** `peerSelfLocated#f8ec284b` */
export interface PeerSelfLocated {
  readonly _: 'peerSelfLocated'
  readonly expires: number
}

/** `peerSettings#f47741f7` */
export interface PeerSettings {
  readonly _: 'peerSettings'
  readonly report_spam?: true
  readonly add_contact?: true
  readonly block_contact?: true
  readonly share_contact?: true
  readonly need_contacts_exception?: true
  readonly report_geo?: true
  readonly autoarchived?: true
  readonly invite_members?: true
  readonly request_chat_broadcast?: true
  readonly business_bot_paused?: true
  readonly business_bot_can_reply?: true
  readonly geo_distance?: number
  readonly request_chat_title?: string
  readonly request_chat_date?: number
  readonly business_bot_id?: bigint
  readonly business_bot_manage_url?: string
  readonly charge_paid_message_stars?: bigint
  readonly registration_month?: string
  readonly phone_country?: string
  readonly name_change_date?: number
  readonly photo_change_date?: number
}

/** `peerStories#9a35e999` */
export interface PeerStories {
  readonly _: 'peerStories'
  readonly peer: TypePeer
  readonly max_read_id?: number
  readonly stories: readonly root_s$.TypeStoryItem[]
}

/** `peerUser#59511722` */
export interface PeerUser {
  readonly _: 'peerUser'
  readonly user_id: bigint
}

/** `pendingSuggestion#e7e82e12` */
export interface PendingSuggestion {
  readonly _: 'pendingSuggestion'
  readonly suggestion: string
  readonly title: root_t$.TypeTextWithEntities
  readonly description: root_t$.TypeTextWithEntities
  readonly url: string
}

/** `phoneCall#30535af5` */
export interface PhoneCall {
  readonly _: 'phoneCall'
  readonly p2p_allowed?: true
  readonly video?: true
  readonly conference_supported?: true
  readonly id: bigint
  readonly access_hash: bigint
  readonly date: number
  readonly admin_id: bigint
  readonly participant_id: bigint
  readonly g_a_or_b: Uint8Array
  readonly key_fingerprint: bigint
  readonly protocol: TypePhoneCallProtocol
  readonly connections: readonly TypePhoneConnection[]
  readonly start_date: number
  readonly custom_parameters?: root_d$.TypeDataJSON
}

/** `phoneCallAccepted#3660c311` */
export interface PhoneCallAccepted {
  readonly _: 'phoneCallAccepted'
  readonly video?: true
  readonly id: bigint
  readonly access_hash: bigint
  readonly date: number
  readonly admin_id: bigint
  readonly participant_id: bigint
  readonly g_b: Uint8Array
  readonly protocol: TypePhoneCallProtocol
}

/** `phoneCallDiscardReasonBusy#faf7e8c9` */
export interface PhoneCallDiscardReasonBusy {
  readonly _: 'phoneCallDiscardReasonBusy'
}

/** `phoneCallDiscardReasonDisconnect#e095c1a0` */
export interface PhoneCallDiscardReasonDisconnect {
  readonly _: 'phoneCallDiscardReasonDisconnect'
}

/** `phoneCallDiscardReasonHangup#57adc690` */
export interface PhoneCallDiscardReasonHangup {
  readonly _: 'phoneCallDiscardReasonHangup'
}

/** `phoneCallDiscardReasonMigrateConferenceCall#9fbbf1f7` */
export interface PhoneCallDiscardReasonMigrateConferenceCall {
  readonly _: 'phoneCallDiscardReasonMigrateConferenceCall'
  readonly slug: string
}

/** `phoneCallDiscardReasonMissed#85e42301` */
export interface PhoneCallDiscardReasonMissed {
  readonly _: 'phoneCallDiscardReasonMissed'
}

/** `phoneCallDiscarded#50ca4de1` */
export interface PhoneCallDiscarded {
  readonly _: 'phoneCallDiscarded'
  readonly need_rating?: true
  readonly need_debug?: true
  readonly video?: true
  readonly id: bigint
  readonly reason?: TypePhoneCallDiscardReason
  readonly duration?: number
}

/** `phoneCallEmpty#5366c915` */
export interface PhoneCallEmpty {
  readonly _: 'phoneCallEmpty'
  readonly id: bigint
}

/** `phoneCallProtocol#fc878fc8` */
export interface PhoneCallProtocol {
  readonly _: 'phoneCallProtocol'
  readonly udp_p2p?: true
  readonly udp_reflector?: true
  readonly min_layer: number
  readonly max_layer: number
  readonly library_versions: readonly string[]
}

/** `phoneCallRequested#14b0ed0c` */
export interface PhoneCallRequested {
  readonly _: 'phoneCallRequested'
  readonly video?: true
  readonly id: bigint
  readonly access_hash: bigint
  readonly date: number
  readonly admin_id: bigint
  readonly participant_id: bigint
  readonly g_a_hash: Uint8Array
  readonly protocol: TypePhoneCallProtocol
}

/** `phoneCallWaiting#c5226f17` */
export interface PhoneCallWaiting {
  readonly _: 'phoneCallWaiting'
  readonly video?: true
  readonly id: bigint
  readonly access_hash: bigint
  readonly date: number
  readonly admin_id: bigint
  readonly participant_id: bigint
  readonly protocol: TypePhoneCallProtocol
  readonly receive_date?: number
}

/** `phoneConnection#9cc123c7` */
export interface PhoneConnection {
  readonly _: 'phoneConnection'
  readonly tcp?: true
  readonly id: bigint
  readonly ip: string
  readonly ipv6: string
  readonly port: number
  readonly peer_tag: Uint8Array
}

/** `phoneConnectionWebrtc#635fe375` */
export interface PhoneConnectionWebrtc {
  readonly _: 'phoneConnectionWebrtc'
  readonly turn?: true
  readonly stun?: true
  readonly id: bigint
  readonly ip: string
  readonly ipv6: string
  readonly port: number
  readonly username: string
  readonly password: string
}

/** `photo#fb197a65` */
export interface Photo {
  readonly _: 'photo'
  readonly has_stickers?: true
  readonly id: bigint
  readonly access_hash: bigint
  readonly file_reference: Uint8Array
  readonly date: number
  readonly sizes: readonly TypePhotoSize[]
  readonly video_sizes?: readonly root_v$.TypeVideoSize[]
  readonly dc_id: number
}

/** `photoCachedSize#021e1ad6` */
export interface PhotoCachedSize {
  readonly _: 'photoCachedSize'
  readonly type: string
  readonly w: number
  readonly h: number
  readonly bytes: Uint8Array
}

/** `photoEmpty#2331b22d` */
export interface PhotoEmpty {
  readonly _: 'photoEmpty'
  readonly id: bigint
}

/** `photoPathSize#d8214d41` */
export interface PhotoPathSize {
  readonly _: 'photoPathSize'
  readonly type: string
  readonly bytes: Uint8Array
}

/** `photoSize#75c78e60` */
export interface PhotoSize {
  readonly _: 'photoSize'
  readonly type: string
  readonly w: number
  readonly h: number
  readonly size: number
}

/** `photoSizeEmpty#0e17e23c` */
export interface PhotoSizeEmpty {
  readonly _: 'photoSizeEmpty'
  readonly type: string
}

/** `photoSizeProgressive#fa3efb95` */
export interface PhotoSizeProgressive {
  readonly _: 'photoSizeProgressive'
  readonly type: string
  readonly w: number
  readonly h: number
  readonly sizes: readonly number[]
}

/** `photoStrippedSize#e0b0bc2e` */
export interface PhotoStrippedSize {
  readonly _: 'photoStrippedSize'
  readonly type: string
  readonly bytes: Uint8Array
}

/** `poll#966e2dbf` */
export interface Poll {
  readonly _: 'poll'
  readonly id: bigint
  readonly closed?: true
  readonly public_voters?: true
  readonly multiple_choice?: true
  readonly quiz?: true
  readonly open_answers?: true
  readonly revoting_disabled?: true
  readonly shuffle_answers?: true
  readonly hide_results_until_close?: true
  readonly creator?: true
  readonly subscribers_only?: true
  readonly question: root_t$.TypeTextWithEntities
  readonly answers: readonly TypePollAnswer[]
  readonly close_period?: number
  readonly close_date?: number
  readonly countries_iso2?: readonly string[]
  readonly hash: bigint
}

/** `pollAnswer#4b7d786a` */
export interface PollAnswer {
  readonly _: 'pollAnswer'
  readonly text: root_t$.TypeTextWithEntities
  readonly option: Uint8Array
  readonly media?: root_m$.TypeMessageMedia
  readonly added_by?: TypePeer
  readonly date?: number
}

/** `pollAnswerVoters#3645230a` */
export interface PollAnswerVoters {
  readonly _: 'pollAnswerVoters'
  readonly chosen?: true
  readonly correct?: true
  readonly option: Uint8Array
  readonly voters?: number
  readonly recent_voters?: readonly TypePeer[]
}

/** `pollResults#ba7bb15e` */
export interface PollResults {
  readonly _: 'pollResults'
  readonly min?: true
  readonly has_unread_votes?: true
  readonly can_view_stats?: true
  readonly results?: readonly TypePollAnswerVoters[]
  readonly total_voters?: number
  readonly recent_voters?: readonly TypePeer[]
  readonly solution?: string
  readonly solution_entities?: readonly root_m$.TypeMessageEntity[]
  readonly solution_media?: root_m$.TypeMessageMedia
}

/** `popularContact#5ce14175` */
export interface PopularContact {
  readonly _: 'popularContact'
  readonly client_id: bigint
  readonly importers: number
}

/** `postAddress#1e8caaeb` */
export interface PostAddress {
  readonly _: 'postAddress'
  readonly street_line1: string
  readonly street_line2: string
  readonly city: string
  readonly state: string
  readonly country_iso2: string
  readonly post_code: string
}

/** `postInteractionCountersMessage#e7058e7f` */
export interface PostInteractionCountersMessage {
  readonly _: 'postInteractionCountersMessage'
  readonly msg_id: number
  readonly views: number
  readonly forwards: number
  readonly reactions: number
}

/** `postInteractionCountersStory#8a480e27` */
export interface PostInteractionCountersStory {
  readonly _: 'postInteractionCountersStory'
  readonly story_id: number
  readonly views: number
  readonly forwards: number
  readonly reactions: number
}

/** `premiumGiftCodeOption#257e962b` */
export interface PremiumGiftCodeOption {
  readonly _: 'premiumGiftCodeOption'
  readonly users: number
  readonly months: number
  readonly store_product?: string
  readonly store_quantity?: number
  readonly currency: string
  readonly amount: bigint
}

/** `premiumSubscriptionOption#5f2d1df2` */
export interface PremiumSubscriptionOption {
  readonly _: 'premiumSubscriptionOption'
  readonly current?: true
  readonly can_purchase_upgrade?: true
  readonly transaction?: string
  readonly months: number
  readonly currency: string
  readonly amount: bigint
  readonly bot_url: string
  readonly store_product?: string
}

/** `prepaidGiveaway#b2539d54` */
export interface PrepaidGiveaway {
  readonly _: 'prepaidGiveaway'
  readonly id: bigint
  readonly months: number
  readonly quantity: number
  readonly date: number
}

/** `prepaidStarsGiveaway#9a9d77e0` */
export interface PrepaidStarsGiveaway {
  readonly _: 'prepaidStarsGiveaway'
  readonly id: bigint
  readonly stars: bigint
  readonly quantity: number
  readonly boosts: number
  readonly date: number
}

/** `privacyKeyAbout#a486b761` */
export interface PrivacyKeyAbout {
  readonly _: 'privacyKeyAbout'
}

/** `privacyKeyAddedByPhone#42ffd42b` */
export interface PrivacyKeyAddedByPhone {
  readonly _: 'privacyKeyAddedByPhone'
}

/** `privacyKeyBirthday#2000a518` */
export interface PrivacyKeyBirthday {
  readonly _: 'privacyKeyBirthday'
}

/** `privacyKeyChatInvite#500e6dfa` */
export interface PrivacyKeyChatInvite {
  readonly _: 'privacyKeyChatInvite'
}

/** `privacyKeyForwards#69ec56a3` */
export interface PrivacyKeyForwards {
  readonly _: 'privacyKeyForwards'
}

/** `privacyKeyNoPaidMessages#17d348d2` */
export interface PrivacyKeyNoPaidMessages {
  readonly _: 'privacyKeyNoPaidMessages'
}

/** `privacyKeyPhoneCall#3d662b7b` */
export interface PrivacyKeyPhoneCall {
  readonly _: 'privacyKeyPhoneCall'
}

/** `privacyKeyPhoneNumber#d19ae46d` */
export interface PrivacyKeyPhoneNumber {
  readonly _: 'privacyKeyPhoneNumber'
}

/** `privacyKeyPhoneP2P#39491cc8` */
export interface PrivacyKeyPhoneP2P {
  readonly _: 'privacyKeyPhoneP2P'
}

/** `privacyKeyProfilePhoto#96151fed` */
export interface PrivacyKeyProfilePhoto {
  readonly _: 'privacyKeyProfilePhoto'
}

/** `privacyKeySavedMusic#ff7a571b` */
export interface PrivacyKeySavedMusic {
  readonly _: 'privacyKeySavedMusic'
}

/** `privacyKeyStarGiftsAutoSave#2ca4fdf8` */
export interface PrivacyKeyStarGiftsAutoSave {
  readonly _: 'privacyKeyStarGiftsAutoSave'
}

/** `privacyKeyStatusTimestamp#bc2eab30` */
export interface PrivacyKeyStatusTimestamp {
  readonly _: 'privacyKeyStatusTimestamp'
}

/** `privacyKeyVoiceMessages#0697f414` */
export interface PrivacyKeyVoiceMessages {
  readonly _: 'privacyKeyVoiceMessages'
}

/** `privacyValueAllowAll#65427b82` */
export interface PrivacyValueAllowAll {
  readonly _: 'privacyValueAllowAll'
}

/** `privacyValueAllowBots#21461b5d` */
export interface PrivacyValueAllowBots {
  readonly _: 'privacyValueAllowBots'
}

/** `privacyValueAllowChatParticipants#6b134e8e` */
export interface PrivacyValueAllowChatParticipants {
  readonly _: 'privacyValueAllowChatParticipants'
  readonly chats: readonly bigint[]
}

/** `privacyValueAllowCloseFriends#f7e8d89b` */
export interface PrivacyValueAllowCloseFriends {
  readonly _: 'privacyValueAllowCloseFriends'
}

/** `privacyValueAllowContacts#fffe1bac` */
export interface PrivacyValueAllowContacts {
  readonly _: 'privacyValueAllowContacts'
}

/** `privacyValueAllowPremium#ece9814b` */
export interface PrivacyValueAllowPremium {
  readonly _: 'privacyValueAllowPremium'
}

/** `privacyValueAllowUsers#b8905fb2` */
export interface PrivacyValueAllowUsers {
  readonly _: 'privacyValueAllowUsers'
  readonly users: readonly bigint[]
}

/** `privacyValueDisallowAll#8b73e763` */
export interface PrivacyValueDisallowAll {
  readonly _: 'privacyValueDisallowAll'
}

/** `privacyValueDisallowBots#f6a5f82f` */
export interface PrivacyValueDisallowBots {
  readonly _: 'privacyValueDisallowBots'
}

/** `privacyValueDisallowChatParticipants#41c87565` */
export interface PrivacyValueDisallowChatParticipants {
  readonly _: 'privacyValueDisallowChatParticipants'
  readonly chats: readonly bigint[]
}

/** `privacyValueDisallowContacts#f888fa1a` */
export interface PrivacyValueDisallowContacts {
  readonly _: 'privacyValueDisallowContacts'
}

/** `privacyValueDisallowUsers#e4621141` */
export interface PrivacyValueDisallowUsers {
  readonly _: 'privacyValueDisallowUsers'
  readonly users: readonly bigint[]
}

/** `profileTabFiles#ab339c00` */
export interface ProfileTabFiles {
  readonly _: 'profileTabFiles'
}

/** `profileTabGifs#a2c0f695` */
export interface ProfileTabGifs {
  readonly _: 'profileTabGifs'
}

/** `profileTabGifts#4d4bd46a` */
export interface ProfileTabGifts {
  readonly _: 'profileTabGifts'
}

/** `profileTabLinks#d3656499` */
export interface ProfileTabLinks {
  readonly _: 'profileTabLinks'
}

/** `profileTabMedia#72c64955` */
export interface ProfileTabMedia {
  readonly _: 'profileTabMedia'
}

/** `profileTabMusic#9f27d26e` */
export interface ProfileTabMusic {
  readonly _: 'profileTabMusic'
}

/** `profileTabPosts#b98cd696` */
export interface ProfileTabPosts {
  readonly _: 'profileTabPosts'
}

/** `profileTabVoice#e477092e` */
export interface ProfileTabVoice {
  readonly _: 'profileTabVoice'
}

/** `publicForwardMessage#01f2bf4a` */
export interface PublicForwardMessage {
  readonly _: 'publicForwardMessage'
  readonly message: root_m$.TypeMessage
}

/** `publicForwardStory#edf3add0` */
export interface PublicForwardStory {
  readonly _: 'publicForwardStory'
  readonly peer: TypePeer
  readonly story: root_s$.TypeStoryItem
}

/** Any `Page`. */
export type TypePage =
  | Page

/** Any `PageBlock`. */
export type TypePageBlock =
  | root_i$.InputPageBlockMap
  | PageBlockAnchor
  | PageBlockAudio
  | PageBlockAuthorDate
  | PageBlockBlockquote
  | PageBlockBlockquoteBlocks
  | PageBlockButtonRow
  | PageBlockChannel
  | PageBlockCollage
  | PageBlockCover
  | PageBlockDetails
  | PageBlockDivider
  | PageBlockDocument
  | PageBlockEmbed
  | PageBlockEmbedPost
  | PageBlockFooter
  | PageBlockHeader
  | PageBlockHeading1
  | PageBlockHeading2
  | PageBlockHeading3
  | PageBlockHeading4
  | PageBlockHeading5
  | PageBlockHeading6
  | PageBlockKicker
  | PageBlockList
  | PageBlockMap
  | PageBlockMath
  | PageBlockOrderedList
  | PageBlockParagraph
  | PageBlockPhoto
  | PageBlockPreformatted
  | PageBlockPullquote
  | PageBlockRelatedArticles
  | PageBlockSlideshow
  | PageBlockSubheader
  | PageBlockSubtitle
  | PageBlockTable
  | PageBlockThinking
  | PageBlockTitle
  | PageBlockUnsupported
  | PageBlockVideo

/** Any `PageButton`. */
export type TypePageButton =
  | PageButton

/** Any `PageCaption`. */
export type TypePageCaption =
  | PageCaption

/** Any `PageListItem`. */
export type TypePageListItem =
  | PageListItemBlocks
  | PageListItemText

/** Any `PageListOrderedItem`. */
export type TypePageListOrderedItem =
  | PageListOrderedItemBlocks
  | PageListOrderedItemText

/** Any `PageRelatedArticle`. */
export type TypePageRelatedArticle =
  | PageRelatedArticle

/** Any `PageTableCell`. */
export type TypePageTableCell =
  | PageTableCell

/** Any `PageTableRow`. */
export type TypePageTableRow =
  | PageTableRow

/** Any `PaidReactionPrivacy`. */
export type TypePaidReactionPrivacy =
  | PaidReactionPrivacyAnonymous
  | PaidReactionPrivacyDefault
  | PaidReactionPrivacyPeer

/** Any `Passkey`. */
export type TypePasskey =
  | Passkey

/** Any `PasswordKdfAlgo`. */
export type TypePasswordKdfAlgo =
  | PasswordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow
  | PasswordKdfAlgoUnknown

/** Any `PaymentCharge`. */
export type TypePaymentCharge =
  | PaymentCharge

/** Any `PaymentFormMethod`. */
export type TypePaymentFormMethod =
  | PaymentFormMethod

/** Any `PaymentRequestedInfo`. */
export type TypePaymentRequestedInfo =
  | PaymentRequestedInfo

/** Any `PaymentSavedCredentials`. */
export type TypePaymentSavedCredentials =
  | PaymentSavedCredentialsCard

/** Any `Peer`. */
export type TypePeer =
  | PeerChannel
  | PeerChat
  | PeerUser

/** Any `PeerBlocked`. */
export type TypePeerBlocked =
  | PeerBlocked

/** Any `PeerColor`. */
export type TypePeerColor =
  | root_i$.InputPeerColorCollectible
  | PeerColor
  | PeerColorCollectible

/** Any `PeerLocated`. */
export type TypePeerLocated =
  | PeerLocated
  | PeerSelfLocated

/** Any `PeerNotifySettings`. */
export type TypePeerNotifySettings =
  | PeerNotifySettings

/** Any `PeerSettings`. */
export type TypePeerSettings =
  | PeerSettings

/** Any `PeerStories`. */
export type TypePeerStories =
  | PeerStories

/** Any `PendingSuggestion`. */
export type TypePendingSuggestion =
  | PendingSuggestion

/** Any `PhoneCall`. */
export type TypePhoneCall =
  | PhoneCall
  | PhoneCallAccepted
  | PhoneCallDiscarded
  | PhoneCallEmpty
  | PhoneCallRequested
  | PhoneCallWaiting

/** Any `PhoneCallDiscardReason`. */
export type TypePhoneCallDiscardReason =
  | PhoneCallDiscardReasonBusy
  | PhoneCallDiscardReasonDisconnect
  | PhoneCallDiscardReasonHangup
  | PhoneCallDiscardReasonMigrateConferenceCall
  | PhoneCallDiscardReasonMissed

/** Any `PhoneCallProtocol`. */
export type TypePhoneCallProtocol =
  | PhoneCallProtocol

/** Any `PhoneConnection`. */
export type TypePhoneConnection =
  | PhoneConnection
  | PhoneConnectionWebrtc

/** Any `Photo`. */
export type TypePhoto =
  | Photo
  | PhotoEmpty

/** Any `PhotoSize`. */
export type TypePhotoSize =
  | PhotoCachedSize
  | PhotoPathSize
  | PhotoSize
  | PhotoSizeEmpty
  | PhotoSizeProgressive
  | PhotoStrippedSize

/** Any `Poll`. */
export type TypePoll =
  | Poll

/** Any `PollAnswer`. */
export type TypePollAnswer =
  | root_i$.InputPollAnswer
  | PollAnswer

/** Any `PollAnswerVoters`. */
export type TypePollAnswerVoters =
  | PollAnswerVoters

/** Any `PollResults`. */
export type TypePollResults =
  | PollResults

/** Any `PopularContact`. */
export type TypePopularContact =
  | PopularContact

/** Any `PostAddress`. */
export type TypePostAddress =
  | PostAddress

/** Any `PostInteractionCounters`. */
export type TypePostInteractionCounters =
  | PostInteractionCountersMessage
  | PostInteractionCountersStory

/** Any `PremiumGiftCodeOption`. */
export type TypePremiumGiftCodeOption =
  | PremiumGiftCodeOption

/** Any `PremiumSubscriptionOption`. */
export type TypePremiumSubscriptionOption =
  | PremiumSubscriptionOption

/** Any `PrepaidGiveaway`. */
export type TypePrepaidGiveaway =
  | PrepaidGiveaway
  | PrepaidStarsGiveaway

/** Any `PrivacyKey`. */
export type TypePrivacyKey =
  | PrivacyKeyAbout
  | PrivacyKeyAddedByPhone
  | PrivacyKeyBirthday
  | PrivacyKeyChatInvite
  | PrivacyKeyForwards
  | PrivacyKeyNoPaidMessages
  | PrivacyKeyPhoneCall
  | PrivacyKeyPhoneNumber
  | PrivacyKeyPhoneP2P
  | PrivacyKeyProfilePhoto
  | PrivacyKeySavedMusic
  | PrivacyKeyStarGiftsAutoSave
  | PrivacyKeyStatusTimestamp
  | PrivacyKeyVoiceMessages

/** Any `PrivacyRule`. */
export type TypePrivacyRule =
  | PrivacyValueAllowAll
  | PrivacyValueAllowBots
  | PrivacyValueAllowChatParticipants
  | PrivacyValueAllowCloseFriends
  | PrivacyValueAllowContacts
  | PrivacyValueAllowPremium
  | PrivacyValueAllowUsers
  | PrivacyValueDisallowAll
  | PrivacyValueDisallowBots
  | PrivacyValueDisallowChatParticipants
  | PrivacyValueDisallowContacts
  | PrivacyValueDisallowUsers

/** Any `ProfileTab`. */
export type TypeProfileTab =
  | ProfileTabFiles
  | ProfileTabGifs
  | ProfileTabGifts
  | ProfileTabLinks
  | ProfileTabMedia
  | ProfileTabMusic
  | ProfileTabPosts
  | ProfileTabVoice

/** Any `PublicForward`. */
export type TypePublicForward =
  | PublicForwardMessage
  | PublicForwardStory
