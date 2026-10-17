# Entities

How Yuigram turns what Telegram sent into something a reader can ask questions of, which parts
of the schema have that treatment today, and which are still read through `raw`.

This document covers the MTProto side. The Bot API subsystem has no equivalent problem: its
schema is already a set of plain objects with named fields, and its context binds behaviour to
them. See [unified-model.md](unified-model.md) §5 for why the two are modelled separately.

---

## 1. The problem

An MTProto answer is a tree of TL constructors. Reading one field means knowing which
constructor arrived and which fields that constructor happens to carry:

```ts
// Who sent this?
const sender =
  message._ === 'messageEmpty'
    ? undefined
    : message.from_id?._ === 'peerUser'
      ? message.from_id.user_id
      : undefined
```

That is three narrowings for one question, repeated at every call site, and the compiler helps
only after the shape is already known. Multiply by the forty-odd fields on a message and the
five constructors of a chat, and reading Telegram becomes the bulk of the work in a program
that wanted to do something else.

Three specific hazards make this worse than verbosity:

- **Absence is overloaded.** A field can be missing because the constructor has no such field,
  because the flag was not set, or because the record is an outline that deliberately withholds
  it. All three read as `undefined`.
- **Numbers are not identities.** A user, a basic group and a channel can all be numbered 20.
  A message number restarts per conversation.
- **Some flags describe other flags.** A partial channel record carries a marker saying its
  stories-hidden flag is unpopulated; reading the flag directly turns "not told" into "no".

---

## 2. The shape chosen

**A view over the value.** A view holds the TL value it was given, computes on access, caches
nothing, and keeps the value reachable as `raw`.

```ts
const message = readMessage(update.message)

message.sender      // PeerRef | undefined
message.isOutgoing  // boolean, never `true | undefined`
message.raw         // the value, unchanged
```

Four properties follow, and each was a deliberate choice:

**It copies nothing.** Constructing a view allocates one object with one field. Reading a
property costs what reading the underlying field costs. There is no normalization pass, so a
program that reads two fields off a message does not pay for the other forty-five.

**It reaches nothing.** No account, no store, no network. Every accessor is a function of the
value alone. That is what makes it safe to build one from a message that arrived in any answer,
on any account, without asking which — and it is why the views can be constructed in a test, in
a worker, or from a stored copy with no client present.

**Behaviour is not on it.** Answering a message, editing it or fetching what it carried needs an
account and the conversation the update arrived in. That is what the event context already
owns — see [api-design.md](api-design.md) §6. A view that could act would be a second owner of
the network, with its own idea of which account it belonged to.

**The value stays reachable.** A reader that wants something a view does not expose is not
blocked by it. The view is a convenience over the schema, never a wall in front of it.

### 2.1 Why not the alternatives

| Considered | Why not |
| --- | --- |
| One shared `Message` type across Bot API and MTProto | The two schemas disagree on what a message is: peer references against resolved objects, Unix seconds against a formatted date, different field sets. [unified-model.md](unified-model.md) §5 forbids it on the unified surface, and honouring the difference is the point. |
| Eagerly normalized plain objects | Pays the conversion cost for every field on every message, for a reader that wanted two of them. Also freezes the answer at conversion time, so anything the schema gains later is invisible until the converter is updated. |
| Classes carrying an account, able to act | Makes every entity a network owner. Two views of one message would each hold a client, and a message forwarded between accounts would carry the wrong one. |
| Accessor functions over raw values, no objects | Loses discoverability entirely: `senderOf(message)` is not something autocomplete offers when the reader has a message in hand. |

### 2.2 Resolution is a separate step

A message names its sender as `peerUser(5)`. The name lives in a `User` in the same answer:
every reply that carries messages carries `users` and `chats` alongside them.

`PeerIndex` is that join, built per answer rather than threaded through each message view:

```ts
const people = readPeers(answer)

for (const value of answer.messages) {
  const message = readMessage(value)
  console.log(people.name(message?.sender), message?.text)
}
```

Two reasons it is not a constructor argument on `MessageView`. A message read from an update has
an index; one read from a stored copy does not, and a view whose accessors work only sometimes
is worse than one that never claims to know. And an index is per answer, not per message —
building one and reading many messages through it is the shape the data already has.

A reference the index does not hold reads as `undefined`. That is not a failed lookup: the
answer did not carry it, and finding out means asking, which is a call on the client.

---

