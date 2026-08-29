# Code Generation

Yuigram owns two generators. Together they produce the majority of the shipped type surface and
are the mechanism by which the framework tracks Telegram without proportional maintenance
effort.

| Generator | Input | Output | Scale |
|---|---|---|---|
| **Bot API** | `core.telegram.org/bots/api` (HTML) | types, methods, events, filters | 185 methods, 388 objects |
| **TL** | `core.telegram.org/schema` + `/schema/mtproto` (TL) | types, reader, writer, errors | 2,315 constructors, 552 errors |

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

### 3.1 Source of truth

**Telegram's published `.tl` text is canonical.** Two documents, fetched from
`core.telegram.org`, parsed by Yuigram's own parser:

| Document | URL | Contents | Versioning |
|---|---|---|---|
| `api.tl` | `/schema`, `/schema?layer=N` | The API layer — 2,300-odd constructors and methods | Layer-numbered |
| `mtproto.tl` | `/schema/mtproto` | The service layer — containers, acknowledgements, salts, the plaintext handshake | Unversioned; the page is titled *Current MTProto TL-schema* |

The pipeline is fixed:

```
core.telegram.org/schema{,/mtproto}   (.tl text)
            │
     Yuigram TL parser
            │
   validated internal representation      committed, reviewable
            │
    emitters ──> generated TypeScript     committed, deterministic
```

**No third-party mirror is a source of truth, at any stage.** Not mtcute's `api-schema.json`,
not GramJS's, not a community JSON dump. A mirror is someone else's parse with someone else's
corrections folded in, and the parser has to exist regardless — the codec must agree with the
notation the protocol is documented in.

Telegram also publishes its own JSON renderings at `/schema/json` and `/schema/mtproto-json`.
Those are first-party and useful, and they are used **only as a cross-check**: after a fetch the
IR is compared against the JSON, and a divergence fails the update rather than being resolved
silently. A cross-check earns its keep precisely because it does not share a parser with the
thing it checks. It never becomes the input.

**Runtime never fetches a schema.** Fetching happens in a development step run by a person, and
the result is committed. A published package that reached the network to learn its own wire
format would be unbuildable offline, non-reproducible, and a supply-chain surface.

#### How a schema enters the repository

```
pnpm --filter @yuigram/tl fetch           download both documents
        │
        ├─> schemas/tl/api.<layer>.tl     the raw text, verbatim
        ├─> schemas/tl/mtproto.tl         the raw text, verbatim
        ├─> schemas/tl/api.<layer>.json   the parsed IR
        └─> schemas/tl/mtproto.json       the parsed IR

pnpm --filter @yuigram/tl emit            IR -> generated TypeScript, offline
```

Both the raw text and the IR are committed. The raw text is what makes a parser change
reviewable: a diff of the IR alone cannot distinguish "Telegram changed the schema" from "the
parser now reads it differently". Keeping both separates those two questions.

#### How updates are reviewed

The scheduled drift job of §6 opens a pull request and never merges one. The review surface is
three diffs answering three different questions:

| Diff | Question it answers |
|---|---|
| `schemas/tl/*.tl` | What did Telegram change? |
| `schemas/tl/*.json` | Did the parser read that change the way it reads everything else? |
| `packages/mtproto/src/generated/**` | What does it mean for the surface users compile against? |

Because generation is deterministic (§5), the third diff is a function of the second. A
generated diff that does not follow from a schema diff means the generator changed, and that is
a separate review.

#### How malformed and unsupported TL is rejected

The parse is **total**. Every line of both documents is either recognised and represented, or it
fails the fetch. There is no skip path, no permissive mode and no unrecognised-constructor
bucket: a parser that silently drops what it does not understand produces a codec that is
correct for everything it knows about and absent for the rest, and nothing downstream can tell
the difference.

The parser fails on:

| Condition | Why it is fatal |
|---|---|
| A line matching no production of the grammar | The schema uses a construct the parser does not model |
| A declared `#id` disagreeing with the CRC32 of the canonical signature | Either the canonicalisation is wrong or the schema is unusual; both need a person |
| A duplicate constructor id within one table | The registry would silently lose one of them |
| A flag reference to an undeclared bitfield, or a bit index outside `0..31` | A field that can never be read correctly |
| A type reference with no definition in this schema or in the shared core | A dangling codec |
| A generic parameter the emitter cannot express | Silent type erasure at the boundary |

Each failure names the document, the line and the construct. None is downgradable by a flag.

### 3.2 Two schemas, kept apart

The two documents are separate on the wire and stay separate here. The service layer is read and
written **before any auth key exists**, over a plaintext channel; the API layer only ever travels
inside an encrypted session. Merging their constructor tables would make it possible for an API
constructor to decode on the plaintext channel — a step that should be impossible rather than
merely unused.

What the two documents actually share is one constructor. `mtproto.tl` defines exactly one TL
core primitive:

```
vector {t:Type} # [ t ] = Vector t;
```

`api.tl` defines the same vector as `vector#1cb5c415`, and owns the rest of the core:

