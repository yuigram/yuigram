// GENERATED FILE — do not edit.
// Bot API callable surface
// Source: Telegram Bot API 10.2, schemas/bot-api/10.2.json

import type { BotAccessSettings, BotCommand, BotDescription, BotName, BotShortDescription, BusinessConnection, ChatAdministratorRights, ChatFullInfo, ChatInviteLink, ChatMember, File, ForumTopic, GameHighScore, MenuButton, Message, MessageId, OwnedGifts, Poll, PreparedInlineMessage, PreparedKeyboardButton, SentGuestMessage, SentWebAppMessage, StarAmount, StarTransactions, Sticker, StickerSet, Story, Update, User, UserChatBoosts, UserProfileAudios, UserProfilePhotos, WebhookInfo } from './types/index.js'
import type {
  AddStickerToSetParams,
  AnswerCallbackQueryParams,
  AnswerChatJoinRequestQueryParams,
  AnswerGuestQueryParams,
  AnswerInlineQueryParams,
  AnswerPreCheckoutQueryParams,
  AnswerShippingQueryParams,
  AnswerWebAppQueryParams,
  ApproveChatJoinRequestParams,
  ApproveSuggestedPostParams,
  BanChatMemberParams,
  BanChatSenderChatParams,
  CloseForumTopicParams,
  CloseGeneralForumTopicParams,
  CloseParams,
  ConvertGiftToStarsParams,
  CopyMessageParams,
  CopyMessagesParams,
  CreateChatInviteLinkParams,
  CreateChatSubscriptionInviteLinkParams,
  CreateForumTopicParams,
  CreateInvoiceLinkParams,
  CreateNewStickerSetParams,
  DeclineChatJoinRequestParams,
  DeclineSuggestedPostParams,
  DeleteAllMessageReactionsParams,
  DeleteBusinessMessagesParams,
  DeleteChatPhotoParams,
  DeleteChatStickerSetParams,
  DeleteEphemeralMessageParams,
  DeleteForumTopicParams,
  DeleteMessageParams,
  DeleteMessageReactionParams,
  DeleteMessagesParams,
  DeleteMyCommandsParams,
  DeleteStickerFromSetParams,
  DeleteStickerSetParams,
  DeleteStoryParams,
  DeleteWebhookParams,
  EditChatInviteLinkParams,
  EditChatSubscriptionInviteLinkParams,
  EditEphemeralMessageCaptionParams,
  EditEphemeralMessageMediaParams,
  EditEphemeralMessageReplyMarkupParams,
  EditEphemeralMessageTextParams,
  EditForumTopicParams,
  EditGeneralForumTopicParams,
  EditMessageCaptionParams,
  EditMessageChecklistParams,
  EditMessageLiveLocationParams,
  EditMessageMediaParams,
  EditMessageReplyMarkupParams,
  EditMessageTextParams,
  EditStoryParams,
  EditUserStarSubscriptionParams,
  ExportChatInviteLinkParams,
  ForwardMessageParams,
  ForwardMessagesParams,
  GetAvailableGiftsParams,
  GetBusinessAccountGiftsParams,
  GetBusinessAccountStarBalanceParams,
  GetBusinessConnectionParams,
  GetChatAdministratorsParams,
  GetChatGiftsParams,
  GetChatMemberCountParams,
  GetChatMemberParams,
  GetChatMenuButtonParams,
  GetChatParams,
  GetCustomEmojiStickersParams,
  GetFileParams,
  GetForumTopicIconStickersParams,
  GetGameHighScoresParams,
  GetManagedBotAccessSettingsParams,
  GetManagedBotTokenParams,
  GetMeParams,
  GetMyCommandsParams,
  GetMyDefaultAdministratorRightsParams,
  GetMyDescriptionParams,
  GetMyNameParams,
  GetMyShortDescriptionParams,
  GetMyStarBalanceParams,
  GetStarTransactionsParams,
  GetStickerSetParams,
  GetUpdatesParams,
  GetUserChatBoostsParams,
  GetUserGiftsParams,
  GetUserPersonalChatMessagesParams,
  GetUserProfileAudiosParams,
  GetUserProfilePhotosParams,
  GetWebhookInfoParams,
  GiftPremiumSubscriptionParams,
  HideGeneralForumTopicParams,
  LeaveChatParams,
  LogOutParams,
  PinChatMessageParams,
  PostStoryParams,
  PromoteChatMemberParams,
  ReadBusinessMessageParams,
  RefundStarPaymentParams,
  RemoveBusinessAccountProfilePhotoParams,
  RemoveChatVerificationParams,
  RemoveMyProfilePhotoParams,
  RemoveUserVerificationParams,
  ReopenForumTopicParams,
  ReopenGeneralForumTopicParams,
  ReplaceManagedBotTokenParams,
  ReplaceStickerInSetParams,
  RepostStoryParams,
  RestrictChatMemberParams,
  RevokeChatInviteLinkParams,
  SavePreparedInlineMessageParams,
  SavePreparedKeyboardButtonParams,
  SendAnimationParams,
  SendAudioParams,
  SendChatActionParams,
  SendChatJoinRequestWebAppParams,
  SendChecklistParams,
  SendContactParams,
  SendDiceParams,
  SendDocumentParams,
  SendGameParams,
  SendGiftParams,
  SendInvoiceParams,
  SendLivePhotoParams,
  SendLocationParams,
  SendMediaGroupParams,
  SendMessageDraftParams,
  SendMessageParams,
  SendPaidMediaParams,
  SendPhotoParams,
  SendPollParams,
  SendRichMessageDraftParams,
  SendRichMessageParams,
  SendStickerParams,
  SendVenueParams,
  SendVideoNoteParams,
  SendVideoParams,
  SendVoiceParams,
  SetBusinessAccountBioParams,
  SetBusinessAccountGiftSettingsParams,
  SetBusinessAccountNameParams,
  SetBusinessAccountProfilePhotoParams,
  SetBusinessAccountUsernameParams,
  SetChatAdministratorCustomTitleParams,
  SetChatDescriptionParams,
  SetChatMemberTagParams,
  SetChatMenuButtonParams,
  SetChatPermissionsParams,
  SetChatPhotoParams,
  SetChatStickerSetParams,
  SetChatTitleParams,
  SetCustomEmojiStickerSetThumbnailParams,
  SetGameScoreParams,
  SetManagedBotAccessSettingsParams,
  SetMessageReactionParams,
  SetMyCommandsParams,
  SetMyDefaultAdministratorRightsParams,
  SetMyDescriptionParams,
  SetMyNameParams,
  SetMyProfilePhotoParams,
  SetMyShortDescriptionParams,
  SetPassportDataErrorsParams,
  SetStickerEmojiListParams,
  SetStickerKeywordsParams,
  SetStickerMaskPositionParams,
  SetStickerPositionInSetParams,
  SetStickerSetThumbnailParams,
  SetStickerSetTitleParams,
  SetUserEmojiStatusParams,
  SetWebhookParams,
  StopMessageLiveLocationParams,
  StopPollParams,
  TransferBusinessAccountStarsParams,
  TransferGiftParams,
  UnbanChatMemberParams,
  UnbanChatSenderChatParams,
  UnhideGeneralForumTopicParams,
  UnpinAllChatMessagesParams,
  UnpinAllForumTopicMessagesParams,
  UnpinAllGeneralForumTopicMessagesParams,
  UnpinChatMessageParams,
  UpgradeGiftParams,
  UploadStickerFileParams,
  VerifyChatParams,
  VerifyUserParams,
} from './methods/index.js'

/**
 * Every Bot API method, as a callable surface. Implemented by a proxy: there
 * is no per-method runtime code, so a new method works as soon as the schema
 * is regenerated.
 */
export interface ApiMethods {
  /**
   * Use this method to receive incoming updates using long polling (wiki).
   * Returns an Array of Update objects.
   *
   * @see https://corefork.telegram.org/bots/api#getupdates
   */
  getUpdates(params?: GetUpdatesParams): Promise<Update[]>

  /**
   * Use this method to specify a URL and receive incoming updates via an
   * outgoing webhook. Whenever there is an update for the bot, we will send an
   * HTTPS POST request to the specified URL, containing a JSON-serialized
   * Update. In case of an unsuccessful request (a request with response HTTP
   * status code different from 2XY), we will repeat the request and give up
   * after a reasonable amount of attempts. Returns True on success. If you'd
   * like to make sure that the webhook was set by you, you can specify secret
   * data in the parameter secret_token. If specified, the request will contain a
   * header “X-Telegram-Bot-Api-Secret-Token” with the secret token as content.
   *
   * @see https://corefork.telegram.org/bots/api#setwebhook
   */
  setWebhook(params: SetWebhookParams): Promise<true>