## 3. Coverage

Coverage is measured mechanically: every field the generated interface declares, against every
field an accessor reads. It is a floor, not a score — a field with an accessor may still deserve
a better question than the one the schema asks.

| Constructor | Fields | Answered | Deliberately not |
| --- | --- | --- | --- |
| `message` | 47 | 47 | `legacy` |
| `messageService` | 16 | 16 | `legacy` |
| `messageEmpty` | 2 | 2 | — |
| `user` | 47 | 47 | — |
| `userEmpty` | 1 | 1 | — |
| `chat` | 15 | 15 | — |
| `chatEmpty` | 1 | 1 | — |
| `chatForbidden` | 2 | 2 | — |
| `channel` | 49 | 49 | — |
| `channelForbidden` | 7 | 7 | — |
| `dialog` | 15 | 15 | — |
| `dialogFolder` | 8 | 8 | — |
| every `messageMedia*` | 17 constructors | all | — |
| `stickerSet` | 18 | 17 | `hash` |

`hash` on a sticker set is a cache key for asking whether the list changed, which a reader of the
set has no use for.

`legacy` marks a message sent by a client old enough that its text needs re-fetching before its
formatting can be trusted. It is an instruction to the code that fetches rather than a fact
about the conversation, and a reader acting on it could do nothing useful with the answer.

Where the schema asks a question badly, the view asks a better one rather than mirroring it:

- **Two flags, one question.** A suggested post records what it was paid in as
  `paid_suggested_post_stars` and `paid_suggested_post_ton`, never both. `suggestedPostPaidIn`
  answers `'stars' | 'ton' | undefined`.
- **A wrapper around two answers.** `stories_max_id` is a structure carrying the newest story
  and whether one is live. Those are `storiesMaxId` and `hasLiveStory`.
- **A flag about a flag.** `stories_hidden_min` marks `stories_hidden` unpopulated, so
  `storiesHidden` answers `boolean | undefined` and never guesses.
- **Present-or-absent booleans.** The wire carries `out?: true`. A reader asking whether a
  message is outgoing wants an answer either way, so these read as `boolean`.
- **Derived, but from the value alone.** `canBeForwarded`, `isAutomaticForward`,
  `isTopicMessage`, `isReply` and `displayName` are computed, and computed without reaching
  anything.
- **Two depths, one reading.** A sticker set arrives brief in a list — sometimes with a cover or
  several — and full when asked for by itself. `StickerSetView` reads every form, says which with
  `isFull`, and pairs each sticker with every emoji the set's packs file it under, which is where
  Telegram records them, rather than only the one the sticker names for itself.
- **One constructor, six things.** `messageMediaDocument` is a video, a voice note, a sticker, an
  animation, a music track or a plain file, and which one lives in the document's attributes
  rather than in the constructor. `MediaView.kind` is that search, done once and named — and the
  order it searches in matters, because a sticker also carries an image size and an animation also
  carries a video attribute.
- **Six statuses, one answer.** A user's `status` is six constructors, two carrying a time and
  three saying only roughly. `presence` names which (`'online'`, `'offline'`, `'recently'`,
  `'last-week'`, `'last-month'`, `'long-ago'`, or `'bot'`), gives `onlineUntil` or `lastSeen`,
  and says with `hiddenByMe` when the vagueness is Telegram hiding others' times from an account
  that hides its own. `mention()` builds text linked to the account — completely, with its access
  hash, where the answer carried one — ready for `sendText`.
- **Structures joined where the schema splits them.** A poll's tally arrives beside its answers,
  keyed by an opaque option; a checklist's completions beside its tasks, keyed by number.
  `pollDetails` and `todoDetails` join them — each answer with its voters, whether this account
  chose it and whether it is right; each task with who finished it and when — and
  `pollDetails.partialResults` says when Telegram sent only this account's choices, so a missing
  count reads as unknown rather than zero. `webpageDetails`, `gameDetails`, `stickerDetails`
  (type, drawing format, set, custom emoji id, mask position, premium effect) and `location`
  (latitude, longitude, accuracy) read the rest, with `readPoll`, `readTodo`, `readWebPage`,
  `readGame`, `readSticker` and `readLocation` behind them for a value held without a view. The
  raw values stay where they were, as `poll`, `todo`, `webpage`, `game` and `geo`.
