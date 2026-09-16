/**
 * What a walk claims to yield.
 *
 * The typing is part of the contract here rather than an implementation
 * detail. A caller writes `for await (const topic of account.forumTopics(…))`
 * and reads fields off `topic` without a cast; a walk typed as `unknown` or as
 * the raw TL union would compile and be useless, and no runtime case would
 * notice. So the element type of every walk is pinned, and so is the fact that
 * these are generators rather than promises of arrays — a caller that could
 * `await` one would be fetching the whole list.
 *
 * Everything here is a compile-time assertion. There is nothing to run.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type { Account } from '../src/account.js'
import type {
  ChatEventView,
  ForumTopicView,
  InviteImporterView,
  InviteLinkView,
} from '../src/entities/chat.js'
import type { MessageView, ReactionView } from '../src/entities/message.js'
import type { PeerStoriesView, StoryView, StoryViewerView } from '../src/entities/story.js'
import type {
  Boost,
  Photo,
  SavedStarGift,
  StarsTransaction,
} from '../src/generated/api/types/index.js'
import type { AllStoriesOptions, WalkOptions } from '../src/paging/walk.js'

declare const account: Account

describe('what each walk yields', () => {
  it('hands over a view where the value needs interpreting', () => {
    expectTypeOf(account.forumTopics('@forum')).toEqualTypeOf<
      AsyncGenerator<ForumTopicView, void, undefined>
    >()
    expectTypeOf(account.chatEvents('@channel')).toEqualTypeOf<
      AsyncGenerator<ChatEventView, void, undefined>
    >()
    expectTypeOf(account.inviteLinks('@chat')).toEqualTypeOf<
      AsyncGenerator<InviteLinkView, void, undefined>
    >()
    expectTypeOf(account.inviteMembers('@chat')).toEqualTypeOf<
      AsyncGenerator<InviteImporterView, void, undefined>
    >()
    expectTypeOf(account.reactions('@chat', 1)).toEqualTypeOf<
      AsyncGenerator<ReactionView, void, undefined>
    >()
    expectTypeOf(account.profileStories('@someone')).toEqualTypeOf<
      AsyncGenerator<StoryView, void, undefined>
    >()
    expectTypeOf(account.storyViewers('me', 1)).toEqualTypeOf<
      AsyncGenerator<StoryViewerView, void, undefined>
    >()
    expectTypeOf(account.allStories()).toEqualTypeOf<
      AsyncGenerator<PeerStoriesView, void, undefined>
    >()
  })

  it('hands over the generated value where it does not', () => {
    // A boost, a photo, a transaction and a gift are flat records the schema
    // already describes. Wrapping them would be a second name for the same
    // fields, and a caller would have to learn which one it had.
    expectTypeOf(account.boosts('@channel')).toEqualTypeOf<AsyncGenerator<Boost, void, undefined>>()
    expectTypeOf(account.profilePhotos('@someone')).toEqualTypeOf<
      AsyncGenerator<Photo, void, undefined>
    >()
    expectTypeOf(account.starsTransactions('me')).toEqualTypeOf<
      AsyncGenerator<StarsTransaction, void, undefined>
    >()
    expectTypeOf(account.savedGifts('me')).toEqualTypeOf<
      AsyncGenerator<SavedStarGift, void, undefined>
    >()
  })

  it('hands over a message where the list is of messages', () => {
    expectTypeOf(account.searchHashtag('telegram')).toEqualTypeOf<
      AsyncGenerator<MessageView, void, undefined>
    >()
  })
})

describe('what a walk is', () => {
  it('is a generator rather than a promise of the whole list', () => {
    // The difference a caller depends on: nothing is fetched until the loop
    // asks, and breaking out of it stops the requests. A walk that could be
    // awaited would have fetched everything before the first item was read.
    expectTypeOf(account.forumTopics('@forum')).not.toMatchTypeOf<Promise<unknown>>()
    expectTypeOf(account.forumTopics('@forum')).toHaveProperty('next')
    expectTypeOf(account.forumTopics('@forum')).toHaveProperty('return')
  })

  it('yields nothing when it ends, rather than a last value', () => {
    // `AsyncGenerator<T, void>` and `AsyncGenerator<T, T>` read alike in a
    // `for await`, and differ for a caller driving `next()` by hand.
    expectTypeOf<Awaited<ReturnType<ReturnType<Account['forumTopics']>['next']>>>().toEqualTypeOf<
      IteratorResult<ForumTopicView, void>
    >()
  })
})

describe('what a walk takes', () => {
  it('accepts a peer by name or by reference', () => {
    expectTypeOf(account.chatEvents).parameter(0).toEqualTypeOf<Parameters<Account['history']>[0]>()
  })

  it('takes the identifier a list belongs to where it needs one', () => {
    // Story viewers and reactions are lists within something, so the thing is
    // an argument rather than an option: leaving it optional would make a
    // caller that forgot it ask about a story the account never named.
    expectTypeOf(account.storyViewers).parameter(1).toEqualTypeOf<number>()
    expectTypeOf(account.reactions).parameter(1).toEqualTypeOf<number>()
  })

  it('extends the shared options where the page size means something', () => {
    expectTypeOf<WalkOptions>().toHaveProperty('limit')
    expectTypeOf<WalkOptions>().toHaveProperty('pageSize')
  })

  it('offers no page size where the server decides how much a page holds', () => {
    // `stories.getAllStories` takes no limit at all, so offering one would be a
    // knob that does nothing.
    expectTypeOf<AllStoriesOptions>().toHaveProperty('limit')
    expectTypeOf<AllStoriesOptions>().not.toHaveProperty('pageSize')
  })
})
