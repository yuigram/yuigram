// GENERATED FILE — do not edit.
// TL methods (813)
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type { TlObject } from '../../tl/object.js'
import type * as types from './types/index.js'

/** Methods in the `account` namespace. */
export interface AccountMethods {
  /** `account.acceptAuthorization#f3ed4c73` */
  acceptAuthorization(params: Omit<types.account.AcceptAuthorization, '_'>): Promise<boolean>

  /** `account.cancelPasswordEmail#c1cbd5b6` */
  cancelPasswordEmail(): Promise<boolean>

  /** `account.changeAuthorizationSettings#40f48462` */
  changeAuthorizationSettings(params: Omit<types.account.ChangeAuthorizationSettings, '_'>): Promise<boolean>

  /** `account.changePhone#70c32edb` */
  changePhone(params: Omit<types.account.ChangePhone, '_'>): Promise<types.TypeUser>

  /** `account.checkUsername#2714d86c` */
  checkUsername(params: Omit<types.account.CheckUsername, '_'>): Promise<boolean>

  /** `account.clearRecentEmojiStatuses#18201aae` */
  clearRecentEmojiStatuses(): Promise<boolean>

  /** `account.confirmBotConnection#67ed1f68` */
  confirmBotConnection(params: Omit<types.account.ConfirmBotConnection, '_'>): Promise<boolean>

  /** `account.confirmPasswordEmail#8fdf1920` */
  confirmPasswordEmail(params: Omit<types.account.ConfirmPasswordEmail, '_'>): Promise<boolean>

  /** `account.confirmPhone#5f2178c3` */
  confirmPhone(params: Omit<types.account.ConfirmPhone, '_'>): Promise<boolean>

  /** `account.createBusinessChatLink#8851e68e` */
  createBusinessChatLink(params: Omit<types.account.CreateBusinessChatLink, '_'>): Promise<types.TypeBusinessChatLink>

  /** `account.createTheme#652e4400` */
  createTheme(params: Omit<types.account.CreateTheme, '_'>): Promise<types.TypeTheme>

  /** `account.declinePasswordReset#4c9409f6` */
  declinePasswordReset(): Promise<boolean>

  /** `account.deleteAccount#a2c0cf74` */
  deleteAccount(params: Omit<types.account.DeleteAccount, '_'>): Promise<boolean>

  /** `account.deleteAutoSaveExceptions#53bc0020` */
  deleteAutoSaveExceptions(): Promise<boolean>

  /** `account.deleteBusinessChatLink#60073674` */
  deleteBusinessChatLink(params: Omit<types.account.DeleteBusinessChatLink, '_'>): Promise<boolean>

  /** `account.deletePasskey#f5b5563f` */
  deletePasskey(params: Omit<types.account.DeletePasskey, '_'>): Promise<boolean>

  /** `account.deleteSecureValue#b880bc4b` */
  deleteSecureValue(params: Omit<types.account.DeleteSecureValue, '_'>): Promise<boolean>

  /** `account.deleteWebBrowserSettingsExceptions#86a0765d` */
  deleteWebBrowserSettingsExceptions(): Promise<types.account.TypeWebBrowserSettings>

  /** `account.disablePeerConnectedBot#5e437ed9` */
  disablePeerConnectedBot(params: Omit<types.account.DisablePeerConnectedBot, '_'>): Promise<boolean>

  /** `account.editBusinessChatLink#8c3410af` */
  editBusinessChatLink(params: Omit<types.account.EditBusinessChatLink, '_'>): Promise<types.TypeBusinessChatLink>

  /** `account.finishTakeoutSession#1d2652ee` */
  finishTakeoutSession(params?: Omit<types.account.FinishTakeoutSession, '_'>): Promise<boolean>

  /** `account.getAccountTTL#08fc711d` */
  getAccountTTL(): Promise<types.TypeAccountDaysTTL>

  /** `account.getAllSecureValues#b288bc7d` */
  getAllSecureValues(): Promise<readonly types.TypeSecureValue[]>

  /** `account.getAuthorizationForm#a929597a` */
  getAuthorizationForm(params: Omit<types.account.GetAuthorizationForm, '_'>): Promise<types.account.TypeAuthorizationForm>

  /** `account.getAuthorizations#e320c158` */
  getAuthorizations(): Promise<types.account.TypeAuthorizations>

  /** `account.getAutoDownloadSettings#56da0b3f` */
  getAutoDownloadSettings(): Promise<types.account.TypeAutoDownloadSettings>

  /** `account.getAutoSaveSettings#adcbbcda` */
  getAutoSaveSettings(): Promise<types.account.TypeAutoSaveSettings>

  /** `account.getBotBusinessConnection#76a86270` */
  getBotBusinessConnection(params: Omit<types.account.GetBotBusinessConnection, '_'>): Promise<types.TypeUpdates>

  /** `account.getBusinessChatLinks#6f70dde1` */
  getBusinessChatLinks(): Promise<types.account.TypeBusinessChatLinks>

  /** `account.getChannelDefaultEmojiStatuses#7727a7d5` */
  getChannelDefaultEmojiStatuses(params: Omit<types.account.GetChannelDefaultEmojiStatuses, '_'>): Promise<types.account.TypeEmojiStatuses>

  /** `account.getChannelRestrictedStatusEmojis#35a9e0d5` */
  getChannelRestrictedStatusEmojis(params: Omit<types.account.GetChannelRestrictedStatusEmojis, '_'>): Promise<types.TypeEmojiList>

  /** `account.getChatThemes#d638de89` */
  getChatThemes(params: Omit<types.account.GetChatThemes, '_'>): Promise<types.account.TypeThemes>

  /** `account.getCollectibleEmojiStatuses#2e7b4543` */
  getCollectibleEmojiStatuses(params: Omit<types.account.GetCollectibleEmojiStatuses, '_'>): Promise<types.account.TypeEmojiStatuses>

  /** `account.getConnectedBots#4ea4c80f` */
  getConnectedBots(): Promise<types.account.TypeConnectedBots>

  /** `account.getContactSignUpNotification#9f07c728` */
  getContactSignUpNotification(): Promise<boolean>

  /** `account.getContentSettings#8b9b4dae` */
  getContentSettings(): Promise<types.account.TypeContentSettings>

  /** `account.getDefaultBackgroundEmojis#a60ab9ce` */
  getDefaultBackgroundEmojis(params: Omit<types.account.GetDefaultBackgroundEmojis, '_'>): Promise<types.TypeEmojiList>

  /** `account.getDefaultEmojiStatuses#d6753386` */
  getDefaultEmojiStatuses(params: Omit<types.account.GetDefaultEmojiStatuses, '_'>): Promise<types.account.TypeEmojiStatuses>

  /** `account.getDefaultGroupPhotoEmojis#915860ae` */
  getDefaultGroupPhotoEmojis(params: Omit<types.account.GetDefaultGroupPhotoEmojis, '_'>): Promise<types.TypeEmojiList>

  /** `account.getDefaultProfilePhotoEmojis#e2750328` */
  getDefaultProfilePhotoEmojis(params: Omit<types.account.GetDefaultProfilePhotoEmojis, '_'>): Promise<types.TypeEmojiList>

  /** `account.getGlobalPrivacySettings#eb2b4cf6` */
  getGlobalPrivacySettings(): Promise<types.TypeGlobalPrivacySettings>

  /** `account.getMultiWallPapers#65ad71dc` */
  getMultiWallPapers(params: Omit<types.account.GetMultiWallPapers, '_'>): Promise<readonly types.TypeWallPaper[]>

  /** `account.getNotifyExceptions#53577479` */
  getNotifyExceptions(params?: Omit<types.account.GetNotifyExceptions, '_'>): Promise<types.TypeUpdates>

  /** `account.getNotifySettings#12b3ad31` */
  getNotifySettings(params: Omit<types.account.GetNotifySettings, '_'>): Promise<types.TypePeerNotifySettings>

  /** `account.getPaidMessagesRevenue#19ba4a67` */
  getPaidMessagesRevenue(params: Omit<types.account.GetPaidMessagesRevenue, '_'>): Promise<types.account.TypePaidMessagesRevenue>

  /** `account.getPasskeys#ea1f0c52` */
  getPasskeys(): Promise<types.account.TypePasskeys>

  /** `account.getPassword#548a30f5` */
  getPassword(): Promise<types.account.TypePassword>

  /** `account.getPasswordSettings#9cd4eaf9` */
  getPasswordSettings(params: Omit<types.account.GetPasswordSettings, '_'>): Promise<types.account.TypePasswordSettings>

  /** `account.getPrivacy#dadbc950` */
  getPrivacy(params: Omit<types.account.GetPrivacy, '_'>): Promise<types.account.TypePrivacyRules>

  /** `account.getReactionsNotifySettings#06dd654c` */
  getReactionsNotifySettings(): Promise<types.TypeReactionsNotifySettings>

  /** `account.getRecentEmojiStatuses#0f578105` */
  getRecentEmojiStatuses(params: Omit<types.account.GetRecentEmojiStatuses, '_'>): Promise<types.account.TypeEmojiStatuses>

  /** `account.getSavedMusicIds#e09d5faf` */
  getSavedMusicIds(params: Omit<types.account.GetSavedMusicIds, '_'>): Promise<types.account.TypeSavedMusicIds>

  /** `account.getSavedRingtones#e1902288` */
  getSavedRingtones(params: Omit<types.account.GetSavedRingtones, '_'>): Promise<types.account.TypeSavedRingtones>

  /** `account.getSecureValue#73665bc2` */
  getSecureValue(params: Omit<types.account.GetSecureValue, '_'>): Promise<readonly types.TypeSecureValue[]>

  /** `account.getTheme#3a5869ec` */
  getTheme(params: Omit<types.account.GetTheme, '_'>): Promise<types.TypeTheme>

  /** `account.getThemes#7206e458` */
  getThemes(params: Omit<types.account.GetThemes, '_'>): Promise<types.account.TypeThemes>

  /** `account.getTmpPassword#449e0b51` */
  getTmpPassword(params: Omit<types.account.GetTmpPassword, '_'>): Promise<types.account.TypeTmpPassword>

  /** `account.getUniqueGiftChatThemes#e42ce9c9` */
  getUniqueGiftChatThemes(params: Omit<types.account.GetUniqueGiftChatThemes, '_'>): Promise<types.account.TypeChatThemes>

  /** `account.getWallPaper#fc8ddbea` */
  getWallPaper(params: Omit<types.account.GetWallPaper, '_'>): Promise<types.TypeWallPaper>

  /** `account.getWallPapers#07967d36` */
  getWallPapers(params: Omit<types.account.GetWallPapers, '_'>): Promise<types.account.TypeWallPapers>

  /** `account.getWebAuthorizations#182e6d6f` */
  getWebAuthorizations(): Promise<types.account.TypeWebAuthorizations>

  /** `account.getWebBrowserSettings#56655768` */
  getWebBrowserSettings(params: Omit<types.account.GetWebBrowserSettings, '_'>): Promise<types.account.TypeWebBrowserSettings>

  /** `account.initPasskeyRegistration#429547e8` */
  initPasskeyRegistration(): Promise<types.account.TypePasskeyRegistrationOptions>

  /** `account.initTakeoutSession#8ef3eab0` */
  initTakeoutSession(params?: Omit<types.account.InitTakeoutSession, '_'>): Promise<types.account.TypeTakeout>

  /** `account.installTheme#c727bb3b` */
  installTheme(params?: Omit<types.account.InstallTheme, '_'>): Promise<boolean>

  /** `account.installWallPaper#feed5769` */
  installWallPaper(params: Omit<types.account.InstallWallPaper, '_'>): Promise<boolean>

  /** `account.invalidateSignInCodes#ca8ae8ba` */
  invalidateSignInCodes(params: Omit<types.account.InvalidateSignInCodes, '_'>): Promise<boolean>

  /** `account.registerDevice#ec86017a` */
  registerDevice(params: Omit<types.account.RegisterDevice, '_'>): Promise<boolean>

  /** `account.registerPasskey#55b41fd6` */
  registerPasskey(params: Omit<types.account.RegisterPasskey, '_'>): Promise<types.TypePasskey>

  /** `account.reorderUsernames#ef500eab` */
  reorderUsernames(params: Omit<types.account.ReorderUsernames, '_'>): Promise<boolean>

  /** `account.reportPeer#c5ba3d86` */
  reportPeer(params: Omit<types.account.ReportPeer, '_'>): Promise<boolean>

  /** `account.reportProfilePhoto#fa8cc6f5` */
  reportProfilePhoto(params: Omit<types.account.ReportProfilePhoto, '_'>): Promise<boolean>

  /** `account.resendPasswordEmail#7a7f2a15` */
  resendPasswordEmail(): Promise<boolean>

  /** `account.resetAuthorization#df77f3bc` */
  resetAuthorization(params: Omit<types.account.ResetAuthorization, '_'>): Promise<boolean>

  /** `account.resetNotifySettings#db7e1747` */
  resetNotifySettings(): Promise<boolean>

  /** `account.resetPassword#9308ce1b` */
  resetPassword(): Promise<types.account.TypeResetPasswordResult>

  /** `account.resetWallPapers#bb3b9804` */
  resetWallPapers(): Promise<boolean>

  /** `account.resetWebAuthorization#2d01b9ef` */
  resetWebAuthorization(params: Omit<types.account.ResetWebAuthorization, '_'>): Promise<boolean>

  /** `account.resetWebAuthorizations#682d2594` */
  resetWebAuthorizations(): Promise<boolean>

  /** `account.resolveBusinessChatLink#5492e5ee` */
  resolveBusinessChatLink(params: Omit<types.account.ResolveBusinessChatLink, '_'>): Promise<types.account.TypeResolvedBusinessChatLinks>

  /** `account.saveAutoDownloadSettings#76f36233` */
  saveAutoDownloadSettings(params: Omit<types.account.SaveAutoDownloadSettings, '_'>): Promise<boolean>

  /** `account.saveAutoSaveSettings#d69b8361` */
  saveAutoSaveSettings(params: Omit<types.account.SaveAutoSaveSettings, '_'>): Promise<boolean>

  /** `account.saveMusic#b26732a9` */
  saveMusic(params: Omit<types.account.SaveMusic, '_'>): Promise<boolean>

  /** `account.saveRingtone#3dea5b03` */
  saveRingtone(params: Omit<types.account.SaveRingtone, '_'>): Promise<types.account.TypeSavedRingtone>

  /** `account.saveSecureValue#899fe31d` */
  saveSecureValue(params: Omit<types.account.SaveSecureValue, '_'>): Promise<types.TypeSecureValue>

  /** `account.saveTheme#f257106c` */
  saveTheme(params: Omit<types.account.SaveTheme, '_'>): Promise<boolean>

  /** `account.saveWallPaper#6c5a5b37` */
  saveWallPaper(params: Omit<types.account.SaveWallPaper, '_'>): Promise<boolean>

  /** `account.sendChangePhoneCode#82574ae5` */
  sendChangePhoneCode(params: Omit<types.account.SendChangePhoneCode, '_'>): Promise<types.auth.TypeSentCode>

  /** `account.sendConfirmPhoneCode#1b3faa88` */
  sendConfirmPhoneCode(params: Omit<types.account.SendConfirmPhoneCode, '_'>): Promise<types.auth.TypeSentCode>

  /** `account.sendVerifyEmailCode#98e037bb` */
  sendVerifyEmailCode(params: Omit<types.account.SendVerifyEmailCode, '_'>): Promise<types.account.TypeSentEmailCode>

  /** `account.sendVerifyPhoneCode#a5a356f9` */
  sendVerifyPhoneCode(params: Omit<types.account.SendVerifyPhoneCode, '_'>): Promise<types.auth.TypeSentCode>

  /** `account.setAccountTTL#2442485e` */
  setAccountTTL(params: Omit<types.account.SetAccountTTL, '_'>): Promise<boolean>

  /** `account.setAuthorizationTTL#bf899aa0` */
  setAuthorizationTTL(params: Omit<types.account.SetAuthorizationTTL, '_'>): Promise<boolean>

  /** `account.setContactSignUpNotification#cff43f61` */
  setContactSignUpNotification(params: Omit<types.account.SetContactSignUpNotification, '_'>): Promise<boolean>

  /** `account.setContentSettings#b574b16b` */
  setContentSettings(params?: Omit<types.account.SetContentSettings, '_'>): Promise<boolean>

  /** `account.setGlobalPrivacySettings#1edaaac2` */
  setGlobalPrivacySettings(params: Omit<types.account.SetGlobalPrivacySettings, '_'>): Promise<types.TypeGlobalPrivacySettings>

  /** `account.setMainProfileTab#5dee78b0` */
  setMainProfileTab(params: Omit<types.account.SetMainProfileTab, '_'>): Promise<boolean>

  /** `account.setPrivacy#c9f81ce8` */
  setPrivacy(params: Omit<types.account.SetPrivacy, '_'>): Promise<types.account.TypePrivacyRules>

  /** `account.setReactionsNotifySettings#316ce548` */
  setReactionsNotifySettings(params: Omit<types.account.SetReactionsNotifySettings, '_'>): Promise<types.TypeReactionsNotifySettings>

  /** `account.toggleConnectedBotPaused#646e1097` */
  toggleConnectedBotPaused(params: Omit<types.account.ToggleConnectedBotPaused, '_'>): Promise<boolean>

  /** `account.toggleNoPaidMessagesException#fe2eda76` */
  toggleNoPaidMessagesException(params: Omit<types.account.ToggleNoPaidMessagesException, '_'>): Promise<boolean>

  /** `account.toggleSponsoredMessages#b9d9a38d` */
  toggleSponsoredMessages(params: Omit<types.account.ToggleSponsoredMessages, '_'>): Promise<boolean>

  /** `account.toggleUsername#58d6b376` */
  toggleUsername(params: Omit<types.account.ToggleUsername, '_'>): Promise<boolean>

  /** `account.toggleWebBrowserSettingsException#60ed4229` */
  toggleWebBrowserSettingsException(params: Omit<types.account.ToggleWebBrowserSettingsException, '_'>): Promise<types.TypeUpdates>

  /** `account.unregisterDevice#6a0d3206` */
  unregisterDevice(params: Omit<types.account.UnregisterDevice, '_'>): Promise<boolean>

  /** `account.updateBirthday#cc6e0c11` */
  updateBirthday(params?: Omit<types.account.UpdateBirthday, '_'>): Promise<boolean>

  /** `account.updateBusinessAwayMessage#a26a7fa5` */
  updateBusinessAwayMessage(params?: Omit<types.account.UpdateBusinessAwayMessage, '_'>): Promise<boolean>

  /** `account.updateBusinessGreetingMessage#66cdafc4` */
  updateBusinessGreetingMessage(params?: Omit<types.account.UpdateBusinessGreetingMessage, '_'>): Promise<boolean>

  /** `account.updateBusinessIntro#a614d034` */
  updateBusinessIntro(params?: Omit<types.account.UpdateBusinessIntro, '_'>): Promise<boolean>