  /**
   * Use this method to remove webhook integration if you decide to switch back
   * to getUpdates. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#deletewebhook
   */
  deleteWebhook(params?: DeleteWebhookParams): Promise<true>

  /**
   * Use this method to get current webhook status. Requires no parameters. On
   * success, returns a WebhookInfo object. If the bot is using getUpdates, will
   * return an object with the url field empty.
   *
   * @see https://corefork.telegram.org/bots/api#getwebhookinfo
   */
  getWebhookInfo(params?: GetWebhookInfoParams): Promise<WebhookInfo>

  /**
   * A simple method for testing your bot's authentication token. Requires no
   * parameters. Returns basic information about the bot in form of a User
   * object.
   *
   * @see https://corefork.telegram.org/bots/api#getme
   */
  getMe(params?: GetMeParams): Promise<User>

  /**
   * Use this method to log out from the cloud Bot API server before launching
   * the bot locally. You must log out the bot before running it locally,
   * otherwise there is no guarantee that the bot will receive updates. After a
   * successful call, you can immediately log in on a local server, but will not
   * be able to log in back to the cloud Bot API server for 10 minutes. Returns
   * True on success. Requires no parameters.
   *
   * @see https://corefork.telegram.org/bots/api#logout
   */
  logOut(params?: LogOutParams): Promise<true>

  /**
   * Use this method to close the bot instance before moving it from one local
   * server to another. You need to delete the webhook before calling this method
   * to ensure that the bot isn't launched again after server restart. The method
   * will return error 429 in the first 10 minutes after the bot is launched.
   * Returns True on success. Requires no parameters.
   *
   * @see https://corefork.telegram.org/bots/api#close
   */
  close(params?: CloseParams): Promise<true>

  /**
   * Use this method to send text messages. On success, the sent Message is
   * returned.
   *
   * @see https://corefork.telegram.org/bots/api#sendmessage
   */
  sendMessage(params: SendMessageParams): Promise<Message>

  /**
   * Use this method to forward messages of any kind. Service messages and
   * messages with protected content can't be forwarded. On success, the sent
   * Message is returned.
   *
   * @see https://corefork.telegram.org/bots/api#forwardmessage
   */
  forwardMessage(params: ForwardMessageParams): Promise<Message>

  /**
   * Use this method to forward multiple messages of any kind. If some of the
   * specified messages can't be found or forwarded, they are skipped. Service
   * messages and messages with protected content can't be forwarded. Album
   * grouping is kept for forwarded messages. On success, an Array of MessageId
   * of the sent messages is returned.
   *
   * @see https://corefork.telegram.org/bots/api#forwardmessages
   */
  forwardMessages(params: ForwardMessagesParams): Promise<MessageId[]>

  /**
   * Use this method to copy messages of any kind. Service messages, paid media
   * messages, giveaway messages, giveaway winners messages, and invoice messages
   * can't be copied. A quiz poll can be copied only if the value of the field
   * correct_option_ids is known to the bot. The method is analogous to the
   * method forwardMessage, but the copied message doesn't have a link to the
   * original message. Returns the MessageId of the sent message on success.
   *
   * @see https://corefork.telegram.org/bots/api#copymessage
   */
  copyMessage(params: CopyMessageParams): Promise<MessageId>

  /**
   * Use this method to copy messages of any kind. If some of the specified
   * messages can't be found or copied, they are skipped. Service messages, paid
   * media messages, giveaway messages, giveaway winners messages, and invoice
   * messages can't be copied. A quiz poll can be copied only if the value of the
   * field correct_option_ids is known to the bot. The method is analogous to the
   * method forwardMessages, but the copied messages don't have a link to the
   * original message. Album grouping is kept for copied messages. On success, an
   * Array of MessageId of the sent messages is returned.
   *
   * @see https://corefork.telegram.org/bots/api#copymessages
   */
  copyMessages(params: CopyMessagesParams): Promise<MessageId[]>

  /**
   * Use this method to send photos. On success, the sent Message is returned.
   *
   * @see https://corefork.telegram.org/bots/api#sendphoto
   */
  sendPhoto(params: SendPhotoParams): Promise<Message>

  /**
   * Use this method to send live photos. On success, the sent Message is
   * returned.
   *
   * @see https://corefork.telegram.org/bots/api#sendlivephoto
   */
  sendLivePhoto(params: SendLivePhotoParams): Promise<Message>

  /**
   * Use this method to send audio files, if you want Telegram clients to display
   * them in the music player. Your audio must be in the .MP3 or .M4A format. On
   * success, the sent Message is returned. Bots can currently send audio files
   * of up to 50 MB in size, this limit may be changed in the future. For sending
   * voice messages, use the sendVoice method instead.
   *
   * @see https://corefork.telegram.org/bots/api#sendaudio
   */
  sendAudio(params: SendAudioParams): Promise<Message>

  /**
   * Use this method to send general files. On success, the sent Message is
   * returned. Bots can currently send files of any type of up to 50 MB in size,
   * this limit may be changed in the future.
   *
   * @see https://corefork.telegram.org/bots/api#senddocument
   */
  sendDocument(params: SendDocumentParams): Promise<Message>

  /**
   * Use this method to send video files, Telegram clients support MPEG4 videos
   * (other formats may be sent as Document). On success, the sent Message is
   * returned. Bots can currently send video files of up to 50 MB in size, this
   * limit may be changed in the future.
   *
   * @see https://corefork.telegram.org/bots/api#sendvideo
   */
  sendVideo(params: SendVideoParams): Promise<Message>

  /**
   * Use this method to send animation files (GIF or H.264/MPEG-4 AVC video
   * without sound). On success, the sent Message is returned. Bots can currently
   * send animation files of up to 50 MB in size, this limit may be changed in
   * the future.
   *
   * @see https://corefork.telegram.org/bots/api#sendanimation
   */
  sendAnimation(params: SendAnimationParams): Promise<Message>

  /**
   * Use this method to send audio files, if you want Telegram clients to display
   * the file as a playable voice message. For this to work, your audio must be
   * in an .OGG file encoded with OPUS, or in .MP3 format, or in .M4A format
   * (other formats may be sent as Audio or Document). On success, the sent
   * Message is returned. Bots can currently send voice messages of up to 50 MB
   * in size, this limit may be changed in the future.
   *
   * @see https://corefork.telegram.org/bots/api#sendvoice
   */
  sendVoice(params: SendVoiceParams): Promise<Message>

  /**
   * As of v.4.0, Telegram clients support rounded square MPEG4 videos of up to 1
   * minute long. Use this method to send video messages. On success, the sent
   * Message is returned.
   *
   * @see https://corefork.telegram.org/bots/api#sendvideonote
   */
  sendVideoNote(params: SendVideoNoteParams): Promise<Message>

  /**
   * Use this method to send paid media. On success, the sent Message is
   * returned.
   *
   * @see https://corefork.telegram.org/bots/api#sendpaidmedia
   */
  sendPaidMedia(params: SendPaidMediaParams): Promise<Message>

  /**
   * Use this method to send a group of photos, live photos, videos, documents or
   * audios as an album. Documents and audio files can be only grouped in an
   * album with messages of the same type. On success, an Array of Message
   * objects that were sent is returned.
   *
   * @see https://corefork.telegram.org/bots/api#sendmediagroup
   */
  sendMediaGroup(params: SendMediaGroupParams): Promise<Message[]>

  /**
   * Use this method to send point on the map. On success, the sent Message is
   * returned.
   *
   * @see https://corefork.telegram.org/bots/api#sendlocation
   */
  sendLocation(params: SendLocationParams): Promise<Message>

  /**
   * Use this method to send information about a venue. On success, the sent
   * Message is returned.
   *
   * @see https://corefork.telegram.org/bots/api#sendvenue
   */
  sendVenue(params: SendVenueParams): Promise<Message>

  /**
   * Use this method to send phone contacts. On success, the sent Message is
   * returned.
   *
   * @see https://corefork.telegram.org/bots/api#sendcontact
   */
  sendContact(params: SendContactParams): Promise<Message>

  /**
   * Use this method to send a native poll. On success, the sent Message is
   * returned.
   *
   * @see https://corefork.telegram.org/bots/api#sendpoll
   */
  sendPoll(params: SendPollParams): Promise<Message>

  /**
   * Use this method to send a checklist on behalf of a connected business
   * account. On success, the sent Message is returned.
   *
   * @see https://corefork.telegram.org/bots/api#sendchecklist
   */
  sendChecklist(params: SendChecklistParams): Promise<Message>

