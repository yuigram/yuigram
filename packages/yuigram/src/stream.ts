// SPDX-License-Identifier: MIT

/**
 * Streaming a model's answer into a chat as it is written: the Bot API plugin,
 * the account form, and the sources and engine both share.
 *
 * Its own entry point, so a program that never streams never loads it.
 */

export * from '@yuigram/bot-api/stream'
export { type AccountStreamOptions, type StreamingAccount, streamTo } from '@yuigram/mtproto/stream'
