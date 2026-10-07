/**
 * What the generated method surface claims.
 *
 * The point of generating 757 signatures is that a caller does not have to know
 * the wire shape, so what matters is that each signature is the schema's and not
 * something plausible written by hand. These assertions pin an argument type and
 * a result type against the TL declarations they were emitted from — a generator
 * that produced `unknown` either side would still compile everywhere else.
 *
 * Everything here is a compile-time assertion. There is nothing to run.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type { Account } from '../src/account.js'
import type { MtprotoApi } from '../src/api.js'
import { documentMedia, photoMedia, uploadedDocument, uploadedPhoto } from '../src/files/media.js'
import type * as types from '../src/generated/api/types/index.js'
import { inputChannel, inputPeerFromMessage } from '../src/network/peers.js'
import type { MtprotoContext } from '../src/normalize/context.js'
import { type DialogsOffset, nextDialogs } from '../src/normalize/paging.js'
import { type SentMessage, sentMessage } from '../src/normalize/sent.js'
import { mockAccount } from '../src/testing/mock-account.js'
import type { TlValue } from '../src/tl/index.js'

declare const account: Account
declare const api: MtprotoApi
declare const event: MtprotoContext

describe('the surface an account exposes', () => {
  it('is the generated one', () => {
    expectTypeOf(account.api).toEqualTypeOf<MtprotoApi>()
  })

  it('groups methods by the namespace TL declares them in', () => {
    expectTypeOf(api.messages.sendMessage).toBeFunction()
    expectTypeOf(api.contacts.resolveUsername).toBeFunction()
    expectTypeOf(api.help.getConfig).toBeFunction()
  })
})

describe('what a method takes', () => {
  it('is the request the schema declares, without its constructor', () => {
    // `contacts.resolveUsername#725afbbc flags:# username:string
    //  referer:flags.0?string = contacts.ResolvedPeer`
    expectTypeOf(api.contacts.resolveUsername)
      .parameter(0)
      .toEqualTypeOf<Omit<types.contacts.ResolveUsername, '_'>>()
  })

  it('rejects a field the schema does not declare', () => {
    // @ts-expect-error `nickname` is not a parameter of contacts.resolveUsername
    api.contacts.resolveUsername({ username: 'telegram', nickname: 'tg' })
  })

  it('rejects a field of the wrong type', () => {
    // @ts-expect-error `username` is a string on the wire
    api.contacts.resolveUsername({ username: 42 })
  })

  it('does not let a caller name a different method', () => {
    // The constructor is the surface's to write. Accepting one here would let a
    // typed call send something other than the method it was addressed to.
    // @ts-expect-error `_` is omitted from the parameters
    api.contacts.resolveUsername({ username: 'telegram', _: 'auth.logOut' })
  })

  it('takes nothing when the schema declares no parameters', () => {
    // `help.getConfig#c4f9186b = Config`
    expectTypeOf(api.help.getConfig).parameters.toEqualTypeOf<[]>()
  })

  it('takes an optional argument when every parameter is conditional', () => {
    expectTypeOf(api.account.getAuthorizationForm).parameter(0).not.toBeUndefined()
  })
})

describe('what a method returns', () => {
  it('is the boxed type the schema names', () => {
    // `contacts.resolveUsername … = contacts.ResolvedPeer`
    expectTypeOf(
      api.contacts.resolveUsername,
    ).returns.resolves.toEqualTypeOf<types.contacts.TypeResolvedPeer>()
  })

  it('is a boolean where the schema returns `Bool`', () => {
    // `account.checkUsername#2714d86c username:string = Bool`
    expectTypeOf(api.account.checkUsername).returns.resolves.toEqualTypeOf<boolean>()
  })

  it('is not `unknown`, which is what a generator that gave up would emit', () => {
    expectTypeOf(api.help.getConfig).returns.resolves.not.toBeUnknown()
    expectTypeOf(api.messages.sendMessage).returns.resolves.not.toBeUnknown()
  })
})

describe('what an event says its payload is', () => {
  it('types the message from the schema rather than as an opaque value', () => {
    expectTypeOf(event.message).toEqualTypeOf<types.TypeMessage | undefined>()
  })

  it('narrows to the ordinary message, with its own fields', () => {
    if (event.message?._ === 'message') {
      expectTypeOf(event.message.message).toEqualTypeOf<string>()
      expectTypeOf(event.message.date).toEqualTypeOf<number>()
      expectTypeOf(event.message.from_id).toEqualTypeOf<types.TypePeer | undefined>()
    }
  })

  it('does not offer text on a service message', () => {
    if (event.message?._ === 'messageService') {
      // @ts-expect-error a service message carries an action, not text
      event.message.message
    }
  })

  it('reports the timestamp in the units Telegram sends', () => {
    // Not a `Date`: the value belongs to the payload, and a handler that wants
    // one builds it.
    expectTypeOf(event.date).toEqualTypeOf<number | undefined>()
  })

  it('leaves the untouched update reachable beside it', () => {
    expectTypeOf(event.raw).toEqualTypeOf<TlValue>()
  })
})

describe('the surface bound to an event', () => {
  it('takes the same parameters without the peer', () => {
    // The whole ergonomic difference, stated as a type: what the update already
    // supplied is not asked for again.
    expectTypeOf(event.here.messages.getHistory)
      .parameter(0)
      .toEqualTypeOf<Omit<types.messages.GetHistory, '_' | 'peer'> & { peer?: never }>()
  })

  it('takes nothing when the peer was the only parameter', () => {
    expectTypeOf(event.here.messages.getPeerSettings).toBeCallableWith()
  })

  it('returns what the schema says, as the unbound surface does', () => {
    expectTypeOf(
      event.here.messages.getPeerSettings,
    ).returns.resolves.toEqualTypeOf<types.messages.TypePeerSettings>()
  })

  it('refuses a peer, because the update already named one', () => {
    // @ts-expect-error the peer is the update's, not the caller's
    event.here.messages.getPeerSettings({ peer: { _: 'inputPeerSelf' } })
  })

  it('does not carry a method the schema addresses some other way', () => {
    // `help.getConfig` names no peer, so it is absent rather than present and
    // certain to fail.
    // @ts-expect-error no peer-addressed method of that name
    event.here.help.getConfig()
  })

  it('leaves the unbound surface reachable beside it', () => {
    expectTypeOf(event.api.call).toBeFunction()
  })
})

describe('the escape hatch beside it', () => {
  it('still takes a whole TL value and answers with one', () => {
    expectTypeOf(api.call).toEqualTypeOf<(query: TlValue) => Promise<TlValue>>()
  })

  it('is not narrowed by the generated surface', () => {
    // A method newer than this build has no signature, so the hatch must keep
    // accepting any constructor name at all.
    expectTypeOf(api.call).toBeCallableWith({ _: 'messages.brandNewMethod', whatever: 1 })
  })
})

/**
 * Whether the helpers compose with the surface that produces their input.
 *
 * Each of these reads or builds a value that crosses between the typed methods
 * and the readers beside them, and each was written down in a doc comment as
 * the way to use one. A signature that accepts only the decoder's shape looks
 * right until a caller holds the schema's — the same value, described twice —
 * and then the documented line does not compile. There is nothing to run: what
 * is being asserted is that these fit together at all.
 */