  /** `account.updateBusinessLocation#9e6b131a` */
  updateBusinessLocation(params?: Omit<types.account.UpdateBusinessLocation, '_'>): Promise<boolean>

  /** `account.updateBusinessWorkHours#4b00e066` */
  updateBusinessWorkHours(params?: Omit<types.account.UpdateBusinessWorkHours, '_'>): Promise<boolean>

  /** `account.updateColor#684d214e` */
  updateColor(params?: Omit<types.account.UpdateColor, '_'>): Promise<boolean>

  /** `account.updateConnectedBot#66a08c7e` */
  updateConnectedBot(params: Omit<types.account.UpdateConnectedBot, '_'>): Promise<types.TypeUpdates>

  /** `account.updateDeviceLocked#38df3532` */
  updateDeviceLocked(params: Omit<types.account.UpdateDeviceLocked, '_'>): Promise<boolean>

  /** `account.updateEmojiStatus#fbd3de6b` */
  updateEmojiStatus(params: Omit<types.account.UpdateEmojiStatus, '_'>): Promise<boolean>

  /** `account.updateNotifySettings#84be5b93` */
  updateNotifySettings(params: Omit<types.account.UpdateNotifySettings, '_'>): Promise<boolean>

  /** `account.updatePasswordSettings#a59b102f` */
  updatePasswordSettings(params: Omit<types.account.UpdatePasswordSettings, '_'>): Promise<boolean>

  /** `account.updatePersonalChannel#d94305e0` */
  updatePersonalChannel(params: Omit<types.account.UpdatePersonalChannel, '_'>): Promise<boolean>

  /** `account.updateProfile#78515775` */
  updateProfile(params?: Omit<types.account.UpdateProfile, '_'>): Promise<types.TypeUser>

  /** `account.updateStatus#6628562c` */
  updateStatus(params: Omit<types.account.UpdateStatus, '_'>): Promise<boolean>

  /** `account.updateTheme#2bf40ccc` */
  updateTheme(params: Omit<types.account.UpdateTheme, '_'>): Promise<types.TypeTheme>

  /** `account.updateUsername#3e0bdd7c` */
  updateUsername(params: Omit<types.account.UpdateUsername, '_'>): Promise<types.TypeUser>

  /** `account.updateWebBrowserSettings#9adf82fe` */
  updateWebBrowserSettings(params?: Omit<types.account.UpdateWebBrowserSettings, '_'>): Promise<types.account.TypeWebBrowserSettings>

  /** `account.uploadRingtone#831a83a2` */
  uploadRingtone(params: Omit<types.account.UploadRingtone, '_'>): Promise<types.TypeDocument>

  /** `account.uploadTheme#1c3db333` */
  uploadTheme(params: Omit<types.account.UploadTheme, '_'>): Promise<types.TypeDocument>

  /** `account.uploadWallPaper#e39a8f03` */
  uploadWallPaper(params: Omit<types.account.UploadWallPaper, '_'>): Promise<types.TypeWallPaper>

  /** `account.verifyEmail#032da4cf` */
  verifyEmail(params: Omit<types.account.VerifyEmail, '_'>): Promise<types.account.TypeEmailVerified>

  /** `account.verifyPhone#4dd3a7f6` */
  verifyPhone(params: Omit<types.account.VerifyPhone, '_'>): Promise<boolean>
}

/** Methods in the `aicompose` namespace. */
export interface AicomposeMethods {
  /** `aicompose.createTone#4aa83913` */
  createTone(params: Omit<types.aicompose.CreateTone, '_'>): Promise<types.TypeAiComposeTone>

  /** `aicompose.deleteTone#dd39316a` */
  deleteTone(params: Omit<types.aicompose.DeleteTone, '_'>): Promise<boolean>

  /** `aicompose.getTone#b2e8ba03` */
  getTone(params: Omit<types.aicompose.GetTone, '_'>): Promise<types.aicompose.TypeTones>

  /** `aicompose.getToneExample#d1b4ab14` */
  getToneExample(params: Omit<types.aicompose.GetToneExample, '_'>): Promise<types.TypeAiComposeToneExample>

  /** `aicompose.getTones#abd59201` */
  getTones(params: Omit<types.aicompose.GetTones, '_'>): Promise<types.aicompose.TypeTones>

  /** `aicompose.saveTone#1782cbb1` */
  saveTone(params: Omit<types.aicompose.SaveTone, '_'>): Promise<boolean>

  /** `aicompose.updateTone#903bcf59` */
  updateTone(params: Omit<types.aicompose.UpdateTone, '_'>): Promise<types.TypeAiComposeTone>
}

/** Methods in the `auth` namespace. */
export interface AuthMethods {
  /** `auth.acceptLoginToken#e894ad4d` */
  acceptLoginToken(params: Omit<types.auth.AcceptLoginToken, '_'>): Promise<types.TypeAuthorization>

  /** `auth.bindTempAuthKey#cdd42a05` */
  bindTempAuthKey(params: Omit<types.auth.BindTempAuthKey, '_'>): Promise<boolean>

  /** `auth.cancelCode#1f040578` */
  cancelCode(params: Omit<types.auth.CancelCode, '_'>): Promise<boolean>

  /** `auth.checkPaidAuth#56e59f9c` */
  checkPaidAuth(params: Omit<types.auth.CheckPaidAuth, '_'>): Promise<types.auth.TypeSentCode>

  /** `auth.checkPassword#d18b4d16` */
  checkPassword(params: Omit<types.auth.CheckPassword, '_'>): Promise<types.auth.TypeAuthorization>

  /** `auth.checkRecoveryPassword#0d36bf79` */
  checkRecoveryPassword(params: Omit<types.auth.CheckRecoveryPassword, '_'>): Promise<boolean>

  /** `auth.dropTempAuthKeys#8e48a188` */
  dropTempAuthKeys(params: Omit<types.auth.DropTempAuthKeys, '_'>): Promise<boolean>

  /** `auth.exportAuthorization#e5bfffcd` */
  exportAuthorization(params: Omit<types.auth.ExportAuthorization, '_'>): Promise<types.auth.TypeExportedAuthorization>

  /** `auth.exportLoginToken#b7e085fe` */
  exportLoginToken(params: Omit<types.auth.ExportLoginToken, '_'>): Promise<types.auth.TypeLoginToken>

  /** `auth.finishFirebasePnvLogin#2c85094c` */
  finishFirebasePnvLogin(params: Omit<types.auth.FinishFirebasePnvLogin, '_'>): Promise<types.auth.TypeAuthorization>

  /** `auth.finishPasskeyLogin#9857ad07` */
  finishPasskeyLogin(params: Omit<types.auth.FinishPasskeyLogin, '_'>): Promise<types.auth.TypeAuthorization>

  /** `auth.firebasePnvSignUp#783f6b56` */
  firebasePnvSignUp(params: Omit<types.auth.FirebasePnvSignUp, '_'>): Promise<types.auth.TypeAuthorization>

  /** `auth.importAuthorization#a57a7dad` */
  importAuthorization(params: Omit<types.auth.ImportAuthorization, '_'>): Promise<types.auth.TypeAuthorization>

  /** `auth.importBotAuthorization#67a3ff2c` */
  importBotAuthorization(params: Omit<types.auth.ImportBotAuthorization, '_'>): Promise<types.auth.TypeAuthorization>

  /** `auth.importLoginToken#95ac5ce4` */
  importLoginToken(params: Omit<types.auth.ImportLoginToken, '_'>): Promise<types.auth.TypeLoginToken>

  /** `auth.importWebTokenAuthorization#2db873a9` */
  importWebTokenAuthorization(params: Omit<types.auth.ImportWebTokenAuthorization, '_'>): Promise<types.auth.TypeAuthorization>

  /** `auth.initFirebasePnvLogin#777df37a` */
  initFirebasePnvLogin(params: Omit<types.auth.InitFirebasePnvLogin, '_'>): Promise<types.auth.TypeFirebasePnvIntent>

  /** `auth.initPasskeyLogin#518ad0b7` */
  initPasskeyLogin(params: Omit<types.auth.InitPasskeyLogin, '_'>): Promise<types.auth.TypePasskeyLoginOptions>

  /** `auth.logOut#3e72ba19` */
  logOut(): Promise<types.auth.TypeLoggedOut>

  /** `auth.recoverPassword#37096c70` */
  recoverPassword(params: Omit<types.auth.RecoverPassword, '_'>): Promise<types.auth.TypeAuthorization>

  /** `auth.reportMissingCode#cb9deff6` */
  reportMissingCode(params: Omit<types.auth.ReportMissingCode, '_'>): Promise<boolean>

  /** `auth.requestFirebaseSms#8e39261e` */
  requestFirebaseSms(params: Omit<types.auth.RequestFirebaseSms, '_'>): Promise<boolean>

  /** `auth.requestPasswordRecovery#d897bc66` */
  requestPasswordRecovery(): Promise<types.auth.TypePasswordRecovery>

  /** `auth.resendCode#cae47523` */
  resendCode(params: Omit<types.auth.ResendCode, '_'>): Promise<types.auth.TypeSentCode>

  /** `auth.resetAuthorizations#9fab0d1a` */
  resetAuthorizations(): Promise<boolean>

  /** `auth.resetLoginEmail#7e960193` */
  resetLoginEmail(params: Omit<types.auth.ResetLoginEmail, '_'>): Promise<types.auth.TypeSentCode>

  /** `auth.sendCode#a677244f` */
  sendCode(params: Omit<types.auth.SendCode, '_'>): Promise<types.auth.TypeSentCode>

  /** `auth.signIn#8d52a951` */
  signIn(params: Omit<types.auth.SignIn, '_'>): Promise<types.auth.TypeAuthorization>

  /** `auth.signUp#aac7b717` */
  signUp(params: Omit<types.auth.SignUp, '_'>): Promise<types.auth.TypeAuthorization>
}

/** Methods in the `bots` namespace. */
export interface BotsMethods {
  /** `bots.addPreviewMedia#17aeb75a` */
  addPreviewMedia(params: Omit<types.bots.AddPreviewMedia, '_'>): Promise<types.TypeBotPreviewMedia>

  /** `bots.allowSendMessage#f132e3ef` */
  allowSendMessage(params: Omit<types.bots.AllowSendMessage, '_'>): Promise<types.TypeUpdates>

  /** `bots.answerWebhookJSONQuery#e6213f4d` */
  answerWebhookJSONQuery(params: Omit<types.bots.AnswerWebhookJSONQuery, '_'>): Promise<boolean>

  /** `bots.canSendMessage#1359f4e6` */
  canSendMessage(params: Omit<types.bots.CanSendMessage, '_'>): Promise<boolean>

  /** `bots.checkDownloadFileParams#50077589` */
  checkDownloadFileParams(params: Omit<types.bots.CheckDownloadFileParams, '_'>): Promise<boolean>

  /** `bots.checkUsername#87f2219b` */
  checkUsername(params: Omit<types.bots.CheckUsername, '_'>): Promise<boolean>

  /** `bots.createBot#e5b17f2b` */
  createBot(params: Omit<types.bots.CreateBot, '_'>): Promise<types.TypeUser>

  /** `bots.deletePreviewMedia#2d0135b3` */
  deletePreviewMedia(params: Omit<types.bots.DeletePreviewMedia, '_'>): Promise<boolean>

  /** `bots.editAccessSettings#31813cd8` */
  editAccessSettings(params: Omit<types.bots.EditAccessSettings, '_'>): Promise<boolean>

  /** `bots.editPreviewMedia#8525606f` */
  editPreviewMedia(params: Omit<types.bots.EditPreviewMedia, '_'>): Promise<types.TypeBotPreviewMedia>

  /** `bots.exportBotToken#bd0d99eb` */
  exportBotToken(params: Omit<types.bots.ExportBotToken, '_'>): Promise<types.bots.TypeExportedBotToken>

  /** `bots.getAccessSettings#213853a3` */
  getAccessSettings(params: Omit<types.bots.GetAccessSettings, '_'>): Promise<types.bots.TypeAccessSettings>

  /** `bots.getAdminedBots#b0711d83` */
  getAdminedBots(): Promise<readonly types.TypeUser[]>

  /** `bots.getBotCommands#e34c0dd6` */
  getBotCommands(params: Omit<types.bots.GetBotCommands, '_'>): Promise<readonly types.TypeBotCommand[]>

  /** `bots.getBotInfo#dcd914fd` */
  getBotInfo(params: Omit<types.bots.GetBotInfo, '_'>): Promise<types.bots.TypeBotInfo>

  /** `bots.getBotMenuButton#9c60eb28` */
  getBotMenuButton(params: Omit<types.bots.GetBotMenuButton, '_'>): Promise<types.TypeBotMenuButton>

  /** `bots.getBotRecommendations#a1b70815` */
  getBotRecommendations(params: Omit<types.bots.GetBotRecommendations, '_'>): Promise<types.users.TypeUsers>

  /** `bots.getPopularAppBots#c2510192` */
  getPopularAppBots(params: Omit<types.bots.GetPopularAppBots, '_'>): Promise<types.bots.TypePopularAppBots>

  /** `bots.getPreviewInfo#423ab3ad` */
  getPreviewInfo(params: Omit<types.bots.GetPreviewInfo, '_'>): Promise<types.bots.TypePreviewInfo>

  /** `bots.getPreviewMedias#a2a5594d` */
  getPreviewMedias(params: Omit<types.bots.GetPreviewMedias, '_'>): Promise<readonly types.TypeBotPreviewMedia[]>

  /** `bots.getRequestedWebViewButton#bf25b7f3` */
  getRequestedWebViewButton(params: Omit<types.bots.GetRequestedWebViewButton, '_'>): Promise<types.TypeKeyboardButton>

  /** `bots.invokeWebViewCustomMethod#087fc5e7` */
  invokeWebViewCustomMethod(params: Omit<types.bots.InvokeWebViewCustomMethod, '_'>): Promise<types.TypeDataJSON>

  /** `bots.reorderPreviewMedias#b627f3aa` */
  reorderPreviewMedias(params: Omit<types.bots.ReorderPreviewMedias, '_'>): Promise<boolean>

  /** `bots.reorderUsernames#9709b1c2` */
  reorderUsernames(params: Omit<types.bots.ReorderUsernames, '_'>): Promise<boolean>

  /** `bots.requestWebViewButton#31a2a35e` */
  requestWebViewButton(params: Omit<types.bots.RequestWebViewButton, '_'>): Promise<types.bots.TypeRequestedButton>

  /** `bots.resetBotCommands#3d8de0f9` */
  resetBotCommands(params: Omit<types.bots.ResetBotCommands, '_'>): Promise<boolean>

  /** `bots.sendCustomRequest#aa2769ed` */
  sendCustomRequest(params: Omit<types.bots.SendCustomRequest, '_'>): Promise<types.TypeDataJSON>

  /** `bots.setBotBroadcastDefaultAdminRights#788464e1` */
  setBotBroadcastDefaultAdminRights(params: Omit<types.bots.SetBotBroadcastDefaultAdminRights, '_'>): Promise<boolean>

  /** `bots.setBotCommands#0517165a` */
  setBotCommands(params: Omit<types.bots.SetBotCommands, '_'>): Promise<boolean>

  /** `bots.setBotGroupDefaultAdminRights#925ec9ea` */
  setBotGroupDefaultAdminRights(params: Omit<types.bots.SetBotGroupDefaultAdminRights, '_'>): Promise<boolean>

  /** `bots.setBotInfo#10cf3123` */
  setBotInfo(params: Omit<types.bots.SetBotInfo, '_'>): Promise<boolean>

  /** `bots.setBotMenuButton#4504d54f` */
  setBotMenuButton(params: Omit<types.bots.SetBotMenuButton, '_'>): Promise<boolean>

  /** `bots.setCustomVerification#8b89dfbd` */
  setCustomVerification(params: Omit<types.bots.SetCustomVerification, '_'>): Promise<boolean>

  /** `bots.setJoinChatResults#e71a4810` */
  setJoinChatResults(params: Omit<types.bots.SetJoinChatResults, '_'>): Promise<boolean>

  /** `bots.toggleUserEmojiStatusPermission#06de6392` */
  toggleUserEmojiStatusPermission(params: Omit<types.bots.ToggleUserEmojiStatusPermission, '_'>): Promise<boolean>

  /** `bots.toggleUsername#053ca973` */
  toggleUsername(params: Omit<types.bots.ToggleUsername, '_'>): Promise<boolean>

  /** `bots.updateStarRefProgram#778b5ab3` */
  updateStarRefProgram(params: Omit<types.bots.UpdateStarRefProgram, '_'>): Promise<types.TypeStarRefProgram>

  /** `bots.updateUserEmojiStatus#ed9f30c5` */
  updateUserEmojiStatus(params: Omit<types.bots.UpdateUserEmojiStatus, '_'>): Promise<boolean>
}

/** Methods in the `channels` namespace. */
export interface ChannelsMethods {
  /** `channels.checkSearchPostsFlood#22567115` */
  checkSearchPostsFlood(params?: Omit<types.channels.CheckSearchPostsFlood, '_'>): Promise<types.TypeSearchPostsFlood>

  /** `channels.checkUsername#10e6bd2c` */
  checkUsername(params: Omit<types.channels.CheckUsername, '_'>): Promise<boolean>

  /** `channels.convertToGigagroup#0b290c69` */
  convertToGigagroup(params: Omit<types.channels.ConvertToGigagroup, '_'>): Promise<types.TypeUpdates>

  /** `channels.createChannel#91006707` */
  createChannel(params: Omit<types.channels.CreateChannel, '_'>): Promise<types.TypeUpdates>

  /** `channels.deactivateAllUsernames#0a245dd3` */
  deactivateAllUsernames(params: Omit<types.channels.DeactivateAllUsernames, '_'>): Promise<boolean>

  /** `channels.deleteChannel#c0111fe3` */
  deleteChannel(params: Omit<types.channels.DeleteChannel, '_'>): Promise<types.TypeUpdates>

  /** `channels.deleteHistory#9baa9647` */
  deleteHistory(params: Omit<types.channels.DeleteHistory, '_'>): Promise<types.TypeUpdates>

  /** `channels.deleteMessages#84c1fd4e` */
  deleteMessages(params: Omit<types.channels.DeleteMessages, '_'>): Promise<types.messages.TypeAffectedMessages>

  /** `channels.deleteParticipantHistory#367544db` */
  deleteParticipantHistory(params: Omit<types.channels.DeleteParticipantHistory, '_'>): Promise<types.messages.TypeAffectedHistory>

  /** `channels.editAdmin#9a98ad68` */
  editAdmin(params: Omit<types.channels.EditAdmin, '_'>): Promise<types.TypeUpdates>

  /** `channels.editBanned#96e6cd81` */
  editBanned(params: Omit<types.channels.EditBanned, '_'>): Promise<types.TypeUpdates>

  /** `channels.editLocation#58e63f6d` */
  editLocation(params: Omit<types.channels.EditLocation, '_'>): Promise<boolean>

  /** `channels.editPhoto#f12e57c9` */
  editPhoto(params: Omit<types.channels.EditPhoto, '_'>): Promise<types.TypeUpdates>

