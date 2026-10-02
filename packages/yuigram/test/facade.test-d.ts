/**
 * The types the façade publishes.
 *
 * The runtime cases next door see values, and a type-only export has none — so
 * the MTProto surface would be half-checked without this. A type that stopped
 * being exported, or that came back as `any` because a re-export silently went
 * ambiguous, fails here rather than in a consumer's editor.
 */

import { describe, expectTypeOf, it } from 'vitest'
import { f as accountFilters } from '../src/account-filters.js'
import { type EmbeddedThumbnail, embeddedThumbnail } from '../src/account-utils.js'
import { type SlotMachineReels, type SlotMachineSymbol, slotMachineReels } from '../src/dice.js'
import type {
  Account,
  AccountContext,
  AccountOptions,
  AnyEventContext,
  AnyFilter,
  AppClient,
  BaseContext,
  Bot,
  CommandContext,
  DownloadDeps,
  DownloadRequest,
  MediaDownloadOptions,
  MessageContext,
  Middleware,
  MtprotoContext,
  MtprotoEventKind,
  NormalizedUpdate,
  ParsedCommand,
  PeerIdentity,
  PeerRef,
  PhotoThumbnail,
  RpcError,
  RpcErrorPattern,
  RpcErrorText,
  TelegramLink,
  Thumbnail,
  ThumbnailAvailability,
  UnifiedContext,
} from '../src/index.js'
import {
  AccountRouter,
  App,
  and,
  Bot as BotClass,
  defineFilter,
  type documentFile,
  downloadToFile,
  f,
  fileIdOfThumbnail,
  memory,
  parseCommand,
  type photoFile,
  type SessionFlavor,
  session,
  thumbnail,
  thumbnailFile,
  thumbnails,
  when,
} from '../src/index.js'
import {
  hashInitData,
  type InitData,
  type InitDataKey,
  type InitDataProblem,
  type InitDataSecret,
  type VerifyInitDataOptions,
  type VerifyInitDataSignatureOptions,
  verifyInitData,
} from '../src/web-app.js'

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

describe('a command read from text', () => {
  it('answers with the command a handler receives, or nothing', () => {
    expectTypeOf(parseCommand).parameter(0).toEqualTypeOf<string | undefined>()
    expectTypeOf(parseCommand).returns.toEqualTypeOf<ParsedCommand | undefined>()
    expectTypeOf<CommandContext['command']>().toEqualTypeOf<ParsedCommand>()
  })
})

describe('the reels of a slot machine', () => {
  it('names three symbols from a closed set, left to right', () => {
    expectTypeOf(slotMachineReels).parameter(0).toEqualTypeOf<number>()
    expectTypeOf(slotMachineReels).returns.toEqualTypeOf<SlotMachineReels>()
    expectTypeOf<SlotMachineReels['length']>().toEqualTypeOf<3>()
    expectTypeOf<SlotMachineReels[number]>().toEqualTypeOf<SlotMachineSymbol>()
    expectTypeOf<SlotMachineSymbol>().toEqualTypeOf<'bar' | 'grapes' | 'lemon' | 'seven'>()
  })
})