- **Seventy constructors, one switch.** A service message's `action` is one of sixty-eight
  `messageAction*` constructors besides the empty one, each spelling its fields the schema's way.
  `readAction` — also `MessageView.serviceAction` and `event.action` on an account's message
  events — reads each into a variant of `ServiceAction` with a `kind` named for what happened
  (`'members-added'`, `'joined-by-link'`, `'payment-received'`, `'gift-received'`), fields in
  camelCase, every peer a `PeerRef` an account method takes as it is, and a gift's note as
  `{ text, entities }`. Photos, gifts, themes and invoices' charges are handed on as they
  arrived, so `account.download(photoFile(action.photo))` works on a changed chat photo as on
  any photo. A few answers are derived: whether a call was `missed`, whether a group call
  `ended`. The constructor stays on every variant as `raw`, and one this build has no reading for
  is `'unsupported'` rather than an error. `f.action('members-added', …)` matches service
  messages by kind and narrows `event.action` to those variants.

---

## 4. Formatting

A message's text and its formatting are separate things: the text is plain, and the ranges within
it are a list of entities. The Bot API takes markup and a `parse_mode` and does this on the
server; MTProto has no such field, so a client that wants bold text computes the ranges itself.

`fromHtml` and `fromMarkdown` read markup into `{ text, entities }`; `toHtml` and `toMarkdown`
write it back. Both are in this repository, with no dependency added.

```ts
const body = fromHtml`Hello, <b>${name}</b>`

await account.call(sendMessage({ peer, ...body, random_id }))
```

Called as template tags they escape what is interpolated and leave the literal parts alone. The
markup is written by the developer and the values come from strangers, and that is the order in
which a user called `<b>` stops being able to format the message they appear in.

Offsets are UTF-16 code units, which is what a JavaScript string index is, so
`text.slice(offset, offset + length)` selects the range an entity covers with no conversion.

Three decisions worth knowing:

- **The Markdown dialect is MarkdownV2**, not the CommonMark-flavoured one the entity
  documentation shows. Yuigram is one framework, and `md` should not mean `*bold*` on one client
  and `**bold**` on another; text escaped for the Bot API side is safe here, and the reverse.
- **Markup that is not quite markup stays in the text.** `2 < 3 and 4 > 3` is a message, an
  unclosed tag runs to the end, and a marker that never closes is a character. Refusing any of
  these would break messages that have nothing to do with formatting.
- **Block quotations, in both forms.** A run of `>` lines is one quote. A run whose body ends in
  `||` is the expandable form — the mark is not part of what the quote says, so it comes off the
  text. Two quotes that touch are separated by `**`, an empty bold entity that contributes nothing
  to the message and exists only so the two do not read back as one. Telling that trailing `||`
  from a spoiler closing on the same line is done by reading the body twice, because counting
  pipes cannot: `>ends with ||shh||` closes a spoiler and `>hidden||` is a mark, and both end in
  exactly two.
- **`__` is one token, not two.** The dialect reads it greedily as the beginning or end of an
  underline, so `a__b` is a word with two underscores in it. That an empty pair of markers is
  consumed — which is what makes `**` work as a separator — does not extend to it. The module
  header separates what the dialect requires from what this parser chooses.

Entities the server finds on its own — mentions, hashtags, bare links, phone numbers, bank cards
— are written as plain text in both directions, because marking them up changes nothing about
the message.

---

## 5. What is not modelled yet

Everything below is reachable through `raw` and through the generated method surface today.
Listing it here is a statement of what has no reading layer, not of what is impossible.

Ordered by how often a program meets it.

| Area | What it covers | Notes |
| --- | --- | --- |
| **Conversation lists** | `DraftMessage`, `ForumTopic` | `Dialog` has a view and a walk over it; these two arrive beside it and do not. |
| **Membership** | `ChatMember`, admin and banned rights, invite links, bot info | Rights are two bitfield-like structures whose absent fields mean different things in each. |
| **Reactions** | `MessageReactions`, per-reaction counts, who reacted | `MessageView.reactions` returns the raw structure today. |
| **Full profiles** | `UserFull`, `ChatFull`, `ChannelFull` | Distinct from `User`/`Chat`: fetched deliberately, much larger, and carrying settings rather than identity. |
| **Stories** | Stories, their views, interactive elements, stealth mode | Depends on the story methods, which are not surfaced. |
| **Premium and payments** | Stars transactions, gifts, boosts, business accounts and connections | Same: the reading layer is worth building after the calls it reads the answers of. |

