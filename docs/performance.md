# Performance

Performance characteristics, budgets, and the architectural decisions that would be expensive
to reverse later.

Premature optimization is explicitly not the aim. This document does not propose optimizations;
it identifies the small number of decisions that are cheap now and very expensive after
release, and sets budgets so that regressions are visible.

---

## 1. Where time actually goes

For a typical bot, a Telegram round trip is 50–300 ms. Framework overhead is measured in
microseconds. **The framework is not the bottleneck**, and designing as though it were would
trade clarity for nothing.

The exceptions, where framework decisions genuinely dominate:

| Situation | Dominant cost |
|---|---|
| High-volume bots (>1,000 updates/s) | Per-update allocation, dispatch overhead |
| MTProto file transfer | Crypto throughput, connection parallelism |
| Many concurrent MTProto clients | Memory per client, mostly peer cache |
| Large TypeScript projects | `.d.ts` size — paid on every keystroke, not at runtime |
| Serverless / edge | Cold start, bundle size |

Effort belongs in these five places and nowhere else.

---

## 2. Startup

| Phase | Budget | Notes |
|---|---|---|
| `import 'yuigram'` | < 100 ms | Dominated by module parse — keep the eager surface small |
| `Bot.fromToken(token)` | < 1 ms | Nothing but validation |
| `bot.poll()` | < 500 ms | One `getMe`, one `setMyCommands` if configured |
| `Account.fromSession(...)` | < 1 ms | No I/O in the factory |
| `user.connect()` — resumed session | < 2 s | Load the protocol stack, the session, connect, handshake with existing key |
| `user.sendCode(...)` and the steps after it | network-bound | Full DH handshake plus a round trip per step |

Decisions that protect this:

- **Lazy TL codec tables.** Building a 2,300-entry dispatch table eagerly costs startup time
  for a client that will use twenty constructors. Resolve on first use: an account loads the
  tables, and the protocol layers that read them, at the moment it connects. A program that
  only runs a bot therefore never evaluates them, and one that does connect pays the cost
  once per process rather than once per client. The `eager-surfaces` invariant keeps a static
  edge from putting them back, and `startup/import` measures what is left.
- **No I/O in constructors.** A constructor that opens a file cannot be used in a
  dependency-injection container or a test without side effects.
- **Subpath exports.** Webhook adapters, testing helpers and storage drivers are not in the
  main entry point, so importing `yuigram` does not parse express glue.
- **One resolution of the core per package.** Measured, the import is not dominated by the
  framework's own code — that runs for about 3 ms — but by Node loading modules: compiling
  them, and resolving each specifier. An import by package name is resolved separately for
  every module that writes it, and the fifty-odd modules the Bot API and MTProto main entries
  load each named `@yuigram/core`. They now take its values from a local `src/core.ts` that
  re-exports it, which cut the import by about 16 ms in a paired comparison of isolated builds.
  The `core-route` invariant keeps a name import from coming back into that graph; `import
  type`, lazily loaded modules and the core's other entry points are untouched, because none
  of them costs anything at startup.

### 2.1 What the gate actually measures

**The acceptance statistic is the median of seven samples**, each a fresh process timing one
dynamic import of the built entry point. A further sample is taken first and discarded, because
a file the operating system has never read costs a disk seek rather than a parse. The reported
range is the minimum and maximum of the seven; it is *not* the acceptance criterion, and
individual samples above 100 ms do not fail the gate.

That distinction matters because the spread is wide and the machine moves it more than the code
does. Eleven runs of one tree, one build, one session:

```
quiet machine   92.3  93.9  94.0  97.1  97.2          ms  (median per run)
after the suite  106   111   120   132   132   152     ms
```

Individual samples across those runs ran from **85 to 163 ms**. A control build of the previous
commit, measured back to back with the 93.9 above, gave 97.4 and 93.7 — and differs from the
current tree by two eager modules, about a millisecond.

**So the honest verdict is the one this section has carried since the budget was set: met on a
quiet machine, and not reliably.** It is not being widened to make that go away, and a run that
passes is not evidence on its own. What the code did is the two-module comparison; what the
timings did is mostly weather.

**So the comparison carries the weight, and the eager module count is what the comparison is made
of.** At roughly 0.4 ms a module the count predicts the medians better than any single timing
does, and it does not drift.

### 2.2 Where this budget currently stands

**Over it.** The eager graph has grown to 129 modules, about 1.3 MB of which some
44% is documentation comments, and the gate's own procedure measures **110 ms**
(seven samples, 103–117 ms) on the tree with the per-package core module. Before
that change an isolated build measured about 129 ms in the same session, so the
change is real and the gap that remains is about 10 ms.

