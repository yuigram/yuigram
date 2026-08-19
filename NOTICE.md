# Notices

Yuigram is licensed under the [MIT License](LICENSE).

## Third-party code

**Yuigram ships no third-party code.**

The published packages have **zero runtime dependencies**. The Bot API subsystem uses Node's
built-in `fetch`, `FormData` and `Blob`; the MTProto subsystem uses `node:crypto` and native
`BigInt`. Cryptographic primitives Node does not provide — AES-IGE, Telegram's RSA padding
schemes, PQ factorization, Miller-Rabin, SRP — are implemented in this repository.

This is verified on every build. `pnpm invariants` fails if any Telegram library appears in a
dependency field, and if any foreign identifier reaches a published declaration file.

Development dependencies (TypeScript, Biome, Vitest, tsx, changesets) are not distributed with
the packages and are listed in the lockfile.

## Telegram specifications

The protocol implementations are written from Telegram's published documentation:

- [Bot API](https://core.telegram.org/bots/api)
- [MTProto](https://core.telegram.org/mtproto)
- [TL schema](https://core.telegram.org/schema)

Method names, type shapes and protocol algorithms are interface facts. Where documentation
prose is reproduced in generated JSDoc, the generated entry carries a link to its source page.

Telegram's server RSA public keys are taken from the published MTProto documentation. They are
deliberately **not** extracted from Telegram's own client applications, which are GPL-licensed.

## Acknowledgements

The following projects were studied during the design of Yuigram. **No code from any of them
is used, adapted, or translated in this repository.** They are credited here as prior art and
as a source of engineering knowledge about Telegram's behaviour, which is a debt worth stating
plainly even though it carries no licence obligation.

| Project | Licence | What was learned from it |
|---|---|---|
| [mtcute](https://github.com/mtcute/mtcute) | MIT | The scale and layering a serious MTProto client requires; where the protocol's difficulty actually concentrates |
| [puregram](https://github.com/puregram/puregram) | MPL-2.0 | Schema-driven Bot API generation; promoting service messages to first-class update kinds; dual-parameter filter narrowing |
| [Telethon](https://github.com/LonamiWebs/Telethon) | MIT | Reference behaviour for protocol edge cases |
| [TDLib](https://github.com/tdlib/td) | Boost 1.0 | Reference behaviour for protocol edge cases |
| [grammY](https://github.com/grammyjs/grammY) | MIT | Middleware and plugin ergonomics in the Bot API space |

puregram is MPL-2.0, which is file-level copyleft. It was used as reference material only; no
puregram source appears in this repository, and a similarity check runs in CI to keep that
verifiable rather than merely asserted.

See [docs/licensing.md](docs/licensing.md) for the full analysis.
