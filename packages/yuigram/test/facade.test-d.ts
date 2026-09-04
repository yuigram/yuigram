/**
 * The types the façade publishes.
 *
 * The runtime cases next door see values, and a type-only export has none — so
 * the MTProto surface would be half-checked without this. A type that stopped
 * being exported, or that came back as `any` because a re-export silently went
 * ambiguous, fails here rather than in a consumer's editor.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type {
  Account,
  AccountContext,
  AccountOptions,
  App,
  AppClient,
  BaseContext,
  Middleware,
  MtprotoContext,
  MtprotoEventKind,
  NormalizedUpdate,
  PeerRef,
} from '../src/index.js'

describe('the MTProto types a consumer writes against', () => {
  it('describes what an account is built from', () => {
    expectTypeOf<AccountOptions['apiId']>().toEqualTypeOf<number>()
    expectTypeOf<AccountOptions['name']>().toEqualTypeOf<string | undefined>()
  })

  it('discriminates a handler by transport', () => {
    // What a handler installed on more than one client branches on. A widened
    // `string` here would make the discrimination silently useless.
    expectTypeOf<MtprotoContext['transport']>().toEqualTypeOf<'mtproto'>()
    expectTypeOf<MtprotoContext['kind']>().toEqualTypeOf<MtprotoEventKind>()
  })

  it('names the peers an update refers to', () => {
    expectTypeOf<MtprotoContext['chat']>().toEqualTypeOf<PeerRef | undefined>()
    expectTypeOf<MtprotoContext['sender']>().toEqualTypeOf<PeerRef | undefined>()
  })

  it('carries the account an event arrived on', () => {
    expectTypeOf<AccountContext>().not.toBeAny()
  })
})

describe('the shape both transports meet through', () => {
  it('accepts an account as a client without the account being told', () => {
    // The container's contract names no transport, and the MTProto package
    // never imports it. This is where that claim is checked.
    expectTypeOf<Account>().toExtend<AppClient>()
  })

  it('offers each of the pieces an application is assembled from', () => {
    expectTypeOf<App>().not.toBeAny()
    expectTypeOf<AppClient>().not.toBeAny()
    expectTypeOf<Middleware<BaseContext>>().not.toBeAny()
  })
})

describe('the name both subsystems wanted', () => {
  it('resolves to the Bot API update', () => {
    // Both packages publish a `NormalizedUpdate`. The façade names one, so this
    // must be a real object type rather than the `any` an ambiguous star export
    // would leave behind.
    expectTypeOf<NormalizedUpdate>().not.toBeAny()
    expectTypeOf<NormalizedUpdate['updateId']>().toEqualTypeOf<number>()
  })
})