```
boolFalse#bc799737 = Bool;
boolTrue#997275b5 = Bool;
true#3fedd339 = True;
error#c4b9f9bb code:int text:string = Error;
null#56730bcc = Null;
```

So the generator emits **three tables**, not one and not two:

```
core        vector · Bool · True · Error · Null       the TL language itself
  │
  ├── mtproto   service constructors + functions      plaintext channel and session control
  └── api       layer constructors + methods          encrypted session only
```

`core` exists so the shared primitives are defined once rather than duplicated with a hope that
both copies stay identical. `mtproto` and `api` never import each other, in either direction.

**A reader is built for a channel, not for the protocol.** The plaintext handshake constructs a
reader over `core + mtproto`; the session constructs one over `core + mtproto + api`. An API
constructor id arriving on the plaintext channel resolves to nothing and raises a decode error,
because it is genuinely absent from that reader's table.

The distinction survives into the generated TypeScript rather than living only in the generator:

- Separate modules, separate namespaces, separate registries.
- Constructor ids are branded per table, so a function accepting an `MtprotoId` cannot be handed
  an `ApiId`. The mistake is a compile error, not a runtime surprise.
- No barrel re-exports one table's constructors from the other's module.
- A `module-boundaries` invariant forbids the import edge outright. Branding stops a value
  crossing between tables; only an import rule stops one table's module reaching into the
  other's, and the two existing invariants resolve specifiers to package names and therefore
  skip relative imports entirely.

A single flat registry would be less code, and that being the only argument in its favour is why
it is rejected.

Two consequences only appear once the tables exist, and both are handled rather than avoided:

- **The two schemas share one name.** `message` is the container element in the service schema
  and a chat message in the API layer — different shapes, different identifiers. A scope
  spanning both therefore **refuses** the name rather than resolving it by table order, because
  preferring whichever table was listed first would encode the wrong constructor with nothing to
  show it had happened. A caller that means one of them addresses that table.
- **A bare reference names a type, not a constructor.** `%Message` says "a bare value of type
  Message", and a bare value carries no identifier to say which constructor that is. The
  generator resolves it to the type's sole constructor, and refuses to generate at all if the
  type has more than one — a guess there would decode the wrong shape silently.

### 3.3 Layer policy

**Yuigram pins one TL layer per release. The pin is layer 223.**

The pin was verified against `core.telegram.org/schema` on 2026-08-29, which serves 223 as
current. It is also the layer the research corpus is measured against — the 2,315-entry count,
the declaration budget, the round-trip corpus. Generating first against the layer the design was
validated against is what makes the first generated diff reviewable; a pin chosen for being
*newest* rather than *known* would mix schema novelty into the review of a brand-new parser.

**There is no automatic layer upgrade.** The drift job fetches, parses, diffs and opens a pull
request. A person reads it and decides. A framework that followed the newest layer on its own
would change its users' compiled surface without anyone having looked at what changed.

**The layer is not runtime-configurable.** It is sent once per connection, in
`invokeWithLayer(layer, initConnection(…))`, and it has to be the layer the generated codecs were
emitted from. An application able to pass a different number would be announcing a wire contract
its own types do not implement. No protocol requirement calls for a client to speak more than one
layer, so nothing is lost by refusing.

The whole public surface for this is one read-only field:

```ts
import { schemaInfo } from 'yuigram'
schemaInfo.tlLayer   // 223
```

#### The update procedure

1. The drift job reports that `core.telegram.org/schema` serves a layer above the pin.
2. `fetch` writes the new `.tl` and IR alongside the current ones. Old snapshots stay — they are
   the record of what each release spoke.
3. `emit` regenerates. Output is deterministic, so the diff is attributable.
4. The generated round-trip corpus grows with the schema, so new constructors arrive with
   coverage rather than without it.
5. A person reviews the three diffs above and merges, or does not.
6. The release carrying the bump names the old and new layer in its notes.

#### Compatibility expectations

Telegram continues to serve clients on older layers — that is what the layer number is for. A
release pinned to 223 keeps working after 224 ships; it simply does not see what 224 introduced.
The failure mode to plan for is the narrow one: a server sending a constructor the pinned table
does not contain. That is a decode error confined to the message carrying it, not a
connection-level failure, and the session layer treats it as an unparseable message rather than a
protocol violation.

An additive layer bump is a minor release. A bump that removes or changes existing surface is a
major release, because it breaks compilation for someone (§7).

### 3.4 Module layout and declaration size

Generated TL declarations are the largest artifact the project ships and the one most able to
degrade a consumer's editor. The measured reference is a 1.96 MB single declaration file in the
ecosystem, re-read by the TypeScript server on every keystroke. The budget is **no generated
`.d.ts` over 300 KB**, enforced by a CI check over the built declarations — the largest today is
the Bot API's 229 KB `available-types.d.ts`, so the budget has headroom but no slack.

Byte count is not the objective. The objective is that a developer's editor stays responsive and
that the type relationships are the real ones, so the split is structural:

