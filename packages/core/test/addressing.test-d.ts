// SPDX-License-Identifier: MIT

/**
 * Type-level assertions for identifiers and links.
 *
 * A link description is only useful if its kind narrows it: code that checks
 * `link.kind === 'message'` must be able to read `link.chat` without a cast, and
 * a description missing a field Telegram requires must not compile.
 */

import { describe, expectTypeOf, it } from 'vitest'
import {
  type AttachTarget,
  botApiId,
  isMarkedPeerId,
  type LinkAdminRight,
  type LinkChat,
  type MarkedKind,
  markedKind,
  type PeerIdentity,
  peerIdentity,
  readLink,
  type TelegramLink,
  writeLink,
} from '../src/index.js'

describe('identifiers', () => {
  it('reads to an identity with a bigint identifier and a closed kind', () => {
    expectTypeOf(peerIdentity).returns.toEqualTypeOf<PeerIdentity>()
    expectTypeOf<PeerIdentity['id']>().toEqualTypeOf<bigint>()
    expectTypeOf<PeerIdentity['kind']>().toEqualTypeOf<'user' | 'chat' | 'channel'>()
    expectTypeOf(markedKind).returns.toEqualTypeOf<MarkedKind | undefined>()
    expectTypeOf(botApiId).returns.toEqualTypeOf<number>()
  })

  it('narrows an unknown value it recognises', () => {
    const value: unknown = '-1001234567890'
    if (isMarkedPeerId(value)) {
      expectTypeOf(value).toEqualTypeOf<string | number | bigint>()
      peerIdentity(value)
    }
  })
})

describe('links', () => {
  it('narrows a description by its kind', () => {
    const link = readLink('t.me/c/1234567890/7')
    expectTypeOf(link).toEqualTypeOf<TelegramLink | undefined>()

    if (link?.kind === 'message') {
      expectTypeOf(link.chat).toEqualTypeOf<LinkChat>()
      expectTypeOf(link.id).toEqualTypeOf<number>()
      expectTypeOf(link.thread).toEqualTypeOf<number | undefined>()
      if ('channel' in link.chat) expectTypeOf(link.chat.channel).toEqualTypeOf<PeerIdentity>()
    }

    if (link?.kind === 'channel-bot') {
      expectTypeOf(link.admin).toEqualTypeOf<readonly LinkAdminRight[]>()
    }

    if (link?.kind === 'attach') {
      expectTypeOf(link.choose).toEqualTypeOf<readonly AttachTarget[] | undefined>()
    }
  })

  it('does not compile a description missing what its kind requires', () => {
    // @ts-expect-error a channel bot link must say which rights it asks for
    writeLink({ kind: 'channel-bot', bot: 'shop_bot' })
    // @ts-expect-error a message link must name the message
    writeLink({ kind: 'message', chat: { username: 'news_channel' } })
    // @ts-expect-error a right is one of the names links use
    writeLink({ kind: 'group-bot', bot: 'shop_bot', admin: ['fly'] })
    // @ts-expect-error a private chat is named by a channel identity, not a number
    writeLink({ kind: 'boost', chat: { channel: 1234567890 } })

    expectTypeOf(writeLink).returns.toEqualTypeOf<string>()
  })
})
