# @yuigram/mtproto

[![npm](https://img.shields.io/npm/v/@yuigram/mtproto.svg)](https://www.npmjs.com/package/@yuigram/mtproto)
[![licence](https://img.shields.io/npm/l/@yuigram/mtproto.svg)](https://github.com/yuigram/yuigram/blob/master/LICENSE)

The Telegram MTProto subsystem of [Yuigram](https://github.com/yuigram/yuigram): the protocol
implementation — cryptography, the TL codec, transport framing, the authorization handshake,
the session layer, the datacenter pool, peer resolution, file transfer and the updates manager.

> **You probably want [`yuigram`](https://www.npmjs.com/package/yuigram).** It is the package
> applications install, and it re-exports what an application uses from here — the account
> filters, utilities, worker, stream and testing entry points as `yuigram/account-filters`,
> `yuigram/account-utils`, `yuigram/worker`, `yuigram/stream` and `yuigram/testing`.

> **Using a user account through MTProto can get that account banned permanently.** Telegram
> states that accounts used for flooding, spamming or faking counters will be banned, and the
> ban applies to the account rather than to the application — what is lost is somebody's
> messages, groups and contacts. That is the reason this subsystem is shaped the way it is, and
> [mtproto.md](https://github.com/yuigram/yuigram/blob/master/docs/mtproto.md) opens with it.

This package is published separately for the reason the core is: it lets the protocol be
depended on without the Bot API coming with it, and it makes the architecture enforceable — the
subsystem cannot import the Bot API, and CI fails the build if it ever does.

Node.js 22 or newer. ESM only. Zero runtime dependencies: the cryptography Node does not
provide — AES-IGE, Telegram's RSA padding, PQ factorization, Miller-Rabin, SRP — is implemented
here.

## Licence

[MPL-2.0](https://github.com/yuigram/yuigram/blob/master/LICENSE). Releases up to `0.1.0` were
MIT-licensed.
