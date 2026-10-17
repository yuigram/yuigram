// SPDX-License-Identifier: MIT

/**
 * Mentions in an outgoing request, in the form a send takes.
 *
 * Markup can say who a mention is for — `<a href="tg://user?id=N">` — but not
 * how to address them, which takes the access hash this account holds for that
 * person and nobody else does. So the formatters produce the received form of a
 * mention, which carries the number alone, and this turns it into the input
 * form on its way out, from the peers the account has written down.
 *
 * Every request passes through here, so a mention formatted by any means —
 * a formatter, a context's reply, a raw call — arrives addressed. A mention of
 * somebody this account has never seen is refused by name rather than sent:
 * Telegram drops a mention it cannot address, and a message that silently lost
 * one is the worse failure.
 */

import { PeerError } from '../core.js'
import { inputPeer, userFor } from '../network/peers.js'
import type { PeerStore } from '../storage/peers.js'
import type { TlValue } from '../tl/index.js'

/** Whether anything in a value is a mention in the received form. */
function carriesMention(value: unknown, depth = 0): boolean {
  // A request is a few levels deep; anything deeper is not a request.
  if (depth > 32 || typeof value !== 'object' || value === null) return false
  if (ArrayBuffer.isView(value)) return false
  if (Array.isArray(value)) return value.some((item) => carriesMention(item, depth + 1))
  if ((value as { readonly _?: unknown })._ === 'messageEntityMentionName') return true

  for (const field of Object.values(value)) {
    if (carriesMention(field, depth + 1)) return true
  }

  return false
}

/** The same value, with every received-form mention in the input form. */
async function rewrite(value: unknown, peers: PeerStore, depth: number): Promise<unknown> {
  if (depth > 32 || typeof value !== 'object' || value === null || ArrayBuffer.isView(value)) {
    return value
  }
  if (Array.isArray(value)) {
    return await Promise.all(value.map(async (item) => await rewrite(item, peers, depth + 1)))
  }

  const object = value as Record<string, unknown>
  if (object['_'] === 'messageEntityMentionName') return await addressed(object, peers)

  const out: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(object)) {
    out[key] = await rewrite(field, peers, depth + 1)
  }

  return out
}

/** One mention, addressed. */
async function addressed(
  mention: Record<string, unknown>,
  peers: PeerStore,
): Promise<Record<string, unknown>> {
  const userId = mention['user_id'] as bigint
  const record = await peers.byId('user', userId)
  if (record === undefined) {
    throw new PeerError(
      `a mention of user ${userId} cannot be sent: this account has not seen them, and a mention needs their access hash`,
    )
  }

  const user = userFor(inputPeer(record))
  if (user === undefined) throw new PeerError(`user ${userId} cannot be addressed in a mention`)

  return {
    _: 'inputMessageEntityMentionName',
    offset: mention['offset'],
    length: mention['length'],
    user_id: user,
  }
}

/**
 * A request with its mentions addressed.
 *
 * The request itself where it has none, which is nearly every request, so the
 * common case costs one walk and no copy.
 */
export async function addressMentions(query: TlValue, peers: PeerStore): Promise<TlValue> {
  if (!carriesMention(query)) return query

  return (await rewrite(query, peers, 0)) as TlValue
}