  /** `channels.editTitle#566decd0` */
  editTitle(params: Omit<types.channels.EditTitle, '_'>): Promise<types.TypeUpdates>

  /** `channels.exportMessageLink#e63fadeb` */
  exportMessageLink(params: Omit<types.channels.ExportMessageLink, '_'>): Promise<types.TypeExportedMessageLink>

  /** `channels.getAdminLog#33ddf480` */
  getAdminLog(params: Omit<types.channels.GetAdminLog, '_'>): Promise<types.channels.TypeAdminLogResults>

  /** `channels.getAdminedPublicChannels#f8b036af` */
  getAdminedPublicChannels(params?: Omit<types.channels.GetAdminedPublicChannels, '_'>): Promise<types.messages.TypeChats>

  /** `channels.getChannelRecommendations#25a71742` */
  getChannelRecommendations(params?: Omit<types.channels.GetChannelRecommendations, '_'>): Promise<types.messages.TypeChats>

  /** `channels.getChannels#0a7f6bbb` */
  getChannels(params: Omit<types.channels.GetChannels, '_'>): Promise<types.messages.TypeChats>

  /** `channels.getFullChannel#08736a09` */
  getFullChannel(params: Omit<types.channels.GetFullChannel, '_'>): Promise<types.messages.TypeChatFull>

  /** `channels.getGroupsForDiscussion#f5dad378` */
  getGroupsForDiscussion(): Promise<types.messages.TypeChats>

  /** `channels.getInactiveChannels#11e831ee` */
  getInactiveChannels(): Promise<types.messages.TypeInactiveChats>

  /** `channels.getLeftChannels#8341ecc0` */
  getLeftChannels(params: Omit<types.channels.GetLeftChannels, '_'>): Promise<types.messages.TypeChats>

  /** `channels.getMessageAuthor#ece2a0e6` */
  getMessageAuthor(params: Omit<types.channels.GetMessageAuthor, '_'>): Promise<types.TypeUser>

  /** `channels.getMessages#ad8c9a23` */
  getMessages(params: Omit<types.channels.GetMessages, '_'>): Promise<types.messages.TypeMessages>

  /** `channels.getParticipant#a0ab6cc6` */
  getParticipant(params: Omit<types.channels.GetParticipant, '_'>): Promise<types.channels.TypeChannelParticipant>

  /** `channels.getParticipants#77ced9d0` */
  getParticipants(params: Omit<types.channels.GetParticipants, '_'>): Promise<types.channels.TypeChannelParticipants>

  /** `channels.getSendAs#e785a43f` */
  getSendAs(params: Omit<types.channels.GetSendAs, '_'>): Promise<types.channels.TypeSendAsPeers>

  /** `channels.inviteToChannel#c9e33d54` */
  inviteToChannel(params: Omit<types.channels.InviteToChannel, '_'>): Promise<types.messages.TypeInvitedUsers>

  /** `channels.joinChannel#7f6a1e22` */
  joinChannel(params: Omit<types.channels.JoinChannel, '_'>): Promise<types.messages.TypeChatInviteJoinResult>

  /** `channels.leaveChannel#f836aa95` */
  leaveChannel(params: Omit<types.channels.LeaveChannel, '_'>): Promise<types.TypeUpdates>

  /** `channels.readHistory#cc104937` */
  readHistory(params: Omit<types.channels.ReadHistory, '_'>): Promise<boolean>

  /** `channels.readMessageContents#eab5dc38` */
  readMessageContents(params: Omit<types.channels.ReadMessageContents, '_'>): Promise<boolean>

  /** `channels.reorderUsernames#b45ced1d` */
  reorderUsernames(params: Omit<types.channels.ReorderUsernames, '_'>): Promise<boolean>

  /** `channels.reportAntiSpamFalsePositive#a850a693` */
  reportAntiSpamFalsePositive(params: Omit<types.channels.ReportAntiSpamFalsePositive, '_'>): Promise<boolean>

  /** `channels.reportSpam#f44a8315` */
  reportSpam(params: Omit<types.channels.ReportSpam, '_'>): Promise<boolean>

  /** `channels.restrictSponsoredMessages#9ae91519` */
  restrictSponsoredMessages(params: Omit<types.channels.RestrictSponsoredMessages, '_'>): Promise<types.TypeUpdates>

  /** `channels.searchPosts#f2c4f24d` */
  searchPosts(params: Omit<types.channels.SearchPosts, '_'>): Promise<types.messages.TypeMessages>

  /** `channels.setBoostsToUnblockRestrictions#ad399cee` */
  setBoostsToUnblockRestrictions(params: Omit<types.channels.SetBoostsToUnblockRestrictions, '_'>): Promise<types.TypeUpdates>

  /** `channels.setDiscussionGroup#40582bb2` */
  setDiscussionGroup(params: Omit<types.channels.SetDiscussionGroup, '_'>): Promise<boolean>

  /** `channels.setEmojiStickers#3cd930b7` */
  setEmojiStickers(params: Omit<types.channels.SetEmojiStickers, '_'>): Promise<boolean>

  /** `channels.setMainProfileTab#3583fcb1` */
  setMainProfileTab(params: Omit<types.channels.SetMainProfileTab, '_'>): Promise<boolean>

  /** `channels.setStickers#ea8ca4f9` */
  setStickers(params: Omit<types.channels.SetStickers, '_'>): Promise<boolean>

  /** `channels.toggleAntiSpam#68f3e4eb` */
  toggleAntiSpam(params: Omit<types.channels.ToggleAntiSpam, '_'>): Promise<types.TypeUpdates>

  /** `channels.toggleAutotranslation#167fc0a1` */
  toggleAutotranslation(params: Omit<types.channels.ToggleAutotranslation, '_'>): Promise<types.TypeUpdates>

  /** `channels.toggleForum#3ff75734` */
  toggleForum(params: Omit<types.channels.ToggleForum, '_'>): Promise<types.TypeUpdates>

  /** `channels.toggleJoinRequest#0ecc2618` */
  toggleJoinRequest(params: Omit<types.channels.ToggleJoinRequest, '_'>): Promise<types.TypeUpdates>

  /** `channels.toggleJoinToSend#e4cb9580` */
  toggleJoinToSend(params: Omit<types.channels.ToggleJoinToSend, '_'>): Promise<types.TypeUpdates>

  /** `channels.toggleParticipantsHidden#6a6e7854` */
  toggleParticipantsHidden(params: Omit<types.channels.ToggleParticipantsHidden, '_'>): Promise<types.TypeUpdates>

  /** `channels.togglePreHistoryHidden#eabbb94c` */
  togglePreHistoryHidden(params: Omit<types.channels.TogglePreHistoryHidden, '_'>): Promise<types.TypeUpdates>

  /** `channels.toggleSignatures#418d549c` */
  toggleSignatures(params: Omit<types.channels.ToggleSignatures, '_'>): Promise<types.TypeUpdates>

  /** `channels.toggleSlowMode#edd49ef0` */
  toggleSlowMode(params: Omit<types.channels.ToggleSlowMode, '_'>): Promise<types.TypeUpdates>

  /** `channels.toggleUsername#50f24105` */
  toggleUsername(params: Omit<types.channels.ToggleUsername, '_'>): Promise<boolean>

  /** `channels.toggleViewForumAsMessages#9738bb15` */
  toggleViewForumAsMessages(params: Omit<types.channels.ToggleViewForumAsMessages, '_'>): Promise<types.TypeUpdates>

  /** `channels.updateColor#d8aa3671` */
  updateColor(params: Omit<types.channels.UpdateColor, '_'>): Promise<types.TypeUpdates>

  /** `channels.updateEmojiStatus#f0d3e6a8` */
  updateEmojiStatus(params: Omit<types.channels.UpdateEmojiStatus, '_'>): Promise<types.TypeUpdates>

  /** `channels.updatePaidMessagesPrice#4b12327b` */
  updatePaidMessagesPrice(params: Omit<types.channels.UpdatePaidMessagesPrice, '_'>): Promise<types.TypeUpdates>

  /** `channels.updateUsername#3514b3de` */
  updateUsername(params: Omit<types.channels.UpdateUsername, '_'>): Promise<boolean>
}

/** Methods in the `chatlists` namespace. */
export interface ChatlistsMethods {
  /** `chatlists.checkChatlistInvite#41c10fff` */
  checkChatlistInvite(params: Omit<types.chatlists.CheckChatlistInvite, '_'>): Promise<types.chatlists.TypeChatlistInvite>

  /** `chatlists.deleteExportedInvite#719c5c5e` */
  deleteExportedInvite(params: Omit<types.chatlists.DeleteExportedInvite, '_'>): Promise<boolean>

  /** `chatlists.editExportedInvite#653db63d` */
  editExportedInvite(params: Omit<types.chatlists.EditExportedInvite, '_'>): Promise<types.TypeExportedChatlistInvite>

  /** `chatlists.exportChatlistInvite#8472478e` */
  exportChatlistInvite(params: Omit<types.chatlists.ExportChatlistInvite, '_'>): Promise<types.chatlists.TypeExportedChatlistInvite>

  /** `chatlists.getChatlistUpdates#89419521` */
  getChatlistUpdates(params: Omit<types.chatlists.GetChatlistUpdates, '_'>): Promise<types.chatlists.TypeChatlistUpdates>

  /** `chatlists.getExportedInvites#ce03da83` */
  getExportedInvites(params: Omit<types.chatlists.GetExportedInvites, '_'>): Promise<types.chatlists.TypeExportedInvites>

  /** `chatlists.getLeaveChatlistSuggestions#fdbcd714` */
  getLeaveChatlistSuggestions(params: Omit<types.chatlists.GetLeaveChatlistSuggestions, '_'>): Promise<readonly types.TypePeer[]>

  /** `chatlists.hideChatlistUpdates#66e486fb` */
  hideChatlistUpdates(params: Omit<types.chatlists.HideChatlistUpdates, '_'>): Promise<boolean>

  /** `chatlists.joinChatlistInvite#a6b1e39a` */
  joinChatlistInvite(params: Omit<types.chatlists.JoinChatlistInvite, '_'>): Promise<types.TypeUpdates>

  /** `chatlists.joinChatlistUpdates#e089f8f5` */
  joinChatlistUpdates(params: Omit<types.chatlists.JoinChatlistUpdates, '_'>): Promise<types.TypeUpdates>

  /** `chatlists.leaveChatlist#74fae13a` */
  leaveChatlist(params: Omit<types.chatlists.LeaveChatlist, '_'>): Promise<types.TypeUpdates>
}

/** Methods in the `communities` namespace. */
export interface CommunitiesMethods {
  /** `communities.create#a63859ec` */
  create(params: Omit<types.communities.Create, '_'>): Promise<types.TypeUpdates>

  /** `communities.getJoinedCommunities#a663e830` */
  getJoinedCommunities(): Promise<types.messages.TypeChats>

  /** `communities.getParticipantJoinedChats#f87eabab` */
  getParticipantJoinedChats(params: Omit<types.communities.GetParticipantJoinedChats, '_'>): Promise<types.communities.TypeParticipantJoinedChats>

  /** `communities.getPeerLinkRequests#93773344` */
  getPeerLinkRequests(params: Omit<types.communities.GetPeerLinkRequests, '_'>): Promise<types.communities.TypePeerLinkRequests>

  /** `communities.toggleAllPeerLinkRequestApproval#bfe3dd3d` */
  toggleAllPeerLinkRequestApproval(params: Omit<types.communities.ToggleAllPeerLinkRequestApproval, '_'>): Promise<boolean>

  /** `communities.toggleCommunityCollapsedInDialogs#d766e3ea` */
  toggleCommunityCollapsedInDialogs(params: Omit<types.communities.ToggleCommunityCollapsedInDialogs, '_'>): Promise<types.TypeUpdates>

  /** `communities.toggleParticipantBanned#9967ad0f` */
  toggleParticipantBanned(params: Omit<types.communities.ToggleParticipantBanned, '_'>): Promise<boolean>

  /** `communities.togglePeerLink#736dcfea` */
  togglePeerLink(params: Omit<types.communities.TogglePeerLink, '_'>): Promise<boolean>

  /** `communities.togglePeerLinkRequestApproval#8c8219a8` */
  togglePeerLinkRequestApproval(params: Omit<types.communities.TogglePeerLinkRequestApproval, '_'>): Promise<boolean>
}

/** Methods in the `contacts` namespace. */
export interface ContactsMethods {
  /** `contacts.acceptContact#f831a20f` */
  acceptContact(params: Omit<types.contacts.AcceptContact, '_'>): Promise<types.TypeUpdates>

  /** `contacts.addContact#d9ba2e54` */
  addContact(params: Omit<types.contacts.AddContact, '_'>): Promise<types.TypeUpdates>

  /** `contacts.block#2e2e8734` */
  block(params: Omit<types.contacts.Block, '_'>): Promise<boolean>

  /** `contacts.blockFromReplies#29a8962c` */
  blockFromReplies(params: Omit<types.contacts.BlockFromReplies, '_'>): Promise<types.TypeUpdates>

  /** `contacts.deleteByPhones#1013fd9e` */
  deleteByPhones(params: Omit<types.contacts.DeleteByPhones, '_'>): Promise<boolean>

  /** `contacts.deleteContacts#096a0e00` */
  deleteContacts(params: Omit<types.contacts.DeleteContacts, '_'>): Promise<types.TypeUpdates>

  /** `contacts.editCloseFriends#ba6705f0` */
  editCloseFriends(params: Omit<types.contacts.EditCloseFriends, '_'>): Promise<boolean>

  /** `contacts.exportContactToken#f8654027` */
  exportContactToken(): Promise<types.TypeExportedContactToken>

  /** `contacts.getBirthdays#daeda864` */
  getBirthdays(): Promise<types.contacts.TypeContactBirthdays>

  /** `contacts.getBlocked#9a868f80` */
  getBlocked(params: Omit<types.contacts.GetBlocked, '_'>): Promise<types.contacts.TypeBlocked>

  /** `contacts.getContactIDs#7adc669d` */
  getContactIDs(params: Omit<types.contacts.GetContactIDs, '_'>): Promise<readonly number[]>

  /** `contacts.getContacts#5dd69e12` */
  getContacts(params: Omit<types.contacts.GetContacts, '_'>): Promise<types.contacts.TypeContacts>

  /** `contacts.getLocated#d348bc44` */
  getLocated(params: Omit<types.contacts.GetLocated, '_'>): Promise<types.TypeUpdates>

  /** `contacts.getSaved#82f1e39f` */
  getSaved(): Promise<readonly types.TypeSavedContact[]>

  /** `contacts.getSponsoredPeers#b6c8c393` */
  getSponsoredPeers(params: Omit<types.contacts.GetSponsoredPeers, '_'>): Promise<types.contacts.TypeSponsoredPeers>

  /** `contacts.getStatuses#c4a353ee` */
  getStatuses(): Promise<readonly types.TypeContactStatus[]>

  /** `contacts.getTopPeers#973478b6` */
  getTopPeers(params: Omit<types.contacts.GetTopPeers, '_'>): Promise<types.contacts.TypeTopPeers>

  /** `contacts.importContactToken#13005788` */
  importContactToken(params: Omit<types.contacts.ImportContactToken, '_'>): Promise<types.TypeUser>

  /** `contacts.importContacts#2c800be5` */
  importContacts(params: Omit<types.contacts.ImportContacts, '_'>): Promise<types.contacts.TypeImportedContacts>

  /** `contacts.resetSaved#879537f1` */
  resetSaved(): Promise<boolean>

  /** `contacts.resetTopPeerRating#1ae373ac` */
  resetTopPeerRating(params: Omit<types.contacts.ResetTopPeerRating, '_'>): Promise<boolean>

  /** `contacts.resolvePhone#8af94344` */
  resolvePhone(params: Omit<types.contacts.ResolvePhone, '_'>): Promise<types.contacts.TypeResolvedPeer>

  /** `contacts.resolveUsername#725afbbc` */
  resolveUsername(params: Omit<types.contacts.ResolveUsername, '_'>): Promise<types.contacts.TypeResolvedPeer>

  /** `contacts.search#05f58d0f` */
  search(params: Omit<types.contacts.Search, '_'>): Promise<types.contacts.TypeFound>

  /** `contacts.setBlocked#94c65c76` */
  setBlocked(params: Omit<types.contacts.SetBlocked, '_'>): Promise<boolean>

  /** `contacts.toggleTopPeers#8514bdda` */
  toggleTopPeers(params: Omit<types.contacts.ToggleTopPeers, '_'>): Promise<boolean>

  /** `contacts.unblock#b550d328` */
  unblock(params: Omit<types.contacts.Unblock, '_'>): Promise<boolean>

  /** `contacts.updateContactNote#139f63fb` */
  updateContactNote(params: Omit<types.contacts.UpdateContactNote, '_'>): Promise<boolean>
}

/** Methods in the `ephemeral` namespace. */
export interface EphemeralMethods {
  /** `ephemeral.deleteAllWelcomeMessages#734f9721` */
  deleteAllWelcomeMessages(params: Omit<types.ephemeral.DeleteAllWelcomeMessages, '_'>): Promise<boolean>

  /** `ephemeral.deleteMessage#92f6e797` */
  deleteMessage(params: Omit<types.ephemeral.DeleteMessage, '_'>): Promise<boolean>

  /** `ephemeral.deleteWelcomeMessage#e882a9e1` */
  deleteWelcomeMessage(params: Omit<types.ephemeral.DeleteWelcomeMessage, '_'>): Promise<boolean>

  /** `ephemeral.editMessage#cf9c725b` */
  editMessage(params: Omit<types.ephemeral.EditMessage, '_'>): Promise<types.TypeUpdates>

  /** `ephemeral.getCallbackAnswer#3fa464c8` */
  getCallbackAnswer(params: Omit<types.ephemeral.GetCallbackAnswer, '_'>): Promise<types.messages.TypeBotCallbackAnswer>

  /** `ephemeral.getWelcomeMessages#db9ac18d` */
  getWelcomeMessages(params: Omit<types.ephemeral.GetWelcomeMessages, '_'>): Promise<types.ephemeral.TypeWelcomeMessages>

  /** `ephemeral.reportMessage#8704f2bf` */
  reportMessage(params: Omit<types.ephemeral.ReportMessage, '_'>): Promise<types.TypeReportResult>

  /** `ephemeral.sendMessage#ba8d5f35` */
  sendMessage(params: Omit<types.ephemeral.SendMessage, '_'>): Promise<types.TypeUpdates>
}

/** Methods in the `folders` namespace. */
export interface FoldersMethods {
  /** `folders.editPeerFolders#6847d0ab` */
  editPeerFolders(params: Omit<types.folders.EditPeerFolders, '_'>): Promise<types.TypeUpdates>
}

/** Methods in the `fragment` namespace. */
export interface FragmentMethods {
  /** `fragment.getCollectibleInfo#be1e85ba` */
  getCollectibleInfo(params: Omit<types.fragment.GetCollectibleInfo, '_'>): Promise<types.fragment.TypeCollectibleInfo>
}

