# Performance

Performance characteristics, budgets, and the architectural decisions that would be expensive
to reverse later.

The project brief's Rule 9 forbids premature optimization. This document does not propose optimizations;
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
| `new Bot(token)` | < 1 ms | Nothing but validation |
| `bot.start()` (polling) | < 500 ms | One `getMe`, one `setMyCommands` if configured |
| `new Account(...)` | < 1 ms | No I/O in the constructor |
| `user.start()` — resumed session | < 2 s | Load session, connect, handshake with existing key |
| `user.start()` — fresh sign-in | network-bound | Full DH handshake plus interactive steps |

Decisions that protect this:

- **Lazy TL codec tables.** Building a 2,300-entry dispatch table eagerly costs startup time
  for a client that will use twenty constructors. Resolve on first use.
- **No I/O in constructors.** A constructor that opens a file cannot be used in a
  dependency-injection container or a test without side effects.
- **Subpath exports.** Webhook adapters, testing helpers and storage drivers are not in the
  main entry point, so importing `yuigram` does not parse express glue.

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
| Lazy context getters | `ctx.chat` decodes on access; an unused field costs nothing |
| Empty chains skipped | An unused hook costs zero, so hooks can exist generously |
| No per-update class instantiation for unused wrappers | Wrapper objects created on demand |

The lazy-getter decision is the one that matters most at volume. A bot handling only
`/start` should not pay to decode the sender, chat, entities and media of every message that
passes through.

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