What the remaining time is, from a profile of that tree: framework code about
3 ms; compiling the modules' source about 29 ms; and Node's per-module work —
finding each module's package scope (~19 ms), checking the file (~17 ms), real
paths and opens (~22 ms). Three further candidates were priced on isolated
builds and not taken:

| Candidate | Priced | Why not taken |
| --- | --- | --- |
| A `package.json` in each `dist/` so the scope search stops there | −15 ms | It would shadow the `browser` maps and `sideEffects` that bundlers read from the nearest manifest, and the optional entry points' imports of their own package by name |
| Comments removed from the emitted JavaScript | −5 ms | The compiler's `removeComments` removes the declarations' documentation as well; keeping it needs a second, JavaScript-only build per package |
| The two smallest redundant modules | ~1 ms | Below what the comparison can tell from noise |

The gate therefore fails, and stays failing rather than being widened. The
history below is how it got here.

**Earlier: at the line, and the line moved with the machine.** Nine runs of the
benchmark's own procedure on the same tree, in the order they were taken, when
the graph was about a hundred modules:

```
97.2  100  98.7  101  96.5  99.3  106  116  118   ms
```

The first six sit between 96 and 101 against a budget of 100. The last three
climb together as the machine takes on other work, and a run of the *unmodified*
earlier trees under that load measures 130–150 — so the tail is the machine
rather than the code.

**The honest verdict is that the gate is met on a quiet machine and not
reliably.** It is not being widened to make that go away: a figure adjusted
until it passes measures nothing. What can be said with confidence is the
comparison, because a comparison survives a machine that drifts.

#### Where the time goes

Profiling a cold import settles what the prose above only assumed. Framework
code accounts for **under two milliseconds** of it. The rest is Node resolving
modules:

| | |
| --- | --- |
| `internalModuleStat` | 16.9 ms |
| `esm/utils` | 16.8 ms |
| `getPackageScopeConfig` | 14.7 ms |
| `package_json_reader`, `lstat`, `open`, `node:path`, `node:url`, `node:fs` | 31.6 ms |
| every framework module's own evaluation, together | 1.7 ms |

Measured against a synthetic tree — a hundred trivial modules in one directory
cost 29 ms to add — the per-module charge is about 0.3 ms at best and about
0.4 ms across a tree as scattered as this one. **So the lever is how many
modules there are, not how large they are**, which is the opposite of what
"dominated by module parse" suggests.

#### What was done about it

The eager surface went from 118 modules to 101 by removing indirection that was
doing no work: a barrel that dragged four webhook adapters into every program
importing a bot, thirteen more in `@yuigram/core` and three in `@yuigram/mtproto`
whose only job was to be re-exported by the package entry point, and one crypto
module left with a single caller. Same exported names, same packages, nothing
moved behind a dynamic import.

#### The measurements

Four alternating rounds, seven samples each, same machine and build settings,
medians per round:

| Tree | Round medians | Overall |
| --- | --- | --- |
| After this work | 105 / 104 / 106 / 107 | **105 ms** |
| Before the platform-seam split | 109 / 110 / 111 / 111 | 110 ms |
| With the seam split, before this work | 112 / 113 / 116 / 111 | 112 ms |

Every round agrees on the ordering, so the 7 ms improvement and the 2 ms the
seam split had cost are both real rather than drift. Individual samples spread
from 96 to 129 ms, which is why medians of medians are reported rather than a
best case.

Every round agrees on the ordering in both sessions this was measured in,
including one where the machine was loaded enough to put all three trees between
130 and 150 ms. **That is what makes the 7 ms attributable**: a comparison
survives drift that an absolute number does not.

#### What closed the gap

The prose above concluded that "move real work behind a dynamic import would
move the cost somewhere nothing measures rather than remove it", and dismissed
it. That was too broad. It is true of work a program is going to do anyway —
moving the codec tables out of the graph only defers what connecting will pay —
and false of work most programs never do at all.

Managing a two-factor password is the second kind. It reaches SRP, SRP reaches
modular exponentiation, Miller-Rabin and the safe-prime table, and a bot has no
password to manage. Seven modules of number theory were being resolved by every
program that loaded the framework so that eight `async` functions could be
called synchronously from the barrel, which none of them is. They are now loaded
when one of the eight is called, which is the shape the codec tables, the
sign-in steps and the download path already use.

That took the eager graph from 102 modules to 95, and moved the distribution off
the line:

| Tree | Modules | Three consecutive medians | Sample range |
| --- | --- | --- | --- |
| Before the paged lists | 102 | 96.9 | 93–106 |
| With them, before this | 104 | 103 / 97.7 / 101 | 89–124 |
| After | 95 | 94.0 / 92.7 / 93.7 | 89–99 |
| Plus the exclusion guard and the people surface | 97 | 93.9 / 94.0 / 97.2 | 85–106 |
| Plus the conversation family, statically imported | 104 | 103 / 103 / 104 | 96–114 |
| The same, loaded when a conversation is operated on | 97 | 95.3 / 95.8 / 99.0 | 85–108 |
| Plus forums, stories, gifts and premium, all loaded when called | 97 | — | — |
| Plus the file-identifier surface | 98 | 99.4 / over / 92.1 | 89–107 |
| Plus identifiers, links and the Bot API payload builders | 100 | 91.7 / 95.4 | 84–107 |

The middle row is the one that matters for how the budget was being read: the
same tree measured above and below 100 ms depending on the run, so a passing
gate said nothing on its own.

An earlier revision of this section claimed the last row put *every individual
sample* under budget. That was true of the three runs measured at the time and
is not a property that holds in general — later runs of the same tree produced
samples from 85 to 106 ms. What can be said is what §2.1 says: the median is the
statistic, it passes, and the sample range straddles the budget.

**The last two rows are the most recent additions, and the second of them is a deliberate trade.**
Four domains — forum topics, stories, gifts, and boosts with the business surface — were added and
cost the eager graph nothing, because each is loaded when one of its operations is called, exactly
as the conversation family is. Three convenience constants that would have been exported from the
package root are not, for the same reason: a value export pulls its whole module in, and those
three would have cost four modules between them for constants a caller can write out.

The file-identifier surface is the one module that was *not* avoided. It is a set of synchronous
pure functions — read an identifier, write one, turn one into a download location — and the only
way to load it lazily would be to make them `async`, which would change their signatures to hide
work at first use. That is the thing this section exists to prevent rather than to do, so the
module is eager and costs what it costs.

What it costs is visible in the measurements, and they are reported as they came out. Three
consecutive runs of the same tree gave a median of 99.4 ms, then one over budget, then 92.1 ms,
with individual samples from 89 to 107 ms in every one. The gate's statistic — the median of
seven — passed in two of the three. That is the straddling this section has described since the
paged lists, now with less room: a tree whose median sits within a few milliseconds of the budget
will report both answers depending on what else the machine is doing, and a single passing run is
not evidence that it is comfortably inside.

**The last row was measured against a control, and came out faster.** Two eager modules were
added — marked identifiers with the link grammar in `@yuigram/core`, and the Bot API payload
builders — and both are synchronous pure functions, so the argument that kept the
file-identifier surface eager keeps these eager too: the only way to defer them would be to make
them `async`, which hides work behind a signature change.

Rather than assume the cost, both trees were built and measured in alternating rounds on one
machine, one warm-up discarded, seven samples each:

| Tree | Eager modules | Round medians | Sample range |
| --- | --- | --- | --- |
| Before this work | 98 | 94.4 / 97.8 ms | 85–113 ms |
| After it | 100 | 91.7 / 95.4 ms | 84–107 ms |

Both rounds agree on the ordering, which is what makes a 2–3 ms difference worth reporting at
all, and the direction is the opposite of what the module count predicts. The explanation is the
paged reads in the same window: the walks used to be one eager module holding every walk's
implementation, and splitting the page reads into a lazily imported module of their own took
more eager *bytes* out of the graph than the two new modules put back. Modules are the lever this
section has measured, and this is the reminder that they are a proxy for work rather than the
work itself.

The gate's own run of the same procedure reports **97.4 ms, range 85–111**, inside the budget,
which is the same straddling described above.

The attributable part is one module, about 0.4 ms. The rest is the spread. **The budget is not
being widened and the statistic is not being changed**; what is being recorded is that the
headroom is now small enough that the next eager module should be argued for rather than assumed.

Neither the lazy codec boundary nor the Bot API bundle's exclusion of MTProto moved:
`bundle/bot-mtproto` is still
0 KB.

The middle row is a regression this project caused and then removed. Sixty operations on
conversations arrived in six modules, and importing them statically put all six on the eager path
— seven modules, and the medians moved with them. They are now loaded when one of the operations
is called, which is the test the section below sets out: work most programs never do is loaded
when it is asked for. A bot that never renames a channel resolves none of it.

