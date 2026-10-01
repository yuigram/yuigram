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

`pnpm verify` runs lint, typecheck, invariants, tests and the declaration budget. CI runs more
than that, and each of the rest can be run locally:

| Command | What it does |
|---|---|
| `pnpm build` | Build all packages |
| `pnpm test` | Run the test suite |
| `pnpm test:watch` | Watch mode |
| `pnpm lint` | Lint and format check |
| `pnpm lint:fix` | Apply safe fixes |
| `pnpm typecheck` | Full type check |
| `pnpm invariants` | Architecture invariant checks |
| `pnpm smoke` | Pack the published packages, install them into a scratch project, and use them |
| `pnpm bench` | Startup, bundle and dispatch budgets |
| `pnpm --filter @yuigram/schema regenerate:offline` | Re-emit the Bot API surface from the committed schema; the diff must be empty |
| `pnpm --filter @yuigram/tl-codegen emit` | The same for the TL surface |

Node 22 or newer is required.

Two checks need software the repository does not install:

- **The runtime matrix** runs the packed packages on Node, Bun, Deno and workerd against a local
  stand-in datacenter. Point it at the runtimes, and at a directory with `miniflare` installed:

  ```bash
  YUIGRAM_BUN=/path/to/bun YUIGRAM_DENO=/path/to/deno YUIGRAM_MINIFLARE=/path/to/dir pnpm --filter @yuigram/runtime-matrix run matrix --strict
  ```

  `--strict` makes a runtime that cannot be found a failure rather than a skipped line. The
  versions CI uses are pinned in `.github/workflows/ci.yml`.

- **The Redis suites** are skipped without a server. With one running:

  ```bash
  pnpm build
  YUIGRAM_TEST_REDIS_URL=redis://127.0.0.1:6379/15 pnpm exec vitest run packages/redis/test/redis-live.test.ts packages/mtproto/test/storage-lease-processes.test.ts
  ```

  The suites write under a namespace of their own for each run and clear it afterwards; CI
  points them at database 15 to keep them apart from anything else.

Nothing in either reaches Telegram. Checks against Telegram itself are opt-in and documented in
[docs/live-verification.md](docs/live-verification.md).

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