  /**
   * Use this method to send an animated emoji that will display a random value.
   * On success, the sent Message is returned.
   *
   * @see https://corefork.telegram.org/bots/api#senddice
   */
  sendDice(params: SendDiceParams): Promise<Message>

  /**
   * Use this method to stream a partial message to a user while the message is
   * being generated. Note that the streamed draft is ephemeral and acts as a
   * temporary 30-second preview - once the output is finalized, you must call
   * sendMessage with the complete message to persist it in the user's chat.
   * Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#sendmessagedraft
   */
  sendMessageDraft(params: SendMessageDraftParams): Promise<true>

  /**
   * Use this method when you need to tell the user that something is happening
   * on the bot's side. The status is set for 5 seconds or less (when a message
   * arrives from your bot, Telegram clients clear its typing status). Returns
   * True on success. Example: The ImageBot needs some time to process a request
   * and upload the image. Instead of sending a text message along the lines of
   * “Retrieving image, please wait…”, the bot may use sendChatAction with action
   * = upload_photo. The user will see a “sending photo” status for the bot. We
   * only recommend using this method when a response from the bot will take a
   * noticeable amount of time to arrive.
   *
   * @see https://corefork.telegram.org/bots/api#sendchataction
   */
  sendChatAction(params: SendChatActionParams): Promise<true>

  /**
   * Use this method to change the chosen reactions on a message. Service
   * messages of some types can't be reacted to. Automatically forwarded messages
   * from a channel to its discussion group have the same available reactions as
   * messages in the channel. Bots can't use paid reactions. Returns True on
   * success.
   *
   * @see https://corefork.telegram.org/bots/api#setmessagereaction
   */
  setMessageReaction(params: SetMessageReactionParams): Promise<true>

  /**
   * Use this method to get a list of profile pictures for a user. Returns a
   * UserProfilePhotos object.
   *
   * @see https://corefork.telegram.org/bots/api#getuserprofilephotos
   */
  getUserProfilePhotos(params: GetUserProfilePhotosParams): Promise<UserProfilePhotos>

  /**
   * Use this method to get a list of profile audios for a user. Returns a
   * UserProfileAudios object.
   *
   * @see https://corefork.telegram.org/bots/api#getuserprofileaudios
   */
  getUserProfileAudios(params: GetUserProfileAudiosParams): Promise<UserProfileAudios>

  /**
   * Changes the emoji status for a given user that previously allowed the bot to
   * manage their emoji status via the Mini App method requestEmojiStatusAccess.
   * Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setuseremojistatus
   */
  setUserEmojiStatus(params: SetUserEmojiStatusParams): Promise<true>

  /**
   * Use this method to get basic information about a file and prepare it for
   * downloading. For the moment, bots can download files of up to 20MB in size.
   * On success, a File object is returned. The file can then be downloaded via
   * the link https://api.telegram.org/file/bot<token>/<file_path>, where
   * <file_path> is taken from the response. It is guaranteed that the link will
   * be valid for at least 1 hour. When the link expires, a new one can be
   * requested by calling getFile again.
   *
   * @see https://corefork.telegram.org/bots/api#getfile
   */
  getFile(params: GetFileParams): Promise<File>

  /**
   * Use this method to ban a user in a group, a supergroup or a channel. In the
   * case of supergroups and channels, the user will not be able to return to the
   * chat on their own using invite links, etc., unless unbanned first. The bot
   * must be an administrator in the chat for this to work and must have the
   * appropriate administrator rights. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#banchatmember
   */
  banChatMember(params: BanChatMemberParams): Promise<true>

  /**
   * Use this method to unban a previously banned user in a supergroup or
   * channel. The user will not return to the group or channel automatically, but
   * will be able to join via link, etc. The bot must be an administrator for
   * this to work. By default, this method guarantees that after the call the
   * user is not a member of the chat, but will be able to join it. So if the
   * user is a member of the chat they will also be removed from the chat. If you
   * don't want this, use the parameter only_if_banned. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#unbanchatmember
   */
  unbanChatMember(params: UnbanChatMemberParams): Promise<true>

  /**
   * Use this method to restrict a user in a supergroup. The bot must be an
   * administrator in the supergroup for this to work and must have the
   * appropriate administrator rights. Pass True for all permissions to lift
   * restrictions from a user. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#restrictchatmember
   */
  restrictChatMember(params: RestrictChatMemberParams): Promise<true>

  /**
   * Use this method to promote or demote a user in a supergroup or a channel.
   * The bot must be an administrator in the chat for this to work and must have
   * the appropriate administrator rights. Pass False for all boolean parameters
   * to demote a user. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#promotechatmember
   */
  promoteChatMember(params: PromoteChatMemberParams): Promise<true>

  /**
   * Use this method to set a custom title for an administrator in a supergroup
   * promoted by the bot. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setchatadministratorcustomtitle
   */
  setChatAdministratorCustomTitle(params: SetChatAdministratorCustomTitleParams): Promise<true>

  /**
   * Use this method to set a tag for a regular member in a group or a
   * supergroup. The bot must be an administrator in the chat for this to work
   * and must have the can_manage_tags administrator right. Returns True on
   * success.
   *
   * @see https://corefork.telegram.org/bots/api#setchatmembertag
   */
  setChatMemberTag(params: SetChatMemberTagParams): Promise<true>

  /**
   * Use this method to ban a channel chat in a supergroup or a channel. Until
   * the chat is unbanned, the owner of the banned chat won't be able to send
   * messages on behalf of any of their channels. The bot must be an
   * administrator in the supergroup or channel for this to work and must have
   * the appropriate administrator rights. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#banchatsenderchat
   */
  banChatSenderChat(params: BanChatSenderChatParams): Promise<true>

  /**
   * Use this method to unban a previously banned channel chat in a supergroup or
   * channel. The bot must be an administrator for this to work and must have the
   * appropriate administrator rights. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#unbanchatsenderchat
   */
  unbanChatSenderChat(params: UnbanChatSenderChatParams): Promise<true>

  /**
   * Use this method to set default chat permissions for all members. The bot
   * must be an administrator in the group or a supergroup for this to work and
   * must have the can_restrict_members administrator rights. Returns True on
   * success.
   *
   * @see https://corefork.telegram.org/bots/api#setchatpermissions
   */
  setChatPermissions(params: SetChatPermissionsParams): Promise<true>

  /**
   * Use this method to generate a new primary invite link for a chat; any
   * previously generated primary link is revoked. The bot must be an
   * administrator in the chat for this to work and must have the appropriate
   * administrator rights. Returns the new invite link as String on success.
   *
   * @see https://corefork.telegram.org/bots/api#exportchatinvitelink
   */
  exportChatInviteLink(params: ExportChatInviteLinkParams): Promise<string>

  /**
   * Use this method to create an additional invite link for a chat. The bot must
   * be an administrator in the chat for this to work and must have the
   * appropriate administrator rights. The link can be revoked using the method
   * revokeChatInviteLink. Returns the new invite link as ChatInviteLink object.
   *
   * @see https://corefork.telegram.org/bots/api#createchatinvitelink
   */
  createChatInviteLink(params: CreateChatInviteLinkParams): Promise<ChatInviteLink>

  /**
   * Use this method to edit a non-primary invite link created by the bot. The
   * bot must be an administrator in the chat for this to work and must have the
   * appropriate administrator rights. Returns the edited invite link as a
   * ChatInviteLink object.
   *
   * @see https://corefork.telegram.org/bots/api#editchatinvitelink
   */
  editChatInviteLink(params: EditChatInviteLinkParams): Promise<ChatInviteLink>

  /**
   * Use this method to create a subscription invite link for a channel chat. The
   * bot must have the can_invite_users administrator rights. The link can be
   * edited using the method editChatSubscriptionInviteLink or revoked using the
   * method revokeChatInviteLink. Returns the new invite link as a ChatInviteLink
   * object.
   *
   * @see https://corefork.telegram.org/bots/api#createchatsubscriptioninvitelink
   */
  createChatSubscriptionInviteLink(params: CreateChatSubscriptionInviteLinkParams): Promise<ChatInviteLink>

  /**
   * Use this method to edit a subscription invite link created by the bot. The
   * bot must have the can_invite_users administrator rights. Returns the edited
   * invite link as a ChatInviteLink object.
   *
   * @see https://corefork.telegram.org/bots/api#editchatsubscriptioninvitelink
   */
  editChatSubscriptionInviteLink(params: EditChatSubscriptionInviteLinkParams): Promise<ChatInviteLink>

  /**
   * Use this method to revoke an invite link created by the bot. If the primary
   * link is revoked, a new link is automatically generated. The bot must be an
   * administrator in the chat for this to work and must have the appropriate
   * administrator rights. Returns the revoked invite link as ChatInviteLink
   * object.
   *
   * @see https://corefork.telegram.org/bots/api#revokechatinvitelink
   */
  revokeChatInviteLink(params: RevokeChatInviteLinkParams): Promise<ChatInviteLink>

