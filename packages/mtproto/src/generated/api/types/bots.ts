// GENERATED FILE — do not edit.
// TL types for bots
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as root_b$ from './root/b.js'
import type * as root_c$ from './root/c.js'
import type * as root_d$ from './root/d.js'
import type * as root_e$ from './root/e.js'
import type * as root_i$ from './root/i.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

/** `bots.addPreviewMedia#17aeb75a` */
export interface AddPreviewMedia {
  readonly _: 'bots.addPreviewMedia'
  readonly bot: root_i$.TypeInputUser
  readonly lang_code: string
  readonly media: root_i$.TypeInputMedia
}

/** `bots.allowSendMessage#f132e3ef` */
export interface AllowSendMessage {
  readonly _: 'bots.allowSendMessage'
  readonly bot: root_i$.TypeInputUser
}

/** `bots.answerWebhookJSONQuery#e6213f4d` */
export interface AnswerWebhookJSONQuery {
  readonly _: 'bots.answerWebhookJSONQuery'
  readonly query_id: bigint
  readonly data: root_d$.TypeDataJSON
}

/** `bots.botInfo#e8a775b0` */
export interface BotInfo {
  readonly _: 'bots.botInfo'
  readonly name: string
  readonly about: string
  readonly description: string
}

/** `bots.canSendMessage#1359f4e6` */
export interface CanSendMessage {
  readonly _: 'bots.canSendMessage'
  readonly bot: root_i$.TypeInputUser
}

/** `bots.checkDownloadFileParams#50077589` */
export interface CheckDownloadFileParams {
  readonly _: 'bots.checkDownloadFileParams'
  readonly bot: root_i$.TypeInputUser
  readonly file_name: string
  readonly url: string
}

/** `bots.deletePreviewMedia#2d0135b3` */
export interface DeletePreviewMedia {
  readonly _: 'bots.deletePreviewMedia'
  readonly bot: root_i$.TypeInputUser
  readonly lang_code: string
  readonly media: readonly root_i$.TypeInputMedia[]
}

/** `bots.editPreviewMedia#8525606f` */
export interface EditPreviewMedia {
  readonly _: 'bots.editPreviewMedia'
  readonly bot: root_i$.TypeInputUser
  readonly lang_code: string
  readonly media: root_i$.TypeInputMedia
  readonly new_media: root_i$.TypeInputMedia
}

/** `bots.getAdminedBots#b0711d83` */
export interface GetAdminedBots {
  readonly _: 'bots.getAdminedBots'
}

/** `bots.getBotCommands#e34c0dd6` */
export interface GetBotCommands {
  readonly _: 'bots.getBotCommands'
  readonly scope: root_b$.TypeBotCommandScope
  readonly lang_code: string
}

/** `bots.getBotInfo#dcd914fd` */
export interface GetBotInfo {
  readonly _: 'bots.getBotInfo'
  readonly bot?: root_i$.TypeInputUser
  readonly lang_code: string
}

/** `bots.getBotMenuButton#9c60eb28` */
export interface GetBotMenuButton {
  readonly _: 'bots.getBotMenuButton'
  readonly user_id: root_i$.TypeInputUser
}

/** `bots.getBotRecommendations#a1b70815` */
export interface GetBotRecommendations {
  readonly _: 'bots.getBotRecommendations'
  readonly bot: root_i$.TypeInputUser
}

/** `bots.getPopularAppBots#c2510192` */
export interface GetPopularAppBots {
  readonly _: 'bots.getPopularAppBots'
  readonly offset: string
  readonly limit: number
}

/** `bots.getPreviewInfo#423ab3ad` */
export interface GetPreviewInfo {
  readonly _: 'bots.getPreviewInfo'
  readonly bot: root_i$.TypeInputUser
  readonly lang_code: string
}

/** `bots.getPreviewMedias#a2a5594d` */
export interface GetPreviewMedias {
  readonly _: 'bots.getPreviewMedias'
  readonly bot: root_i$.TypeInputUser
}

/** `bots.invokeWebViewCustomMethod#087fc5e7` */
export interface InvokeWebViewCustomMethod {
  readonly _: 'bots.invokeWebViewCustomMethod'
  readonly bot: root_i$.TypeInputUser
  readonly custom_method: string
  readonly params: root_d$.TypeDataJSON
}

/** `bots.popularAppBots#1991b13b` */
export interface PopularAppBots {
  readonly _: 'bots.popularAppBots'
  readonly next_offset?: string
  readonly users: readonly root_u$.TypeUser[]
}