describe('the helpers beside the generated surface', () => {
  it('reads a send answered by a typed method', async () => {
    const answer = await api.messages.sendMessage({
      peer: { _: 'inputPeerSelf' },
      message: 'hi',
      random_id: 1n,
    })

    expectTypeOf(sentMessage(answer, 1n)).toEqualTypeOf<SentMessage>()
  })

  it('reads a send answered through the untyped escape hatch', async () => {
    const answer = await api.call({ _: 'messages.sendMessage' })

    expectTypeOf(sentMessage(answer, 1n)).toEqualTypeOf<SentMessage>()
  })

  it('reads a send answered on the surface bound to an event', async () => {
    const answer = await event.here.messages.sendMedia({
      media: { _: 'inputMediaEmpty' },
      message: '',
      random_id: 1n,
    })

    expectTypeOf(sentMessage(answer, 1n)).toEqualTypeOf<SentMessage>()
  })

  it('reads a page of dialogs answered by a typed method', async () => {
    const answer = await api.messages.getDialogs({
      offset_date: 0,
      offset_id: 0,
      offset_peer: { _: 'inputPeerEmpty' },
      limit: 100,
      hash: 0n,
    })

    expectTypeOf(nextDialogs(answer)).toEqualTypeOf<DialogsOffset | undefined>()
  })

  it('builds a peer a typed method accepts', () => {
    expectTypeOf(inputPeerFromMessage).returns.toEqualTypeOf<types.TypeInputPeer>()
    expectTypeOf(account.resolve).returns.resolves.toEqualTypeOf<types.TypeInputPeer>()
  })

  it('builds a channel the channel methods accept', () => {
    expectTypeOf(inputChannel).returns.toEqualTypeOf<types.TypeInputChannel>()
  })

  it('builds media a send accepts', () => {
    expectTypeOf(documentMedia).returns.toEqualTypeOf<types.TypeInputMedia>()
    expectTypeOf(photoMedia).returns.toEqualTypeOf<types.TypeInputMedia>()
    expectTypeOf(uploadedPhoto).returns.toEqualTypeOf<types.TypeInputMedia>()
    expectTypeOf(uploadedDocument).returns.toEqualTypeOf<types.TypeInputMedia>()
  })
})

describe('the test harness', () => {
  it('builds the account a plugin expects when told the flavour', () => {
    interface Tenant {
      tenant: string
    }

    const { account: flavoured } = mockAccount<Tenant>()

    flavoured.use(async (event, next) => {
      expectTypeOf(event.tenant).toEqualTypeOf<string>()
      await next()
    })
    expectTypeOf(mockAccount().account).toEqualTypeOf<Account>()
  })
})
