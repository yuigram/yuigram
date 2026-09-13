/**
 * Reading a message through a view rather than by narrowing.
 *
 * The three constructors are the whole point: a reader that only ever meets an
 * ordinary message will not notice that a service message has no text and an
 * empty one has no sender, and those are exactly the two that arrive when
 * something has gone wrong in a conversation. So most of these are about what
 * the other two answer.
 *
 * A view holds the value rather than copying it, so the cases also pin that:
 * nothing is transformed on the way in, and the value stays reachable.
 */

import { describe, expect, it } from 'vitest'
import { MessageView, readMessage, sameMessage } from '../src/entities/index.js'
import type { Message, MessageEmpty, MessageService } from '../src/generated/api/types/index.js'

const ORDINARY: Message = {
  _: 'message',
  id: 77,
  peer_id: { _: 'peerChannel', channel_id: 55n },
  from_id: { _: 'peerUser', user_id: 5n },
  message: 'hello',
  date: 1_700_000_000,
  out: true,
  pinned: true,
  silent: true,
  edit_date: 1_700_000_100,
  views: 12,
  forwards: 3,
  grouped_id: 900n,
  via_bot_id: 42n,
  post_author: 'Someone',
  ttl_period: 60,
  entities: [{ _: 'messageEntityBold', offset: 0, length: 5 }],
  media: { _: 'messageMediaEmpty' },
  reply_to: { _: 'messageReplyHeader', reply_to_msg_id: 70 },
}

const SERVICE: MessageService = {
  _: 'messageService',
  id: 78,
  peer_id: { _: 'peerChat', chat_id: 9n },
  from_id: { _: 'peerUser', user_id: 5n },
  date: 1_700_000_200,
  action: { _: 'messageActionChatJoinedByLink', inviter_id: 6n },
}

const EMPTY: MessageEmpty = { _: 'messageEmpty', id: 79 }

/** Identifiers are bigints, which `JSON.stringify` has no representation for. */
const serialize = (value: unknown): string =>
  JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item))

describe('an ordinary message, read', () => {
  const message = new MessageView(ORDINARY)

  it('names the conversation and the sender as references', () => {
    expect(message.chat).toEqual({ kind: 'channel', id: 55n })
    expect(message.sender).toEqual({ kind: 'user', id: 5n })
  })

  it('answers the questions the constructor makes optional', () => {
    expect(message.form).toBe('ordinary')
    expect(message.id).toBe(77)
    expect(message.text).toBe('hello')
    expect(message.date).toBe(1_700_000_000)
    expect(message.editDate).toBe(1_700_000_100)
    expect(message.views).toBe(12)
    expect(message.forwards).toBe(3)
    expect(message.groupedId).toBe(900n)
    expect(message.viaBotId).toBe(42n)
    expect(message.postAuthor).toBe('Someone')
    expect(message.ttlPeriod).toBe(60)
  })

  it('reads the flags as booleans rather than as the wire s optional true', () => {
    // `out?: true` is present-or-absent on the wire. A reader asking "is this
    // outgoing" wants an answer either way, not `true | undefined`.
    expect(message.isOutgoing).toBe(true)
    expect(message.isPinned).toBe(true)
    expect(message.isSilent).toBe(true)
    expect(message.isPost).toBe(false)
    expect(message.isContentProtected).toBe(false)
    expect(message.isMentioned).toBe(false)
  })

  it('reads what it answers', () => {
    expect(message.isReply).toBe(true)
    expect(message.replyToMessageId).toBe(70)
  })

  it('is not a service message and not empty', () => {
    expect(message.isService).toBe(false)
    expect(message.isEmpty).toBe(false)
  })

  it('hands back what it carried, unchanged', () => {
    expect(message.entities).toBe(ORDINARY.entities)
    expect(message.media).toBe(ORDINARY.media)
    expect(message.raw).toBe(ORDINARY)
  })
})

describe('a service message, read', () => {
  const message = new MessageView(SERVICE)

  it('says what happened rather than what was said', () => {
    expect(message.form).toBe('service')
    expect(message.isService).toBe(true)
    expect(message.action).toBe(SERVICE.action)
  })

  it('has no text, rather than an empty one', () => {
    // An empty string would make a reader testing for text believe there was
    // some. A service message said nothing.
    expect(message.text).toBeUndefined()
    expect(message.entities).toBeUndefined()
    expect(message.media).toBeUndefined()
  })

  it('still names the conversation, the sender and the moment', () => {
    expect(message.chat).toEqual({ kind: 'chat', id: 9n })
    expect(message.sender).toEqual({ kind: 'user', id: 5n })
    expect(message.date).toBe(1_700_000_200)
  })

  it('answers the ordinary-only questions without pretending', () => {
    expect(message.views).toBeUndefined()
    expect(message.isPinned).toBe(false)
    expect(message.markup).toBeUndefined()
  })
})

