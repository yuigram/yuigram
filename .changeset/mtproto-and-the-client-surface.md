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

**Runtimes.** The Bot API subsystem now reaches no Node built-in at all: polling, webhooks,
sending and files-by-`Blob` need nothing but `fetch`. One import of `node:crypto`, for the single
function comparing a webhook secret, had been keeping every bundle containing a bot from loading
on Bun, Deno, Cloudflare Workers or Vercel Edge — the platforms the Fetch webhook adapter exists
to serve. `docs/runtimes.md` has the matrix, says which cells were executed and which were only
reasoned about, and records what MTProto would still need to run in a browser.

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
