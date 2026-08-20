# Naming

Evaluation of `Yuigram`, `yuigram`, `@yui` and `@yui/*`, and a recommendation.

---

## 1. Registry facts

Checked against the npm registry on 2026-08-19. One of these findings is decisive.

| Name | Status |
|---|---|
| `yuigram` | **Available** (404) |
| `@yuigram/*` | **Available** (404) |
| `@yui/*` | Available (404) |
| **`@yui`** | **Not a valid package name** |
| `yui` | **Taken** — Yahoo's YUI 3, 101,451 downloads/month |

### `@yui` cannot be a package

```
$ npm view @yui version
npm error code EINVALIDTAGNAME
npm error Invalid tag name "@yui" of package "@yui"
```

npm's grammar requires a scoped package to be `@scope/name`. A bare `@yui` has no name
component; npm parses the string as a package with a tag and rejects it. It cannot be
published, installed, or imported.

**Option B from the brief — `import { Bot } from "@yui"` — is therefore not implementable.**
It could only be simulated with a TypeScript path alias or a bundler alias, which would work
in the author's own repository and break for every consumer.

This removes the option rather than arguing against it.

### `yui` collides with an existing brand

`yui` on npm is Yahoo's YUI 3 library. Development stopped in 2014, yet it still records
101,451 downloads a month — comparable to `teleproto` and twice `@mtcute/node`. A `@yui`
scope would sit next to a well-known, still-downloaded, unrelated JavaScript library with the
same name. That is a discoverability and trust cost with no offsetting benefit.

---

## 2. The remaining options

### Option A — `yuigram` for everything

```bash
npm install yuigram
```
```ts
import { Account, Bot } from 'yuigram'
```

Internal packages: `@yuigram/core`, `@yuigram/bot-api`, `@yuigram/mtproto`.
Plugins: `@yuigram/session`, `@yuigram/redis`.

### Option C — `yuigram` public, `@yui/*` internal

```bash
npm install yuigram
```
```ts
import { Bot } from 'yuigram'
import { redis } from '@yui/redis'
```

Same public entry point, but the scope for internals and plugins is `@yui/*`.

---

## 3. Evaluation

| Criterion | Option A (`@yuigram/*`) | Option C (`@yui/*`) |
|---|---|---|
| **npm conventions** | Scope matches package name — the standard pattern (`@grammyjs/*` for `grammy`, `@mtcute/*` for mtcute) | Scope diverges from the product name |
| **Package identity** | One name everywhere | Two names for one project |
| **Branding** | Consistent; the scope reinforces the product | Splits brand equity across two strings |
| **Ergonomics** | `@yuigram/redis` — 8 characters longer | `@yui/redis` — marginally shorter |
| **AI ergonomics** | Predictable: the scope is derivable from the package name | A model must *know* the mapping; it cannot infer `@yui` from `yuigram` |
| **Discoverability** | Searching "yuigram" finds everything | Searching "yuigram" misses the plugins; searching "yui" surfaces Yahoo's library |
| **Monorepo** | Directory names match package names | Requires a mental mapping |
| **Plugin ecosystem** | Third parties can guess the convention | Third parties must be told |
| **Maintainability** | One name to protect, one scope to hold | Two, including one shared with a known brand |

### On the AI-ergonomics argument specifically

The project brief (§1, §37) proposes `@yui` partly because short names are efficient with AI
coding assistants. Examined directly, the argument does not hold:

**Token cost is negligible.** `@yuigram/redis` versus `@yui/redis` is a difference of a few
tokens, appearing once per file in an import statement. Against a file of hundreds or
thousands of tokens, it is noise.

**Inferability matters far more than length.** An assistant generating code has to produce a
package name that resolves. Given `yuigram`, `@yuigram/session` is derivable by convention;
`@yui/session` requires prior knowledge, and a model that lacks it will confidently emit
`@yuigram/session` and be wrong. **A shorter name that must be memorized is worse for AI
assistance than a longer one that can be derived.**

**Consistency dominates.** What actually helps model-generated code compile is one import
root, predictable member names, honest types, and one obvious way to do each thing. The API
design in [api-design.md](api-design.md) §17 addresses all of these. Scope length is not on
the list.

So the AI argument, which was the strongest case for `@yui`, in fact points the other way.

---

## 4. Recommendation

> **Option A.**
>
> - **npm package:** `yuigram`
> - **Import:** `import { Account, Bot } from 'yuigram'`
> - **Internal / plugin scope:** `@yuigram/*`
> - **Brand:** Yuigram
> - **`@yui` is not used**, and the `@yui` scope is not claimed

Reasons, in order of weight:

1. `@yui` as an import specifier is technically impossible — the option is not available.
2. `yui` is an existing, still-downloaded npm brand. Adjacency to it is a cost.
3. A scope matching the package name is the ecosystem convention and is derivable, which
   serves both humans and AI assistants better than a shorter arbitrary one.
4. One name is easier to protect, document, search for and build a community around.

### Optional: claim `@yui` defensively

Registering the `@yui` scope without publishing under it costs nothing and prevents a
third party from occupying a name adjacent to the project. This is squatting-prevention, not
a naming decision.

---

## 5. Public surface

Everything from one root, with narrow subpaths where an import would otherwise pull weight it
does not need:

```ts
import { Account, App, Bot, Router, f, media, session, memory, file } from 'yuigram'

import { express } from 'yuigram/webhook/express'   // avoids bundling express glue
import { mockBot } from 'yuigram/testing'           // test-only helpers
```

The rule: **if it is used in normal application code, it is at the root.** Subpaths exist only
to keep optional weight out of the main graph. A developer should never have to guess which
subpath a symbol lives in.

---

## 6. Repository structure

A monorepo publishing one primary package.

```
yuigram/
├── packages/
│   ├── core/          @yuigram/core       transport-agnostic framework
│   ├── bot-api/       @yuigram/bot-api    Bot API subsystem
│   ├── mtproto/       @yuigram/mtproto    MTProto subsystem
│   └── yuigram/       yuigram             the façade
├── plugins/
│   ├── storage-redis/   @yuigram/storage-redis
│   └── storage-sqlite/  @yuigram/storage-sqlite
├── schemas/  tools/  examples/  docs/  tests/
```

Considered and rejected:

| Structure | Why not |
|---|---|
| **Single package** | Bot-only users would still download the MTProto subsystem. Internal boundaries would be conventions rather than enforced. The CI invariants in [architecture.md](architecture.md) §10 depend on real package boundaries. |
| **Many independently-installed packages** | Fragments onboarding — `npm install yuigram` stops being sufficient, which is the product's central promise (the project brief §50). |

The hybrid keeps both properties: one install for users, enforced modularity for maintenance.
The internal packages are published so that advanced consumers *can* depend on `@yuigram/core`
directly, but nothing in the documentation asks them to.

---

## 7. Identifiers

| Concern | Decision |
|---|---|
| Product name | **Yuigram** (capital Y) in prose |
| Package | `yuigram`, lowercase |
| Scope | `@yuigram/*` |
| GitHub org | `yuigram` |
| Domain | `yuigram.dev` preferred; `.js.org` is a free fallback |
| Primary classes | `App`, `Bot`, `Account`, `Router` — of which only `Bot` ships today |
| Filter namespace | `f` — used constantly, and the brevity is earned. Not yet implemented; `filter`, `and`, `or` and `not` are what ship today |
| Media namespace | `media` — not yet implemented |
| Error prefix | None — `FloodError`, `BotApiError`, not `YuiFloodError` |
| Internal type prefix | None |

Three notes.

**`Account`, not `User`, for the MTProto client.** The original proposal was `Bot` and `User`,
on the principle that a client should be named for what it *is* on Telegram rather than which
protocol it speaks. The principle stands; the name does not. `User` is already Telegram's own
name for a person or bot in the API, and the Bot API subsystem exports it as a type:

```ts
import type { User } from 'yuigram'   // Telegram's User object, today
```

A client class of the same name would collide at the one import path the whole design is built
around. The alternatives were weighed as:

| Candidate | Verdict |
|---|---|
| `User` | Collides with the entity type. Renaming the entity is worse — matching Telegram's own vocabulary is a feature. |
| `UserClient` | Unambiguous, but asymmetric against a `Bot` that is not `BotClient`. |
| `Userbot` | Instantly recognisable to the Telegram community, but jargon, and it names a use rather than a thing. |
| **`Account`** | **Chosen.** Says what the client is — a Telegram account you are signed into — keeps the original principle, and collides with nothing. |

Every reference implementation avoids this trap by not naming the client after an entity:
mtcute has `TelegramClient`, puregram has `Telegram`, Telethon has `TelegramClient`. Yuigram
keeps the shorter, more descriptive pair, `Bot` and `Account`.

This is revisitable when the MTProto client is actually built; it is settled now only so the
documentation stops proposing a name that cannot compile.

**`f` as the filter namespace** is the one place brevity wins, because filters appear several
times per handler registration. `import { f } from 'yuigram'` is explicit at the import site,
so the short name is bound to something visible rather than being a global mystery.

**No `Yui` prefix on exported types.** `YuiError`, `YuiContext`, `YuiBot` would add a
redundant three characters to every identifier; the import statement already establishes
provenance, and TypeScript handles collisions with aliasing. The brief's §25 proposes
`YuiError` as a hierarchy root — the hierarchy is adopted, the prefix is not.