  /**
   * Use this method to approve a chat join request. The bot must be an
   * administrator in the chat for this to work and must have the
   * can_invite_users administrator right. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#approvechatjoinrequest
   */
  approveChatJoinRequest(params: ApproveChatJoinRequestParams): Promise<true>

  /**
   * Use this method to decline a chat join request. The bot must be an
   * administrator in the chat for this to work and must have the
   * can_invite_users administrator right. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#declinechatjoinrequest
   */
  declineChatJoinRequest(params: DeclineChatJoinRequestParams): Promise<true>

  /**
   * Use this method to process a received chat join request query. Returns True
   * on success.
   *
   * @see https://corefork.telegram.org/bots/api#answerchatjoinrequestquery
   */
  answerChatJoinRequestQuery(params: AnswerChatJoinRequestQueryParams): Promise<true>

  /**
   * Use this method to process a received chat join request query by showing a
   * Mini App to the user before deciding the outcome. Call
   * answerChatJoinRequestQuery to resolve the join request query based on the
   * user interaction with the Mini App. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#sendchatjoinrequestwebapp
   */
  sendChatJoinRequestWebApp(params: SendChatJoinRequestWebAppParams): Promise<true>

  /**
   * Use this method to set a new profile photo for the chat. Photos can't be
   * changed for private chats. The bot must be an administrator in the chat for
   * this to work and must have the appropriate administrator rights. Returns
   * True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setchatphoto
   */
  setChatPhoto(params: SetChatPhotoParams): Promise<true>

  /**
   * Use this method to delete a chat photo. Photos can't be changed for private
   * chats. The bot must be an administrator in the chat for this to work and
   * must have the appropriate administrator rights. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#deletechatphoto
   */
  deleteChatPhoto(params: DeleteChatPhotoParams): Promise<true>

  /**
   * Use this method to change the title of a chat. Titles can't be changed for
   * private chats. The bot must be an administrator in the chat for this to work
   * and must have the appropriate administrator rights. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setchattitle
   */
  setChatTitle(params: SetChatTitleParams): Promise<true>

  /**
   * Use this method to change the description of a group, a supergroup or a
   * channel. The bot must be an administrator in the chat for this to work and
   * must have the appropriate administrator rights. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setchatdescription
   */
  setChatDescription(params: SetChatDescriptionParams): Promise<true>

  /**
   * Use this method to add a message to the list of pinned messages in a chat.
   * In private chats and channel direct messages chats, all non-service messages
   * can be pinned. Conversely, the bot must be an administrator with the
   * 'can_pin_messages' right or the 'can_edit_messages' right to pin messages in
   * groups and channels respectively. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#pinchatmessage
   */
  pinChatMessage(params: PinChatMessageParams): Promise<true>

  /**
   * Use this method to remove a message from the list of pinned messages in a
   * chat. In private chats and channel direct messages chats, all messages can
   * be unpinned. Conversely, the bot must be an administrator with the
   * 'can_pin_messages' right or the 'can_edit_messages' right to unpin messages
   * in groups and channels respectively. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#unpinchatmessage
   */
  unpinChatMessage(params: UnpinChatMessageParams): Promise<true>

  /**
   * Use this method to clear the list of pinned messages in a chat. In private
   * chats and channel direct messages chats, no additional rights are required
   * to unpin all pinned messages. Conversely, the bot must be an administrator
   * with the 'can_pin_messages' right or the 'can_edit_messages' right to unpin
   * all pinned messages in groups and channels respectively. Returns True on
   * success.
   *
   * @see https://corefork.telegram.org/bots/api#unpinallchatmessages
   */
  unpinAllChatMessages(params: UnpinAllChatMessagesParams): Promise<true>

  /**
   * Use this method for your bot to leave a group, supergroup or channel.
   * Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#leavechat
   */
  leaveChat(params: LeaveChatParams): Promise<true>

  /**
   * Use this method to get up-to-date information about the chat. Returns a
   * ChatFullInfo object on success.
   *
   * @see https://corefork.telegram.org/bots/api#getchat
   */
  getChat(params: GetChatParams): Promise<ChatFullInfo>

  /**
   * Use this method to get a list of administrators in a chat. Returns an Array
   * of ChatMember objects.
   *
   * @see https://corefork.telegram.org/bots/api#getchatadministrators
   */
  getChatAdministrators(params: GetChatAdministratorsParams): Promise<ChatMember[]>

  /**
   * Use this method to get the number of members in a chat. Returns Integer on
   * success.
   *
   * @see https://corefork.telegram.org/bots/api#getchatmembercount
   */
  getChatMemberCount(params: GetChatMemberCountParams): Promise<number>

  /**
   * Use this method to get information about a member of a chat. The method is
   * only guaranteed to work for other users if the bot is an administrator in
   * the chat. Returns a ChatMember object on success.
   *
   * @see https://corefork.telegram.org/bots/api#getchatmember
   */
  getChatMember(params: GetChatMemberParams): Promise<ChatMember>

  /**
   * Use this method to get the last messages from the personal chat (i.e., the
   * chat currently added to their profile) of a given user. On success, an Array
   * of Message objects is returned.
   *
   * @see https://corefork.telegram.org/bots/api#getuserpersonalchatmessages
   */
  getUserPersonalChatMessages(params: GetUserPersonalChatMessagesParams): Promise<Message[]>

  /**
   * Use this method to set a new group sticker set for a supergroup. The bot
   * must be an administrator in the chat for this to work and must have the
   * appropriate administrator rights. Use the field can_set_sticker_set
   * optionally returned in getChat requests to check if the bot can use this
   * method. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setchatstickerset
   */
  setChatStickerSet(params: SetChatStickerSetParams): Promise<true>

  /**
   * Use this method to delete a group sticker set from a supergroup. The bot
   * must be an administrator in the chat for this to work and must have the
   * appropriate administrator rights. Use the field can_set_sticker_set
   * optionally returned in getChat requests to check if the bot can use this
   * method. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#deletechatstickerset
   */
  deleteChatStickerSet(params: DeleteChatStickerSetParams): Promise<true>

  /**
   * Use this method to get custom emoji stickers, which can be used as a forum
   * topic icon by any user. Requires no parameters. Returns an Array of Sticker
   * objects.
   *
   * @see https://corefork.telegram.org/bots/api#getforumtopiciconstickers
   */
  getForumTopicIconStickers(params?: GetForumTopicIconStickersParams): Promise<Sticker[]>

  /**
   * Use this method to create a topic in a forum supergroup chat or a private
   * chat with a user. In the case of a supergroup chat the bot must be an
   * administrator in the chat for this to work and must have the
   * can_manage_topics administrator right. Returns information about the created
   * topic as a ForumTopic object.
   *
   * @see https://corefork.telegram.org/bots/api#createforumtopic
   */
  createForumTopic(params: CreateForumTopicParams): Promise<ForumTopic>

  /**
   * Use this method to edit name and icon of a topic in a forum supergroup chat
   * or a private chat with a user. In the case of a supergroup chat the bot must
   * be an administrator in the chat for this to work and must have the
   * can_manage_topics administrator rights, unless it is the creator of the
   * topic. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#editforumtopic
   */
  editForumTopic(params: EditForumTopicParams): Promise<true>

  /**
   * Use this method to close an open topic in a forum supergroup chat. The bot
   * must be an administrator in the chat for this to work and must have the
   * can_manage_topics administrator rights, unless it is the creator of the
   * topic. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#closeforumtopic
   */
  closeForumTopic(params: CloseForumTopicParams): Promise<true>

  /**
   * Use this method to reopen a closed topic in a forum supergroup chat. The bot
   * must be an administrator in the chat for this to work and must have the
   * can_manage_topics administrator rights, unless it is the creator of the
   * topic. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#reopenforumtopic
   */
  reopenForumTopic(params: ReopenForumTopicParams): Promise<true>

  /**
   * Use this method to delete a forum topic along with all its messages in a
   * forum supergroup chat or a private chat with a user. In the case of a
   * supergroup chat the bot must be an administrator in the chat for this to
   * work and must have the can_delete_messages administrator rights. Returns
   * True on success.
   *
   * @see https://corefork.telegram.org/bots/api#deleteforumtopic
   */
  deleteForumTopic(params: DeleteForumTopicParams): Promise<true>