/** Methods in the `help` namespace. */
export interface HelpMethods {
  /** `help.acceptTermsOfService#ee72f79a` */
  acceptTermsOfService(params: Omit<types.help.AcceptTermsOfService, '_'>): Promise<boolean>

  /** `help.dismissSuggestion#f50dbaa1` */
  dismissSuggestion(params: Omit<types.help.DismissSuggestion, '_'>): Promise<boolean>

  /** `help.editUserInfo#66b91b70` */
  editUserInfo(params: Omit<types.help.EditUserInfo, '_'>): Promise<types.help.TypeUserInfo>

  /** `help.getAppConfig#61e3f854` */
  getAppConfig(params: Omit<types.help.GetAppConfig, '_'>): Promise<types.help.TypeAppConfig>

  /** `help.getAppUpdate#522d5a7d` */
  getAppUpdate(params: Omit<types.help.GetAppUpdate, '_'>): Promise<types.help.TypeAppUpdate>

  /** `help.getCdnConfig#52029342` */
  getCdnConfig(): Promise<types.TypeCdnConfig>

  /** `help.getConfig#c4f9186b` */
  getConfig(): Promise<types.TypeConfig>

  /** `help.getCountriesList#735787a8` */
  getCountriesList(params: Omit<types.help.GetCountriesList, '_'>): Promise<types.help.TypeCountriesList>

  /** `help.getDeepLinkInfo#3fedc75f` */
  getDeepLinkInfo(params: Omit<types.help.GetDeepLinkInfo, '_'>): Promise<types.help.TypeDeepLinkInfo>

  /** `help.getInviteText#4d392343` */
  getInviteText(): Promise<types.help.TypeInviteText>

  /** `help.getNearestDc#1fb33026` */
  getNearestDc(): Promise<types.TypeNearestDc>

  /** `help.getPassportConfig#c661ad08` */
  getPassportConfig(params: Omit<types.help.GetPassportConfig, '_'>): Promise<types.help.TypePassportConfig>

  /** `help.getPeerColors#da80f42f` */
  getPeerColors(params: Omit<types.help.GetPeerColors, '_'>): Promise<types.help.TypePeerColors>

  /** `help.getPeerProfileColors#abcfa9fd` */
  getPeerProfileColors(params: Omit<types.help.GetPeerProfileColors, '_'>): Promise<types.help.TypePeerColors>

  /** `help.getPremiumPromo#b81b93d4` */
  getPremiumPromo(): Promise<types.help.TypePremiumPromo>

  /** `help.getPromoData#c0977421` */
  getPromoData(): Promise<types.help.TypePromoData>

  /** `help.getRecentMeUrls#3dc0f114` */
  getRecentMeUrls(params: Omit<types.help.GetRecentMeUrls, '_'>): Promise<types.help.TypeRecentMeUrls>

  /** `help.getSupport#9cdf08cd` */
  getSupport(): Promise<types.help.TypeSupport>

  /** `help.getSupportName#d360e72c` */
  getSupportName(): Promise<types.help.TypeSupportName>

  /** `help.getTermsOfServiceUpdate#2ca51fd1` */
  getTermsOfServiceUpdate(): Promise<types.help.TypeTermsOfServiceUpdate>

  /** `help.getTimezonesList#49b30240` */
  getTimezonesList(params: Omit<types.help.GetTimezonesList, '_'>): Promise<types.help.TypeTimezonesList>

  /** `help.getUserInfo#038a08d3` */
  getUserInfo(params: Omit<types.help.GetUserInfo, '_'>): Promise<types.help.TypeUserInfo>

  /** `help.hidePromoData#1e251c95` */
  hidePromoData(params: Omit<types.help.HidePromoData, '_'>): Promise<boolean>

  /** `help.saveAppLog#6f02f748` */
  saveAppLog(params: Omit<types.help.SaveAppLog, '_'>): Promise<boolean>

  /** `help.setBotUpdatesStatus#ec22cfcd` */
  setBotUpdatesStatus(params: Omit<types.help.SetBotUpdatesStatus, '_'>): Promise<boolean>
}

/** Methods in the `langpack` namespace. */
export interface LangpackMethods {
  /** `langpack.getDifference#cd984aa5` */
  getDifference(params: Omit<types.langpack.GetDifference, '_'>): Promise<types.TypeLangPackDifference>

  /** `langpack.getLangPack#f2f2330a` */
  getLangPack(params: Omit<types.langpack.GetLangPack, '_'>): Promise<types.TypeLangPackDifference>

  /** `langpack.getLanguage#6a596502` */
  getLanguage(params: Omit<types.langpack.GetLanguage, '_'>): Promise<types.TypeLangPackLanguage>

  /** `langpack.getLanguages#42c6978f` */
  getLanguages(params: Omit<types.langpack.GetLanguages, '_'>): Promise<readonly types.TypeLangPackLanguage[]>

  /** `langpack.getStrings#efea3803` */
  getStrings(params: Omit<types.langpack.GetStrings, '_'>): Promise<readonly types.TypeLangPackString[]>
}

/** Methods in the `messages` namespace. */
export interface MessagesMethods {
  /** `messages.acceptEncryption#3dbc0415` */
  acceptEncryption(params: Omit<types.messages.AcceptEncryption, '_'>): Promise<types.TypeEncryptedChat>

  /** `messages.acceptUrlAuth#67a3f0de` */
  acceptUrlAuth(params?: Omit<types.messages.AcceptUrlAuth, '_'>): Promise<types.TypeUrlAuthResult>

  /** `messages.addChatUser#cbc6d107` */
  addChatUser(params: Omit<types.messages.AddChatUser, '_'>): Promise<types.messages.TypeInvitedUsers>

  /** `messages.addPollAnswer#19bc4b6d` */
  addPollAnswer(params: Omit<types.messages.AddPollAnswer, '_'>): Promise<types.TypeUpdates>

  /** `messages.appendTodoList#21a61057` */
  appendTodoList(params: Omit<types.messages.AppendTodoList, '_'>): Promise<types.TypeUpdates>

  /** `messages.checkChatInvite#3eadb1bb` */
  checkChatInvite(params: Omit<types.messages.CheckChatInvite, '_'>): Promise<types.TypeChatInvite>

  /** `messages.checkHistoryImport#43fe19f3` */
  checkHistoryImport(params: Omit<types.messages.CheckHistoryImport, '_'>): Promise<types.messages.TypeHistoryImportParsed>

  /** `messages.checkHistoryImportPeer#5dc60f03` */
  checkHistoryImportPeer(params: Omit<types.messages.CheckHistoryImportPeer, '_'>): Promise<types.messages.TypeCheckedHistoryImportPeer>

  /** `messages.checkQuickReplyShortcut#f1d0fbd3` */
  checkQuickReplyShortcut(params: Omit<types.messages.CheckQuickReplyShortcut, '_'>): Promise<boolean>

  /** `messages.checkUrlAuthMatchCode#c9a47b0b` */
  checkUrlAuthMatchCode(params: Omit<types.messages.CheckUrlAuthMatchCode, '_'>): Promise<boolean>

  /** `messages.clearAllDrafts#7e58ee9c` */
  clearAllDrafts(): Promise<boolean>

  /** `messages.clearRecentReactions#9dfeefb4` */
  clearRecentReactions(): Promise<boolean>

  /** `messages.clearRecentStickers#8999602d` */
  clearRecentStickers(params?: Omit<types.messages.ClearRecentStickers, '_'>): Promise<boolean>

  /** `messages.clickSponsoredMessage#8235057e` */
  clickSponsoredMessage(params: Omit<types.messages.ClickSponsoredMessage, '_'>): Promise<boolean>

  /** `messages.composeMessageWithAI#daecc589` */
  composeMessageWithAI(params: Omit<types.messages.ComposeMessageWithAI, '_'>): Promise<types.messages.TypeComposedMessageWithAI>

  /** `messages.composeRichMessageWithAI#8d7ae6af` */
  composeRichMessageWithAI(params?: Omit<types.messages.ComposeRichMessageWithAI, '_'>): Promise<types.messages.TypeComposedRichMessageWithAI>

  /** `messages.createChat#92ceddd4` */
  createChat(params: Omit<types.messages.CreateChat, '_'>): Promise<types.messages.TypeInvitedUsers>

  /** `messages.createForumTopic#2f98c3d5` */
  createForumTopic(params: Omit<types.messages.CreateForumTopic, '_'>): Promise<types.TypeUpdates>

  /** `messages.declineUrlAuth#35436bbc` */
  declineUrlAuth(params: Omit<types.messages.DeclineUrlAuth, '_'>): Promise<boolean>

  /** `messages.deleteChat#5bd0ee50` */
  deleteChat(params: Omit<types.messages.DeleteChat, '_'>): Promise<boolean>

  /** `messages.deleteChatUser#a2185cab` */
  deleteChatUser(params: Omit<types.messages.DeleteChatUser, '_'>): Promise<types.TypeUpdates>

  /** `messages.deleteExportedChatInvite#d464a42b` */
  deleteExportedChatInvite(params: Omit<types.messages.DeleteExportedChatInvite, '_'>): Promise<boolean>

  /** `messages.deleteFactCheck#d1da940c` */
  deleteFactCheck(params: Omit<types.messages.DeleteFactCheck, '_'>): Promise<types.TypeUpdates>

  /** `messages.deleteHistory#b08f922a` */
  deleteHistory(params: Omit<types.messages.DeleteHistory, '_'>): Promise<types.messages.TypeAffectedHistory>

  /** `messages.deleteMessages#e58e95d2` */
  deleteMessages(params: Omit<types.messages.DeleteMessages, '_'>): Promise<types.messages.TypeAffectedMessages>

  /** `messages.deleteParticipantReaction#e3b7f82c` */
  deleteParticipantReaction(params: Omit<types.messages.DeleteParticipantReaction, '_'>): Promise<types.TypeUpdates>

  /** `messages.deleteParticipantReactions#a0b80cf8` */
  deleteParticipantReactions(params: Omit<types.messages.DeleteParticipantReactions, '_'>): Promise<boolean>

  /** `messages.deletePhoneCallHistory#f9cbe409` */
  deletePhoneCallHistory(params?: Omit<types.messages.DeletePhoneCallHistory, '_'>): Promise<types.messages.TypeAffectedFoundMessages>

  /** `messages.deletePollAnswer#ac8505a5` */
  deletePollAnswer(params: Omit<types.messages.DeletePollAnswer, '_'>): Promise<types.TypeUpdates>

  /** `messages.deleteQuickReplyMessages#e105e910` */
  deleteQuickReplyMessages(params: Omit<types.messages.DeleteQuickReplyMessages, '_'>): Promise<types.TypeUpdates>

  /** `messages.deleteQuickReplyShortcut#3cc04740` */
  deleteQuickReplyShortcut(params: Omit<types.messages.DeleteQuickReplyShortcut, '_'>): Promise<boolean>

  /** `messages.deleteRevokedExportedChatInvites#56987bd5` */
  deleteRevokedExportedChatInvites(params: Omit<types.messages.DeleteRevokedExportedChatInvites, '_'>): Promise<boolean>

  /** `messages.deleteSavedHistory#4dc5085f` */
  deleteSavedHistory(params: Omit<types.messages.DeleteSavedHistory, '_'>): Promise<types.messages.TypeAffectedHistory>

  /** `messages.deleteScheduledMessages#59ae2b16` */
  deleteScheduledMessages(params: Omit<types.messages.DeleteScheduledMessages, '_'>): Promise<types.TypeUpdates>

  /** `messages.deleteTopicHistory#d2816f10` */
  deleteTopicHistory(params: Omit<types.messages.DeleteTopicHistory, '_'>): Promise<types.messages.TypeAffectedHistory>

  /** `messages.discardEncryption#f393aea0` */
  discardEncryption(params: Omit<types.messages.DiscardEncryption, '_'>): Promise<boolean>

  /** `messages.editChatAbout#def60797` */
  editChatAbout(params: Omit<types.messages.EditChatAbout, '_'>): Promise<boolean>

  /** `messages.editChatAdmin#a85bd1c2` */
  editChatAdmin(params: Omit<types.messages.EditChatAdmin, '_'>): Promise<boolean>

  /** `messages.editChatCreator#f743b857` */
  editChatCreator(params: Omit<types.messages.EditChatCreator, '_'>): Promise<types.TypeUpdates>

  /** `messages.editChatDefaultBannedRights#a5866b41` */
  editChatDefaultBannedRights(params: Omit<types.messages.EditChatDefaultBannedRights, '_'>): Promise<types.TypeUpdates>

  /** `messages.editChatParticipantRank#a00f32b0` */
  editChatParticipantRank(params: Omit<types.messages.EditChatParticipantRank, '_'>): Promise<types.TypeUpdates>

  /** `messages.editChatPhoto#35ddd674` */
  editChatPhoto(params: Omit<types.messages.EditChatPhoto, '_'>): Promise<types.TypeUpdates>

  /** `messages.editChatTitle#73783ffd` */
  editChatTitle(params: Omit<types.messages.EditChatTitle, '_'>): Promise<types.TypeUpdates>

  /** `messages.editExportedChatInvite#bdca2f75` */
  editExportedChatInvite(params: Omit<types.messages.EditExportedChatInvite, '_'>): Promise<types.messages.TypeExportedChatInvite>

  /** `messages.editFactCheck#0589ee75` */
  editFactCheck(params: Omit<types.messages.EditFactCheck, '_'>): Promise<types.TypeUpdates>

  /** `messages.editForumTopic#cecc1134` */
  editForumTopic(params: Omit<types.messages.EditForumTopic, '_'>): Promise<types.TypeUpdates>

  /** `messages.editInlineBotMessage#a423bb51` */
  editInlineBotMessage(params: Omit<types.messages.EditInlineBotMessage, '_'>): Promise<boolean>

  /** `messages.editMessage#b106e66c` */
  editMessage(params: Omit<types.messages.EditMessage, '_'>): Promise<types.TypeUpdates>

  /** `messages.editQuickReplyShortcut#5c003cef` */
  editQuickReplyShortcut(params: Omit<types.messages.EditQuickReplyShortcut, '_'>): Promise<boolean>

  /** `messages.exportChatInvite#a455de90` */
  exportChatInvite(params: Omit<types.messages.ExportChatInvite, '_'>): Promise<types.TypeExportedChatInvite>

  /** `messages.faveSticker#b9ffc55b` */
  faveSticker(params: Omit<types.messages.FaveSticker, '_'>): Promise<boolean>

  /** `messages.forwardMessages#13704a7c` */
  forwardMessages(params: Omit<types.messages.ForwardMessages, '_'>): Promise<types.TypeUpdates>

  /** `messages.getAdminsWithInvites#3920e6ef` */
  getAdminsWithInvites(params: Omit<types.messages.GetAdminsWithInvites, '_'>): Promise<types.messages.TypeChatAdminsWithInvites>

  /** `messages.getAllDrafts#6a3f8d65` */
  getAllDrafts(): Promise<types.TypeUpdates>

  /** `messages.getAllStickers#b8a0a1a8` */
  getAllStickers(params: Omit<types.messages.GetAllStickers, '_'>): Promise<types.messages.TypeAllStickers>

  /** `messages.getArchivedStickers#57f17692` */
  getArchivedStickers(params: Omit<types.messages.GetArchivedStickers, '_'>): Promise<types.messages.TypeArchivedStickers>

  /** `messages.getAttachMenuBot#77216192` */
  getAttachMenuBot(params: Omit<types.messages.GetAttachMenuBot, '_'>): Promise<types.TypeAttachMenuBotsBot>

  /** `messages.getAttachMenuBots#16fcc2cb` */
  getAttachMenuBots(params: Omit<types.messages.GetAttachMenuBots, '_'>): Promise<types.TypeAttachMenuBots>

  /** `messages.getAttachedStickers#cc5b67cc` */
  getAttachedStickers(params: Omit<types.messages.GetAttachedStickers, '_'>): Promise<readonly types.TypeStickerSetCovered[]>

  /** `messages.getAvailableEffects#dea20a39` */
  getAvailableEffects(params: Omit<types.messages.GetAvailableEffects, '_'>): Promise<types.messages.TypeAvailableEffects>

  /** `messages.getAvailableReactions#18dea0ac` */
  getAvailableReactions(params: Omit<types.messages.GetAvailableReactions, '_'>): Promise<types.messages.TypeAvailableReactions>

  /** `messages.getBotApp#34fdc5c3` */
  getBotApp(params: Omit<types.messages.GetBotApp, '_'>): Promise<types.messages.TypeBotApp>

  /** `messages.getBotCallbackAnswer#9342ca07` */
  getBotCallbackAnswer(params: Omit<types.messages.GetBotCallbackAnswer, '_'>): Promise<types.messages.TypeBotCallbackAnswer>

  /** `messages.getChatInviteImporters#df04dd4e` */
  getChatInviteImporters(params: Omit<types.messages.GetChatInviteImporters, '_'>): Promise<types.messages.TypeChatInviteImporters>

  /** `messages.getChats#49e9528f` */
  getChats(params: Omit<types.messages.GetChats, '_'>): Promise<types.messages.TypeChats>

  /** `messages.getCommonChats#e40ca104` */
  getCommonChats(params: Omit<types.messages.GetCommonChats, '_'>): Promise<types.messages.TypeChats>

  /** `messages.getCustomEmojiDocuments#d9ab0f54` */
  getCustomEmojiDocuments(params: Omit<types.messages.GetCustomEmojiDocuments, '_'>): Promise<readonly types.TypeDocument[]>

  /** `messages.getDefaultHistoryTTL#658b7188` */
  getDefaultHistoryTTL(): Promise<types.TypeDefaultHistoryTTL>

  /** `messages.getDefaultTagReactions#bdf93428` */
  getDefaultTagReactions(params: Omit<types.messages.GetDefaultTagReactions, '_'>): Promise<types.messages.TypeReactions>

  /** `messages.getDhConfig#26cf8950` */
  getDhConfig(params: Omit<types.messages.GetDhConfig, '_'>): Promise<types.messages.TypeDhConfig>

  /** `messages.getDialogFilters#efd48c89` */
  getDialogFilters(): Promise<types.messages.TypeDialogFilters>

  /** `messages.getDialogUnreadMarks#21202222` */
  getDialogUnreadMarks(params?: Omit<types.messages.GetDialogUnreadMarks, '_'>): Promise<readonly types.TypeDialogPeer[]>

  /** `messages.getDialogs#a0f4cb4f` */
  getDialogs(params: Omit<types.messages.GetDialogs, '_'>): Promise<types.messages.TypeDialogs>

  /** `messages.getDiscussionMessage#446972fd` */
  getDiscussionMessage(params: Omit<types.messages.GetDiscussionMessage, '_'>): Promise<types.messages.TypeDiscussionMessage>

  /** `messages.getDocumentByHash#b1f2061f` */
  getDocumentByHash(params: Omit<types.messages.GetDocumentByHash, '_'>): Promise<types.TypeDocument>

  /** `messages.getEmojiGameInfo#fb7e8ca7` */
  getEmojiGameInfo(): Promise<types.messages.TypeEmojiGameInfo>