describe('Mini App launch data', () => {
  it('writes a hash with the token or a key, and no age policy', () => {
    expectTypeOf(hashInitData).returns.toEqualTypeOf<Promise<string>>()
    expectTypeOf<{ token: string }>().toExtend<InitDataSecret>()
    expectTypeOf<{ key: InitDataKey }>().toExtend<InitDataSecret>()
    expectTypeOf<{ token: string; key: InitDataKey }>().not.toExtend<InitDataSecret>()
  })

  it('requires an age policy, and one proof or the other', () => {
    expectTypeOf(verifyInitData).returns.toEqualTypeOf<Promise<InitData>>()
    expectTypeOf<{ token: string; maxAge: number }>().toExtend<VerifyInitDataOptions>()
    expectTypeOf<{ key: InitDataKey; maxAge: number }>().toExtend<VerifyInitDataOptions>()
    // A check with no age limit is a decision, not an omission.
    expectTypeOf<{ token: string }>().not.toExtend<VerifyInitDataOptions>()
    expectTypeOf<{
      token: string
      key: InitDataKey
      maxAge: number
    }>().not.toExtend<VerifyInitDataOptions>()
    expectTypeOf<{ botId: number }>().not.toExtend<VerifyInitDataSignatureOptions>()
    expectTypeOf<InitData['auth_date']>().toEqualTypeOf<number>()
    expectTypeOf<InitDataProblem>().toEqualTypeOf<
      'malformed' | 'mismatch' | 'unsigned' | 'expired' | 'future' | 'unsupported'
    >()
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
    expectTypeOf<'proxy' | 'socks' | 'contact' | 'mini-app'>().toExtend<TelegramLink['kind']>()
    expectTypeOf<Extract<TelegramLink, { kind: 'socks' }>['pass']>().toEqualTypeOf<
      string | undefined
    >()
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
  it('is a method of the bot over its transport, and a function for the disk', () => {
    const bot = null as unknown as Bot
    expectTypeOf(bot.download('file-id')).toEqualTypeOf<Promise<Uint8Array>>()
    expectTypeOf(bot.files).toEqualTypeOf<DownloadDeps>()
    expectTypeOf(downloadToFile(bot.files, './out.bin', 'file-id')).toEqualTypeOf<Promise<void>>()
    // @ts-expect-error writing to a path needs a filesystem, which a bot does not carry
    void bot.download('file-id', './out.bin')
    expectTypeOf(bot.downloadStream('file-id')).toEqualTypeOf<Promise<ReadableStream<Uint8Array>>>()
    expectTypeOf(bot.getFileUrl('file-id')).toEqualTypeOf<Promise<string>>()
    // @ts-expect-error a number names no file
    void bot.download(42)
  })

  it('is an action of a message, for the file it carries', () => {
    const ctx = null as unknown as MessageContext
    expectTypeOf(ctx.download()).toEqualTypeOf<Promise<Uint8Array>>()
    expectTypeOf(ctx.downloadStream()).toEqualTypeOf<Promise<ReadableStream<Uint8Array>>>()
  })
})

describe('a session keyed by the application', () => {
  interface Cart {
    count: number
  }

  it('reads the chat and the sender without a context type named', () => {
    // The usual scopes are one expression each. Before the key could read
    // either, these compiled only through `createSession` and a stated context.
    const perUser = session<Cart>({
      storage: memory(),
      key: (event) => event.sender?.id,
      initial: () => ({ count: 0 }),
    })
    const perChat = session<Cart>({
      storage: memory(),
      key: (event) => event.chat?.id,
      initial: () => ({ count: 0 }),
    })

    BotClass.fromToken<SessionFlavor<Cart>>('123:abc').extend(perUser)
    BotClass.fromToken<SessionFlavor<Cart>>('123:abc').extend(perChat)
    expectTypeOf(perUser).not.toBeAny()
  })

  it('still refuses a key that reads something no update carries', () => {
    session<Cart>({
      storage: memory(),
      // @ts-expect-error a session key sees the chat and the sender, not the whole update
      key: (event) => event.message.chat.id,
      initial: () => ({ count: 0 }),
    })
  })
})

describe('a filter registered on an account', () => {
  const account = null as unknown as Account

  it('accepts the account filters, and passes on what they prove', () => {
    account.on(accountFilters.text(), (event) => {
      expectTypeOf(event.text).toEqualTypeOf<string>()
    })
    account.on('message', accountFilters.chat('user'), (event) => {
      expectTypeOf(event.transport).toEqualTypeOf<'mtproto'>()
    })
  })

  it('accepts a filter written for what every transport shares', () => {
    const anyText = defineFilter<UnifiedContext>(
      'anyText',
      (event) => typeof event === 'object' && event !== null && 'text' in event,
    )
    account.on(anyText, () => {})
    account.once(and(accountFilters.incoming, anyText), () => {})
  })

  it('refuses a filter written for the Bot API, which would never match', () => {
    // It reads `chat.type`, which an account's peers do not have. Accepted, it
    // compiled, matched nothing, and said nothing.
    // @ts-expect-error the Bot API's `f` reads the events of another transport
    account.on(f.chat.private, () => {})
    // @ts-expect-error composed, it is still the Bot API's
    account.on('message', and(f.chat.private, f.text(/./)), () => {})
    // @ts-expect-error a router holds the same registrations
    new AccountRouter().on(f.media.photo, () => {})
  })
})

describe('middleware gated on a filter', () => {
  it('is written against what the filter proved', () => {
    const bot = BotClass.fromToken('123:abc')
    bot.use(
      when(f.chat.private, async (message, next) => {
        expectTypeOf(message.chat.id).toEqualTypeOf<number>()
        expectTypeOf(message.transport).toEqualTypeOf<'bot-api'>()
        await next()
      }),
    )
  })

  it('still takes a bare predicate, typed as it says', () => {
    const gate = when(
      (event: { readonly kind: string }) => event.kind === 'message',
      async (event, next) => {
        expectTypeOf(event.kind).toEqualTypeOf<string>()
        await next()
      },
    )
    expectTypeOf(gate).not.toBeAny()
  })
})