```
generated/
├── core/             vector · Bool · True · Error · Null
├── mtproto/
│   ├── types.ts          service constructors
│   ├── functions.ts      service methods
│   └── registry.ts       id -> codec, this table only
└── api/
    ├── types/
    │   ├── index.ts      root-namespace constructors
    │   ├── messages.ts   one module per TL namespace
    │   ├── channels.ts
    │   └── …
    ├── functions/        the same split, for methods
    ├── errors.ts
    └── registry.ts       id -> codec, this table only
```

**Split by TL namespace**, because that is the boundary the schema already draws and the one a
developer navigates by. A split chosen purely to hit a byte target would cut across concepts and
make every import arbitrary.

One namespace needs more than that. The root namespace holds twelve hundred constructors and
emits 330 KB on its own, so it is divided again — alphabetically, into a directory behind a
barrel that keeps its original module path. Alphabetical is not arbitrary here: TL names a
constructor after the type it builds, so a type and its constructors land in the same file, and
a name moves between files only if it is renamed. The division triggers on measured output
rather than on a constructor count, so it is a function of the schema alone and identical on
every machine.

**Cycles are handled by construction, not by luck.** Cross-namespace references are ordinary in
TL — `messages.messages` carries root `Message`, `Chat` and `User` values. Two rules apply:

- *Type modules* import each other with `import type` only. Those imports are erased, circular
  references between them are legal TypeScript, and that is stated as intended rather than
  tolerated.
- *Runtime codec modules* have no cycles at all: a codec never imports another codec. It resolves
  what it needs through the registry it was constructed with, by id. The runtime module graph is
  therefore a tree — namespace modules export codec factories, the registry assembles them once,
  and nothing points back up.

**Resolution is lazy.** Ids map to factories realised on first use, so a client touching twenty
constructors does not pay to build a table of 2,315.

**The public surface is the API layer and the two codec entry points.** The `core` and `mtproto`
tables, the registry internals, the branded id types and the emitter's own structures stay
internal to `@yuigram/mtproto`. A consumer sees the TL types they call methods with; they never
see how the generator arranged them.

### 3.5 Grammar

```
name#id  arg:Type  arg2:flags.3?Type  = ResultType;
```

The constructor id is `CRC32` of the canonical signature with `;` and parentheses removed. It is
**computed and then compared** against any explicit `#id`; a mismatch is fatal, per §3.1.

The features that break naive parsers:

| Feature | Rule |
|---|---|
| `flags:#` | Declares a bitfield |
| `field:flags.N?T` | Present only when bit `N` is set |
| **`field:flags.N?true`** | **Zero bytes on the wire — the flag bit is the value** |
| Bare types | `%Type` or a lowercase reference: no leading constructor id |
| Bare vectors | Inside otherwise-boxed structures |
| Namespaces | `messages.sendMessage` → nested TypeScript namespaces |
| Generic functions | `invokeWithLayer`, `invokeAfterMsg` — parameterized over the wrapped call |
| Section markers | `---types---` and `---functions---`; a document may omit the first and default to types |

### 3.6 Emitters

| Emitter | Output |
|---|---|
| `types` | An interface per constructor and a union per boxed type, split by TL namespace |
| `tables` | The wire layout of every constructor, as data |
| `registry` | The indexed table and its branded identifier type |
| `schema-info` | The pinned layer, and nothing else |

**The codec is table-driven.** The generator emits a description of each
constructor's fields; one hand-written reader and one hand-written writer walk
it. The alternative — a serializer and a deserializer emitted per constructor —
was rejected once the tables existed, for two reasons that outlast any schema:

- *One interpreter is verifiable once.* Twenty-three hundred generated functions
  can only be checked by round-tripping them against each other, which passes
  for a consistently wrong pair. A single reader and writer are checked against
  fixed byte vectors, boundary cases and malformed input directly.
- *A layer bump changes data, not code.* New constructors extend a table.
  Nothing about the emitted logic has to be re-reviewed.

The table also costs a consumer's editor nothing: its declaration is one line
whatever its length, so the size budget applies only to the type modules.

Errors are derived from Telegram's own schema and from observed responses, not from a
third-party error table. See [licensing.md](licensing.md) §6.

The generated round-trip test suite is itself an emitter output, so a new TL layer automatically
extends test coverage rather than leaving new constructors unverified. See
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

Two mitigations, both structural rather than cosmetic, and both applied by each generator:

**Split by domain or namespace.** Generated declarations are emitted per Bot API domain
(`messages`, `chats`, `payments`, `stickers`, `business`, …) and per TL namespace
(`messages`, `channels`, `account`, `photos`, …). Editors resolve and cache per file, and
incremental recompilation touches a fraction of the surface.

**Lazy codec tables.** Constructor ids map to functions resolved on first use, so startup does
not eagerly construct a 2,315-entry dispatch table for a client that will use twenty.

Budget: **no single generated `.d.ts` over ~300 KB**, enforced by a CI check over the built
declarations. See [performance.md](performance.md) §5.

The TL generator's layout, and how it keeps the runtime module graph acyclic while type modules
reference each other freely, is in §3.4.

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
| TL schema | Tracks the pinned layer number — currently 223, see §3.3 |
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