  /** `messages.getEmojiGroups#7488ce5b` */
  getEmojiGroups(params: Omit<types.messages.GetEmojiGroups, '_'>): Promise<types.messages.TypeEmojiGroups>

  /** `messages.getEmojiKeywords#35a0e062` */
  getEmojiKeywords(params: Omit<types.messages.GetEmojiKeywords, '_'>): Promise<types.TypeEmojiKeywordsDifference>

  /** `messages.getEmojiKeywordsDifference#1508b6af` */
  getEmojiKeywordsDifference(params: Omit<types.messages.GetEmojiKeywordsDifference, '_'>): Promise<types.TypeEmojiKeywordsDifference>

  /** `messages.getEmojiKeywordsLanguages#4e9963b2` */
  getEmojiKeywordsLanguages(params: Omit<types.messages.GetEmojiKeywordsLanguages, '_'>): Promise<readonly types.TypeEmojiLanguage[]>

  /** `messages.getEmojiProfilePhotoGroups#21a548f3` */
  getEmojiProfilePhotoGroups(params: Omit<types.messages.GetEmojiProfilePhotoGroups, '_'>): Promise<types.messages.TypeEmojiGroups>

  /** `messages.getEmojiStatusGroups#2ecd56cd` */
  getEmojiStatusGroups(params: Omit<types.messages.GetEmojiStatusGroups, '_'>): Promise<types.messages.TypeEmojiGroups>

  /** `messages.getEmojiStickerGroups#1dd840f5` */
  getEmojiStickerGroups(params: Omit<types.messages.GetEmojiStickerGroups, '_'>): Promise<types.messages.TypeEmojiGroups>

  /** `messages.getEmojiStickers#fbfca18f` */
  getEmojiStickers(params: Omit<types.messages.GetEmojiStickers, '_'>): Promise<types.messages.TypeAllStickers>

  /** `messages.getEmojiURL#d5b10c26` */
  getEmojiURL(params: Omit<types.messages.GetEmojiURL, '_'>): Promise<types.TypeEmojiURL>

  /** `messages.getExportedChatInvite#73746f5c` */
  getExportedChatInvite(params: Omit<types.messages.GetExportedChatInvite, '_'>): Promise<types.messages.TypeExportedChatInvite>

  /** `messages.getExportedChatInvites#a2b5a3f6` */
  getExportedChatInvites(params: Omit<types.messages.GetExportedChatInvites, '_'>): Promise<types.messages.TypeExportedChatInvites>

  /** `messages.getExtendedMedia#84f80814` */
  getExtendedMedia(params: Omit<types.messages.GetExtendedMedia, '_'>): Promise<types.TypeUpdates>

  /** `messages.getFactCheck#b9cdc5ee` */
  getFactCheck(params: Omit<types.messages.GetFactCheck, '_'>): Promise<readonly types.TypeFactCheck[]>

  /** `messages.getFavedStickers#04f1aaa9` */
  getFavedStickers(params: Omit<types.messages.GetFavedStickers, '_'>): Promise<types.messages.TypeFavedStickers>

  /** `messages.getFeaturedEmojiStickers#0ecf6736` */
  getFeaturedEmojiStickers(params: Omit<types.messages.GetFeaturedEmojiStickers, '_'>): Promise<types.messages.TypeFeaturedStickers>

  /** `messages.getFeaturedStickers#64780b14` */
  getFeaturedStickers(params: Omit<types.messages.GetFeaturedStickers, '_'>): Promise<types.messages.TypeFeaturedStickers>

  /** `messages.getForumTopics#3ba47bff` */
  getForumTopics(params: Omit<types.messages.GetForumTopics, '_'>): Promise<types.messages.TypeForumTopics>

  /** `messages.getForumTopicsByID#af0a4a08` */
  getForumTopicsByID(params: Omit<types.messages.GetForumTopicsByID, '_'>): Promise<types.messages.TypeForumTopics>

  /** `messages.getFullChat#aeb00b34` */
  getFullChat(params: Omit<types.messages.GetFullChat, '_'>): Promise<types.messages.TypeChatFull>

  /** `messages.getFutureChatCreatorAfterLeave#3b7d0ea6` */
  getFutureChatCreatorAfterLeave(params: Omit<types.messages.GetFutureChatCreatorAfterLeave, '_'>): Promise<types.TypeUser>

  /** `messages.getGameHighScores#e822649d` */
  getGameHighScores(params: Omit<types.messages.GetGameHighScores, '_'>): Promise<types.messages.TypeHighScores>

  /** `messages.getHistory#4423e6c5` */
  getHistory(params: Omit<types.messages.GetHistory, '_'>): Promise<types.messages.TypeMessages>

  /** `messages.getInlineBotResults#514e999d` */
  getInlineBotResults(params: Omit<types.messages.GetInlineBotResults, '_'>): Promise<types.messages.TypeBotResults>

  /** `messages.getInlineGameHighScores#0f635e1b` */
  getInlineGameHighScores(params: Omit<types.messages.GetInlineGameHighScores, '_'>): Promise<types.messages.TypeHighScores>

  /** `messages.getMaskStickers#640f82b8` */
  getMaskStickers(params: Omit<types.messages.GetMaskStickers, '_'>): Promise<types.messages.TypeAllStickers>

  /** `messages.getMessageEditData#fda68d36` */
  getMessageEditData(params: Omit<types.messages.GetMessageEditData, '_'>): Promise<types.messages.TypeMessageEditData>

  /** `messages.getMessageReactionsList#461b3f48` */
  getMessageReactionsList(params: Omit<types.messages.GetMessageReactionsList, '_'>): Promise<types.messages.TypeMessageReactionsList>

  /** `messages.getMessageReadParticipants#31c1c44f` */
  getMessageReadParticipants(params: Omit<types.messages.GetMessageReadParticipants, '_'>): Promise<readonly types.TypeReadParticipantDate[]>

  /** `messages.getMessages#63c66506` */
  getMessages(params: Omit<types.messages.GetMessages, '_'>): Promise<types.messages.TypeMessages>

  /** `messages.getMessagesReactions#8bba90e6` */
  getMessagesReactions(params: Omit<types.messages.GetMessagesReactions, '_'>): Promise<types.TypeUpdates>

  /** `messages.getMessagesViews#5784d3e1` */
  getMessagesViews(params: Omit<types.messages.GetMessagesViews, '_'>): Promise<types.messages.TypeMessageViews>

  /** `messages.getMyStickers#d0b5e1fc` */
  getMyStickers(params: Omit<types.messages.GetMyStickers, '_'>): Promise<types.messages.TypeMyStickers>

  /** `messages.getOldFeaturedStickers#7ed094a1` */
  getOldFeaturedStickers(params: Omit<types.messages.GetOldFeaturedStickers, '_'>): Promise<types.messages.TypeFeaturedStickers>

  /** `messages.getOnlines#6e2be050` */
  getOnlines(params: Omit<types.messages.GetOnlines, '_'>): Promise<types.TypeChatOnlines>

  /** `messages.getOutboxReadDate#8c4bfe5d` */
  getOutboxReadDate(params: Omit<types.messages.GetOutboxReadDate, '_'>): Promise<types.TypeOutboxReadDate>

  /** `messages.getPaidReactionPrivacy#472455aa` */
  getPaidReactionPrivacy(): Promise<types.TypeUpdates>

  /** `messages.getPeerDialogs#e470bcfd` */
  getPeerDialogs(params: Omit<types.messages.GetPeerDialogs, '_'>): Promise<types.messages.TypePeerDialogs>

  /** `messages.getPeerSettings#efd9a6a2` */
  getPeerSettings(params: Omit<types.messages.GetPeerSettings, '_'>): Promise<types.messages.TypePeerSettings>

  /** `messages.getPersonalChannelHistory#55fb0996` */
  getPersonalChannelHistory(params: Omit<types.messages.GetPersonalChannelHistory, '_'>): Promise<types.messages.TypeMessages>

  /** `messages.getPinnedDialogs#d6b94df2` */
  getPinnedDialogs(params: Omit<types.messages.GetPinnedDialogs, '_'>): Promise<types.messages.TypePeerDialogs>

  /** `messages.getPinnedSavedDialogs#d63d94e0` */
  getPinnedSavedDialogs(): Promise<types.messages.TypeSavedDialogs>

  /** `messages.getPollResults#eda3e33b` */
  getPollResults(params: Omit<types.messages.GetPollResults, '_'>): Promise<types.TypeUpdates>

  /** `messages.getPollVotes#b86e380e` */
  getPollVotes(params: Omit<types.messages.GetPollVotes, '_'>): Promise<types.messages.TypeVotesList>

  /** `messages.getPreparedInlineMessage#857ebdb8` */
  getPreparedInlineMessage(params: Omit<types.messages.GetPreparedInlineMessage, '_'>): Promise<types.messages.TypePreparedInlineMessage>

  /** `messages.getQuickReplies#d483f2a8` */
  getQuickReplies(params: Omit<types.messages.GetQuickReplies, '_'>): Promise<types.messages.TypeQuickReplies>

  /** `messages.getQuickReplyMessages#94a495c3` */
  getQuickReplyMessages(params: Omit<types.messages.GetQuickReplyMessages, '_'>): Promise<types.messages.TypeMessages>

  /** `messages.getRecentLocations#702a40e0` */
  getRecentLocations(params: Omit<types.messages.GetRecentLocations, '_'>): Promise<types.messages.TypeMessages>

  /** `messages.getRecentReactions#39461db2` */
  getRecentReactions(params: Omit<types.messages.GetRecentReactions, '_'>): Promise<types.messages.TypeReactions>

  /** `messages.getRecentStickers#9da9403b` */
  getRecentStickers(params: Omit<types.messages.GetRecentStickers, '_'>): Promise<types.messages.TypeRecentStickers>

  /** `messages.getReplies#22ddd30c` */
  getReplies(params: Omit<types.messages.GetReplies, '_'>): Promise<types.messages.TypeMessages>

  /** `messages.getRichMessage#501569cf` */
  getRichMessage(params: Omit<types.messages.GetRichMessage, '_'>): Promise<types.messages.TypeMessages>

  /** `messages.getSavedDialogs#1e91fc99` */
  getSavedDialogs(params: Omit<types.messages.GetSavedDialogs, '_'>): Promise<types.messages.TypeSavedDialogs>

  /** `messages.getSavedDialogsByID#6f6f9c96` */
  getSavedDialogsByID(params: Omit<types.messages.GetSavedDialogsByID, '_'>): Promise<types.messages.TypeSavedDialogs>

  /** `messages.getSavedGifs#5cf09635` */
  getSavedGifs(params: Omit<types.messages.GetSavedGifs, '_'>): Promise<types.messages.TypeSavedGifs>

  /** `messages.getSavedHistory#998ab009` */
  getSavedHistory(params: Omit<types.messages.GetSavedHistory, '_'>): Promise<types.messages.TypeMessages>

  /** `messages.getSavedReactionTags#3637e05b` */
  getSavedReactionTags(params: Omit<types.messages.GetSavedReactionTags, '_'>): Promise<types.messages.TypeSavedReactionTags>

  /** `messages.getScheduledHistory#f516760b` */
  getScheduledHistory(params: Omit<types.messages.GetScheduledHistory, '_'>): Promise<types.messages.TypeMessages>

  /** `messages.getScheduledMessages#bdbb0464` */
  getScheduledMessages(params: Omit<types.messages.GetScheduledMessages, '_'>): Promise<types.messages.TypeMessages>

  /** `messages.getSearchCounters#1bbcf300` */
  getSearchCounters(params: Omit<types.messages.GetSearchCounters, '_'>): Promise<readonly types.messages.TypeSearchCounter[]>

  /** `messages.getSearchResultsCalendar#6aa3f6bd` */
  getSearchResultsCalendar(params: Omit<types.messages.GetSearchResultsCalendar, '_'>): Promise<types.messages.TypeSearchResultsCalendar>

  /** `messages.getSearchResultsPositions#9c7f2f10` */
  getSearchResultsPositions(params: Omit<types.messages.GetSearchResultsPositions, '_'>): Promise<types.messages.TypeSearchResultsPositions>

  /** `messages.getSplitRanges#1cff7e08` */
  getSplitRanges(): Promise<readonly types.TypeMessageRange[]>

  /** `messages.getSponsoredMessages#3d6ce850` */
  getSponsoredMessages(params: Omit<types.messages.GetSponsoredMessages, '_'>): Promise<types.messages.TypeSponsoredMessages>

  /** `messages.getStickerSet#c8a0ec74` */
  getStickerSet(params: Omit<types.messages.GetStickerSet, '_'>): Promise<types.messages.TypeStickerSet>

  /** `messages.getStickers#d5a5d3a1` */
  getStickers(params: Omit<types.messages.GetStickers, '_'>): Promise<types.messages.TypeStickers>

  /** `messages.getSuggestedDialogFilters#a29cd42c` */
  getSuggestedDialogFilters(): Promise<readonly types.TypeDialogFilterSuggested[]>

  /** `messages.getTopReactions#bb8125ba` */
  getTopReactions(params: Omit<types.messages.GetTopReactions, '_'>): Promise<types.messages.TypeReactions>

  /** `messages.getUnreadMentions#f107e790` */
  getUnreadMentions(params: Omit<types.messages.GetUnreadMentions, '_'>): Promise<types.messages.TypeMessages>

  /** `messages.getUnreadPollVotes#43286cf2` */
  getUnreadPollVotes(params: Omit<types.messages.GetUnreadPollVotes, '_'>): Promise<types.messages.TypeMessages>

  /** `messages.getUnreadReactions#bd7f90ac` */
  getUnreadReactions(params: Omit<types.messages.GetUnreadReactions, '_'>): Promise<types.messages.TypeMessages>

  /** `messages.getWebPage#8d9692a3` */
  getWebPage(params: Omit<types.messages.GetWebPage, '_'>): Promise<types.messages.TypeWebPage>

  /** `messages.getWebPagePreview#570d6f6f` */
  getWebPagePreview(params: Omit<types.messages.GetWebPagePreview, '_'>): Promise<types.messages.TypeWebPagePreview>

  /** `messages.hideAllChatJoinRequests#e085f4ea` */
  hideAllChatJoinRequests(params: Omit<types.messages.HideAllChatJoinRequests, '_'>): Promise<types.TypeUpdates>

  /** `messages.hideChatJoinRequest#7fe7e815` */
  hideChatJoinRequest(params: Omit<types.messages.HideChatJoinRequest, '_'>): Promise<types.TypeUpdates>

  /** `messages.hidePeerSettingsBar#4facb138` */
  hidePeerSettingsBar(params: Omit<types.messages.HidePeerSettingsBar, '_'>): Promise<boolean>

  /** `messages.importChatInvite#de91436e` */
  importChatInvite(params: Omit<types.messages.ImportChatInvite, '_'>): Promise<types.messages.TypeChatInviteJoinResult>

  /** `messages.initHistoryImport#34090c3b` */
  initHistoryImport(params: Omit<types.messages.InitHistoryImport, '_'>): Promise<types.messages.TypeHistoryImport>

  /** `messages.installStickerSet#c78fe460` */
  installStickerSet(params: Omit<types.messages.InstallStickerSet, '_'>): Promise<types.messages.TypeStickerSetInstallResult>

  /** `messages.markDialogUnread#8c5006f8` */
  markDialogUnread(params: Omit<types.messages.MarkDialogUnread, '_'>): Promise<boolean>

  /** `messages.migrateChat#a2875319` */
  migrateChat(params: Omit<types.messages.MigrateChat, '_'>): Promise<types.TypeUpdates>

  /** `messages.prolongWebView#b0d81a83` */
  prolongWebView(params: Omit<types.messages.ProlongWebView, '_'>): Promise<boolean>

  /** `messages.rateTranscribedAudio#7f1d072f` */
  rateTranscribedAudio(params: Omit<types.messages.RateTranscribedAudio, '_'>): Promise<boolean>

  /** `messages.readDiscussion#f731a9f4` */
  readDiscussion(params: Omit<types.messages.ReadDiscussion, '_'>): Promise<boolean>

  /** `messages.readEncryptedHistory#7f4b690a` */
  readEncryptedHistory(params: Omit<types.messages.ReadEncryptedHistory, '_'>): Promise<boolean>

  /** `messages.readFeaturedStickers#5b118126` */
  readFeaturedStickers(params: Omit<types.messages.ReadFeaturedStickers, '_'>): Promise<boolean>

  /** `messages.readHistory#0e306d3a` */
  readHistory(params: Omit<types.messages.ReadHistory, '_'>): Promise<types.messages.TypeAffectedMessages>

  /** `messages.readMentions#36e5bf4d` */
  readMentions(params: Omit<types.messages.ReadMentions, '_'>): Promise<types.messages.TypeAffectedHistory>

  /** `messages.readMessageContents#36a73f77` */
  readMessageContents(params: Omit<types.messages.ReadMessageContents, '_'>): Promise<types.messages.TypeAffectedMessages>

  /** `messages.readPollVotes#1720b4d8` */
  readPollVotes(params: Omit<types.messages.ReadPollVotes, '_'>): Promise<types.messages.TypeAffectedHistory>

  /** `messages.readReactions#9ec44f93` */
  readReactions(params: Omit<types.messages.ReadReactions, '_'>): Promise<types.messages.TypeAffectedHistory>

  /** `messages.readSavedHistory#ba4a3b5b` */
  readSavedHistory(params: Omit<types.messages.ReadSavedHistory, '_'>): Promise<boolean>

  /** `messages.receivedMessages#05a954c0` */
  receivedMessages(params: Omit<types.messages.ReceivedMessages, '_'>): Promise<readonly types.TypeReceivedNotifyMessage[]>

  /** `messages.receivedQueue#55a5bb66` */
  receivedQueue(params: Omit<types.messages.ReceivedQueue, '_'>): Promise<readonly bigint[]>

  /** `messages.reorderPinnedDialogs#3b1adf37` */
  reorderPinnedDialogs(params: Omit<types.messages.ReorderPinnedDialogs, '_'>): Promise<boolean>

  /** `messages.reorderPinnedForumTopics#0e7841f0` */
  reorderPinnedForumTopics(params: Omit<types.messages.ReorderPinnedForumTopics, '_'>): Promise<types.TypeUpdates>

  /** `messages.reorderPinnedSavedDialogs#8b716587` */
  reorderPinnedSavedDialogs(params: Omit<types.messages.ReorderPinnedSavedDialogs, '_'>): Promise<boolean>

  /** `messages.reorderQuickReplies#60331907` */
  reorderQuickReplies(params: Omit<types.messages.ReorderQuickReplies, '_'>): Promise<boolean>

  /** `messages.reorderStickerSets#78337739` */
  reorderStickerSets(params: Omit<types.messages.ReorderStickerSets, '_'>): Promise<boolean>

  /** `messages.report#fc78af9b` */
  report(params: Omit<types.messages.Report, '_'>): Promise<types.TypeReportResult>

  /** `messages.reportEncryptedSpam#4b0c8c0f` */
  reportEncryptedSpam(params: Omit<types.messages.ReportEncryptedSpam, '_'>): Promise<boolean>

