/**
 * Utilities that need no account: waveforms, inline previews, Instant View
 * pages and rich text, and inline message identifiers.
 *
 * Every one of them is synchronous and works on values already in hand.
 * Its own entry point, so a program that never draws a waveform or walks a
 * page never loads any of it:
 *
 * ```ts
 * import { decodeWaveform, strippedToJpeg } from '@yuigram/mtproto/utils'
 * ```
 *
 * File types, file names, phone numbers and peer conversions are on the main
 * entry point instead, because sending and signing in use them.
 */

export { readInlineMessageId, writeInlineMessageId } from '../messaging/interact.js'
export {
  formattedToRichText,
  type PageMedia,
  type PageVisit,
  pageMedia,
  richTextToFormatted,
  walkPageBlocks,
} from './pages.js'
export {
  type EmbeddedThumbnail,
  embeddedThumbnail,
  inflatePath,
  type OutlineOptions,
  outlineSvg,
  strippedToJpeg,
} from './thumbnails.js'
export { decodeWaveform, encodeWaveform } from './waveform.js'
