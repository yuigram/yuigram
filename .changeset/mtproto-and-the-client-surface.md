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