  /**
   * Use this method to clear the list of pinned messages in a forum topic in a
   * forum supergroup chat or a private chat with a user. In the case of a
   * supergroup chat the bot must be an administrator in the chat for this to
   * work and must have the can_pin_messages administrator right in the
   * supergroup. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#unpinallforumtopicmessages
   */
  unpinAllForumTopicMessages(params: UnpinAllForumTopicMessagesParams): Promise<true>

  /**
   * Use this method to edit the name of the 'General' topic in a forum
   * supergroup chat. The bot must be an administrator in the chat for this to
   * work and must have the can_manage_topics administrator rights. Returns True
   * on success.
   *
   * @see https://corefork.telegram.org/bots/api#editgeneralforumtopic
   */
  editGeneralForumTopic(params: EditGeneralForumTopicParams): Promise<true>

  /**
   * Use this method to close an open 'General' topic in a forum supergroup chat.
   * The bot must be an administrator in the chat for this to work and must have
   * the can_manage_topics administrator rights. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#closegeneralforumtopic
   */
  closeGeneralForumTopic(params: CloseGeneralForumTopicParams): Promise<true>

  /**
   * Use this method to reopen a closed 'General' topic in a forum supergroup
   * chat. The bot must be an administrator in the chat for this to work and must
   * have the can_manage_topics administrator rights. The topic will be
   * automatically unhidden if it was hidden. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#reopengeneralforumtopic
   */
  reopenGeneralForumTopic(params: ReopenGeneralForumTopicParams): Promise<true>

  /**
   * Use this method to hide the 'General' topic in a forum supergroup chat. The
   * bot must be an administrator in the chat for this to work and must have the
   * can_manage_topics administrator rights. The topic will be automatically
   * closed if it was open. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#hidegeneralforumtopic
   */
  hideGeneralForumTopic(params: HideGeneralForumTopicParams): Promise<true>

  /**
   * Use this method to unhide the 'General' topic in a forum supergroup chat.
   * The bot must be an administrator in the chat for this to work and must have
   * the can_manage_topics administrator rights. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#unhidegeneralforumtopic
   */
  unhideGeneralForumTopic(params: UnhideGeneralForumTopicParams): Promise<true>

  /**
   * Use this method to clear the list of pinned messages in a General forum
   * topic. The bot must be an administrator in the chat for this to work and
   * must have the can_pin_messages administrator right in the supergroup.
   * Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#unpinallgeneralforumtopicmessages
   */
  unpinAllGeneralForumTopicMessages(params: UnpinAllGeneralForumTopicMessagesParams): Promise<true>

  /**
   * Use this method to send answers to callback queries sent from inline
   * keyboards. The answer will be displayed to the user as a notification at the
   * top of the chat screen or as an alert. On success, True is returned.
   * Alternatively, the user can be redirected to the specified Game URL. For
   * this option to work, you must first create a game for your bot via
   * @BotFather and accept the terms. Otherwise, you may use links like
   * t.me/your_bot?start=XXXX that open your bot with a parameter.
   *
   * @see https://corefork.telegram.org/bots/api#answercallbackquery
   */
  answerCallbackQuery(params: AnswerCallbackQueryParams): Promise<true>

  /**
   * Use this method to reply to a received guest message. On success, a
   * SentGuestMessage object is returned.
   *
   * @see https://corefork.telegram.org/bots/api#answerguestquery
   */
  answerGuestQuery(params: AnswerGuestQueryParams): Promise<SentGuestMessage>

  /**
   * Use this method to get the list of boosts added to a chat by a user.
   * Requires administrator rights in the chat. Returns a UserChatBoosts object.
   *
   * @see https://corefork.telegram.org/bots/api#getuserchatboosts
   */
  getUserChatBoosts(params: GetUserChatBoostsParams): Promise<UserChatBoosts>

  /**
   * Use this method to get information about the connection of the bot with a
   * business account. Returns a BusinessConnection object on success.
   *
   * @see https://corefork.telegram.org/bots/api#getbusinessconnection
   */
  getBusinessConnection(params: GetBusinessConnectionParams): Promise<BusinessConnection>

  /**
   * Use this method to get the token of a managed bot. Returns the token as
   * String on success.
   *
   * @see https://corefork.telegram.org/bots/api#getmanagedbottoken
   */
  getManagedBotToken(params: GetManagedBotTokenParams): Promise<string>

  /**
   * Use this method to revoke the current token of a managed bot and generate a
   * new one. Returns the new token as String on success.
   *
   * @see https://corefork.telegram.org/bots/api#replacemanagedbottoken
   */
  replaceManagedBotToken(params: ReplaceManagedBotTokenParams): Promise<string>

  /**
   * Use this method to get the access settings of a managed bot. Returns a
   * BotAccessSettings object on success.
   *
   * @see https://corefork.telegram.org/bots/api#getmanagedbotaccesssettings
   */
  getManagedBotAccessSettings(params: GetManagedBotAccessSettingsParams): Promise<BotAccessSettings>

  /**
   * Use this method to change the access settings of a managed bot. Returns True
   * on success.
   *
   * @see https://corefork.telegram.org/bots/api#setmanagedbotaccesssettings
   */
  setManagedBotAccessSettings(params: SetManagedBotAccessSettingsParams): Promise<true>

  /**
   * Use this method to change the list of the bot's commands. See this manual
   * for more details about bot commands. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setmycommands
   */
  setMyCommands(params: SetMyCommandsParams): Promise<true>

  /**
   * Use this method to delete the list of the bot's commands for the given scope
   * and user language. After deletion, higher level commands will be shown to
   * affected users. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#deletemycommands
   */
  deleteMyCommands(params?: DeleteMyCommandsParams): Promise<true>

  /**
   * Use this method to get the current list of the bot's commands for the given
   * scope and user language. Returns an Array of BotCommand objects. If commands
   * aren't set, an empty list is returned.
   *
   * @see https://corefork.telegram.org/bots/api#getmycommands
   */
  getMyCommands(params?: GetMyCommandsParams): Promise<BotCommand[]>

  /**
   * Use this method to change the bot's name. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setmyname
   */
  setMyName(params?: SetMyNameParams): Promise<true>

  /**
   * Use this method to get the current bot name for the given user language.
   * Returns BotName on success.
   *
   * @see https://corefork.telegram.org/bots/api#getmyname
   */
  getMyName(params?: GetMyNameParams): Promise<BotName>

  /**
   * Use this method to change the bot's description, which is shown in the chat
   * with the bot if the chat is empty. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setmydescription
   */
  setMyDescription(params?: SetMyDescriptionParams): Promise<true>

  /**
   * Use this method to get the current bot description for the given user
   * language. Returns BotDescription on success.
   *
   * @see https://corefork.telegram.org/bots/api#getmydescription
   */
  getMyDescription(params?: GetMyDescriptionParams): Promise<BotDescription>

  /**
   * Use this method to change the bot's short description, which is shown on the
   * bot's profile page and is sent together with the link when users share the
   * bot. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setmyshortdescription
   */
  setMyShortDescription(params?: SetMyShortDescriptionParams): Promise<true>

  /**
   * Use this method to get the current bot short description for the given user
   * language. Returns BotShortDescription on success.
   *
   * @see https://corefork.telegram.org/bots/api#getmyshortdescription
   */
  getMyShortDescription(params?: GetMyShortDescriptionParams): Promise<BotShortDescription>

  /**
   * Changes the profile photo of the bot. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setmyprofilephoto
   */
  setMyProfilePhoto(params: SetMyProfilePhotoParams): Promise<true>

  /**
   * Removes the profile photo of the bot. Requires no parameters. Returns True
   * on success.
   *
   * @see https://corefork.telegram.org/bots/api#removemyprofilephoto
   */
  removeMyProfilePhoto(params?: RemoveMyProfilePhotoParams): Promise<true>

  /**
   * Use this method to change the bot's menu button in a private chat, or the
   * default menu button. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setchatmenubutton
   */
  setChatMenuButton(params?: SetChatMenuButtonParams): Promise<true>

  /**
   * Use this method to get the current value of the bot's menu button in a
   * private chat, or the default menu button. Returns MenuButton on success.
   *
   * @see https://corefork.telegram.org/bots/api#getchatmenubutton
   */
  getChatMenuButton(params?: GetChatMenuButtonParams): Promise<MenuButton>

  /**
   * Use this method to change the default administrator rights requested by the
   * bot when it's added as an administrator to groups or channels. These rights
   * will be suggested to users, but they are free to modify the list before
   * adding the bot. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setmydefaultadministratorrights
   */
  setMyDefaultAdministratorRights(params?: SetMyDefaultAdministratorRightsParams): Promise<true>