### 5.1 Modelled differently, on purpose

These have no entity class and are not gaps.

| Concept | How Yuigram models it |
| --- | --- |
| Update kinds | Normalized events plus a context per kind, not a class per update. See [events.md](events.md). |
| A peers index carried on every entity | `PeerIndex` per answer, and `PeerStore` for what the account has learned across answers. |
| Errors | The error taxonomy in [architecture.md](architecture.md) §9, shared with the Bot API side. |
| Keyboard construction | `Keyboard` and `InlineKeyboard` on the framework surface, shared by both transports. |

---

## 6. What the entity layer does not decide

**Paging.** Iterating is not an entity question, and the answer lives on the client. `nextDialogs`
works out where the next page begins without fetching it; the walks — `account.dialogs()`,
`account.history(peer)` and the rest — do the fetching, as async generators.

A generator was the resolution to what looked like a conflict. `normalize/paging.ts` says how many
pages to ask for, how fast, and what to do with them are the caller's — and a generator decides
none of the three: nothing is requested until the loop asks for the next item, breaking out stops
the fetching, and `limit` is the caller's own answer. What it removes is the offset arithmetic,
which is three fields that have to agree and the part a caller gets wrong.

**Every walk has a page read beside it**, and the walk is a loop over it: `account.historyPage`,
`account.membersPage`, `account.boostsPage` and the rest. A page is what a program needs when a
list has to be shown with how many there are, stopped now and carried on later, or told apart from
a list that has merely paused. It carries:

| Field | What it is |
| --- | --- |
| `items` | The page, as the walk would have yielded it |
| `total` | `{ count, precision }` as the answer gave it, or `undefined` where it gave none |
| `next` | A cursor to continue from, or `undefined` where the list ends here |
| `peers` | The users and conversations the answer described, where it described any |

and whatever else that answer says about the list: a forum's ordering, the pinned-to-top stories,
stealth mode, a story's counters, the star balance, the search allowance for public posts.

`precision` is `exact` where the answer states a count without flagging it as estimated — or is
the complete list, on a first request — `approximate` where the answer flags its own count as
inexact, and `reported` where it gives a number and says nothing about how exact it is. A total is
never the length of the page, and never zero standing in for "not said".

A cursor is opaque, not secret: base64 over the list it belongs to, a fingerprint of the filters
that produced it, and the position, with 64-bit values kept as integers. It is refused — before any
request — when handed to a different list, to the same list with different filters, or when it is
not a cursor. Peers inside it are references resolved through the account reading the next page,
so a cursor never carries an access hash. `cursor` on a walk starts the walk from such a place, and
`signal` stops a walk or a page read before its next request.

**Which policy a list is paged by** is the list's, not the layer's. Twenty lists ship, using nine
policies, and each list's rule is written once, in its page read:

| Policy | Continued by | The end is | Lists |
| --- | --- | --- | --- |
| Message number | The oldest message of the page, or the newest for `reverse` | The complete form, or a cursor that stopped moving | `history`, `search` |
| Dialog offset | The last row's date, number and peer | The complete form | `dialogs` |
| Rate, peer and number | The rate the answer gave, with the last message | No rate to continue from | `searchGlobal` |
| Rate, peer and number, dated | The same, falling back to the last message's date | The complete form, or an empty page | `searchHashtag`, `searchPosts` |
| Count into a live list | How many have been seen | An empty page, or the complete form | `members`, `profilePhotos`, `savedMusic` |
| Opaque cursor | The exact string the server named | No cursor, a cursor that stopped moving, or an empty page whose answer counts nothing | `reactions`, `boosts`, `starsTransactions`, `savedGifts`, `storyViewers` |
| Several fields | The last entry's date and identifiers | An entry that carries none, or a cursor that stopped moving | `forumTopics`, `inviteLinks`, `inviteMembers` |
| Identifier moving back | The oldest identifier of the page | An empty page, or a cursor that stopped moving | `profileStories`, `chatEvents` |
| State with a flag | The state, sent back as a continuation | The server saying there is no more | `allStories` |

An empty page is not the end by itself. A page with nothing on it and a cursor that moves is a list
that paused over a stretch the server left out, and it continues. What ends a list is the answer
saying so — no cursor, the complete form, no more — or a cursor that would ask for the page just
read, which would otherwise repeat for ever. Both kinds of end are tested by counting requests
rather than by reading output, because an implementation that never terminates yields exactly the
right items first.

