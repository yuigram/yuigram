/**
 * The façade's public surface.
 *
 * This is the only file in the repository that tests what a user actually
 * receives from `npm install yuigram`. Everything else imports through deep
 * paths, which is how `Bot` — the main class of the Bot API package — went
 * unexported from its own entry point without a single test noticing.
 */

import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as accountUtils from '../src/account-utils.js'
import * as dice from '../src/dice.js'
import * as yuigram from '../src/index.js'
import * as testing from '../src/testing.js'
import * as webApp from '../src/web-app.js'
import * as webhook from '../src/webhook.js'

describe('the entry point', () => {
  it('exports the client', () => {
    expect(typeof yuigram.Bot).toBe('function')
  })

  it('exports the storage adapters', () => {
    expect(typeof yuigram.memory).toBe('function')
    expect(typeof yuigram.file).toBe('function')
  })

  it('exports the session helpers', () => {
    expect(typeof yuigram.createSession).toBe('function')
    expect(typeof yuigram.userChatKey).toBe('function')
  })

  it('exports the filter combinators', () => {
    for (const name of ['and', 'or', 'not', 'every', 'some'] as const) {
      expect(typeof yuigram[name]).toBe('function')
    }
  })

  it('exports the error hierarchy', () => {
    expect(Object.getPrototypeOf(yuigram.FloodError)).toBe(yuigram.TelegramError)
    expect(new yuigram.ValidationError('x')).toBeInstanceOf(yuigram.YuigramError)
  })

  it('exports the logger', () => {
    expect(typeof yuigram.createLogger).toBe('function')
  })

  it('exports the convenience layer a bot is written against', () => {
    // Each of these is documented on the front page, and each is the kind of
    // thing that gets built, tested through a deep path, and never wired into
    // the package a user installs.
    expect(typeof yuigram.f).toBe('object')
    expect(typeof yuigram.has).toBe('object')
    expect(typeof yuigram.media).toBe('object')
    expect(typeof yuigram.format).toBe('object')
    expect(typeof yuigram.InlineKeyboard).toBe('function')
    expect(typeof yuigram.Keyboard).toBe('function')
    expect(typeof yuigram.Router).toBe('function')
    expect(typeof yuigram.session).toBe('function')
    expect(typeof yuigram.retryOnFloodWait).toBe('function')
    expect(typeof yuigram.withChatAction).toBe('function')
    expect(typeof yuigram.html).toBe('function')
    expect(typeof yuigram.md).toBe('function')
  })

  it('offers every filter family the documentation names', () => {
    for (const family of [
      'has',
      'hasQuery',
      'text',
      'caption',
      'anyText',
      'command',
      'chat',
      'sender',
      'media',
      'callback',
      'reply',
      'forward',
      'entity',
      'topic',
    ] as const) {
      expect(yuigram.f[family]).toBeDefined()
    }
  })

  it('exports the production layer', () => {
    // Each of these is the answer to a question a bot asks in its first week
    // of real traffic, and each is documented on the front page.
    expect(typeof yuigram.throttle).toBe('function')
    expect(typeof yuigram.retryOnFloodWait).toBe('function')
    expect(typeof yuigram.rateLimit).toBe('function')
    expect(typeof yuigram.createScheduler).toBe('function')
    expect(typeof yuigram.inline).toBe('object')
    expect(typeof yuigram.session).toBe('function')
  })

  it('offers the MTProto helpers that turn what arrived into what a call carries', () => {
    // Each of these reads a protocol shape a caller would otherwise have to
    // assemble by hand at every call site, which is where a field gets left
    // out and the request is refused for a reason that names something else.
    expect(typeof yuigram.documentFile).toBe('function')
    expect(typeof yuigram.photoFile).toBe('function')
    expect(typeof yuigram.documentMedia).toBe('function')
    expect(typeof yuigram.photoMedia).toBe('function')
    expect(typeof yuigram.uploadedDocument).toBe('function')
    expect(typeof yuigram.uploadedPhoto).toBe('function')
    expect(typeof yuigram.sentMessage).toBe('function')
    expect(typeof yuigram.nextDialogs).toBe('function')
    expect(typeof yuigram.inputPeerFromMessage).toBe('function')
    expect(typeof yuigram.inputChannel).toBe('function')
  })

  it('offers the renderings of a photo or a document, and reads the embedded ones apart', () => {
    expect(typeof yuigram.thumbnails).toBe('function')
    expect(typeof yuigram.thumbnail).toBe('function')
    expect(typeof yuigram.thumbnailFile).toBe('function')
    expect(typeof yuigram.fileIdOfThumbnail).toBe('function')
    // Decoding a carried preview is kept off the main entry point.
    expect('embeddedThumbnail' in yuigram).toBe(false)
    expect(typeof accountUtils.embeddedThumbnail).toBe('function')

    const document = {
      _: 'document' as const,
      id: 7n,
      access_hash: 1n,
      file_reference: Uint8Array.of(3),
      date: 0,
      mime_type: 'video/mp4',
      size: 10n,
      dc_id: 2,
      attributes: [],
      thumbs: [
        { _: 'photoStrippedSize' as const, type: 'i', bytes: Uint8Array.of(1, 8, 8) },
        { _: 'photoSize' as const, type: 'm', w: 320, h: 180, size: 900 },
      ],
    }

    expect(yuigram.thumbnails(document).map((one) => one.availability)).toEqual([
      'download',
      'embedded',
    ])
    expect(yuigram.thumbnailFile(document, 'm').location).toMatchObject({
      _: 'inputDocumentFileLocation',
      thumb_size: 'm',
    })
    const preview = yuigram.thumbnail(document, 'i')
    expect(preview && accountUtils.embeddedThumbnail(preview).mimeType).toBe('image/jpeg')
  })

  it('offers the reader that turns a message into questions it can answer', () => {
    // A message arrives as three constructors behind a union, and reading one
    // through a deep path is how this stayed out of the installed package.
    expect(typeof yuigram.MessageView).toBe('function')
    expect(typeof yuigram.readMessage).toBe('function')
    expect(typeof yuigram.sameMessage).toBe('function')

    const message = yuigram.readMessage({
      _: 'message',
      id: 1,
      peer_id: { _: 'peerUser', user_id: 2n },
      message: 'hi',
      date: 0,
    })

    expect(message?.text).toBe('hi')
    expect(message?.chat).toEqual({ kind: 'user', id: 2n })
  })

  it('offers the join between what a message names and who the answer described', () => {
    expect(typeof yuigram.UserView).toBe('function')
    expect(typeof yuigram.ChatView).toBe('function')
    expect(typeof yuigram.PeerIndex).toBe('function')
    expect(typeof yuigram.readUser).toBe('function')
    expect(typeof yuigram.readChat).toBe('function')
    expect(typeof yuigram.readPeers).toBe('function')

    const people = yuigram.readPeers({
      users: [{ _: 'user', id: 2n, first_name: 'Ada' }],
      chats: [
        {
          _: 'chat',
          id: 3n,
          title: 'Group',
          photo: { _: 'chatPhotoEmpty' },
          participants_count: 2,
          date: 0,
          version: 1,
        },
      ],
    })

    expect(people.name({ kind: 'user', id: 2n })).toBe('Ada')
    expect(people.name({ kind: 'chat', id: 3n })).toBe('Group')
  })

  it('offers markup in both directions, which MTProto has no server-side parsing for', () => {
    expect(typeof yuigram.fromHtml).toBe('function')
    expect(typeof yuigram.fromMarkdown).toBe('function')
    expect(typeof yuigram.toHtml).toBe('function')
    expect(typeof yuigram.toMarkdown).toBe('function')

    const body = yuigram.fromHtml('<b>bold</b> text')

    expect(body.text).toBe('bold text')
    expect(body.entities).toEqual([{ _: 'messageEntityBold', offset: 0, length: 4 }])
    expect(yuigram.toMarkdown(body)).toBe('*bold* text')
  })

  it('offers the links a bot hands out, and the proxy and profile links an account reads', () => {
    expect(
      yuigram.writeLink({
        kind: 'group-bot',
        bot: 'shop_bot',
        payload: 'invite',
        admin: ['pin_messages'],
      }),
    ).toBe('https://t.me/shop_bot?startgroup=invite&admin=pin_messages')
    expect(yuigram.readLink('tg://resolve?domain=shop_bot&startapp=page_42&mode=compact')).toEqual({
      kind: 'mini-app',
      bot: 'shop_bot',
      payload: 'page_42',
      mode: 'compact',
    })
    expect(yuigram.readLink('https://t.me/proxy?server=192.0.2.10&port=443&secret=ee00')).toEqual({
      kind: 'proxy',
      server: '192.0.2.10',
      port: 443,
      secret: 'ee00',
    })
    expect(yuigram.readLink('tg://socks?server=192.0.2.10&port=1080')).toEqual({
      kind: 'socks',
      server: '192.0.2.10',
      port: 1080,
    })
    expect(yuigram.readLink('t.me/contact/AbC_d-9')).toEqual({ kind: 'contact', token: 'AbC_d-9' })
    expect(() =>
      yuigram.writeLink({ kind: 'bot-start', bot: 'shop_bot', payload: 'x'.repeat(65) }),
    ).toThrow(yuigram.LinkError)
  })

  it('offers the command parser a bot dispatches with, for text read outside an update', () => {
    expect(yuigram.parseCommand('/give@shop_bot 10 gold')).toEqual({
      name: 'give',
      mention: 'shop_bot',
      rest: '10 gold',
      args: ['10', 'gold'],
    })
    expect(yuigram.parseCommand('see /help')).toBeUndefined()
  })

  it('offers the walk over a list that arrives one page at a time', () => {
    expect(typeof yuigram.walkDialogs).toBe('function')
    expect(typeof yuigram.walkHistory).toBe('function')
    expect(typeof yuigram.walkSearch).toBe('function')
    expect(typeof yuigram.walkGlobalSearch).toBe('function')
    expect(typeof yuigram.walkMembers).toBe('function')
    expect(typeof yuigram.MemberView).toBe('function')
    expect(typeof yuigram.readMember).toBe('function')
    expect(typeof yuigram.DialogView).toBe('function')
    expect(typeof yuigram.readDialog).toBe('function')

    const row = yuigram.readDialog({
      _: 'dialog',
      peer: { _: 'peerUser', user_id: 4n },
      top_message: 7,
      read_inbox_max_id: 0,
      read_outbox_max_id: 0,
      unread_count: 1,
      unread_mentions_count: 0,
      unread_reactions_count: 0,
      unread_poll_votes_count: 0,
      notify_settings: { _: 'peerNotifySettings' },
    })

    expect(row?.peer).toEqual({ kind: 'user', id: 4n })
    expect(row?.unreadCount).toBe(1)
  })

  it('offers the rest of the walks, and what they yield', () => {
    // The only test that checks what somebody actually receives from
    // `npm install yuigram`. A walk exported from the subsystem and forgotten
    // here is reachable from the package and from nothing a user writes.
    const walks = [
      yuigram.walkAllStories,
      yuigram.walkBoosts,
      yuigram.walkChatEvents,
      yuigram.walkForumTopics,
      yuigram.walkHashtagSearch,
      yuigram.walkInviteLinks,
      yuigram.walkInviteMembers,
      yuigram.walkProfilePhotos,
      yuigram.walkProfileStories,
      yuigram.walkReactions,
      yuigram.walkSavedGifts,
      yuigram.walkStarsTransactions,
      yuigram.walkStoryViewers,
    ]
    const views = [
      yuigram.ChatEventView,
      yuigram.ForumTopicView,
      yuigram.InviteImporterView,
      yuigram.InviteLinkView,
      yuigram.PeerStoriesView,
      yuigram.ReactionView,
      yuigram.StoryView,
      yuigram.StoryViewerView,
    ]

    expect(walks).toHaveLength(13)
    expect(walks.filter((walk) => typeof walk !== 'function')).toEqual([])
    expect(views.filter((view) => typeof view !== 'function')).toEqual([])

    const people = [
      yuigram.whoAmI,
      yuigram.readUsers,
      yuigram.readProfile,
      yuigram.findByPhone,
      yuigram.commonChats,
      yuigram.editProfile,
      yuigram.setUsername,
      yuigram.setOnline,
      yuigram.setEmojiStatus,
      yuigram.setBirthday,
      yuigram.setProfilePhoto,
      yuigram.deleteProfilePhotos,
      yuigram.messageTtl,
      yuigram.setMessageTtl,
      yuigram.readContacts,
      yuigram.addContact,
      yuigram.importContacts,
      yuigram.deleteContacts,
      yuigram.block,
      yuigram.unblock,
      yuigram.readBlocked,
      yuigram.peerSettings,
      yuigram.setCloseFriends,
      yuigram.savedMusic,
      yuigram.saveMusic,
    ]

    expect(people).toHaveLength(25)
    expect(people.filter((one) => typeof one !== 'function')).toEqual([])

    const topic = yuigram.readForumTopic({ _: 'forumTopicDeleted', id: 9 })
    expect(topic?.isDeleted).toBe(true)
    expect(topic?.title).toBeUndefined()

    expect(yuigram.readReaction({ _: 'reactionEmoji', emoticon: '🔥' })).toEqual({
      kind: 'emoji',
      emoji: '🔥',
    })
  })

  it('offers the operations an account performs on a conversation of its choosing', () => {
    // Answering an update already worked. Starting a conversation is what was
    // missing, and it is the most-used thing an account does.
    expect(typeof yuigram.sendText).toBe('function')
    expect(typeof yuigram.sendMedia).toBe('function')
    expect(typeof yuigram.editMessage).toBe('function')
    expect(typeof yuigram.deleteMessages).toBe('function')
    expect(typeof yuigram.forwardMessages).toBe('function')
    expect(typeof yuigram.react).toBe('function')
    expect(typeof yuigram.pinMessage).toBe('function')
    expect(typeof yuigram.readHistory).toBe('function')
    expect(typeof yuigram.setTyping).toBe('function')
    expect(typeof yuigram.getMessages).toBe('function')
  })

  it('paces with the published Telegram limits by default', () => {
    expect(yuigram.DEFAULT_GLOBAL_PER_SECOND).toBe(30)
    expect(yuigram.DEFAULT_CHAT_PER_SECOND).toBe(1)
    expect(yuigram.DEFAULT_GROUP_PER_MINUTE).toBe(20)
  })

  it('offers every inline result builder the documentation names', () => {
    for (const builder of [
      'article',
      'photo',
      'gif',
      'video',
      'audio',
      'voice',
      'document',
      'location',
      'venue',
      'contact',
      'sticker',
    ] as const) {
      expect(typeof yuigram.inline[builder]).toBe('function')
    }
  })

  it('offers every media source the documentation names', () => {
    for (const source of [
      'path',
      'url',
      'id',
      'buffer',
      'stream',
      'text',
      'json',
      'blob',
    ] as const) {
      expect(typeof yuigram.media[source]).toBe('function')
    }
  })
})