/** `bots.previewInfo#0ca71d64` */
export interface PreviewInfo {
  readonly _: 'bots.previewInfo'
  readonly media: readonly root_b$.TypeBotPreviewMedia[]
  readonly lang_codes: readonly string[]
}

/** `bots.reorderPreviewMedias#b627f3aa` */
export interface ReorderPreviewMedias {
  readonly _: 'bots.reorderPreviewMedias'
  readonly bot: root_i$.TypeInputUser
  readonly lang_code: string
  readonly order: readonly root_i$.TypeInputMedia[]
}

/** `bots.reorderUsernames#9709b1c2` */
export interface ReorderUsernames {
  readonly _: 'bots.reorderUsernames'
  readonly bot: root_i$.TypeInputUser
  readonly order: readonly string[]
}

/** `bots.resetBotCommands#3d8de0f9` */
export interface ResetBotCommands {
  readonly _: 'bots.resetBotCommands'
  readonly scope: root_b$.TypeBotCommandScope
  readonly lang_code: string
}

/** `bots.sendCustomRequest#aa2769ed` */
export interface SendCustomRequest {
  readonly _: 'bots.sendCustomRequest'
  readonly custom_method: string
  readonly params: root_d$.TypeDataJSON
}

/** `bots.setBotBroadcastDefaultAdminRights#788464e1` */
export interface SetBotBroadcastDefaultAdminRights {
  readonly _: 'bots.setBotBroadcastDefaultAdminRights'
  readonly admin_rights: root_c$.TypeChatAdminRights
}

/** `bots.setBotCommands#0517165a` */
export interface SetBotCommands {
  readonly _: 'bots.setBotCommands'
  readonly scope: root_b$.TypeBotCommandScope
  readonly lang_code: string
  readonly commands: readonly root_b$.TypeBotCommand[]
}

/** `bots.setBotGroupDefaultAdminRights#925ec9ea` */
export interface SetBotGroupDefaultAdminRights {
  readonly _: 'bots.setBotGroupDefaultAdminRights'
  readonly admin_rights: root_c$.TypeChatAdminRights
}

/** `bots.setBotInfo#10cf3123` */
export interface SetBotInfo {
  readonly _: 'bots.setBotInfo'
  readonly bot?: root_i$.TypeInputUser
  readonly lang_code: string
  readonly name?: string
  readonly about?: string
  readonly description?: string
}

/** `bots.setBotMenuButton#4504d54f` */
export interface SetBotMenuButton {
  readonly _: 'bots.setBotMenuButton'
  readonly user_id: root_i$.TypeInputUser
  readonly button: root_b$.TypeBotMenuButton
}

/** `bots.setCustomVerification#8b89dfbd` */
export interface SetCustomVerification {
  readonly _: 'bots.setCustomVerification'
  readonly enabled?: true
  readonly bot?: root_i$.TypeInputUser
  readonly peer: root_i$.TypeInputPeer
  readonly custom_description?: string
}

/** `bots.toggleUserEmojiStatusPermission#06de6392` */
export interface ToggleUserEmojiStatusPermission {
  readonly _: 'bots.toggleUserEmojiStatusPermission'
  readonly bot: root_i$.TypeInputUser
  readonly enabled: boolean
}

/** `bots.toggleUsername#053ca973` */
export interface ToggleUsername {
  readonly _: 'bots.toggleUsername'
  readonly bot: root_i$.TypeInputUser
  readonly username: string
  readonly active: boolean
}

/** Any `bots.BotInfo`. */
export type TypeBotInfo =
  | BotInfo

/** Any `bots.PopularAppBots`. */
export type TypePopularAppBots =
  | PopularAppBots

/** Any `bots.PreviewInfo`. */
export type TypePreviewInfo =
  | PreviewInfo

/** `bots.updateStarRefProgram#778b5ab3` */
export interface UpdateStarRefProgram {
  readonly _: 'bots.updateStarRefProgram'
  readonly bot: root_i$.TypeInputUser
  readonly commission_permille: number
  readonly duration_months?: number
}

/** `bots.updateUserEmojiStatus#ed9f30c5` */
export interface UpdateUserEmojiStatus {
  readonly _: 'bots.updateUserEmojiStatus'
  readonly user_id: root_i$.TypeInputUser
  readonly emoji_status: root_e$.TypeEmojiStatus
}