  /** `messages.reportMessagesDelivery#5a6d7395` */
  reportMessagesDelivery(params: Omit<types.messages.ReportMessagesDelivery, '_'>): Promise<boolean>

  /** `messages.reportMusicListen#ddbcd819` */
  reportMusicListen(params: Omit<types.messages.ReportMusicListen, '_'>): Promise<boolean>

  /** `messages.reportReaction#3f64c076` */
  reportReaction(params: Omit<types.messages.ReportReaction, '_'>): Promise<boolean>

  /** `messages.reportReadMetrics#4067c5e6` */
  reportReadMetrics(params: Omit<types.messages.ReportReadMetrics, '_'>): Promise<boolean>

  /** `messages.reportSpam#cf1592db` */
  reportSpam(params: Omit<types.messages.ReportSpam, '_'>): Promise<boolean>

  /** `messages.reportSponsoredMessage#12cbf0c4` */
  reportSponsoredMessage(params: Omit<types.messages.ReportSponsoredMessage, '_'>): Promise<types.channels.TypeSponsoredMessageReportResult>

  /** `messages.requestAppWebView#53618bce` */
  requestAppWebView(params: Omit<types.messages.RequestAppWebView, '_'>): Promise<types.TypeWebViewResult>

  /** `messages.requestChatJoinWebView#ba9ee679` */
  requestChatJoinWebView(params: Omit<types.messages.RequestChatJoinWebView, '_'>): Promise<types.TypeWebViewResult>

  /** `messages.requestEncryption#f64daf43` */
  requestEncryption(params: Omit<types.messages.RequestEncryption, '_'>): Promise<types.TypeEncryptedChat>

  /** `messages.requestMainWebView#c9e01e7b` */
  requestMainWebView(params: Omit<types.messages.RequestMainWebView, '_'>): Promise<types.TypeWebViewResult>

  /** `messages.requestSimpleWebView#413a3e73` */
  requestSimpleWebView(params: Omit<types.messages.RequestSimpleWebView, '_'>): Promise<types.TypeWebViewResult>

  /** `messages.requestUrlAuth#894cc99c` */
  requestUrlAuth(params?: Omit<types.messages.RequestUrlAuth, '_'>): Promise<types.TypeUrlAuthResult>

  /** `messages.requestWebView#269dc2c1` */
  requestWebView(params: Omit<types.messages.RequestWebView, '_'>): Promise<types.TypeWebViewResult>

  /** `messages.saveDefaultSendAs#ccfddf96` */
  saveDefaultSendAs(params: Omit<types.messages.SaveDefaultSendAs, '_'>): Promise<boolean>

  /** `messages.saveDraft#ad0fa15c` */
  saveDraft(params: Omit<types.messages.SaveDraft, '_'>): Promise<boolean>

  /** `messages.saveGif#327a30cb` */
  saveGif(params: Omit<types.messages.SaveGif, '_'>): Promise<boolean>

  /** `messages.savePreparedInlineMessage#f21f7f2f` */
  savePreparedInlineMessage(params: Omit<types.messages.SavePreparedInlineMessage, '_'>): Promise<types.messages.TypeBotPreparedInlineMessage>

  /** `messages.saveRecentSticker#392718f8` */
  saveRecentSticker(params: Omit<types.messages.SaveRecentSticker, '_'>): Promise<boolean>

  /** `messages.search#29ee847a` */
  search(params: Omit<types.messages.Search, '_'>): Promise<types.messages.TypeMessages>

  /** `messages.searchCustomEmoji#2c11c0d7` */
  searchCustomEmoji(params: Omit<types.messages.SearchCustomEmoji, '_'>): Promise<types.TypeEmojiList>

  /** `messages.searchEmojiStickerSets#92b4494c` */
  searchEmojiStickerSets(params: Omit<types.messages.SearchEmojiStickerSets, '_'>): Promise<types.messages.TypeFoundStickerSets>

  /** `messages.searchGlobal#6126a43c` */
  searchGlobal(params: Omit<types.messages.SearchGlobal, '_'>): Promise<types.messages.TypeMessages>

  /** `messages.searchSentMedia#107e31a0` */
  searchSentMedia(params: Omit<types.messages.SearchSentMedia, '_'>): Promise<types.messages.TypeMessages>

  /** `messages.searchStickerSets#35705b8a` */
  searchStickerSets(params: Omit<types.messages.SearchStickerSets, '_'>): Promise<types.messages.TypeFoundStickerSets>

  /** `messages.searchStickers#29b1c66a` */
  searchStickers(params: Omit<types.messages.SearchStickers, '_'>): Promise<types.messages.TypeFoundStickers>

  /** `messages.sendBotRequestedPeer#6c5cf2a7` */
  sendBotRequestedPeer(params: Omit<types.messages.SendBotRequestedPeer, '_'>): Promise<types.TypeUpdates>

  /** `messages.sendEncrypted#44fa7a15` */
  sendEncrypted(params: Omit<types.messages.SendEncrypted, '_'>): Promise<types.messages.TypeSentEncryptedMessage>

  /** `messages.sendEncryptedFile#5559481d` */
  sendEncryptedFile(params: Omit<types.messages.SendEncryptedFile, '_'>): Promise<types.messages.TypeSentEncryptedMessage>

  /** `messages.sendEncryptedService#32d439a4` */
  sendEncryptedService(params: Omit<types.messages.SendEncryptedService, '_'>): Promise<types.messages.TypeSentEncryptedMessage>

  /** `messages.sendInlineBotResult#c0cf7646` */
  sendInlineBotResult(params: Omit<types.messages.SendInlineBotResult, '_'>): Promise<types.TypeUpdates>

  /** `messages.sendMedia#0330e77f` */
  sendMedia(params: Omit<types.messages.SendMedia, '_'>): Promise<types.TypeUpdates>

  /** `messages.sendMessage#fef48f62` */
  sendMessage(params: Omit<types.messages.SendMessage, '_'>): Promise<types.TypeUpdates>

  /** `messages.sendMultiMedia#1bf89d74` */
  sendMultiMedia(params: Omit<types.messages.SendMultiMedia, '_'>): Promise<types.TypeUpdates>

  /** `messages.sendPaidReaction#58bbcb50` */
  sendPaidReaction(params: Omit<types.messages.SendPaidReaction, '_'>): Promise<types.TypeUpdates>

  /** `messages.sendQuickReplyMessages#6c750de1` */
  sendQuickReplyMessages(params: Omit<types.messages.SendQuickReplyMessages, '_'>): Promise<types.TypeUpdates>

  /** `messages.sendReaction#d30d78d4` */
  sendReaction(params: Omit<types.messages.SendReaction, '_'>): Promise<types.TypeUpdates>

  /** `messages.sendScheduledMessages#bd38850a` */
  sendScheduledMessages(params: Omit<types.messages.SendScheduledMessages, '_'>): Promise<types.TypeUpdates>

  /** `messages.sendScreenshotNotification#a1405817` */
  sendScreenshotNotification(params: Omit<types.messages.SendScreenshotNotification, '_'>): Promise<types.TypeUpdates>

  /** `messages.sendVote#10ea6184` */
  sendVote(params: Omit<types.messages.SendVote, '_'>): Promise<types.TypeUpdates>

  /** `messages.sendWebViewData#dc0242c8` */
  sendWebViewData(params: Omit<types.messages.SendWebViewData, '_'>): Promise<types.TypeUpdates>

  /** `messages.sendWebViewResultMessage#0a4314f5` */
  sendWebViewResultMessage(params: Omit<types.messages.SendWebViewResultMessage, '_'>): Promise<types.TypeWebViewMessageSent>

  /** `messages.setBotCallbackAnswer#d58f130a` */
  setBotCallbackAnswer(params: Omit<types.messages.SetBotCallbackAnswer, '_'>): Promise<boolean>

  /** `messages.setBotGuestChatResult#b8f106e3` */
  setBotGuestChatResult(params: Omit<types.messages.SetBotGuestChatResult, '_'>): Promise<types.TypeInputBotInlineMessageID>

  /** `messages.setBotPrecheckoutResults#09c2dd95` */
  setBotPrecheckoutResults(params: Omit<types.messages.SetBotPrecheckoutResults, '_'>): Promise<boolean>

  /** `messages.setBotShippingResults#e5f672fa` */
  setBotShippingResults(params: Omit<types.messages.SetBotShippingResults, '_'>): Promise<boolean>

  /** `messages.setChatAvailableReactions#864b2581` */
  setChatAvailableReactions(params: Omit<types.messages.SetChatAvailableReactions, '_'>): Promise<types.TypeUpdates>

  /** `messages.setChatTheme#081202c9` */
  setChatTheme(params: Omit<types.messages.SetChatTheme, '_'>): Promise<types.TypeUpdates>

  /** `messages.setChatWallPaper#8ffacae1` */
  setChatWallPaper(params: Omit<types.messages.SetChatWallPaper, '_'>): Promise<types.TypeUpdates>

  /** `messages.setDefaultHistoryTTL#9eb51445` */
  setDefaultHistoryTTL(params: Omit<types.messages.SetDefaultHistoryTTL, '_'>): Promise<boolean>

  /** `messages.setDefaultReaction#4f47a016` */
  setDefaultReaction(params: Omit<types.messages.SetDefaultReaction, '_'>): Promise<boolean>

  /** `messages.setEncryptedTyping#791451ed` */
  setEncryptedTyping(params: Omit<types.messages.SetEncryptedTyping, '_'>): Promise<boolean>

  /** `messages.setGameScore#8ef8ecc0` */
  setGameScore(params: Omit<types.messages.SetGameScore, '_'>): Promise<types.TypeUpdates>

  /** `messages.setHistoryTTL#b80e5fe4` */
  setHistoryTTL(params: Omit<types.messages.SetHistoryTTL, '_'>): Promise<types.TypeUpdates>

  /** `messages.setInlineBotResults#bb12a419` */
  setInlineBotResults(params: Omit<types.messages.SetInlineBotResults, '_'>): Promise<boolean>

  /** `messages.setInlineGameScore#15ad9f64` */
  setInlineGameScore(params: Omit<types.messages.SetInlineGameScore, '_'>): Promise<boolean>

  /** `messages.setTyping#58943ee2` */
  setTyping(params: Omit<types.messages.SetTyping, '_'>): Promise<boolean>

  /** `messages.startBot#e6df7378` */
  startBot(params: Omit<types.messages.StartBot, '_'>): Promise<types.TypeUpdates>

  /** `messages.startHistoryImport#b43df344` */
  startHistoryImport(params: Omit<types.messages.StartHistoryImport, '_'>): Promise<boolean>

  /** `messages.summarizeText#abbbd346` */
  summarizeText(params: Omit<types.messages.SummarizeText, '_'>): Promise<types.TypeTextWithEntities>

  /** `messages.toggleBotInAttachMenu#69f59d69` */
  toggleBotInAttachMenu(params: Omit<types.messages.ToggleBotInAttachMenu, '_'>): Promise<boolean>

  /** `messages.toggleDialogFilterTags#fd2dda49` */
  toggleDialogFilterTags(params: Omit<types.messages.ToggleDialogFilterTags, '_'>): Promise<boolean>

  /** `messages.toggleDialogPin#a731e257` */
  toggleDialogPin(params: Omit<types.messages.ToggleDialogPin, '_'>): Promise<boolean>

  /** `messages.toggleNoForwards#b2081a35` */
  toggleNoForwards(params: Omit<types.messages.ToggleNoForwards, '_'>): Promise<types.TypeUpdates>

  /** `messages.togglePaidReactionPrivacy#435885b5` */
  togglePaidReactionPrivacy(params: Omit<types.messages.TogglePaidReactionPrivacy, '_'>): Promise<boolean>

  /** `messages.togglePeerTranslations#e47cb579` */
  togglePeerTranslations(params: Omit<types.messages.TogglePeerTranslations, '_'>): Promise<boolean>

  /** `messages.toggleSavedDialogPin#ac81bbde` */
  toggleSavedDialogPin(params: Omit<types.messages.ToggleSavedDialogPin, '_'>): Promise<boolean>

  /** `messages.toggleStickerSets#b5052fea` */
  toggleStickerSets(params: Omit<types.messages.ToggleStickerSets, '_'>): Promise<boolean>

  /** `messages.toggleSuggestedPostApproval#8107455c` */
  toggleSuggestedPostApproval(params: Omit<types.messages.ToggleSuggestedPostApproval, '_'>): Promise<types.TypeUpdates>

  /** `messages.toggleTodoCompleted#d3e03124` */
  toggleTodoCompleted(params: Omit<types.messages.ToggleTodoCompleted, '_'>): Promise<types.TypeUpdates>

  /** `messages.transcribeAudio#269e9a49` */
  transcribeAudio(params: Omit<types.messages.TranscribeAudio, '_'>): Promise<types.messages.TypeTranscribedAudio>

  /** `messages.translateRichMessage#1a542004` */
  translateRichMessage(params: Omit<types.messages.TranslateRichMessage, '_'>): Promise<types.messages.TypeTranslatedRichMessage>

  /** `messages.translateText#a5eec345` */
  translateText(params: Omit<types.messages.TranslateText, '_'>): Promise<types.messages.TypeTranslatedText>

  /** `messages.uninstallStickerSet#f96e55de` */
  uninstallStickerSet(params: Omit<types.messages.UninstallStickerSet, '_'>): Promise<boolean>

  /** `messages.unpinAllMessages#062dd747` */
  unpinAllMessages(params: Omit<types.messages.UnpinAllMessages, '_'>): Promise<types.messages.TypeAffectedHistory>

  /** `messages.updateDialogFilter#1ad4a04a` */
  updateDialogFilter(params: Omit<types.messages.UpdateDialogFilter, '_'>): Promise<boolean>

  /** `messages.updateDialogFiltersOrder#c563c1e4` */
  updateDialogFiltersOrder(params: Omit<types.messages.UpdateDialogFiltersOrder, '_'>): Promise<boolean>

  /** `messages.updatePinnedForumTopic#175df251` */
  updatePinnedForumTopic(params: Omit<types.messages.UpdatePinnedForumTopic, '_'>): Promise<types.TypeUpdates>

  /** `messages.updatePinnedMessage#d2aaf7ec` */
  updatePinnedMessage(params: Omit<types.messages.UpdatePinnedMessage, '_'>): Promise<types.TypeUpdates>

  /** `messages.updateSavedReactionTag#60297dec` */
  updateSavedReactionTag(params: Omit<types.messages.UpdateSavedReactionTag, '_'>): Promise<boolean>

  /** `messages.uploadEncryptedFile#5057c497` */
  uploadEncryptedFile(params: Omit<types.messages.UploadEncryptedFile, '_'>): Promise<types.TypeEncryptedFile>

  /** `messages.uploadImportedMedia#2a862092` */
  uploadImportedMedia(params: Omit<types.messages.UploadImportedMedia, '_'>): Promise<types.TypeMessageMedia>

  /** `messages.uploadMedia#14967978` */
  uploadMedia(params: Omit<types.messages.UploadMedia, '_'>): Promise<types.TypeMessageMedia>

  /** `messages.viewSponsoredMessage#269e3643` */
  viewSponsoredMessage(params: Omit<types.messages.ViewSponsoredMessage, '_'>): Promise<boolean>
}

/** Methods in the `payments` namespace. */
export interface PaymentsMethods {
  /** `payments.applyGiftCode#f6e26854` */
  applyGiftCode(params: Omit<types.payments.ApplyGiftCode, '_'>): Promise<types.TypeUpdates>

  /** `payments.assignAppStoreTransaction#80ed747d` */
  assignAppStoreTransaction(params: Omit<types.payments.AssignAppStoreTransaction, '_'>): Promise<types.TypeUpdates>

  /** `payments.assignPlayMarketTransaction#dffd50d3` */
  assignPlayMarketTransaction(params: Omit<types.payments.AssignPlayMarketTransaction, '_'>): Promise<types.TypeUpdates>

  /** `payments.botCancelStarsSubscription#6dfa0622` */
  botCancelStarsSubscription(params: Omit<types.payments.BotCancelStarsSubscription, '_'>): Promise<boolean>

  /** `payments.canPurchaseStore#4fdc5ea7` */
  canPurchaseStore(params: Omit<types.payments.CanPurchaseStore, '_'>): Promise<boolean>

  /** `payments.changeStarsSubscription#c7770878` */
  changeStarsSubscription(params: Omit<types.payments.ChangeStarsSubscription, '_'>): Promise<boolean>

  /** `payments.checkCanSendGift#c0c4edc9` */
  checkCanSendGift(params: Omit<types.payments.CheckCanSendGift, '_'>): Promise<types.payments.TypeCheckCanSendGiftResult>

  /** `payments.checkGiftCode#8e51b4c1` */
  checkGiftCode(params: Omit<types.payments.CheckGiftCode, '_'>): Promise<types.payments.TypeCheckedGiftCode>

  /** `payments.clearSavedInfo#d83d70c1` */
  clearSavedInfo(params?: Omit<types.payments.ClearSavedInfo, '_'>): Promise<boolean>

  /** `payments.connectStarRefBot#7ed5348a` */
  connectStarRefBot(params: Omit<types.payments.ConnectStarRefBot, '_'>): Promise<types.payments.TypeConnectedStarRefBots>

  /** `payments.convertStarGift#74bf076b` */
  convertStarGift(params: Omit<types.payments.ConvertStarGift, '_'>): Promise<boolean>

  /** `payments.craftStarGift#b0f9684f` */
  craftStarGift(params: Omit<types.payments.CraftStarGift, '_'>): Promise<types.TypeUpdates>

  /** `payments.createStarGiftCollection#1f4a0e87` */
  createStarGiftCollection(params: Omit<types.payments.CreateStarGiftCollection, '_'>): Promise<types.TypeStarGiftCollection>

  /** `payments.deleteStarGiftCollection#ad5648e8` */
  deleteStarGiftCollection(params: Omit<types.payments.DeleteStarGiftCollection, '_'>): Promise<boolean>

  /** `payments.editConnectedStarRefBot#e4fca4a3` */
  editConnectedStarRefBot(params: Omit<types.payments.EditConnectedStarRefBot, '_'>): Promise<types.payments.TypeConnectedStarRefBots>

  /** `payments.exportInvoice#0f91b065` */
  exportInvoice(params: Omit<types.payments.ExportInvoice, '_'>): Promise<types.payments.TypeExportedInvoice>

  /** `payments.fulfillStarsSubscription#cc5bebb3` */
  fulfillStarsSubscription(params: Omit<types.payments.FulfillStarsSubscription, '_'>): Promise<boolean>

  /** `payments.getBankCardData#2e79d779` */
  getBankCardData(params: Omit<types.payments.GetBankCardData, '_'>): Promise<types.payments.TypeBankCardData>

  /** `payments.getConnectedStarRefBot#b7d998f0` */
  getConnectedStarRefBot(params: Omit<types.payments.GetConnectedStarRefBot, '_'>): Promise<types.payments.TypeConnectedStarRefBots>