describe('the schema version', () => {
  it('names the Bot API version the surface was generated from', () => {
    // A user hitting a method newer than this build needs to know which
    // version they are talking to before reaching for `call()`.
    expect(yuigram.schemaInfo.botApi).toMatch(/^\d+\.\d+$/)
  })

  it('names the release the surface was regenerated from, not an earlier one', () => {
    // The version was once written here by hand and went on reporting 10.2
    // after the surface moved to 10.3. The newest committed snapshot is what
    // the generated sources are emitted from, so the two must agree.
    const snapshots = readdirSync(new URL('../../../schemas/bot-api/', import.meta.url))
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.replace(/\.json$/, ''))
      .sort()

    expect(yuigram.schemaInfo.botApi).toBe(snapshots.at(-1))
    expect(yuigram.BOT_API_VERSION).toBe(yuigram.schemaInfo.botApi)
  })

  it('names the TL layer the MTProto surface was generated from', () => {
    // Taken from the generated schema rather than written down here, so it
    // cannot drift from the codecs that were emitted alongside it.
    expect(yuigram.schemaInfo.tlLayer).toBeTypeOf('number')
  })
})

describe('the subpaths', () => {
  it('exposes the testing harness', () => {
    expect(typeof testing.mockBot).toBe('function')
  })

  it('exposes the webhook adapters', () => {
    expect(typeof webhook.nodeWebhook).toBe('function')
    expect(typeof webhook.expressWebhook).toBe('function')
    expect(typeof webhook.fastifyWebhook).toBe('function')
    // The Fetch adapter is the one that covers Hono, Elysia, h3, Bun, Deno,
    // Workers and Next route handlers at once.
    expect(typeof webhook.webWebhook).toBe('function')
    expect(typeof webhook.fastifyWebhook).toBe('function')
  })

  it('keeps the adapters out of the main entry point', () => {
    // A bot that polls should not carry the webhook adapters.
    expect('nodeWebhook' in yuigram).toBe(false)
  })

  it('exposes Mini App launch data, reading apart from checking', async () => {
    expect(typeof webApp.readInitData).toBe('function')
    expect(typeof webApp.verifyInitData).toBe('function')
    expect(typeof webApp.verifyInitDataSignature).toBe('function')
    expect(typeof webApp.InitDataKey.fromToken).toBe('function')

    const error = await webApp
      .verifyInitData('auth_date=1&hash=00', { token: '1:x', maxAge: 60 })
      .catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(webApp.InitDataError)
    expect(error).toBeInstanceOf(yuigram.ValidationError)
    expect((error as InstanceType<typeof webApp.InitDataError>).problem).toBe('malformed')
  })

  it('keeps launch data out of the main entry point', () => {
    // Most bots never open a Mini App, and a page that checks launch data
    // needs nothing else from the framework.
    expect('verifyInitData' in yuigram).toBe(false)
  })

  it('writes the hash a fixture of launch data needs', async () => {
    const fields = 'auth_date=1700000000&start_param=demo'
    const token = '1:x'
    const launch = `${fields}&hash=${await webApp.hashInitData(fields, { token })}`

    await expect(
      webApp.verifyInitData(launch, { token, maxAge: Number.POSITIVE_INFINITY }),
    ).resolves.toMatchObject({ start_param: 'demo' })
  })

  it('exposes the reels of a slot machine, and keeps them out of the main entry point', () => {
    expect(dice.slotMachineReels(64)).toEqual(['seven', 'seven', 'seven'])
    expect(dice.slotMachineReels(2)).toEqual(['grapes', 'bar', 'bar'])
    expect(() => dice.slotMachineReels(65)).toThrow(yuigram.ValidationError)
    expect('slotMachineReels' in yuigram).toBe(false)
  })
})

describe('independence', () => {
  it('names no third-party Telegram library anywhere in its surface', () => {
    // The invariant checks the built declarations. This checks the runtime
    // surface, which is what a user can actually reach.
    const forbidden = ['mtcute', 'puregram', 'grammy', 'telegraf', 'gramjs']

    for (const name of Object.keys({ ...yuigram, ...testing, ...webhook })) {
      for (const library of forbidden) {
        expect(name.toLowerCase()).not.toContain(library)
      }
    }
  })
})

describe('a bot built through the façade', () => {
  it('handles an update end to end', async () => {
    // Proves the re-exports are wired to working implementations rather than
    // to names that merely resolve.
    const { bot, send, calls } = testing.mockBot()

    bot.onCommand('start', (ctx) => ctx.reply('hello'))
    await send.command('/start')

    expect(calls.last('sendMessage')?.params['text']).toBe('hello')
  })
})