That has one visible consequence. The operations are reachable as `account.<method>`, and no
longer as free functions from the package entry — a static re-export would put the modules back on
the eager path, which is the whole cost being avoided. Their types are still exported, because a
type is erased.

#### What is left

At roughly 0.4 ms a module, the remaining headroom is about twelve modules. What
is still eagerly resolved and need not be follows the same test as the password
machinery — work most programs never do — and the candidates are the message
formatters (`format/html`, `format/markdown`, `format/text`), which a program
that sends plain text never touches, and the entity views, which a program that
reads `raw` never constructs. Neither has been done: each is a public surface
whose laziness would have to be arranged without changing a signature, and the
budget is met without them.

What is *not* worth doing is publishing fewer, larger modules. That would cost
the codec tables their lazy boundary and the Bot API bundle its exclusion of
MTProto, which are worth more than the milliseconds.

---

## 3. Update processing

Budget: **< 1 ms of framework overhead per update**, excluding handler and network time. At
that level it is invisible next to a round trip, and there is no case for going further.

Design choices that keep it there:

| Choice | Effect |
|---|---|
| Kind-indexed handler map | Handler lookup is O(1), not a scan over every registration |
| Filter `kinds` metadata | Irrelevant filters skipped before any predicate runs |
| Chain composed at registration | Middleware chain built once, not per update |
| Lazy context getters | `message.chat` decodes on access; an unused field costs nothing |
| Empty chains skipped | An unused hook costs zero, so hooks can exist generously |
| No per-update class instantiation for unused wrappers | Wrapper objects created on demand |

The lazy-getter decision is the one that matters most at volume. A bot handling only
`/start` should not pay to decode the sender, chat, entities and media of every message that
passes through.

### Measured

`pnpm bench` times the whole per-update path — normalization, service promotion, the middleware
chain, filter evaluation across several registrations, context construction and handler
invocation — with the network replaced by the mock transport, so handler and network time are
excluded by construction.

| Measurement | Result |
|---|---|
| Framework overhead per update | **~14 µs** |
| Throughput, single-threaded | **~70,000 updates/sec** |
| Budget | 1,000 µs |

Measured on a developer machine with a stack of five middleware and five handler
registrations, one of which matches. The figure moves with the hardware, so treat it as an
order of magnitude and a direction of travel rather than a number to defend: the point is that
overhead sits roughly seventy times under the budget and four orders of magnitude under a
Telegram round trip.

### Concurrency

Concurrent dispatch by default. In-flight tracking bounds memory and enables draining. An
optional `maxConcurrent` protects downstream systems:

```ts
new App({ maxConcurrent: 100 })
```

`ordering: 'per-chat'` serializes within a chat and is a throughput ceiling — correct for
conversational state machines, wrong as a default. See [events.md](events.md) §7.

---

## 4. Memory

| Component | Estimate | Notes |
|---|---|---|
| Bot client, idle | ~2–5 MB | Mostly loaded module code |
| Per in-flight update | ~2–10 KB | Lazy decoding keeps this low |
| MTProto client, idle | ~10–20 MB | Codec tables, connection buffers |
| **MTProto peer cache** | **grows without bound** | The one real leak risk |
| Framework sessions in memory | unbounded without an LRU | `memory({ max })` provided |

The peer cache is the item to watch. An active account accumulates tens or hundreds of
thousands of peers, and holding them all in memory is not viable for a long-running process
with several clients. Mitigations: a persistent driver with an in-memory LRU in front
(`tiered`), and a documented working-set bound. This is a design requirement, not a future
optimization — retrofitting a bounded cache onto code that assumed a complete in-memory map
is a rewrite.

---

## 5. TypeScript performance

This is where a Telegram framework most often disappoints in practice, and it is invisible in
benchmarks because the cost is paid by the *consumer's editor*, not by the runtime.

Measured reference points:

| Artifact | Size |
|---|---|
| `@mtcute/tl/index.d.ts` | **1.96 MB** |
| `@puregram/api` `updates.d.ts` | 358 KB |
| `@puregram/api` `types.d.ts` | 319 KB |

A two-megabyte declaration file is re-read and re-checked by the TypeScript server far more
often than most people assume, and it is the difference between autocomplete appearing in
100 ms and in two seconds.

Budgets and the choices that hold them:

| Budget | Mechanism |
|---|---|
| No single `.d.ts` over ~300 KB | Split generated declarations by domain / TL namespace |
| Autocomplete in an example project < 500 ms | Measured in CI on a fixture project |
| Bounded conditional-type depth | Avoid deep recursive generics in the public surface |
| Bounded intersection accumulation | Cap plugin type accumulation; flatten where possible |
| Type tests | `expect-type` assertions so inference quality is a test, not a hope |