  /** `payments.getConnectedStarRefBots#5869a553` */
  getConnectedStarRefBots(params: Omit<types.payments.GetConnectedStarRefBots, '_'>): Promise<types.payments.TypeConnectedStarRefBots>

  /** `payments.getCraftStarGifts#fd05dd00` */
  getCraftStarGifts(params: Omit<types.payments.GetCraftStarGifts, '_'>): Promise<types.payments.TypeSavedStarGifts>

  /** `payments.getGiveawayInfo#f4239425` */
  getGiveawayInfo(params: Omit<types.payments.GetGiveawayInfo, '_'>): Promise<types.payments.TypeGiveawayInfo>

  /** `payments.getPaymentForm#37148dbb` */
  getPaymentForm(params: Omit<types.payments.GetPaymentForm, '_'>): Promise<types.payments.TypePaymentForm>

  /** `payments.getPaymentReceipt#2478d1cc` */
  getPaymentReceipt(params: Omit<types.payments.GetPaymentReceipt, '_'>): Promise<types.payments.TypePaymentReceipt>

  /** `payments.getPremiumGiftCodeOptions#2757ba54` */
  getPremiumGiftCodeOptions(params?: Omit<types.payments.GetPremiumGiftCodeOptions, '_'>): Promise<readonly types.TypePremiumGiftCodeOption[]>

  /** `payments.getResaleStarGifts#7a5fa236` */
  getResaleStarGifts(params: Omit<types.payments.GetResaleStarGifts, '_'>): Promise<types.payments.TypeResaleStarGifts>

  /** `payments.getSavedInfo#227d824b` */
  getSavedInfo(): Promise<types.payments.TypeSavedInfo>

  /** `payments.getSavedStarGift#b455a106` */
  getSavedStarGift(params: Omit<types.payments.GetSavedStarGift, '_'>): Promise<types.payments.TypeSavedStarGifts>

  /** `payments.getSavedStarGifts#a319e569` */
  getSavedStarGifts(params: Omit<types.payments.GetSavedStarGifts, '_'>): Promise<types.payments.TypeSavedStarGifts>

  /** `payments.getStarGiftActiveAuctions#a5d0514d` */
  getStarGiftActiveAuctions(params: Omit<types.payments.GetStarGiftActiveAuctions, '_'>): Promise<types.payments.TypeStarGiftActiveAuctions>

  /** `payments.getStarGiftAuctionAcquiredGifts#6ba2cbec` */
  getStarGiftAuctionAcquiredGifts(params: Omit<types.payments.GetStarGiftAuctionAcquiredGifts, '_'>): Promise<types.payments.TypeStarGiftAuctionAcquiredGifts>

  /** `payments.getStarGiftAuctionState#5c9ff4d6` */
  getStarGiftAuctionState(params: Omit<types.payments.GetStarGiftAuctionState, '_'>): Promise<types.payments.TypeStarGiftAuctionState>

  /** `payments.getStarGiftCollections#981b91dd` */
  getStarGiftCollections(params: Omit<types.payments.GetStarGiftCollections, '_'>): Promise<types.payments.TypeStarGiftCollections>

  /** `payments.getStarGiftUpgradeAttributes#6d038b58` */
  getStarGiftUpgradeAttributes(params: Omit<types.payments.GetStarGiftUpgradeAttributes, '_'>): Promise<types.payments.TypeStarGiftUpgradeAttributes>

  /** `payments.getStarGiftUpgradePreview#9c9abcb1` */
  getStarGiftUpgradePreview(params: Omit<types.payments.GetStarGiftUpgradePreview, '_'>): Promise<types.payments.TypeStarGiftUpgradePreview>

  /** `payments.getStarGiftWithdrawalUrl#d06e93a8` */
  getStarGiftWithdrawalUrl(params: Omit<types.payments.GetStarGiftWithdrawalUrl, '_'>): Promise<types.payments.TypeStarGiftWithdrawalUrl>

  /** `payments.getStarGifts#c4563590` */
  getStarGifts(params: Omit<types.payments.GetStarGifts, '_'>): Promise<types.payments.TypeStarGifts>

  /** `payments.getStarsGiftOptions#d3c96bc8` */
  getStarsGiftOptions(params?: Omit<types.payments.GetStarsGiftOptions, '_'>): Promise<readonly types.TypeStarsGiftOption[]>

  /** `payments.getStarsGiveawayOptions#bd1efd3e` */
  getStarsGiveawayOptions(): Promise<readonly types.TypeStarsGiveawayOption[]>

  /** `payments.getStarsRevenueAdsAccountUrl#d1d7efc5` */
  getStarsRevenueAdsAccountUrl(params: Omit<types.payments.GetStarsRevenueAdsAccountUrl, '_'>): Promise<types.payments.TypeStarsRevenueAdsAccountUrl>

  /** `payments.getStarsRevenueStats#d91ffad6` */
  getStarsRevenueStats(params: Omit<types.payments.GetStarsRevenueStats, '_'>): Promise<types.payments.TypeStarsRevenueStats>

  /** `payments.getStarsRevenueWithdrawalUrl#2433dc92` */
  getStarsRevenueWithdrawalUrl(params: Omit<types.payments.GetStarsRevenueWithdrawalUrl, '_'>): Promise<types.payments.TypeStarsRevenueWithdrawalUrl>

  /** `payments.getStarsStatus#4ea9b3bf` */
  getStarsStatus(params: Omit<types.payments.GetStarsStatus, '_'>): Promise<types.payments.TypeStarsStatus>

  /** `payments.getStarsSubscriptions#032512c5` */
  getStarsSubscriptions(params: Omit<types.payments.GetStarsSubscriptions, '_'>): Promise<types.payments.TypeStarsStatus>

  /** `payments.getStarsTopupOptions#c00ec7d3` */
  getStarsTopupOptions(): Promise<readonly types.TypeStarsTopupOption[]>

  /** `payments.getStarsTransactions#69da4557` */
  getStarsTransactions(params: Omit<types.payments.GetStarsTransactions, '_'>): Promise<types.payments.TypeStarsStatus>

  /** `payments.getStarsTransactionsByID#2dca16b8` */
  getStarsTransactionsByID(params: Omit<types.payments.GetStarsTransactionsByID, '_'>): Promise<types.payments.TypeStarsStatus>

  /** `payments.getSuggestedStarRefBots#0d6b48f7` */
  getSuggestedStarRefBots(params: Omit<types.payments.GetSuggestedStarRefBots, '_'>): Promise<types.payments.TypeSuggestedStarRefBots>

  /** `payments.getUniqueStarGift#a1974d72` */
  getUniqueStarGift(params: Omit<types.payments.GetUniqueStarGift, '_'>): Promise<types.payments.TypeUniqueStarGift>

  /** `payments.getUniqueStarGiftValueInfo#4365af6b` */
  getUniqueStarGiftValueInfo(params: Omit<types.payments.GetUniqueStarGiftValueInfo, '_'>): Promise<types.payments.TypeUniqueStarGiftValueInfo>

  /** `payments.launchPrepaidGiveaway#5ff58f20` */
  launchPrepaidGiveaway(params: Omit<types.payments.LaunchPrepaidGiveaway, '_'>): Promise<types.TypeUpdates>

  /** `payments.refundStarsCharge#25ae8f4a` */
  refundStarsCharge(params: Omit<types.payments.RefundStarsCharge, '_'>): Promise<types.TypeUpdates>

  /** `payments.reorderStarGiftCollections#c32af4cc` */
  reorderStarGiftCollections(params: Omit<types.payments.ReorderStarGiftCollections, '_'>): Promise<boolean>

  /** `payments.resolveStarGiftOffer#e9ce781c` */
  resolveStarGiftOffer(params: Omit<types.payments.ResolveStarGiftOffer, '_'>): Promise<types.TypeUpdates>

  /** `payments.saveStarGift#2a2a697c` */
  saveStarGift(params: Omit<types.payments.SaveStarGift, '_'>): Promise<boolean>

  /** `payments.sendPaymentForm#2d03522f` */
  sendPaymentForm(params: Omit<types.payments.SendPaymentForm, '_'>): Promise<types.payments.TypePaymentResult>

  /** `payments.sendStarGiftOffer#8fb86b41` */
  sendStarGiftOffer(params: Omit<types.payments.SendStarGiftOffer, '_'>): Promise<types.TypeUpdates>

  /** `payments.sendStarsForm#7998c914` */
  sendStarsForm(params: Omit<types.payments.SendStarsForm, '_'>): Promise<types.payments.TypePaymentResult>

  /** `payments.toggleChatStarGiftNotifications#60eaefa1` */
  toggleChatStarGiftNotifications(params: Omit<types.payments.ToggleChatStarGiftNotifications, '_'>): Promise<boolean>

  /** `payments.toggleStarGiftsPinnedToTop#1513e7b0` */
  toggleStarGiftsPinnedToTop(params: Omit<types.payments.ToggleStarGiftsPinnedToTop, '_'>): Promise<boolean>

  /** `payments.transferStarGift#7f18176a` */
  transferStarGift(params: Omit<types.payments.TransferStarGift, '_'>): Promise<types.TypeUpdates>

  /** `payments.updateStarGiftCollection#4fddbee7` */
  updateStarGiftCollection(params: Omit<types.payments.UpdateStarGiftCollection, '_'>): Promise<types.TypeStarGiftCollection>

  /** `payments.updateStarGiftPrice#edbe6ccb` */
  updateStarGiftPrice(params: Omit<types.payments.UpdateStarGiftPrice, '_'>): Promise<types.TypeUpdates>

  /** `payments.upgradeStarGift#aed6e4f5` */
  upgradeStarGift(params: Omit<types.payments.UpgradeStarGift, '_'>): Promise<types.TypeUpdates>

  /** `payments.validateRequestedInfo#b6c8f12b` */
  validateRequestedInfo(params: Omit<types.payments.ValidateRequestedInfo, '_'>): Promise<types.payments.TypeValidatedRequestedInfo>
}

/** Methods in the `phone` namespace. */
export interface PhoneMethods {
  /** `phone.acceptCall#3bd2b4a0` */
  acceptCall(params: Omit<types.phone.AcceptCall, '_'>): Promise<types.phone.TypePhoneCall>

  /** `phone.checkGroupCall#b59cf977` */
  checkGroupCall(params: Omit<types.phone.CheckGroupCall, '_'>): Promise<readonly number[]>

  /** `phone.confirmCall#2efe1722` */
  confirmCall(params: Omit<types.phone.ConfirmCall, '_'>): Promise<types.phone.TypePhoneCall>

  /** `phone.createConferenceCall#7d0444bb` */
  createConferenceCall(params: Omit<types.phone.CreateConferenceCall, '_'>): Promise<types.TypeUpdates>

  /** `phone.createGroupCall#48cdc6d8` */
  createGroupCall(params: Omit<types.phone.CreateGroupCall, '_'>): Promise<types.TypeUpdates>

  /** `phone.declineConferenceCallInvite#3c479971` */
  declineConferenceCallInvite(params: Omit<types.phone.DeclineConferenceCallInvite, '_'>): Promise<types.TypeUpdates>

  /** `phone.deleteConferenceCallParticipants#8ca60525` */
  deleteConferenceCallParticipants(params: Omit<types.phone.DeleteConferenceCallParticipants, '_'>): Promise<types.TypeUpdates>

  /** `phone.deleteGroupCallMessages#f64f54f7` */
  deleteGroupCallMessages(params: Omit<types.phone.DeleteGroupCallMessages, '_'>): Promise<types.TypeUpdates>

  /** `phone.deleteGroupCallParticipantMessages#1dbfeca0` */
  deleteGroupCallParticipantMessages(params: Omit<types.phone.DeleteGroupCallParticipantMessages, '_'>): Promise<types.TypeUpdates>

  /** `phone.discardCall#b2cbc1c0` */
  discardCall(params: Omit<types.phone.DiscardCall, '_'>): Promise<types.TypeUpdates>

  /** `phone.discardGroupCall#7a777135` */
  discardGroupCall(params: Omit<types.phone.DiscardGroupCall, '_'>): Promise<types.TypeUpdates>

  /** `phone.editGroupCallParticipant#a5273abf` */
  editGroupCallParticipant(params: Omit<types.phone.EditGroupCallParticipant, '_'>): Promise<types.TypeUpdates>

  /** `phone.editGroupCallTitle#1ca6ac0a` */
  editGroupCallTitle(params: Omit<types.phone.EditGroupCallTitle, '_'>): Promise<types.TypeUpdates>

  /** `phone.exportGroupCallInvite#e6aa647f` */
  exportGroupCallInvite(params: Omit<types.phone.ExportGroupCallInvite, '_'>): Promise<types.phone.TypeExportedGroupCallInvite>

  /** `phone.getCallConfig#55451fa9` */
  getCallConfig(): Promise<types.TypeDataJSON>

  /** `phone.getGroupCall#041845db` */
  getGroupCall(params: Omit<types.phone.GetGroupCall, '_'>): Promise<types.phone.TypeGroupCall>

  /** `phone.getGroupCallChainBlocks#ee9f88a6` */
  getGroupCallChainBlocks(params: Omit<types.phone.GetGroupCallChainBlocks, '_'>): Promise<types.TypeUpdates>

  /** `phone.getGroupCallJoinAs#ef7c213a` */
  getGroupCallJoinAs(params: Omit<types.phone.GetGroupCallJoinAs, '_'>): Promise<types.phone.TypeJoinAsPeers>

  /** `phone.getGroupCallStars#6f636302` */
  getGroupCallStars(params: Omit<types.phone.GetGroupCallStars, '_'>): Promise<types.phone.TypeGroupCallStars>

  /** `phone.getGroupCallStreamChannels#1ab21940` */
  getGroupCallStreamChannels(params: Omit<types.phone.GetGroupCallStreamChannels, '_'>): Promise<types.phone.TypeGroupCallStreamChannels>

  /** `phone.getGroupCallStreamRtmpUrl#5af4c73a` */
  getGroupCallStreamRtmpUrl(params: Omit<types.phone.GetGroupCallStreamRtmpUrl, '_'>): Promise<types.phone.TypeGroupCallStreamRtmpUrl>

  /** `phone.getGroupParticipants#c558d8ab` */
  getGroupParticipants(params: Omit<types.phone.GetGroupParticipants, '_'>): Promise<types.phone.TypeGroupParticipants>

  /** `phone.inviteConferenceCallParticipant#bcf22685` */
  inviteConferenceCallParticipant(params: Omit<types.phone.InviteConferenceCallParticipant, '_'>): Promise<types.TypeUpdates>

  /** `phone.inviteToGroupCall#7b393160` */
  inviteToGroupCall(params: Omit<types.phone.InviteToGroupCall, '_'>): Promise<types.TypeUpdates>

  /** `phone.joinGroupCall#8fb53057` */
  joinGroupCall(params: Omit<types.phone.JoinGroupCall, '_'>): Promise<types.TypeUpdates>

  /** `phone.joinGroupCallPresentation#cbea6bc4` */
  joinGroupCallPresentation(params: Omit<types.phone.JoinGroupCallPresentation, '_'>): Promise<types.TypeUpdates>

  /** `phone.leaveGroupCall#500377f9` */
  leaveGroupCall(params: Omit<types.phone.LeaveGroupCall, '_'>): Promise<types.TypeUpdates>

  /** `phone.leaveGroupCallPresentation#1c50d144` */
  leaveGroupCallPresentation(params: Omit<types.phone.LeaveGroupCallPresentation, '_'>): Promise<types.TypeUpdates>

  /** `phone.receivedCall#17d54f61` */
  receivedCall(params: Omit<types.phone.ReceivedCall, '_'>): Promise<boolean>

  /** `phone.requestCall#42ff96ed` */
  requestCall(params: Omit<types.phone.RequestCall, '_'>): Promise<types.phone.TypePhoneCall>

  /** `phone.saveCallDebug#277add7e` */
  saveCallDebug(params: Omit<types.phone.SaveCallDebug, '_'>): Promise<boolean>

  /** `phone.saveCallLog#41248786` */
  saveCallLog(params: Omit<types.phone.SaveCallLog, '_'>): Promise<boolean>

  /** `phone.saveDefaultGroupCallJoinAs#575e1f8c` */
  saveDefaultGroupCallJoinAs(params: Omit<types.phone.SaveDefaultGroupCallJoinAs, '_'>): Promise<boolean>

  /** `phone.saveDefaultSendAs#4167add1` */
  saveDefaultSendAs(params: Omit<types.phone.SaveDefaultSendAs, '_'>): Promise<boolean>

  /** `phone.sendConferenceCallBroadcast#c6701900` */
  sendConferenceCallBroadcast(params: Omit<types.phone.SendConferenceCallBroadcast, '_'>): Promise<types.TypeUpdates>

  /** `phone.sendGroupCallEncryptedMessage#e5afa56d` */
  sendGroupCallEncryptedMessage(params: Omit<types.phone.SendGroupCallEncryptedMessage, '_'>): Promise<boolean>

  /** `phone.sendGroupCallMessage#b1d11410` */
  sendGroupCallMessage(params: Omit<types.phone.SendGroupCallMessage, '_'>): Promise<types.TypeUpdates>

  /** `phone.sendSignalingData#ff7a9383` */
  sendSignalingData(params: Omit<types.phone.SendSignalingData, '_'>): Promise<boolean>

  /** `phone.setCallRating#59ead627` */
  setCallRating(params: Omit<types.phone.SetCallRating, '_'>): Promise<types.TypeUpdates>

  /** `phone.startScheduledGroupCall#5680e342` */
  startScheduledGroupCall(params: Omit<types.phone.StartScheduledGroupCall, '_'>): Promise<types.TypeUpdates>

  /** `phone.toggleGroupCallRecord#f128c708` */
  toggleGroupCallRecord(params: Omit<types.phone.ToggleGroupCallRecord, '_'>): Promise<types.TypeUpdates>

  /** `phone.toggleGroupCallSettings#974392f2` */
  toggleGroupCallSettings(params: Omit<types.phone.ToggleGroupCallSettings, '_'>): Promise<types.TypeUpdates>

  /** `phone.toggleGroupCallStartSubscription#219c34e6` */
  toggleGroupCallStartSubscription(params: Omit<types.phone.ToggleGroupCallStartSubscription, '_'>): Promise<types.TypeUpdates>
}

/** Methods in the `photos` namespace. */
export interface PhotosMethods {
  /** `photos.deletePhotos#87cf7f2f` */
  deletePhotos(params: Omit<types.photos.DeletePhotos, '_'>): Promise<readonly bigint[]>

  /** `photos.getUserPhotos#91cd32a8` */
  getUserPhotos(params: Omit<types.photos.GetUserPhotos, '_'>): Promise<types.photos.TypePhotos>

  /** `photos.updateProfilePhoto#09e82039` */
  updateProfilePhoto(params: Omit<types.photos.UpdateProfilePhoto, '_'>): Promise<types.photos.TypePhoto>

  /** `photos.uploadContactProfilePhoto#e14c4a71` */
  uploadContactProfilePhoto(params: Omit<types.photos.UploadContactProfilePhoto, '_'>): Promise<types.photos.TypePhoto>

