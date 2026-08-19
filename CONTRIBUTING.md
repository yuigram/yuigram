# Contributing

Thanks for your interest in Yuigram.

## Before you start

Yuigram is in early development. The architecture is settled and documented in [docs/](docs/);
the implementation is being built bottom-up. Read [docs/roadmap.md](docs/roadmap.md) to see
where the project currently is — a pull request for a phase that has not started yet is likely
to conflict with foundational work.

For anything beyond a small fix, open an issue first.

## Setup

```bash
pnpm install
pnpm verify
```

`pnpm verify` runs lint, typecheck, invariants and tests. It is what CI runs, so a green local
`verify` means a green pull request.

| Command | What it does |
|---|---|
| `pnpm build` | Build all packages |
| `pnpm test` | Run the test suite |
| `pnpm test:watch` | Watch mode |
| `pnpm lint` | Lint and format check |
| `pnpm lint:fix` | Apply safe fixes |
| `pnpm typecheck` | Full type check |
| `pnpm invariants` | Architecture invariant checks |

Node 22 or newer is required.

## The rules that are not negotiable

These are the ones that get pull requests rejected, so they are worth stating first.

**No third-party Telegram library, ever.** Not as a dependency, not vendored, not copied.
Yuigram implements the Bot API and MTProto itself. This is enforced by `pnpm invariants`.

**No code copied from another project.** puregram is MPL-2.0 — file-level copyleft — so
copying even a fragment would permanently bind the receiving file. mtcute is MIT and may be
read freely, but reproducing its structure closely produces a derivative of it. Protocol work
is written from Telegram's specification; other clients may be consulted to understand what
the *server* does, never transcribed. See [docs/licensing.md](docs/licensing.md) §3.

**Security checks are never configurable off.** A flag that disables validation is a flag that
ends up disabled in production.

**Layer boundaries hold.** `core` imports nothing transport-specific. `bot-api` and `mtproto`
never import each other.

## Protocol work

If you are implementing part of the MTProto stack:

1. **Work from the specification.** Cite the `core.telegram.org` page in a comment where the
   algorithm is non-obvious.
2. **Crypto needs known-answer vectors** before anything depends on it. A primitive without
   vectors is treated as unimplemented.
3. **The mock server comes first** for anything in the session or updates layers. These cannot
   be validated against the live network; see [docs/testing.md](docs/testing.md) §3.
4. **Record undocumented behaviour** in [docs/protocol-notes/](docs/protocol-notes/), scrubbed
   of anything account-identifying.

## Style

Biome handles formatting and linting; run `pnpm lint:fix` rather than arguing with it.

Comments should explain **why** — a constraint, a protocol requirement, a non-obvious
consequence. Do not comment what the code already says.

```ts
// Reconnect automatically when the transport becomes unavailable.
// Preserve the original Telegram error code for callers.
```

Everything committed is in English: code, comments, documentation, commit messages.

## Commits

Conventional commits, describing the change:

```
feat: add unified message event system
fix: handle MTProto reconnect failures
refactor: simplify client lifecycle
docs: document session storage
test: add middleware integration tests
```

## Pull requests

- Add a changeset for anything user-facing: `pnpm changeset`
- Add tests. A bug fix should come with the test that fails without it.
- Update documentation in the same pull request as the change.
- Keep it focused. One concern per pull request.

## Reporting bugs

Include the Yuigram version, Node version, a minimal reproduction, and what you expected.

**Never include a session string, bot token or `api_hash` in an issue.** If a reproduction
seems to need one, it does not — describe the shape of the data instead.

Security issues go through [SECURITY.md](SECURITY.md), not the issue tracker.
