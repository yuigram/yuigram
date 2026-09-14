---
'@yuigram/bot-api': minor
'@yuigram/mtproto': minor
'@yuigram/core': minor
'yuigram': minor
---

MTProto, and a client surface that says what a handler was given.

`npm install yuigram` now builds bots and user accounts in one project, on an implementation
this repository owns end to end. The published packages still have zero runtime dependencies:
the cryptography Node does not provide — AES-IGE, Telegram's RSA padding, PQ factorization,
Miller-Rabin, SRP — is implemented here.

**Accounts.** An `Account` client with its own lifecycle, signing in by phone and code, by
password, as a bot, or from a token another device approves. Sessions are portable strings or
an encrypted directory, and an account resumed from one never reaches a sign-in callback.
Signing out revokes the authorization and forgets what only made sense while it held: the keys,
the place in the update stream, and the peers whose access hashes were issued to it.

**The protocol.** The full MTProto 2.0 stack: the authorization handshake with perfect forward
secrecy, the session layer, transport framing and obfuscation, connection pools per datacenter
and purpose, migration between datacenters, and the updates manager with gap recovery over the
common box and per-channel sequences. 757 typed methods generated from a committed TL schema,
with `call()` reaching anything newer.

**Files.** Chunked parallel upload and download with the alignment rules the server enforces,
photos fetched at the largest size worth fetching, expired file references put right invisibly
from the message they arrived in, and delivery nodes behind an explicit opt-in — a node is
recognised by the address list rather than by whatever redirected to it, holds an authorization
good for nothing but ranges, and is asked for nothing else.

**Reading a message.** A message arrives as three constructors behind one union — ordinary,
service, and an empty hole where one the account cannot see used to be — with most fields
optional behind that. `readMessage` returns a view that answers the questions directly, over the
value it was handed rather than a copy of it, so nothing is transformed on the way in and the
message stays reachable as `raw`. The view reaches no account and no network: everything it
answers is a function of the message alone, which is what makes it safe to build one from
anything that arrived, on any account.

**Formatting.** MTProto has no `parse_mode`: a message is plain text plus a list of ranges, and
producing the ranges is the client's job. `fromHtml` and `fromMarkdown` read markup into text and
entities, `toHtml` and `toMarkdown` write it back, and both parsers are in the package rather than
in a dependency. Used as template tags they escape what is interpolated and leave the markup
alone, so a user called `<b>` cannot format the message they appear in. Block quotations are
supported in both forms, expandable included, in both dialects and both directions.

**Runtimes.** The Bot API subsystem reaches no Node built-in at all: polling, webhooks, sending
and files-by-`Blob` need nothing but `fetch`. One import of `node:crypto`, for the single function
comparing a webhook secret, had been keeping every bundle containing a bot from loading on Bun,
Deno, Cloudflare Workers or Vercel Edge — the platforms the Fetch webhook adapter exists to serve.

**And MTProto runs in a browser.** Every module that reached for `node:crypto` now names one
contract instead, and the `browser` field in each package chooses between two implementations of
it: the platform's, which Node, Bun and Deno all provide, and one over nothing at all. The second
needed AES-256, SHA-1, SHA-256, MD5, HMAC and DEFLATE written here, each checked against the
values published with the standards that define them before being compared with the platform. A
WebSocket connector stands in for the socket a browser does not have, `web()` is a store over
`localStorage`, and stretching a password goes to `crypto.subtle` — the one primitive worth
waiting for, and the reason the rest do not wait.

A bundle that builds is not a program that runs, so `tools/browser` serves the framework to a real
browser and answers the WebSocket it opens with the datacenter the test suite uses. Seventeen
checks pass in Chrome: the key exchange completes, a temporary key is bound, an encrypted call is
answered, an update is dispatched, and the session survives in the page's own storage. Running it
found what the build could not — `process.version` read at module scope, `Buffer` on four live
paths, and a five-second prime validation that wants a worker.

`docs/runtimes.md` has the matrix broken down step by step, says which cells were executed and
which were only reasoned about, and states plainly that Bun, Deno, the edge platforms and Telegram
itself are still inference.

