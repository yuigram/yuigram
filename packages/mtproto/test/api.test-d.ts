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
import type * as types from '../src/generated/api/types/index.js'
import type { TlValue } from '../src/tl/index.js'

declare const account: Account
declare const api: MtprotoApi

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