describe('an empty message, read', () => {
  const message = new MessageView(EMPTY)

  it('is a hole with an identifier and little else', () => {
    expect(message.form).toBe('empty')
    expect(message.isEmpty).toBe(true)
    expect(message.id).toBe(79)
    expect(message.text).toBeUndefined()
    expect(message.sender).toBeUndefined()
    expect(message.date).toBeUndefined()
  })

  it('names no conversation when the answer could not place it', () => {
    expect(message.chat).toBeUndefined()
  })

  it('reports flags as false rather than reading a field that is not there', () => {
    expect(message.isOutgoing).toBe(false)
    expect(message.hasUnreadMedia).toBe(false)
    expect(message.isReply).toBe(false)
  })
})

describe('building a view', () => {
  it('takes what an event carries, including nothing', () => {
    // A kind of update that names no message hands over undefined, and a reader
    // should not have to check before asking.
    expect(readMessage(undefined)).toBeUndefined()
    expect(readMessage(ORDINARY)?.id).toBe(77)
  })

  it('copies nothing, so the value is the one that was handed in', () => {
    expect(readMessage(ORDINARY)?.raw).toBe(ORDINARY)
  })

  it('serializes as the message it reads', () => {
    // Accessors live on the prototype, so without this a view stringifies to
    // the one own property it has rather than to the message.
    //
    // Identifiers are bigints, which `JSON.stringify` refuses on its own. That
    // is a property of the schema and not of the view — serializing the message
    // directly needs the same replacer — so the comparison uses one.
    expect(serialize(readMessage(ORDINARY))).toBe(serialize(ORDINARY))
  })

  it('hands the message itself to anything that asks for it', () => {
    expect(new MessageView(ORDINARY).toJSON()).toBe(ORDINARY)
  })
})

describe('telling two views apart', () => {
  it('says two views of one message are the same message', () => {
    // Views are built on demand, so `===` says nothing about which message
    // each one reads.
    expect(readMessage(ORDINARY)).not.toBe(readMessage(ORDINARY))
    expect(sameMessage(new MessageView(ORDINARY), new MessageView(ORDINARY))).toBe(true)
  })

  it('does not confuse one number in two conversations', () => {
    // Numbering restarts per channel, so the identifier alone is not identity.
    const elsewhere: Message = { ...ORDINARY, peer_id: { _: 'peerChannel', channel_id: 66n } }

    expect(sameMessage(new MessageView(ORDINARY), new MessageView(elsewhere))).toBe(false)
  })

  it('separates two different messages in one conversation', () => {
    const later: Message = { ...ORDINARY, id: 78 }

    expect(sameMessage(new MessageView(ORDINARY), new MessageView(later))).toBe(false)
  })

  it('treats two unplaceable messages as the same only when both are unplaced', () => {
    const other: MessageEmpty = { _: 'messageEmpty', id: 79 }

    expect(sameMessage(new MessageView(EMPTY), new MessageView(other))).toBe(true)
    expect(sameMessage(new MessageView(EMPTY), new MessageView(ORDINARY))).toBe(false)
  })

  it('does not match an unplaced message against a placed one of the same number', () => {
    // The number is equal here, so this is the case that actually reaches the
    // conversation comparison rather than stopping at the number.
    const placed: Message = { ...ORDINARY, id: 79 }

    expect(sameMessage(new MessageView(EMPTY), new MessageView(placed))).toBe(false)
    expect(sameMessage(new MessageView(placed), new MessageView(EMPTY))).toBe(false)
  })

  it('does not confuse a user with a chat that numbers the same', () => {
    // Peer identifiers are only unique within their kind, so a user and a chat
    // can carry the same number and mean different conversations.
    const inChat: Message = { ...ORDINARY, peer_id: { _: 'peerChat', chat_id: 55n } }
    const withUser: Message = { ...ORDINARY, peer_id: { _: 'peerUser', user_id: 55n } }

    expect(sameMessage(new MessageView(inChat), new MessageView(withUser))).toBe(false)
    expect(sameMessage(new MessageView(ORDINARY), new MessageView(inChat))).toBe(false)
  })
})