**Saying something.** An account can now start a conversation rather than only answer one.
`sendText`, `sendMedia`, `editMessage`, `deleteMessages`, `forwardMessages`, `react`,
`pinMessage`, `readHistory`, `setTyping` and `getMessages` sit on `Account`, take a name or a
reference, and accept formatted text as readily as plain — so a bold message is one call rather
than a string and a list of ranges kept in step by hand. The deduplication key every send needs
is drawn rather than left to the caller, and where Telegram splits a method in two for channels
the right one is chosen from the conversation.

**Reading media.** `message.media` is a view rather than nineteen constructors. The one that
matters most is the least informative — a video, a voice note, a sticker, an animation, a music
track and a plain file all arrive as `messageMediaDocument`, and which one it is lives in the
document's attributes — so `kind` answers that in a word, and duration, size, dimensions and the
rest come off whichever attribute actually holds them.

**The second factor.** Signing in with a password worked; managing one did not exist.
`passwordStatus`, `setPassword`, `removePassword`, the recovery-address calls and the recovery
flow are on `Account` now. The password never leaves the process: what goes to Telegram is a proof
of the old one and a verifier for the new, and neither can be turned back into what was typed.

**Searching, and who is in a conversation.** `account.search` walks the messages in one
conversation that match a query; `account.searchGlobal` walks matches across every conversation;
`account.members` walks a channel's members. Three lists, three different ways of continuing —
by message number, by a rate the server returns with each page, and by how many have been seen —
and each is the one Telegram actually specifies rather than one policy forced onto all three. A
`MemberView` reads somebody's standing, where two of the six constructors name a conversation
rather than a person.

**Membership changes arrive as events.** Somebody joining, leaving, being promoted or being
restricted now reaches a handler as `mtproto:membership` rather than as a raw update — all seven
constructors Telegram kept for the one question, naming the conversation it happened in and the
account that made the change rather than the one it was about. The seven disagree about which
field means what: the actor is `actor_id` on the two modern forms, `inviter_id` on the oldest of
the additions, and named nowhere on removal, promotion and renaming, where the event now says so
instead of blaming the person it happened to. The whole-list form keeps its chat inside the list
it wraps, and is read from there rather than reported as concerning no conversation.

**A bot signed in over this transport gets its queries here.** A tapped button, an inline query,
a chosen result, the two payment steps and a request to join now reach a handler as
`mtproto:callback_query`, `mtproto:inline_query`, `mtproto:inline_chosen`,
`mtproto:shipping_query`, `mtproto:precheckout_query` and `mtproto:join_request`. They have to
be: a Bot API client is a different client on a different connection and cannot answer a query
that arrived on this one. So `answerCallback`, `answerInlineQuery`, `answerShipping`,
`answerPrecheckout` and `decideJoinRequest` sit on `Account`, each answering with the identifier
the query arrived with — every one of these stalls something visible until it is answered, and a
pre-checkout answer is the last point at which a charge can still be refused. A query is not a
conversation, either: an inline query names no chat, and the event no longer invents a private
one from whoever asked.

**Walking a list.** `account.dialogs()` and `account.history(peer)` read a list that arrives one
page at a time as one sequence, working out the offsets — three fields that have to agree — rather
than leaving them to the caller. Both are async generators: nothing is requested until the loop
asks for the next item, so breaking out stops the fetching and `limit` means what it says. A
`DialogView` reads a row in a conversation list, which is this account's record about a
conversation rather than the conversation itself.

**One application, several identities.** An `App` holds a bot and any number of accounts, each
with its own credentials, store and connections, under shared middleware and cross-client
handlers. Operations that mean the same thing on both transports are the same call; the ones
that do not stay on the client that has them.

**The client surface changed.** Registration now selects the context type, so a handler receives
what its registration proved rather than the weakest case across every update kind. The renames
are mechanical and nothing was removed without a replacement — `docs/migration.md` lists every
one.

A bot that uses none of this pays nothing for it: the MTProto subsystem is loaded on demand, and
a Bot API bundle contains none of it.