  /**
   * Use this method to get the current default administrator rights of the bot.
   * Returns ChatAdministratorRights on success.
   *
   * @see https://corefork.telegram.org/bots/api#getmydefaultadministratorrights
   */
  getMyDefaultAdministratorRights(params?: GetMyDefaultAdministratorRightsParams): Promise<ChatAdministratorRights>

  /**
   * Returns the list of gifts that can be sent by the bot to users and channel
   * chats. Requires no parameters. Returns a Gifts object.
   *
   * @see https://corefork.telegram.org/bots/api#getavailablegifts
   */
  getAvailableGifts(params?: GetAvailableGiftsParams): Promise<boolean>

  /**
   * Sends a gift to the given user or channel chat. The gift can't be converted
   * to Telegram Stars by the receiver. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#sendgift
   */
  sendGift(params: SendGiftParams): Promise<true>

  /**
   * Gifts a Telegram Premium subscription to the given user. Returns True on
   * success.
   *
   * @see https://corefork.telegram.org/bots/api#giftpremiumsubscription
   */
  giftPremiumSubscription(params: GiftPremiumSubscriptionParams): Promise<true>

  /**
   * Verifies a user on behalf of the organization which is represented by the
   * bot. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#verifyuser
   */
  verifyUser(params: VerifyUserParams): Promise<true>

  /**
   * Verifies a chat on behalf of the organization which is represented by the
   * bot. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#verifychat
   */
  verifyChat(params: VerifyChatParams): Promise<true>

  /**
   * Removes verification from a user who is currently verified on behalf of the
   * organization represented by the bot. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#removeuserverification
   */
  removeUserVerification(params: RemoveUserVerificationParams): Promise<true>

  /**
   * Removes verification from a chat that is currently verified on behalf of the
   * organization represented by the bot. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#removechatverification
   */
  removeChatVerification(params: RemoveChatVerificationParams): Promise<true>

  /**
   * Marks incoming message as read on behalf of a business account. Requires the
   * can_read_messages business bot right. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#readbusinessmessage
   */
  readBusinessMessage(params: ReadBusinessMessageParams): Promise<true>

  /**
   * Delete messages on behalf of a business account. Requires the
   * can_delete_sent_messages business bot right to delete messages sent by the
   * bot itself, or the can_delete_all_messages business bot right to delete any
   * message. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#deletebusinessmessages
   */
  deleteBusinessMessages(params: DeleteBusinessMessagesParams): Promise<true>

  /**
   * Changes the first and last name of a managed business account. Requires the
   * can_change_name business bot right. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setbusinessaccountname
   */
  setBusinessAccountName(params: SetBusinessAccountNameParams): Promise<true>

  /**
   * Changes the username of a managed business account. Requires the
   * can_change_username business bot right. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setbusinessaccountusername
   */
  setBusinessAccountUsername(params: SetBusinessAccountUsernameParams): Promise<true>

  /**
   * Changes the bio of a managed business account. Requires the can_change_bio
   * business bot right. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setbusinessaccountbio
   */
  setBusinessAccountBio(params: SetBusinessAccountBioParams): Promise<true>

  /**
   * Changes the profile photo of a managed business account. Requires the
   * can_edit_profile_photo business bot right. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setbusinessaccountprofilephoto
   */
  setBusinessAccountProfilePhoto(params: SetBusinessAccountProfilePhotoParams): Promise<true>

  /**
   * Removes the current profile photo of a managed business account. Requires
   * the can_edit_profile_photo business bot right. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#removebusinessaccountprofilephoto
   */
  removeBusinessAccountProfilePhoto(params: RemoveBusinessAccountProfilePhotoParams): Promise<true>

  /**
   * Changes the privacy settings pertaining to incoming gifts in a managed
   * business account. Requires the can_change_gift_settings business bot right.
   * Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setbusinessaccountgiftsettings
   */
  setBusinessAccountGiftSettings(params: SetBusinessAccountGiftSettingsParams): Promise<true>

  /**
   * Returns the amount of Telegram Stars owned by a managed business account.
   * Requires the can_view_gifts_and_stars business bot right. Returns StarAmount
   * on success.
   *
   * @see https://corefork.telegram.org/bots/api#getbusinessaccountstarbalance
   */
  getBusinessAccountStarBalance(params: GetBusinessAccountStarBalanceParams): Promise<StarAmount>

  /**
   * Transfers Telegram Stars from the business account balance to the bot's
   * balance. Requires the can_transfer_stars business bot right. Returns True on
   * success.
   *
   * @see https://corefork.telegram.org/bots/api#transferbusinessaccountstars
   */
  transferBusinessAccountStars(params: TransferBusinessAccountStarsParams): Promise<true>

  /**
   * Returns the gifts received and owned by a managed business account. Requires
   * the can_view_gifts_and_stars business bot right. Returns OwnedGifts on
   * success.
   *
   * @see https://corefork.telegram.org/bots/api#getbusinessaccountgifts
   */
  getBusinessAccountGifts(params: GetBusinessAccountGiftsParams): Promise<OwnedGifts>

  /**
   * Returns the gifts owned and hosted by a user. Returns OwnedGifts on success.
   *
   * @see https://corefork.telegram.org/bots/api#getusergifts
   */
  getUserGifts(params: GetUserGiftsParams): Promise<OwnedGifts>

  /**
   * Returns the gifts owned by a chat. Returns OwnedGifts on success.
   *
   * @see https://corefork.telegram.org/bots/api#getchatgifts
   */
  getChatGifts(params: GetChatGiftsParams): Promise<OwnedGifts>

  /**
   * Converts a given regular gift to Telegram Stars. Requires the
   * can_convert_gifts_to_stars business bot right. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#convertgifttostars
   */
  convertGiftToStars(params: ConvertGiftToStarsParams): Promise<true>

  /**
   * Upgrades a given regular gift to a unique gift. Requires the
   * can_transfer_and_upgrade_gifts business bot right. Additionally requires the
   * can_transfer_stars business bot right if the upgrade is paid. Returns True
   * on success.
   *
   * @see https://corefork.telegram.org/bots/api#upgradegift
   */
  upgradeGift(params: UpgradeGiftParams): Promise<true>

  /**
   * Transfers an owned unique gift to another user. Requires the
   * can_transfer_and_upgrade_gifts business bot right. Requires
   * can_transfer_stars business bot right if the transfer is paid. Returns True
   * on success.
   *
   * @see https://corefork.telegram.org/bots/api#transfergift
   */
  transferGift(params: TransferGiftParams): Promise<true>

  /**
   * Posts a story on behalf of a managed business account. Requires the
   * can_manage_stories business bot right. Returns Story on success.
   *
   * @see https://corefork.telegram.org/bots/api#poststory
   */
  postStory(params: PostStoryParams): Promise<Story>

  /**
   * Reposts a story on behalf of a business account from another business
   * account. Both business accounts must be managed by the same bot, and the
   * story on the source account must have been posted (or reposted) by the bot.
   * Requires the can_manage_stories business bot right for both business
   * accounts. Returns Story on success.
   *
   * @see https://corefork.telegram.org/bots/api#repoststory
   */
  repostStory(params: RepostStoryParams): Promise<Story>

  /**
   * Edits a story previously posted by the bot on behalf of a managed business
   * account. Requires the can_manage_stories business bot right. Returns Story
   * on success.
   *
   * @see https://corefork.telegram.org/bots/api#editstory
   */
  editStory(params: EditStoryParams): Promise<Story>

  /**
   * Deletes a story previously posted by the bot on behalf of a managed business
   * account. Requires the can_manage_stories business bot right. Returns True on
   * success.
   *
   * @see https://corefork.telegram.org/bots/api#deletestory
   */
  deleteStory(params: DeleteStoryParams): Promise<true>

  /**
   * Use this method to set the result of an interaction with a Web App and send
   * a corresponding message on behalf of the user to the chat from which the
   * query originated. On success, a SentWebAppMessage object is returned.
   *
   * @see https://corefork.telegram.org/bots/api#answerwebappquery
   */
  answerWebAppQuery(params: AnswerWebAppQueryParams): Promise<SentWebAppMessage>

  /**
   * Stores a message that can be sent by a user of a Mini App. Returns a
   * PreparedInlineMessage object.
   *
   * @see https://corefork.telegram.org/bots/api#savepreparedinlinemessage
   */
  savePreparedInlineMessage(params: SavePreparedInlineMessageParams): Promise<PreparedInlineMessage>

  /**
   * Stores a keyboard button that can be used by a user within a Mini App.
   * Returns a PreparedKeyboardButton object.
   *
   * @see https://corefork.telegram.org/bots/api#savepreparedkeyboardbutton
   */
  savePreparedKeyboardButton(params: SavePreparedKeyboardButtonParams): Promise<PreparedKeyboardButton>