The bounded-intersection point refers to the plugin model: `.extend()` accumulating
intersections indefinitely degrades editor performance in exactly the applications that use
the most plugins. Flattening the accumulated type at each step keeps it linear.

---

## 6. MTProto throughput

| Factor | Impact | Approach |
|---|---|---|
| **AES-IGE in pure JS** | Dominates file transfer | Correct JS first; optional WASM acceleration later |
| Connection parallelism | Dominates download speed | Separate connection pools per DC by purpose; file transfers use distinct `session_id`s over the same auth key, as Telegram's file documentation recommends |
| Chunk size | Moderate | 512 KB default, tunable |
| TL serialization | Low | Generated code; buffer reuse where measurable |
| Peer lookups | Moderate at volume | Indexed storage plus an in-memory LRU |

Order matters here: **correctness first**. A fast, subtly wrong AES-IGE implementation is
worth nothing, and the WASM path is an optional package precisely so that it never becomes a
prerequisite for correct behaviour.

---

## 7. Bundle size

| Target | Budget | Mechanism |
|---|---|---|
| Bot-only application | < 150 KB min+gzip | Tree-shaking; MTProto excluded when unused |
| Full application | < 500 KB min+gzip | Lazy TL tables |
| Cold start (serverless) | < 300 ms | Small eager surface; webhook path avoids MTProto entirely |

The Bot-only figure requires that importing `yuigram` does not pull the MTProto subsystem
into the graph. That is a packaging constraint — `sideEffects: false`, no top-level
cross-imports between subsystems, `Account` reachable only through its own module — and it is
far cheaper to establish at the start than to retrofit.

### Measured

`pnpm bench` bundles two programs written against the built package — one that runs only a
bot, one that also runs an account — minifies and compresses each, and fails the build on a
breach.

| Measurement | Result | Budget |
|---|---|---|
| Bot-only application | **~19 KB** min+gzip | 150 KB |
| Full application | **~109 KB** min+gzip | 500 KB |
| MTProto in a bot-only bundle | **0 bytes** | 0 |

The third row is not redundant. The whole framework compresses to less than the bot-only
allowance, so a bot bundle that dragged all of MTProto in would still be inside its budget:
the size cannot hold the exclusion, and the exclusion is what the first row's note actually
requires. It is measured from the bundler's own per-input accounting rather than by searching
the output, which minification is free to rename.

The serverless figure is not measured. It is a property of a platform rather than of this
package, and the mechanism it names — a small eager surface, with the webhook path avoiding
MTProto — is what `startup/import` and the `eager-surfaces` invariant already hold.

---

## 8. Benchmarks

Tracked in CI, on fixed hardware, with results published per release:

| Benchmark | Measures |
|---|---|
| `dispatch/simple` | Updates/second, one handler, no filters |
| `dispatch/filtered` | Updates/second, fifty handlers with filters |
| `dispatch/middleware` | Overhead per middleware layer |
| `context/lazy` | Cost of accessing 0, 1, or all context fields |
| `tl/serialize` | TL encode/decode throughput |
| `crypto/aes-ige` | MB/s |
| `startup/import` | Module load time |
| `types/check` | `tsc` time on a fixture project |
| `types/autocomplete` | Editor response time on a fixture project |

The last two are unusual to benchmark and are the most valuable, because they measure the
cost users actually feel every day.

Regression thresholds fail the build, so performance is a property under test rather than an
occasional investigation.

---

## 9. Decisions that would be expensive to reverse

Ranked by cost of retrofitting:

1. **Eager context decoding.** Making it lazy afterwards means touching every context type
   and every test. **Decide now: lazy.**
2. **A single monolithic generated `.d.ts`.** Splitting later breaks every deep import users
   have written. **Decide now: split by domain.**
3. **An unbounded in-memory peer cache.** Retrofitting bounds means rewriting anything that
   assumed a complete map. **Decide now: bounded, with a persistent tier.**
4. **Synchronous storage contracts.** Async-ifying later is a breaking change to every
   adapter. **Decide now: async throughout.**
5. **Cross-imports between subsystems.** Destroys tree-shaking, and untangling it is a
   refactor of the whole dependency graph. **Decide now: forbidden, enforced in CI.**
6. **No `maxConcurrent` bound.** Adding a limit later changes behaviour under load for
   existing users. **Decide now: present, default unlimited, documented.**

Everything else can wait for evidence.
