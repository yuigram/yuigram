/**
 * The types the façade publishes.
 *
 * The runtime cases next door see values, and a type-only export has none — so
 * the MTProto surface would be half-checked without this. A type that stopped
 * being exported, or that came back as `any` because a re-export silently went
 * ambiguous, fails here rather than in a consumer's editor.
 */

import { describe, expectTypeOf, it } from 'vitest'
import { type EmbeddedThumbnail, embeddedThumbnail } from '../src/account-utils.js'
import type {
  Account,
  AccountContext,
  AccountOptions,
  AnyEventContext,
  AnyFilter,
  AppClient,
  BaseContext,
  Bot,
  DownloadRequest,
  MediaDownloadOptions,
  MessageContext,
  Middleware,
  MtprotoContext,
  MtprotoEventKind,
  NormalizedUpdate,
  PeerIdentity,
  PeerRef,
  PhotoThumbnail,
  RpcError,
  RpcErrorPattern,
  RpcErrorText,
  TelegramLink,
  Thumbnail,
  ThumbnailAvailability,
} from '../src/index.js'
import {
  App,
  type documentFile,
  fileIdOfThumbnail,
  type photoFile,
  thumbnail,
  thumbnailFile,
  thumbnails,
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

/**
 * The union a cross-client application is written against.
 *
 * Named at the call site rather than published by core, which cannot describe
 * either transport without depending on it. What the two have in common is
 * already a type — the base every context extends — and what they do not is
 * carried by the discriminant.
 */
type Cross = AnyEventContext | MtprotoContext

declare const event: Cross

describe('what a cross-client handler is given', () => {
  it('discriminates on the transport', () => {
    expectTypeOf(event.transport).toEqualTypeOf<'bot-api' | 'mtproto'>()
  })

  it('narrows to the MTProto context', () => {
    if (event.transport === 'mtproto') {
      expectTypeOf(event).toExtend<MtprotoContext>()
      expectTypeOf(event.kind).toEqualTypeOf<MtprotoEventKind>()
      expectTypeOf(event.chat).toEqualTypeOf<PeerRef | undefined>()
    }
  })

  it('narrows to the Bot API context', () => {
    if (event.transport === 'bot-api') {
      expectTypeOf(event).toExtend<AnyEventContext>()
      // Present on one transport and not the other, which is exactly why the
      // discriminant has to be read before anything else is.
      expectTypeOf(event.updateId).toEqualTypeOf<number>()
    }
  })

  it('names the client an event arrived on, on either transport', () => {
    expectTypeOf(event.client.name).toEqualTypeOf<string>()
  })

  it('is not collapsed into something that lost the difference', () => {
    expectTypeOf<Cross>().not.toBeAny()
    expectTypeOf<Cross>().not.toEqualTypeOf<AnyEventContext>()
    expectTypeOf<Cross>().not.toEqualTypeOf<MtprotoContext>()
  })
})

describe('registering across clients', () => {
  it('hands a handler the context the application was declared with', () => {
    const app = new App<Cross>()
    app.on('message', (given) => {
      expectTypeOf(given).toEqualTypeOf<Cross>()
    })
  })

  it('takes a kind, a list of kinds, or a filter', () => {
    const app = new App<Cross>()
    expectTypeOf(app.on).parameter(0).toExtend<string | readonly string[] | AnyFilter>()
  })

  it('returns the application, so registrations chain', () => {
    const app = new App<Cross>()
    expectTypeOf(app.on('message', () => {})).toEqualTypeOf<App<Cross>>()
    expectTypeOf(app.once('message', () => {})).toEqualTypeOf<App<Cross>>()
  })

  it('says whether taking a handler off found one', () => {
    const app = new App<Cross>()
    expectTypeOf(app.off).returns.toEqualTypeOf<boolean>()
  })

  it('holds a client of either kind under one union', () => {
    const app = new App<Cross>()
    expectTypeOf(app.add<Bot>).toBeFunction()
    expectTypeOf(app.add<Account>).toBeFunction()
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

describe('identifiers and links, which belong to neither transport', () => {
  it('names a peer in the shape an account resolves', () => {
    // An identity read from a Bot API chat id goes straight to
    // `account.resolve`, which finds the access hash; neither side converts.
    expectTypeOf<PeerIdentity>().not.toBeAny()
    expectTypeOf<PeerIdentity>().toExtend<PeerRef>()
    expectTypeOf<PeerRef>().toExtend<PeerIdentity>()
    expectTypeOf<PeerIdentity>().toExtend<Parameters<Account['resolve']>[0]>()
  })

  it('publishes the link description as a real union', () => {
    expectTypeOf<TelegramLink>().not.toBeAny()
    expectTypeOf<TelegramLink['kind']>().toExtend<string>()
  })
})

describe('the thumbnails of a photo or a document', () => {
  it('takes either, and answers what choosing between renderings needs', () => {
    // The photo `photoFile` takes, or the document `documentFile` takes.
    expectTypeOf(thumbnails)
      .parameter(0)
      .toEqualTypeOf<Parameters<typeof photoFile>[0] | Parameters<typeof documentFile>[0]>()
    expectTypeOf(thumbnails).returns.toEqualTypeOf<Thumbnail[]>()
    expectTypeOf(thumbnail).returns.toEqualTypeOf<Thumbnail | undefined>()
    expectTypeOf(thumbnailFile).returns.toEqualTypeOf<DownloadRequest>()
    expectTypeOf(fileIdOfThumbnail).returns.toEqualTypeOf<string>()
  })

  it('says of each how it is had, as a closed union', () => {
    // A widened `string` would let a caller compare against a value that is
    // never produced, and the branch would silently never run.
    expectTypeOf<Thumbnail['availability']>().toEqualTypeOf<ThumbnailAvailability>()
    expectTypeOf<ThumbnailAvailability>().toEqualTypeOf<
      'download' | 'embedded' | 'unsupported' | 'unavailable'
    >()
    expectTypeOf<PhotoThumbnail>().toEqualTypeOf<Thumbnail>()
  })

  it('reads an embedded one from the utilities entry point', () => {
    expectTypeOf(embeddedThumbnail).parameter(0).toEqualTypeOf<Thumbnail>()
    expectTypeOf(embeddedThumbnail).returns.toEqualTypeOf<EmbeddedThumbnail>()
  })

  it('lets an event fetch one of its renderings', () => {
    expectTypeOf<MtprotoContext['download']>()
      .parameter(0)
      .toEqualTypeOf<MediaDownloadOptions | undefined>()
    expectTypeOf<MediaDownloadOptions['thumbnail']>().toEqualTypeOf<string | undefined>()
  })
})

describe('the names Telegram documents for a refusal', () => {
  it('are published as open unions, never as any', () => {
    expectTypeOf<RpcErrorPattern>().not.toBeAny()
    expectTypeOf<'FLOOD_WAIT_%d'>().toExtend<RpcErrorPattern>()
    expectTypeOf<'NOT_IN_ANY_LIST'>().toExtend<RpcErrorPattern>()
    expectTypeOf<RpcError['text']>().toEqualTypeOf<RpcErrorText>()
  })
})

describe('downloading a file', () => {
  it('is a method of the bot, with the bytes or a path', () => {
    const bot = null as unknown as Bot
    expectTypeOf(bot.download('file-id')).toEqualTypeOf<Promise<Uint8Array>>()
    expectTypeOf(bot.download('file-id', './out.bin')).toEqualTypeOf<Promise<void>>()
    expectTypeOf(bot.downloadStream('file-id')).toEqualTypeOf<Promise<ReadableStream<Uint8Array>>>()
    expectTypeOf(bot.getFileUrl('file-id')).toEqualTypeOf<Promise<string>>()
    // @ts-expect-error a number names no file
    void bot.download(42)
  })

  it('is an action of a message, for the file it carries', () => {
    const ctx = null as unknown as MessageContext
    expectTypeOf(ctx.download()).toEqualTypeOf<Promise<Uint8Array>>()
    expectTypeOf(ctx.download('./out.bin')).toEqualTypeOf<Promise<void>>()
    expectTypeOf(ctx.downloadStream()).toEqualTypeOf<Promise<ReadableStream<Uint8Array>>>()
  })
})
