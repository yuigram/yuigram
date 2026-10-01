/**
 * Mini App launch data: reading `Telegram.WebApp.initData`, and checking that
 * Telegram issued it.
 *
 * Its own entry point, so a program that never checks launch data never loads it.
 */

export {
  type InitData,
  InitDataError,
  type InitDataFreshness,
  InitDataKey,
  type InitDataProblem,
  readInitData,
  TELEGRAM_INIT_DATA_KEYS,
  type VerifyInitDataOptions,
  type VerifyInitDataSignatureOptions,
  verifyInitData,
  verifyInitDataSignature,
  type WebAppChat,
  type WebAppUser,
} from './init-data.js'