  /**
   * Use this method to edit text, rich and game messages. On success, if the
   * edited message is not an inline message, the edited Message is returned,
   * otherwise True is returned. Note that business messages that were not sent
   * by the bot and do not contain an inline keyboard can only be edited within
   * 48 hours from the time they were sent.
   *
   * @see https://corefork.telegram.org/bots/api#editmessagetext
   */
  editMessageText(params?: EditMessageTextParams): Promise<Message | true>

  /**
   * Use this method to edit captions of messages. On success, if the edited
   * message is not an inline message, the edited Message is returned, otherwise
   * True is returned. Note that business messages that were not sent by the bot
   * and do not contain an inline keyboard can only be edited within 48 hours
   * from the time they were sent.
   *
   * @see https://corefork.telegram.org/bots/api#editmessagecaption
   */
  editMessageCaption(params?: EditMessageCaptionParams): Promise<Message | true>

  /**
   * Use this method to edit animation, audio, document, live photo, photo, or
   * video messages, or to replace a text or a rich message with a media. If a
   * message is part of a message album, then it can be edited only to an audio
   * for audio albums, only to a document for document albums and to a photo, a
   * live photo, or a video otherwise. When an inline message is edited, a new
   * file can't be uploaded; use a previously uploaded file via its file_id or
   * specify a URL. On success, if the edited message is not an inline message,
   * the edited Message is returned, otherwise True is returned. Note that
   * business messages that were not sent by the bot and do not contain an inline
   * keyboard can only be edited within 48 hours from the time they were sent.
   *
   * @see https://corefork.telegram.org/bots/api#editmessagemedia
   */
  editMessageMedia(params: EditMessageMediaParams): Promise<Message | true>

  /**
   * Use this method to edit live location messages. A location can be edited
   * until its live_period expires or editing is explicitly disabled by a call to
   * stopMessageLiveLocation. On success, if the edited message is not an inline
   * message, the edited Message is returned, otherwise True is returned.
   *
   * @see https://corefork.telegram.org/bots/api#editmessagelivelocation
   */
  editMessageLiveLocation(params: EditMessageLiveLocationParams): Promise<Message | true>

  /**
   * Use this method to stop updating a live location message before live_period
   * expires. On success, if the message is not an inline message, the edited
   * Message is returned, otherwise True is returned.
   *
   * @see https://corefork.telegram.org/bots/api#stopmessagelivelocation
   */
  stopMessageLiveLocation(params?: StopMessageLiveLocationParams): Promise<Message | true>

  /**
   * Use this method to edit a checklist on behalf of a connected business
   * account. On success, the edited Message is returned.
   *
   * @see https://corefork.telegram.org/bots/api#editmessagechecklist
   */
  editMessageChecklist(params: EditMessageChecklistParams): Promise<Message>

  /**
   * Use this method to edit only the reply markup of messages. On success, if
   * the edited message is not an inline message, the edited Message is returned,
   * otherwise True is returned. Note that business messages that were not sent
   * by the bot and do not contain an inline keyboard can only be edited within
   * 48 hours from the time they were sent.
   *
   * @see https://corefork.telegram.org/bots/api#editmessagereplymarkup
   */
  editMessageReplyMarkup(params?: EditMessageReplyMarkupParams): Promise<Message | true>

  /**
   * Use this method to stop a poll which was sent by the bot. On success, the
   * stopped Poll is returned.
   *
   * @see https://corefork.telegram.org/bots/api#stoppoll
   */
  stopPoll(params: StopPollParams): Promise<Poll>

  /**
   * Use this method to edit an ephemeral text message. Note that it is not
   * guaranteed that the user will receive the message edit event, especially if
   * they are offline. On success, True is returned.
   *
   * @see https://corefork.telegram.org/bots/api#editephemeralmessagetext
   */
  editEphemeralMessageText(params: EditEphemeralMessageTextParams): Promise<true>

  /**
   * Use this method to edit the media of an ephemeral message. Note that it is
   * not guaranteed that the user will receive the message edit event, especially
   * if they are offline. On success, True is returned.
   *
   * @see https://corefork.telegram.org/bots/api#editephemeralmessagemedia
   */
  editEphemeralMessageMedia(params: EditEphemeralMessageMediaParams): Promise<true>

  /**
   * Use this method to edit the caption of an ephemeral message. Note that it is
   * not guaranteed that the user will receive the message edit event, especially
   * if they are offline. On success, True is returned.
   *
   * @see https://corefork.telegram.org/bots/api#editephemeralmessagecaption
   */
  editEphemeralMessageCaption(params: EditEphemeralMessageCaptionParams): Promise<true>

  /**
   * Use this method to edit only the reply markup of an ephemeral message. Note
   * that it is not guaranteed that the user will receive the message edit event,
   * especially if they are offline. On success, True is returned.
   *
   * @see https://corefork.telegram.org/bots/api#editephemeralmessagereplymarkup
   */
  editEphemeralMessageReplyMarkup(params: EditEphemeralMessageReplyMarkupParams): Promise<true>

  /**
   * Use this method to approve a suggested post in a direct messages chat. The
   * bot must have the 'can_post_messages' administrator right in the
   * corresponding channel chat. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#approvesuggestedpost
   */
  approveSuggestedPost(params: ApproveSuggestedPostParams): Promise<true>

  /**
   * Use this method to decline a suggested post in a direct messages chat. The
   * bot must have the 'can_manage_direct_messages' administrator right in the
   * corresponding channel chat. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#declinesuggestedpost
   */
  declineSuggestedPost(params: DeclineSuggestedPostParams): Promise<true>

  /**
   * Use this method to delete a message, including service messages, with the
   * following limitations: - A message can only be deleted if it was sent less
   * than 48 hours ago. - Service messages about a supergroup, channel, or forum
   * topic creation can't be deleted. - A dice message in a private chat can only
   * be deleted if it was sent more than 24 hours ago. - Bots can delete outgoing
   * messages in private chats, groups, and supergroups. - Bots can delete
   * incoming messages in private chats. - Bots granted can_post_messages
   * permissions can delete outgoing messages in channels. - If the bot is an
   * administrator of a group, it can delete any message there. - If the bot has
   * can_delete_messages administrator right in a supergroup or a channel, it can
   * delete any message there. - If the bot has can_manage_direct_messages
   * administrator right in a channel, it can delete any message in the
   * corresponding direct messages chat. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#deletemessage
   */
  deleteMessage(params: DeleteMessageParams): Promise<true>

  /**
   * Use this method to delete multiple messages simultaneously. If some of the
   * specified messages can't be found, they are skipped. Returns True on
   * success.
   *
   * @see https://corefork.telegram.org/bots/api#deletemessages
   */
  deleteMessages(params: DeleteMessagesParams): Promise<true>

  /**
   * Use this method to delete an ephemeral message. Note that it is not
   * guaranteed that the user will receive the message deletion event, especially
   * if they are offline. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#deleteephemeralmessage
   */
  deleteEphemeralMessage(params: DeleteEphemeralMessageParams): Promise<true>

  /**
   * Use this method to remove a reaction from a message in a group or a
   * supergroup chat. The bot must have the 'can_delete_messages' administrator
   * right in the chat. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#deletemessagereaction
   */
  deleteMessageReaction(params: DeleteMessageReactionParams): Promise<true>

  /**
   * Use this method to remove up to 10000 recent reactions in a group or a
   * supergroup chat added by a given user or chat. The bot must have the
   * 'can_delete_messages' administrator right in the chat. Returns True on
   * success.
   *
   * @see https://corefork.telegram.org/bots/api#deleteallmessagereactions
   */
  deleteAllMessageReactions(params: DeleteAllMessageReactionsParams): Promise<true>

  /**
   * Use this method to send static .WEBP, animated .TGS, or video .WEBM
   * stickers. On success, the sent Message is returned.
   *
   * @see https://corefork.telegram.org/bots/api#sendsticker
   */
  sendSticker(params: SendStickerParams): Promise<Message>

  /**
   * Use this method to get a sticker set. On success, a StickerSet object is
   * returned.
   *
   * @see https://corefork.telegram.org/bots/api#getstickerset
   */
  getStickerSet(params: GetStickerSetParams): Promise<StickerSet>

  /**
   * Use this method to get information about custom emoji stickers by their
   * identifiers. Returns an Array of Sticker objects.
   *
   * @see https://corefork.telegram.org/bots/api#getcustomemojistickers
   */
  getCustomEmojiStickers(params: GetCustomEmojiStickersParams): Promise<Sticker[]>