describe('the shapes that are not the common one', () => {
  it('gives a channel post no sender, because a channel is not a person', () => {
    // `from_id` is absent on a post signed by the channel itself. The
    // conversation is still there, and that is what a reader wants for a post.
    const post: Message = {
      _: 'message',
      id: 4,
      peer_id: { _: 'peerChannel', channel_id: 55n },
      message: 'announcement',
      date: 1_700_000_000,
      post: true,
      noforwards: true,
      from_rank: 'Owner',
    }

    const message = new MessageView(post)

    expect(message.sender).toBeUndefined()
    expect(message.chat).toEqual({ kind: 'channel', id: 55n })
    expect(message.isPost).toBe(true)
    expect(message.isContentProtected).toBe(true)
    expect(message.senderRank).toBe('Owner')
  })

  it('does not report a reply to a story as a reply to a message', () => {
    // The reply header is a union. Only one of its constructors carries a
    // message number, and reading `reply_to_msg_id` off the other one would be
    // reading a field that is not there.
    const toStory: Message = {
      ...ORDINARY,
      reply_to: { _: 'messageReplyStoryHeader', peer: { _: 'peerUser', user_id: 8n }, story_id: 3 },
    }

    const message = new MessageView(toStory)

    expect(message.replyTo).toBe(toStory.reply_to)
    expect(message.replyToMessageId).toBeUndefined()
    expect(message.isReply).toBe(false)
  })

  it('knows a forwarded message by the header it carries', () => {
    const forwarded: Message = {
      ...ORDINARY,
      fwd_from: { _: 'messageFwdHeader', date: 1_699_000_000 },
    }

    expect(new MessageView(forwarded).isForwarded).toBe(true)
    expect(new MessageView(forwarded).forwardedFrom).toBe(forwarded.fwd_from)
    expect(new MessageView(ORDINARY).isForwarded).toBe(false)
    expect(new MessageView(ORDINARY).forwardedFrom).toBeUndefined()
  })

  it('reads what an ordinary message carries beyond its text', () => {
    const decorated: Message = {
      ...ORDINARY,
      mentioned: true,
      media_unread: true,
      invert_media: true,
      edit_hide: true,
      effect: 5n,
      reply_markup: { _: 'replyKeyboardHide' },
      reactions: { _: 'messageReactions', results: [] },
      replies: { _: 'messageReplies', replies: 2, replies_pts: 9 },
      factcheck: { _: 'factCheck', hash: 3n },
    }

    const message = new MessageView(decorated)

    expect(message.isMentioned).toBe(true)
    expect(message.hasUnreadMedia).toBe(true)
    expect(message.invertMedia).toBe(true)
    expect(message.hideEditMark).toBe(true)
    expect(message.effectId).toBe(5n)
    expect(message.markup).toBe(decorated.reply_markup)
    expect(message.reactions).toBe(decorated.reactions)
    expect(message.replies).toBe(decorated.replies)
    expect(message.factCheck).toBe(decorated.factcheck)
  })

  it('keeps flags that sit next to each other apart', () => {
    // `invert_media`/`from_scheduled` and `edit_hide`/`offline` are adjacent
    // booleans with nothing distinguishing them but the field name, which is
    // the shape where reading the wrong one is invisible.
    const scheduled: Message = { ...ORDINARY, from_scheduled: true, offline: true }

    const message = new MessageView(scheduled)

    expect(message.isFromScheduled).toBe(true)
    expect(message.isFromOffline).toBe(true)
    expect(message.invertMedia).toBe(false)
    expect(message.hideEditMark).toBe(false)
  })

  it('does not call a service or empty message a channel post', () => {
    // `post` is only on the ordinary constructor, and the answer for the other
    // two is no rather than yes.
    expect(new MessageView(SERVICE).isPost).toBe(false)
    expect(new MessageView(EMPTY).isPost).toBe(false)
  })

  it('reads what a service message answers', () => {
    // A service message can reply — a pinned-message notice names the message
    // it is about this way — so the reply header is not ordinary-only.
    const pinned: MessageService = {
      ...SERVICE,
      action: { _: 'messageActionPinMessage' },
      reply_to: { _: 'messageReplyHeader', reply_to_msg_id: 61 },
    }

    const message = new MessageView(pinned)

    expect(message.replyTo).toBe(pinned.reply_to)
    expect(message.replyToMessageId).toBe(61)
    expect(message.isReply).toBe(true)
  })

  it('answers for a service message the account was mentioned in', () => {
    // `mentioned` and `media_unread` are on both non-empty constructors, so
    // reading them must not be narrowed to the ordinary one.
    const mention: MessageService = {
      ...SERVICE,
      mentioned: true,
      media_unread: true,
      ttl_period: 30,
    }

    const message = new MessageView(mention)

    expect(message.isMentioned).toBe(true)
    expect(message.hasUnreadMedia).toBe(true)
    expect(message.ttlPeriod).toBe(30)
  })

  it('reads a message in a conversation with one other person', () => {
    const direct: Message = { ...ORDINARY, peer_id: { _: 'peerUser', user_id: 12n } }

    expect(new MessageView(direct).chat).toEqual({ kind: 'user', id: 12n })
  })
})
