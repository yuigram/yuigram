# Code Generation

Yuigram owns two generators. Together they produce the majority of the shipped type surface and
are the mechanism by which the framework tracks Telegram without proportional maintenance
effort.

| Generator | Input | Output | Scale |
|---|---|---|---|
| **Bot API** | `core.telegram.org/bots/api` (HTML) | types, methods, events, filters | 185 methods, 388 objects |
| **TL** | `core.telegram.org/schema` (TL) | types, reader, writer, errors | 2,315 constructors, 552 errors |

This is the answer to the maintainability requirement. Telegram ships Bot
API releases every few months and TL layers more often; a framework that hand-maintains either
surface falls behind permanently. Generation converts that recurring engineering work into a
review task.

---

## 1. Shared architecture

Both generators use the same three-stage shape, and share the emitter infrastructure:

```
   source ──> [ parser ] ──> IR (committed JSON) ──> [ emitters ] ──> generated sources
```

The **intermediate representation is the contract**. Parsers know about their input format and
nothing about TypeScript; emitters know about TypeScript and nothing about HTML or TL grammar.
This separation is what makes the Bot API scraper's fragility survivable — when Telegram
restructures its documentation, only the parser changes.

### The IR is committed

Schema snapshots live in the repository, layer- and version-tagged:

```
schemas/
├── bot-api/
│   ├── 10.2.json
│   └── 10.1.json
└── tl/
    ├── 223.json
    └── 222.json
```

Four consequences, all deliberate:

1. **Builds are reproducible offline.** No network access at build time, ever.
2. **Schema changes are reviewable diffs.** A Bot API release shows up as a readable change to
   a JSON file in a pull request, not as a silent shift in generated output.
3. **A documentation restructure breaks a scheduled job, not everyone's build.** This converts
   the highest-severity risk in [bot-api.md](bot-api.md) §8 into an inconvenience.
4. **History is preserved.** Diffing layer 222 against 223 answers "what changed" precisely.

---

## 2. Bot API generator

### 2.1 Source

Primary: `corefork.telegram.org/bots/api`. Fallback: `core.telegram.org/bots/api`.

The corefork host publishes documentation ahead of the stable page, which gives generated
clients lead time on unreleased features at no cost.