A basic group's members are not a list Telegram pages: they arrive whole, in the group's full
description. `membersPage` reads them there and pages over the whole list locally, so its total is
exact.

**Chat folders are rules, applied here.** Telegram keeps a folder as conversations always in it,
never in it and pinned in it, plus kinds of conversation to include and exclusions for read, muted
and archived ones, and leaves applying them to the client. `account.dialogs({ folder })` reads the
folder's pinned conversations first, then the conversation list with the rules applied in the order
Telegram's own clients use: always-included wins, never-included loses, then the exclusions, then
the kinds — where a bot matches only as a bot and the account itself counts as a contact. A shared
folder is a fixed list of conversations and is read directly.

A walk yields a view where reading the value needs interpretation — a union whose constructor is
most of the answer, or a peer that has to become a reference — and the generated value itself where
it does not. A boost, a photo, a star transaction and a saved gift are flat records the schema
already describes; wrapping them would be a second name for the same fields.

**A record is only acceptable while it preserves the capability**, which is a stronger test than
"the fields are all there". For the four above:

| Yielded | What a caller needs to be able to do | How |
| --- | --- | --- |
| `Photo` | fetch the bytes; send it on without re-uploading | `photoFile(photo)` into `download`; `photoMedia(photo)` into a send |
| `Boost` | say who boosted | `user_id` plus the peer the answer carried, harvested on the way back |
| `StarsTransaction` | direction, amount, counterparty | flags and `peer` on the record |
| `SavedStarGift` | what it is, who sent it, when | `gift`, `from_id`, `date` on the record |

The peers are the part that would be easy to lose. Every walk goes out through the account, so
every user and chat an answer described is written down before the walk yields — which is why a
number read off one of these records is enough for `account.resolve({ kind, id })` afterwards,
with no second lookup and no per-answer index to carry around.

A photo or document can also be named by the opaque string Bot API clients use for files, through
`fileIdOfPhoto` and `fileIdOfDocument`, and one such string turned back into a download with
`fileFor` — see [mtproto.md](mtproto.md) §11.

**Thumbnails.** `thumbnails(media)` lists every rendering a photo or a document offers — a photo's
sizes and animated versions, a document's `thumbs` and `video_thumbs` — and says of each how it is
had:

| `availability` | Constructors | How |
| --- | --- | --- |
| `download` | `photoSize`, `photoSizeProgressive`, `videoSize` | `thumbnailFile(media, type)` into `download`, or `event.download({ thumbnail: type })` |
| `embedded` | `photoStrippedSize`, `photoCachedSize`, `photoPathSize` | `embeddedThumbnail(size)` from the utilities entry point, with no request |
| `unsupported` | `videoSizeEmojiMarkup`, `videoSizeStickerMarkup` | none: an emoji or sticker to animate, which a client draws itself |
| `unavailable` | `photoSizeEmpty` | none: listed with no content |

A document's thumbnail is addressed by the document — identifier, hash, reference, datacenter —
with the size's name added, so it goes stale when the document's reference does. From an event,
`download({ thumbnail })` asks for the message again once and retries, as it does for the whole
file; `account.download(thumbnailFile(...))` holds no message and hands the refusal back.
`fileIdOfThumbnail(media, type)` writes the string other clients use for one.

**Links.** A message's `t.me` address needs the conversation's username, which the message does
not carry. It belongs on the client or the context — whichever holds the peer — not on a view
that reaches nothing.

**Refresh.** A view is a reading of one value at one moment. Getting a newer one means asking
again, and asking is a call.

---

## 7. Adding an entity

The pattern, in order:

1. Read the constructors in `schemas/tl/api.<layer>.tl`. Count them, and find what separates
   them — a union of five constructors covering three real things needs one accessor that says
   which, before any field accessor is worth writing.
2. Write the view over the union, not over one constructor. Accessors answer `undefined` where
   the message does not carry the field, and `false` rather than `undefined` for a
   present-or-absent boolean.
3. Check every field is answered, or say in the module why one is not.
4. Test all constructors, including the empty and forbidden ones. Those are the cases that
   arrive when something has gone wrong, and the ones a reader has never seen.
5. Export from `entities/index.ts`, the package entry, and the façade — and add a case to
   `packages/yuigram/test/facade.test.ts`, which is the only test that checks what a user
   actually receives from `npm install yuigram`.