  /** `photos.uploadProfilePhoto#0388a3b5` */
  uploadProfilePhoto(params?: Omit<types.photos.UploadProfilePhoto, '_'>): Promise<types.photos.TypePhoto>
}

/** Methods in the `premium` namespace. */
export interface PremiumMethods {
  /** `premium.applyBoost#6b7da746` */
  applyBoost(params: Omit<types.premium.ApplyBoost, '_'>): Promise<types.premium.TypeMyBoosts>

  /** `premium.getBoostsList#60f67660` */
  getBoostsList(params: Omit<types.premium.GetBoostsList, '_'>): Promise<types.premium.TypeBoostsList>

  /** `premium.getBoostsStatus#042f1f61` */
  getBoostsStatus(params: Omit<types.premium.GetBoostsStatus, '_'>): Promise<types.premium.TypeBoostsStatus>

  /** `premium.getMyBoosts#0be77b4a` */
  getMyBoosts(): Promise<types.premium.TypeMyBoosts>

  /** `premium.getUserBoosts#39854d1f` */
  getUserBoosts(params: Omit<types.premium.GetUserBoosts, '_'>): Promise<types.premium.TypeBoostsList>
}

/** Methods in the `smsjobs` namespace. */
export interface SmsjobsMethods {
  /** `smsjobs.finishJob#4f1ebf24` */
  finishJob(params: Omit<types.smsjobs.FinishJob, '_'>): Promise<boolean>

  /** `smsjobs.getSmsJob#778d902f` */
  getSmsJob(params: Omit<types.smsjobs.GetSmsJob, '_'>): Promise<types.TypeSmsJob>

  /** `smsjobs.getStatus#10a698e8` */
  getStatus(): Promise<types.smsjobs.TypeStatus>

  /** `smsjobs.isEligibleToJoin#0edc39d0` */
  isEligibleToJoin(): Promise<types.smsjobs.TypeEligibilityToJoin>

  /** `smsjobs.join#a74ece2d` */
  join(): Promise<boolean>

  /** `smsjobs.leave#9898ad73` */
  leave(): Promise<boolean>

  /** `smsjobs.updateSettings#093fa0bf` */
  updateSettings(params?: Omit<types.smsjobs.UpdateSettings, '_'>): Promise<boolean>
}

/** Methods in the `stats` namespace. */
export interface StatsMethods {
  /** `stats.getBroadcastStats#ab42441a` */
  getBroadcastStats(params: Omit<types.stats.GetBroadcastStats, '_'>): Promise<types.stats.TypeBroadcastStats>

  /** `stats.getMegagroupStats#dcdf8607` */
  getMegagroupStats(params: Omit<types.stats.GetMegagroupStats, '_'>): Promise<types.stats.TypeMegagroupStats>

  /** `stats.getMessagePublicForwards#5f150144` */
  getMessagePublicForwards(params: Omit<types.stats.GetMessagePublicForwards, '_'>): Promise<types.stats.TypePublicForwards>

  /** `stats.getMessageStats#b6e0a3f5` */
  getMessageStats(params: Omit<types.stats.GetMessageStats, '_'>): Promise<types.stats.TypeMessageStats>

  /** `stats.getPollStats#c27dfa68` */
  getPollStats(params: Omit<types.stats.GetPollStats, '_'>): Promise<types.stats.TypePollStats>

  /** `stats.getStoryPublicForwards#a6437ef6` */
  getStoryPublicForwards(params: Omit<types.stats.GetStoryPublicForwards, '_'>): Promise<types.stats.TypePublicForwards>

  /** `stats.getStoryStats#374fef40` */
  getStoryStats(params: Omit<types.stats.GetStoryStats, '_'>): Promise<types.stats.TypeStoryStats>

  /** `stats.loadAsyncGraph#621d5fa0` */
  loadAsyncGraph(params: Omit<types.stats.LoadAsyncGraph, '_'>): Promise<types.TypeStatsGraph>
}

/** Methods in the `stickers` namespace. */
export interface StickersMethods {
  /** `stickers.addStickerToSet#8653febe` */
  addStickerToSet(params: Omit<types.stickers.AddStickerToSet, '_'>): Promise<types.messages.TypeStickerSet>

  /** `stickers.changeSticker#f5537ebc` */
  changeSticker(params: Omit<types.stickers.ChangeSticker, '_'>): Promise<types.messages.TypeStickerSet>

  /** `stickers.changeStickerPosition#ffb6d4ca` */
  changeStickerPosition(params: Omit<types.stickers.ChangeStickerPosition, '_'>): Promise<types.messages.TypeStickerSet>

  /** `stickers.checkShortName#284b3639` */
  checkShortName(params: Omit<types.stickers.CheckShortName, '_'>): Promise<boolean>

  /** `stickers.createStickerSet#9021ab67` */
  createStickerSet(params: Omit<types.stickers.CreateStickerSet, '_'>): Promise<types.messages.TypeStickerSet>

  /** `stickers.deleteStickerSet#87704394` */
  deleteStickerSet(params: Omit<types.stickers.DeleteStickerSet, '_'>): Promise<boolean>

  /** `stickers.removeStickerFromSet#f7760f51` */
  removeStickerFromSet(params: Omit<types.stickers.RemoveStickerFromSet, '_'>): Promise<types.messages.TypeStickerSet>

  /** `stickers.renameStickerSet#124b1c00` */
  renameStickerSet(params: Omit<types.stickers.RenameStickerSet, '_'>): Promise<types.messages.TypeStickerSet>

  /** `stickers.replaceSticker#4696459a` */
  replaceSticker(params: Omit<types.stickers.ReplaceSticker, '_'>): Promise<types.messages.TypeStickerSet>

  /** `stickers.setStickerSetThumb#a76a5392` */
  setStickerSetThumb(params: Omit<types.stickers.SetStickerSetThumb, '_'>): Promise<types.messages.TypeStickerSet>

  /** `stickers.suggestShortName#4dafc503` */
  suggestShortName(params: Omit<types.stickers.SuggestShortName, '_'>): Promise<types.stickers.TypeSuggestedShortName>
}

/** Methods in the `stories` namespace. */
export interface StoriesMethods {
  /** `stories.activateStealthMode#57bbd166` */
  activateStealthMode(params?: Omit<types.stories.ActivateStealthMode, '_'>): Promise<types.TypeUpdates>

  /** `stories.canSendStory#30eb63f0` */
  canSendStory(params: Omit<types.stories.CanSendStory, '_'>): Promise<types.stories.TypeCanSendStoryCount>

  /** `stories.createAlbum#a36396e5` */
  createAlbum(params: Omit<types.stories.CreateAlbum, '_'>): Promise<types.TypeStoryAlbum>

  /** `stories.deleteAlbum#8d3456d0` */
  deleteAlbum(params: Omit<types.stories.DeleteAlbum, '_'>): Promise<boolean>

  /** `stories.deleteStories#ae59db5f` */
  deleteStories(params: Omit<types.stories.DeleteStories, '_'>): Promise<readonly number[]>

  /** `stories.editStory#2c63a72b` */
  editStory(params: Omit<types.stories.EditStory, '_'>): Promise<types.TypeUpdates>

  /** `stories.exportStoryLink#7b8def20` */
  exportStoryLink(params: Omit<types.stories.ExportStoryLink, '_'>): Promise<types.TypeExportedStoryLink>

  /** `stories.getAlbumStories#ac806d61` */
  getAlbumStories(params: Omit<types.stories.GetAlbumStories, '_'>): Promise<types.stories.TypeStories>

  /** `stories.getAlbums#25b3eac7` */
  getAlbums(params: Omit<types.stories.GetAlbums, '_'>): Promise<types.stories.TypeAlbums>

  /** `stories.getAllReadPeerStories#9b5ae7f9` */
  getAllReadPeerStories(): Promise<types.TypeUpdates>

  /** `stories.getAllStories#eeb0d625` */
  getAllStories(params?: Omit<types.stories.GetAllStories, '_'>): Promise<types.stories.TypeAllStories>

  /** `stories.getChatsToSend#a56a8b60` */
  getChatsToSend(): Promise<types.messages.TypeChats>

  /** `stories.getPeerMaxIDs#78499170` */
  getPeerMaxIDs(params: Omit<types.stories.GetPeerMaxIDs, '_'>): Promise<readonly types.TypeRecentStory[]>

  /** `stories.getPeerStories#2c4ada50` */
  getPeerStories(params: Omit<types.stories.GetPeerStories, '_'>): Promise<types.stories.TypePeerStories>

  /** `stories.getPinnedStories#5821a5dc` */
  getPinnedStories(params: Omit<types.stories.GetPinnedStories, '_'>): Promise<types.stories.TypeStories>

  /** `stories.getStoriesArchive#b4352016` */
  getStoriesArchive(params: Omit<types.stories.GetStoriesArchive, '_'>): Promise<types.stories.TypeStories>

  /** `stories.getStoriesByID#5774ca74` */
  getStoriesByID(params: Omit<types.stories.GetStoriesByID, '_'>): Promise<types.stories.TypeStories>

  /** `stories.getStoriesViews#28e16cc8` */
  getStoriesViews(params: Omit<types.stories.GetStoriesViews, '_'>): Promise<types.stories.TypeStoryViews>

  /** `stories.getStoryReactionsList#b9b2881f` */
  getStoryReactionsList(params: Omit<types.stories.GetStoryReactionsList, '_'>): Promise<types.stories.TypeStoryReactionsList>

  /** `stories.getStoryViewsList#7ed23c57` */
  getStoryViewsList(params: Omit<types.stories.GetStoryViewsList, '_'>): Promise<types.stories.TypeStoryViewsList>

  /** `stories.incrementStoryViews#b2028afb` */
  incrementStoryViews(params: Omit<types.stories.IncrementStoryViews, '_'>): Promise<boolean>

  /** `stories.readStories#a556dac8` */
  readStories(params: Omit<types.stories.ReadStories, '_'>): Promise<readonly number[]>

  /** `stories.reorderAlbums#8535fbd9` */
  reorderAlbums(params: Omit<types.stories.ReorderAlbums, '_'>): Promise<boolean>

  /** `stories.report#19d8eb45` */
  report(params: Omit<types.stories.Report, '_'>): Promise<types.TypeReportResult>

  /** `stories.searchPosts#d1810907` */
  searchPosts(params: Omit<types.stories.SearchPosts, '_'>): Promise<types.stories.TypeFoundStories>

  /** `stories.sendReaction#7fd736b2` */
  sendReaction(params: Omit<types.stories.SendReaction, '_'>): Promise<types.TypeUpdates>

  /** `stories.sendStory#8f9e6898` */
  sendStory(params: Omit<types.stories.SendStory, '_'>): Promise<types.TypeUpdates>

  /** `stories.startLive#d069ccde` */
  startLive(params: Omit<types.stories.StartLive, '_'>): Promise<types.TypeUpdates>

  /** `stories.toggleAllStoriesHidden#7c2557c4` */
  toggleAllStoriesHidden(params: Omit<types.stories.ToggleAllStoriesHidden, '_'>): Promise<boolean>

  /** `stories.togglePeerStoriesHidden#bd0415c4` */
  togglePeerStoriesHidden(params: Omit<types.stories.TogglePeerStoriesHidden, '_'>): Promise<boolean>

  /** `stories.togglePinned#9a75a1ef` */
  togglePinned(params: Omit<types.stories.TogglePinned, '_'>): Promise<readonly number[]>

  /** `stories.togglePinnedToTop#0b297e9b` */
  togglePinnedToTop(params: Omit<types.stories.TogglePinnedToTop, '_'>): Promise<boolean>

  /** `stories.updateAlbum#5e5259b6` */
  updateAlbum(params: Omit<types.stories.UpdateAlbum, '_'>): Promise<types.TypeStoryAlbum>
}

/** Methods in the `updates` namespace. */
export interface UpdatesMethods {
  /** `updates.getChannelDifference#03173d78` */
  getChannelDifference(params: Omit<types.updates.GetChannelDifference, '_'>): Promise<types.updates.TypeChannelDifference>

  /** `updates.getDifference#19c2f763` */
  getDifference(params: Omit<types.updates.GetDifference, '_'>): Promise<types.updates.TypeDifference>

  /** `updates.getState#edd4882a` */
  getState(): Promise<types.updates.TypeState>
}

/** Methods in the `upload` namespace. */
export interface UploadMethods {
  /** `upload.getCdnFile#395f69da` */
  getCdnFile(params: Omit<types.upload.GetCdnFile, '_'>): Promise<types.upload.TypeCdnFile>

  /** `upload.getCdnFileHashes#91dc3f31` */
  getCdnFileHashes(params: Omit<types.upload.GetCdnFileHashes, '_'>): Promise<readonly types.TypeFileHash[]>

  /** `upload.getFile#be5335be` */
  getFile(params: Omit<types.upload.GetFile, '_'>): Promise<types.upload.TypeFile>

  /** `upload.getFileHashes#9156982a` */
  getFileHashes(params: Omit<types.upload.GetFileHashes, '_'>): Promise<readonly types.TypeFileHash[]>

  /** `upload.getWebFile#24e6818d` */
  getWebFile(params: Omit<types.upload.GetWebFile, '_'>): Promise<types.upload.TypeWebFile>

  /** `upload.reuploadCdnFile#9b2754a8` */
  reuploadCdnFile(params: Omit<types.upload.ReuploadCdnFile, '_'>): Promise<readonly types.TypeFileHash[]>

  /** `upload.saveBigFilePart#de7b673d` */
  saveBigFilePart(params: Omit<types.upload.SaveBigFilePart, '_'>): Promise<boolean>

  /** `upload.saveFilePart#b304a621` */
  saveFilePart(params: Omit<types.upload.SaveFilePart, '_'>): Promise<boolean>
}

/** Methods in the `users` namespace. */
export interface UsersMethods {
  /** `users.getFullUser#b60f5918` */
  getFullUser(params: Omit<types.users.GetFullUser, '_'>): Promise<types.users.TypeUserFull>

  /** `users.getRequirementsToContact#d89a83a3` */
  getRequirementsToContact(params: Omit<types.users.GetRequirementsToContact, '_'>): Promise<readonly types.TypeRequirementToContact[]>

  /** `users.getSavedMusic#788d7fe3` */
  getSavedMusic(params: Omit<types.users.GetSavedMusic, '_'>): Promise<types.users.TypeSavedMusic>

  /** `users.getSavedMusicByID#7573a4e9` */
  getSavedMusicByID(params: Omit<types.users.GetSavedMusicByID, '_'>): Promise<types.users.TypeSavedMusic>

  /** `users.getUsers#0d91a548` */
  getUsers(params: Omit<types.users.GetUsers, '_'>): Promise<readonly types.TypeUser[]>

  /** `users.setSecureValueErrors#90c894b5` */
  setSecureValueErrors(params: Omit<types.users.SetSecureValueErrors, '_'>): Promise<boolean>

  /** `users.suggestBirthday#fc533372` */
  suggestBirthday(params: Omit<types.users.SuggestBirthday, '_'>): Promise<types.TypeUpdates>
}

/**
 * Every method the schema declares, addressed the way TL names it.
 *
 * The typed half of `docs/architecture.md` §7. A method newer than this
 * build is not here, and is reached by naming it — which is what `call`
 * is for.
 */
export interface ApiMethods {
  /** The `account` namespace. */
  readonly account: AccountMethods

  /** The `aicompose` namespace. */
  readonly aicompose: AicomposeMethods

  /** The `auth` namespace. */
  readonly auth: AuthMethods

  /** The `bots` namespace. */
  readonly bots: BotsMethods

  /** The `channels` namespace. */
  readonly channels: ChannelsMethods

  /** The `chatlists` namespace. */
  readonly chatlists: ChatlistsMethods

  /** The `communities` namespace. */
  readonly communities: CommunitiesMethods

  /** The `contacts` namespace. */
  readonly contacts: ContactsMethods

  /** The `ephemeral` namespace. */
  readonly ephemeral: EphemeralMethods

  /** The `folders` namespace. */
  readonly folders: FoldersMethods

  /** The `fragment` namespace. */
  readonly fragment: FragmentMethods

  /** The `help` namespace. */
  readonly help: HelpMethods

  /** The `langpack` namespace. */
  readonly langpack: LangpackMethods

  /** The `messages` namespace. */
  readonly messages: MessagesMethods

  /** The `payments` namespace. */
  readonly payments: PaymentsMethods

  /** The `phone` namespace. */
  readonly phone: PhoneMethods

  /** The `photos` namespace. */
  readonly photos: PhotosMethods

  /** The `premium` namespace. */
  readonly premium: PremiumMethods

  /** The `smsjobs` namespace. */
  readonly smsjobs: SmsjobsMethods

  /** The `stats` namespace. */
  readonly stats: StatsMethods

  /** The `stickers` namespace. */
  readonly stickers: StickersMethods

  /** The `stories` namespace. */
  readonly stories: StoriesMethods

  /** The `updates` namespace. */
  readonly updates: UpdatesMethods

  /** The `upload` namespace. */
  readonly upload: UploadMethods

  /** The `users` namespace. */
  readonly users: UsersMethods

  /** `initConnection#c1cd5ea9` */
  initConnection(params: Omit<types.InitConnection, '_'>): Promise<TlObject>

  /** `invokeAfterMsg#cb9f372d` */
  invokeAfterMsg(params: Omit<types.InvokeAfterMsg, '_'>): Promise<TlObject>

  /** `invokeAfterMsgs#3dc4b4f0` */
  invokeAfterMsgs(params: Omit<types.InvokeAfterMsgs, '_'>): Promise<TlObject>

  /** `invokeWithApnsSecret#0dae54f8` */
  invokeWithApnsSecret(params: Omit<types.InvokeWithApnsSecret, '_'>): Promise<TlObject>

  /** `invokeWithBusinessConnection#dd289f8e` */
  invokeWithBusinessConnection(params: Omit<types.InvokeWithBusinessConnection, '_'>): Promise<TlObject>

  /** `invokeWithGooglePlayIntegrity#1df92984` */
  invokeWithGooglePlayIntegrity(params: Omit<types.InvokeWithGooglePlayIntegrity, '_'>): Promise<TlObject>

  /** `invokeWithLayer#da9b0d0d` */
  invokeWithLayer(params: Omit<types.InvokeWithLayer, '_'>): Promise<TlObject>

  /** `invokeWithMessagesRange#365275f2` */
  invokeWithMessagesRange(params: Omit<types.InvokeWithMessagesRange, '_'>): Promise<TlObject>

  /** `invokeWithReCaptcha#adbb0f94` */
  invokeWithReCaptcha(params: Omit<types.InvokeWithReCaptcha, '_'>): Promise<TlObject>

  /** `invokeWithTakeout#aca9fd2e` */
  invokeWithTakeout(params: Omit<types.InvokeWithTakeout, '_'>): Promise<TlObject>

  /** `invokeWithoutUpdates#bf9459b7` */
  invokeWithoutUpdates(params: Omit<types.InvokeWithoutUpdates, '_'>): Promise<TlObject>
}