Cross-check: [`ark0f/tg-bot-api`](https://github.com/ark0f/tg-bot-api) (Apache-2.0 / MIT),
regenerated nightly. CI parses both and diffs the result. A divergence means either Telegram
restructured the page or our parser regressed — both worth an alert, and neither detectable
from our own output alone.

Explicitly **not** used: puregram's schema JSON, which is MPL-2.0. See
[licensing.md](licensing.md) §4.

### 2.2 The parsing problem

There is no machine-readable Bot API schema. The HTML documentation *is* the specification,
and types are expressed in prose. The parser must resolve:

| Documented as | Meaning |
|---|---|
| `Integer or String` | A union, expressed in English |
| `True` | Present only when true — a distinct type from `Boolean` |
| `InputFile or String` | The multipart boundary |
| `Array of Array of InlineKeyboardButton` | Nested arrays |
| `Message` or `True` (return) | Union return, depending on whether the message is inline |
| "Optional." prefix | Field optionality, carried in the description text |
| Fields documented required but absent in practice | Older messages lack fields the docs call mandatory |

The last row is the one that causes runtime failures rather than build failures. It is handled
by a **patch file** applied after parsing, recording deliberate deviations from the
documentation with a stated reason:

```json
{ "object": "Message", "field": "from",
  "override": { "required": false },
  "reason": "absent on channel posts despite being documented as present" }
```

Patches are reviewed like code. Their existence is a feature: it makes each deviation from the
official documentation explicit and attributable rather than buried in parser special-casing.

### 2.3 IR shape

```ts
type TypeRef =
  | { kind: 'string' }  | { kind: 'integer' } | { kind: 'float' }
  | { kind: 'boolean' } | { kind: 'true' }
  | { kind: 'array', of: TypeRef }
  | { kind: 'union', of: TypeRef[] }
  | { kind: 'reference', name: string }
  | { kind: 'literal', value: string }
  | { kind: 'file' }

interface Field  { name: string; type: TypeRef; required: boolean
                   description: string; documentationLink: string }
interface Method { name: string; arguments: Field[]; returns: TypeRef
                   multipartOnly: boolean; description: string }
```

Every entry carries its source URL, so provenance is machine-readable rather than assumed —
which matters for the documentation-text question flagged in [licensing.md](licensing.md) §5.

### 2.4 Emitters

| Emitter | Output |
|---|---|
| `types` | 388 object interfaces, split by domain |
| `methods` | Parameter and return types for 185 methods |
| `api` | The callable method surface (types only — the runtime is an eleven-line proxy) |
| `events` | Event-kind map, discriminants, **service-message promotion table** |
| `contexts` | Per-event field shapes, carrying the schema's own optionality |
| `bindings` | **Which methods each context can pre-address**, as a table |
| `registrations` | A named `on…` registration per event kind |
| `filters` | Per-field filters derived from object shapes |
| `errors` | Known error-code mappings |

The promotion table is generated by detecting `Message` fields that are service markers, so a
new service message type in a future Bot API release becomes a new event kind automatically.
See [events.md](events.md) §3.3.

### 2.5 Generating tables, not code

Two of those emitters produce breadth that would otherwise be hundreds of hand-written
methods, and neither emits a method body.

**`bindings`** classifies every method by the identifiers it takes. An update already
addresses something — a chat, a message, a query — so a method taking those parameters can be
offered with them filled in: `message.banChatMember({ user_id })` rather than
`api.banChatMember({ chat_id: message.chat.id, user_id })`. What is emitted is the
classification:

```ts
export const CHAT_BOUND = {
  banChatMember: ['chat_id'],
  sendMessage: ['chat_id', 'message_thread_id', 'business_connection_id'],
  …
}
```

The signatures come from `ApiMethods`, which is already generated, mapped through a type that
makes the supplied parameters optional rather than absent. No parameter shape is restated, so
none can drift. The runtime is one binder that reads the table and one prototype per client.
**105 bound methods, 165 generated lines, no per-method code anywhere.**

**`registrations`** emits one `on…` declaration per event kind — `onMessage`,
`onChatMemberJoined`, seventy-nine in all — and the list the client installs them from. Again
a declaration and a table: the bodies are one loop over that list.

The comparison worth making: the same breadth, emitted as code, is what takes a mature Bot API
framework 9,302 generated lines for its message surface alone. Both approaches are
maintenance-free — that is what generation buys — but declarations are paid for by every
consumer's TypeScript server, so emitting fewer of them for the same surface is worth the
indirection. See [performance.md](performance.md) §5.

### 2.6 What the classification cannot know

Three judgements are hand-written next to the generator, because a parameter name does not
carry them:

- **Which chat `chat_id` means.** On `forwardMessage` it is the *destination*, and the source
  is `from_chat_id`. Binding by name alone would forward every message to the chat it came
  from. Methods that distinguish source from destination are listed explicitly, and a guard
  fails the build if Telegram adds another one — the alternative is a silent misclassification
  that looks reasonable in review.
- **Required versus merely declared.** Every `sendX` method accepts an optional
  `callback_query_id`, because a bot may answer a callback query with a message. Only the
  answer methods require one. Matching on declaration classified `sendMessage` as a query
  answer, which is the confident kind of mistake a schema-driven rule makes.
- **What is never bound.** Nothing infers `user_id` from the sender. A moderation call aimed
  at whoever happened to send the message is a footgun; naming the target is one word longer
  and never ambiguous.

---

## 3. TL generator

### 3.1 Source

The official TL schema at `core.telegram.org/schema`, layer-tagged. Unlike the Bot API, this is
already machine-readable — the difficulty is in the grammar, not the extraction.

### 3.2 Grammar

```
name#id  arg:Type  arg2:flags.3?Type  = ResultType;
```

The constructor id is `CRC32` of the canonical signature with `;` and parentheses removed. It
is **computed and then compared** against any explicit `#id` — a mismatch means either the
parser's canonicalization is wrong or the schema is unusual, and both need a human.

The features that break naive parsers:

| Feature | Rule |
|---|---|
| `flags:#` | Declares a bitfield |
| `field:flags.N?T` | Present only when bit `N` is set |
| **`field:flags.N?true`** | **Zero bytes on the wire — the flag bit is the value** |
| Bare types | `%Type` or lowercase reference: no leading constructor id |
| Bare vectors | Inside otherwise-boxed structures |
| Namespaces | `messages.sendMessage` → nested TypeScript namespaces |
| Generic functions | `invokeWithLayer`, `invokeAfterMsg` — parameterized over the wrapped call |

### 3.3 Emitters

| Emitter | Output | Approx. size |
|---|---|---|
| `types` | Interfaces per constructor, split by TL namespace | 1.5–2 MB `.d.ts` |
| `reader` | Constructor id → deserializer | 200–300 KB |
| `writer` | Constructor id → serializer | 400–500 KB |
| `errors` | 552 typed error classes | 50–100 KB |
| `round-trip tests` | Generated property tests | — |

Errors are derived from Telegram's own schema and from observed responses, not from a
third-party error table. See [licensing.md](licensing.md) §6.

The generated round-trip test suite is itself an emitter output, so a new TL layer
automatically extends test coverage rather than leaving new constructors unverified. See
[testing.md](testing.md) §2.2.

---

## 4. Output size management

This is the one place where code generation actively hurts users if done carelessly. Measured
reference points from the ecosystem:

| Artifact | Size | Cost |
|---|---|---|
| `@mtcute/tl/index.d.ts` | 1.96 MB | Paid by the consumer's TypeScript server, on every keystroke |
| `@puregram/api/updates.d.ts` | 358 KB | Same |
| `bot-api/generated/bindings.ts` | 7 KB | Yuigram’s equivalent breadth, as a table |

Mitigations, both structural rather than cosmetic:

**Split by domain / namespace.** Generated declarations are emitted per Bot API domain
(`messages`, `chats`, `payments`, `stickers`, `business`, …) and per TL namespace
(`messages`, `channels`, `account`, `photos`, …), behind a barrel re-export. Editors resolve and
cache per file, and incremental recompilation touches a fraction of the surface.

**Lazy codec tables.** Constructor ids map to functions resolved on first use, so startup does
not eagerly construct a 2,315-entry dispatch table for a client that will use twenty.

Budget: **no single generated `.d.ts` over ~300 KB**, verified in CI. See
[performance.md](performance.md) §5.

---

## 5. Determinism

Generated output must be byte-identical for identical input, on any machine. Without this,
drift detection produces noise and stops being trusted.

Requirements:

- Stable ordering everywhere — sort by name, never rely on parse or object-key order
- No timestamps, no hostnames, no absolute paths, no generator version in the output body
- Formatting applied as a final pass with a pinned formatter version
- A checksum header recording the input schema hash

```ts
// GENERATED — do not edit.
// source: schemas/bot-api/10.2.json  sha256:3f9c…
```

CI regenerates and fails if the working tree differs. Hand-editing generated code is therefore
impossible to do accidentally, and impossible to do deliberately without noticing.

---

## 6. Drift detection and the update workflow

A scheduled job, daily:

```
fetch source ──> parse ──> new IR
                             │
                     diff against committed IR
                             │
                 ┌───────────┴───────────┐
              no change              change detected
                 │                        │
                exit          regenerate · run tests · open PR
```

The pull request body is generated from the diff, and states plainly what changed:

```
Bot API 10.2 → 10.3

Methods added:     2   (sendChecklist, editChecklist)
Methods changed:   1   (sendMessage: +checklist)
Objects added:     4
Objects changed:   3
Fields removed:    0
Breaking:          none detected
```

**A human reviews and merges.** The job never publishes on its own. Automation handles the
mechanical work; the judgement about whether a change needs design work — a new Bot API feature
may deserve a first-class abstraction rather than just a type — stays with a person.

### Failure modes and their signals

| Failure | Signal | Response |
|---|---|---|
| Telegram restructures the HTML | Parser throws, or the diff is implausibly large | Job fails loudly; existing builds unaffected; fix the parser |
| Parser regression | ark0f cross-check diverges | Investigate before merging |
| New TL layer | Round-trip tests fail on new constructors | Extend the parser; tests are generated, so coverage follows |
| Silent semantic change | Not detectable by diff alone | Test-DC smoke tests; user reports |

The last row is an acknowledged gap: a field whose *meaning* changes while its type stays the
same will pass every automated check. Nothing prevents that, and pretending otherwise would be
dishonest — it is caught by integration testing and by users, and that is the reality for every
client in this ecosystem.

---

## 7. Versioning

| Artifact | Version relationship |
|---|---|
| Bot API schema | Tracks Telegram's version (10.2, 10.3, …) |
| TL schema | Tracks the layer number (223, 224, …) |
| `yuigram` | Independent semantic versioning |

Yuigram's version does **not** encode the Bot API version or TL layer. Those are properties of
the schema the release was built against, exposed at runtime and documented per release:

```ts
import { schemaInfo } from 'yuigram'
schemaInfo.botApi   // '10.2'
schemaInfo.tlLayer  // 223
```

A schema bump that adds surface is a minor release. A schema bump that removes or changes
existing surface is a major release, because it breaks compilation for someone.

---

## 8. Why the runtime stays small

The generated output is almost entirely types. The runtime that consumes it is deliberately
tiny:

```ts
export function createApiProxy (caller) {
  return new Proxy({}, {
    get (_t, prop) {
      if (prop === 'call') return (m, p) => caller(m, p)
      return (params) => caller(prop, params)
    }
  })
}
```

185 Bot API methods, zero per-method runtime code. The types come from the generated `.d.ts`;
dispatch is a proxy. This has two consequences worth naming: new methods work the moment the
schema regenerates, and `call()` provides a forward-compatible escape hatch for methods newer
than the installed types.

The same pattern applies to the TL surface, with the codec tables generated and the dispatch
mechanism hand-written and small.

---

## 9. Principles

1. **The IR is the contract.** Parsers own the input format; emitters own TypeScript. Neither
   knows about the other.
2. **Commit the schema.** Reproducible builds, reviewable diffs, and a documentation
   restructure that breaks a job rather than everyone's build.
3. **Generated code is never hand-edited.** Enforced by checksum and CI regeneration.
4. **Deterministic output**, or drift detection becomes noise and stops being read.
5. **Automate the mechanical work; keep the judgement.** The bot opens the pull request; a
   person decides whether the change needs design.
6. **Cross-check against an independent parse.** Our own output cannot reveal our own parser's
   blind spots.
7. **Split the output.** A 2 MB declaration file is a cost paid by every user, every day.
8. **Record deviations explicitly.** Patch files with stated reasons, not silent special cases.