  /**
   * Use this method to upload a file with a sticker for later use in the
   * createNewStickerSet, addStickerToSet, or replaceStickerInSet methods (the
   * file can be used multiple times). Returns the uploaded File on success.
   *
   * @see https://corefork.telegram.org/bots/api#uploadstickerfile
   */
  uploadStickerFile(params: UploadStickerFileParams): Promise<File>

  /**
   * Use this method to create a new sticker set owned by a user. The bot will be
   * able to edit the sticker set thus created. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#createnewstickerset
   */
  createNewStickerSet(params: CreateNewStickerSetParams): Promise<true>

  /**
   * Use this method to add a new sticker to a set created by the bot. Emoji
   * sticker sets can have up to 200 stickers. Other sticker sets can have up to
   * 120 stickers. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#addstickertoset
   */
  addStickerToSet(params: AddStickerToSetParams): Promise<true>

  /**
   * Use this method to move a sticker in a set created by the bot to a specific
   * position. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setstickerpositioninset
   */
  setStickerPositionInSet(params: SetStickerPositionInSetParams): Promise<true>

  /**
   * Use this method to delete a sticker from a set created by the bot. Returns
   * True on success.
   *
   * @see https://corefork.telegram.org/bots/api#deletestickerfromset
   */
  deleteStickerFromSet(params: DeleteStickerFromSetParams): Promise<true>

  /**
   * Use this method to replace an existing sticker in a sticker set with a new
   * one. The method is equivalent to calling deleteStickerFromSet, then
   * addStickerToSet, then setStickerPositionInSet. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#replacestickerinset
   */
  replaceStickerInSet(params: ReplaceStickerInSetParams): Promise<true>

  /**
   * Use this method to change the list of emoji assigned to a regular or custom
   * emoji sticker. The sticker must belong to a sticker set created by the bot.
   * Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setstickeremojilist
   */
  setStickerEmojiList(params: SetStickerEmojiListParams): Promise<true>

  /**
   * Use this method to change search keywords assigned to a regular or custom
   * emoji sticker. The sticker must belong to a sticker set created by the bot.
   * Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setstickerkeywords
   */
  setStickerKeywords(params: SetStickerKeywordsParams): Promise<true>

  /**
   * Use this method to change the mask position of a mask sticker. The sticker
   * must belong to a sticker set that was created by the bot. Returns True on
   * success.
   *
   * @see https://corefork.telegram.org/bots/api#setstickermaskposition
   */
  setStickerMaskPosition(params: SetStickerMaskPositionParams): Promise<true>

  /**
   * Use this method to set the title of a created sticker set. Returns True on
   * success.
   *
   * @see https://corefork.telegram.org/bots/api#setstickersettitle
   */
  setStickerSetTitle(params: SetStickerSetTitleParams): Promise<true>

  /**
   * Use this method to set the thumbnail of a regular or mask sticker set. The
   * format of the thumbnail file must match the format of the stickers in the
   * set. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setstickersetthumbnail
   */
  setStickerSetThumbnail(params: SetStickerSetThumbnailParams): Promise<true>

  /**
   * Use this method to set the thumbnail of a custom emoji sticker set. Returns
   * True on success.
   *
   * @see https://corefork.telegram.org/bots/api#setcustomemojistickersetthumbnail
   */
  setCustomEmojiStickerSetThumbnail(params: SetCustomEmojiStickerSetThumbnailParams): Promise<true>

  /**
   * Use this method to delete a sticker set that was created by the bot. Returns
   * True on success.
   *
   * @see https://corefork.telegram.org/bots/api#deletestickerset
   */
  deleteStickerSet(params: DeleteStickerSetParams): Promise<true>

  /**
   * Use this method to send rich messages. If the message contains a block with
   * a media element, then the bot must have the right to send the media to the
   * chat. On success, the sent Message is returned.
   *
   * @see https://corefork.telegram.org/bots/api#sendrichmessage
   */
  sendRichMessage(params: SendRichMessageParams): Promise<Message>

  /**
   * Use this method to stream a partial rich message to a user while the message
   * is being generated. Note that the streamed draft is ephemeral and acts as a
   * temporary 30-second preview - once the output is finalized, you must call
   * sendRichMessage with the complete message to persist it in the user's chat.
   * Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#sendrichmessagedraft
   */
  sendRichMessageDraft(params: SendRichMessageDraftParams): Promise<true>

  /**
   * Use this method to send answers to an inline query. On success, True is
   * returned. No more than 50 results per query are allowed.
   *
   * @see https://corefork.telegram.org/bots/api#answerinlinequery
   */
  answerInlineQuery(params: AnswerInlineQueryParams): Promise<true>

  /**
   * Use this method to send invoices. On success, the sent Message is returned.
   *
   * @see https://corefork.telegram.org/bots/api#sendinvoice
   */
  sendInvoice(params: SendInvoiceParams): Promise<Message>

  /**
   * Use this method to create a link for an invoice. Returns the created invoice
   * link as String on success.
   *
   * @see https://corefork.telegram.org/bots/api#createinvoicelink
   */
  createInvoiceLink(params: CreateInvoiceLinkParams): Promise<string>

  /**
   * If you sent an invoice requesting a shipping address and the parameter
   * is_flexible was specified, the Bot API will send an Update with a
   * shipping_query field to the bot. Use this method to reply to shipping
   * queries. On success, True is returned.
   *
   * @see https://corefork.telegram.org/bots/api#answershippingquery
   */
  answerShippingQuery(params: AnswerShippingQueryParams): Promise<true>

  /**
   * Once the user has confirmed their payment and shipping details, the Bot API
   * sends the final confirmation in the form of an Update with the field
   * pre_checkout_query. Use this method to respond to such pre-checkout queries.
   * On success, True is returned. Note: The Bot API must receive an answer
   * within 10 seconds after the pre-checkout query was sent.
   *
   * @see https://corefork.telegram.org/bots/api#answerprecheckoutquery
   */
  answerPreCheckoutQuery(params: AnswerPreCheckoutQueryParams): Promise<true>

  /**
   * A method to get the current Telegram Stars balance of the bot. Requires no
   * parameters. On success, returns a StarAmount object.
   *
   * @see https://corefork.telegram.org/bots/api#getmystarbalance
   */
  getMyStarBalance(params?: GetMyStarBalanceParams): Promise<StarAmount>

  /**
   * Returns the bot's Telegram Star transactions in chronological order. On
   * success, returns a StarTransactions object.
   *
   * @see https://corefork.telegram.org/bots/api#getstartransactions
   */
  getStarTransactions(params?: GetStarTransactionsParams): Promise<StarTransactions>

  /**
   * Refunds a successful payment in Telegram Stars. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#refundstarpayment
   */
  refundStarPayment(params: RefundStarPaymentParams): Promise<true>

  /**
   * Allows the bot to cancel or re-enable extension of a subscription paid in
   * Telegram Stars. Returns True on success.
   *
   * @see https://corefork.telegram.org/bots/api#edituserstarsubscription
   */
  editUserStarSubscription(params: EditUserStarSubscriptionParams): Promise<true>

  /**
   * Informs a user that some of the Telegram Passport elements they provided
   * contains errors. The user will not be able to re-submit their Passport to
   * you until the errors are fixed (the contents of the field for which you
   * returned the error must change). Returns True on success. Use this if the
   * data submitted by the user doesn't satisfy the standards your service
   * requires for any reason. For example, if a birthday date seems invalid, a
   * submitted document is blurry, a scan shows evidence of tampering, etc.
   * Supply some details in the error message to make sure the user knows how to
   * correct the issues.
   *
   * @see https://corefork.telegram.org/bots/api#setpassportdataerrors
   */
  setPassportDataErrors(params: SetPassportDataErrorsParams): Promise<true>

  /**
   * Use this method to send a game. On success, the sent Message is returned.
   *
   * @see https://corefork.telegram.org/bots/api#sendgame
   */
  sendGame(params: SendGameParams): Promise<Message>

  /**
   * Use this method to set the score of the specified user in a game message. On
   * success, if the message is not an inline message, the Message is returned,
   * otherwise True is returned. Returns an error, if the new score is not
   * greater than the user's current score in the chat and force is False.
   *
   * @see https://corefork.telegram.org/bots/api#setgamescore
   */
  setGameScore(params: SetGameScoreParams): Promise<Message | true>

  /**
   * Use this method to get data for high score tables. Will return the score of
   * the specified user and several of their neighbors in a game. Returns an
   * Array of GameHighScore objects. This method will currently return scores for
   * the target user, plus two of their closest neighbors on each side. Will also
   * return the top three users if the user and their neighbors are not among
   * them. Please note that this behavior is subject to change.
   *
   * @see https://corefork.telegram.org/bots/api#getgamehighscores
   */
  getGameHighScores(params: GetGameHighScoresParams): Promise<GameHighScore[]>
}
