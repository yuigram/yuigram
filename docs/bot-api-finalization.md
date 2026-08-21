# Bot API Finalization

The Bot API subsystem is feature-competitive. This plan closes what is left before the focus
moves to MTProto, and states plainly what will not be built.

The standard is not "everything puregram has". It is: **nothing a developer would reasonably
reject Yuigram over for a new Bot API project.**

---

## 1. Remaining gaps

From the comparative audit, in the order a real bot meets them.

| # | Gap | Why it matters | Severity |
|---|---|---|---|
| G1 | **No throttling** | A broadcast loop hits `429` inside the first second. Retry recovers, but the bot is already flooding — and repeated flooding earns longer waits | **High** |
| G2 | **Uploads are buffered** | A 200 MB file against a local Bot API server is 200 MB of resident memory. `media.path` already describes a stream; the encoder reads it into a `Blob` | **High** |
| G3 | **No inbound rate limiting** | One user holding the enter key occupies the handler loop. Every production bot writes this by hand | Medium |
| G4 | **No inline-mode result builders** | Answering an inline query means hand-writing `{ type: 'article', id, title, input_message_content: { message_text } }` per result | Medium |
| G5 | **No storage adapters beyond memory and file** | Redis is the obvious production store, and `KV` is four methods, but nobody has written the thirty lines | Medium |
| G6 | **No scenes/conversations** | Multi-step dialogue is common. `Router` plus sessions gets close, but the position tracking is manual | Medium |
| G7 | **Production edges unaudited** | Concurrency limits, backpressure under load, storage failure, cancellation paths | **High** |
| G8 | **No media caching** | Re-uploading the same file per send is wasteful; `file_id` reuse is free | Low |

---

## 2. Priority

**Ship in this phase:** G1, G2, G3, G4, G7.
**Document as a recipe, do not ship:** G5, G8.
**Defer with a stated reason:** G6.

The dividing line is whether the absence would make a competent developer choose otherwise.
Throttling and streaming are on that side. A Redis adapter is not — it is thirty lines against
a four-method interface, and shipping it means owning a dependency, a connection lifecycle and
a version matrix for something the application already has a client for.

---

## 3. Proposed architecture

### 3.1 Throttling

Telegram's published limits, which the defaults follow:

| Scope | Limit |
|---|---|
| Global | ~30 requests/second |
| Per chat | ~1 message/second |
| Per group or channel | ~20 messages/minute |

They are soft: Telegram absorbs bursts and answers `429` with `retry_after` when it stops
absorbing. So throttling is **proactive pacing** and `retryOnFloodWait` is **reactive
recovery**, and a serious bot wants both.

Built on the existing `ApiHook`, because that mechanism already exists and already composes:

```ts
bot.hook(throttle())                     // paces
bot.hook(retryOnFloodWait({ maxWait: 30 }))  // recovers
```

A **sliding window** per bucket rather than a token bucket. Telegram's own enforcement is
"how many in the last second", and a sliding window answers exactly that question; a token
bucket approximates it and drifts under bursty traffic.

Buckets: `global`, `chat:<id>`, `group:<id>`. Which one a call lands in comes from `chat_id`,
with a negative id meaning a group — Telegram's own convention. Callers queue behind a
per-bucket FIFO so ordering is fair and deterministic rather than a thundering herd.

### 3.2 Streaming uploads

Today: every upload becomes a `Blob`, `FormData` carries it, `fetch` sends it. Correct, and
bounded by however large the file is.

The change is **one decision at encode time**:

```
any upload is a stream?  ──no──>  FormData, exactly as today
         │
        yes
         ▼
hand-built multipart envelope over a ReadableStream, boundary set explicitly
```

Buffers stay on the `FormData` path because it is simpler and lets the runtime compute
`content-length`. Streams take the streaming path, where the body is an async generator that
yields envelope bytes and file bytes as the socket drains them.

This preserves the media API exactly: `media.path()` already returns a lazy async iterable, so
it starts streaming with no call-site change. Backpressure comes from `ReadableStream` pull
semantics; abort propagates through the generator's `finally`, which is what closes the file
handle.

### 3.3 Inbound rate limiting

Dispatch-side middleware, not a hook: it gates updates coming in, which is a different
direction from the outbound throttle and belongs on a different pipeline. Fixed window per
key, default per user, with the response left to the application — a bot that silently drops
and a bot that answers "slow down" are both legitimate, and the framework should not choose.

### 3.4 Inline results

A small builder namespace over the generated result types, filling `id` when omitted, since it
is required and meaningless to the caller.

---

## 4. Core vs plugin decisions

| Capability | Decision | Reason |
|---|---|---|
| **Throttling** | **Core** | Built on a hook that is already core, ~200 lines, and every production bot needs it. Making it a second package is friction with no architectural gain. puregram made it a plugin because its core would otherwise grow; Yuigram's extension point already exists |
| **Inbound rate limiting** | **Core** | Same argument, on the dispatch side. ~100 lines |
| **Sliding-window primitive** | **Core, exported** | So a userland plugin pacing on some other signal — per user, per topic — does not reimplement it |
| **Inline result builders** | **Core** | Types are generated already; the builders are a thin, stable layer |
| **Media caching** | **Userland recipe** | It is a hook plus a `KV`. Both exist. Shipping it means owning an eviction policy nobody agrees on |
| **Redis / SQLite storage** | **Userland recipe** | `KV` is four methods. Shipping an adapter means owning a driver dependency, a connection lifecycle and a version matrix for something the application already has |
| **Scenes / conversations** | **Deferred** | Real design surface — persistence of position, re-entry, cancellation, nesting. Doing it badly is worse than not doing it. `Router` plus sessions covers the common case today |
| **Rich messages** | **Not now** | New, niche, and the generated types already make them callable |
| **Pagination** | **Not building** | The Bot API paginates almost nothing; `getUpdates` offsets are handled by polling |

The through-line: something belongs in core when it rides an extension point core already
owns and every serious bot needs it. Something stays userland when shipping it means owning a
dependency or a policy.

---

## 5. Implementation order

1. **Streaming uploads** — self-contained, no API change, unblocks large media
2. **Throttling** — plus the exported window primitive
3. **Inbound rate limiting** — pairs with the above
4. **Inline result builders** — small
5. **Production hardening** — concurrency, backpressure, storage failure, cancellation
6. **Docs and examples** — a production example that uses all of it

Each step ends with the full verification suite and a look at the public surface.

---

## 6. Testing strategy

Beyond "does it work", every area gets tests for the failure it exists to prevent:

| Area | What is tested |
|---|---|
| Streaming | Bytes arrive intact; a large file is never fully resident; abort closes the handle; a stream error surfaces rather than truncating |
| Throttling | Windows pace correctly under fake timers; FIFO fairness; buckets isolate; the global cap composes with per-chat; drop mode reports which bucket overflowed; excluded methods bypass |
| Rate limiting | Window boundaries; per-key isolation; the limit is not shared between users |
| Hardening | Storage failure degrades rather than throws; concurrent updates do not lose session writes; shutdown drains under load; cancellation propagates |

Type tests where the type is the feature — the media union, the throttle options, the
builders.

---

## 7. Definition of done

- [x] Streaming uploads work, with memory behaviour tested
- [x] Throttling ships, with defaults matching Telegram's published limits
- [x] Inbound rate limiting ships
- [x] Inline result builders ship
- [x] Production audit complete, with every finding fixed or written down — see §10
- [x] Public surface reviewed; nothing documented that does not exist, nothing shipped that is
      not documented
- [x] Full verification green: lint, typecheck, invariants, unit, type tests, smoke, package
      contents
- [x] Examples cover the production shape
- [x] No release artifacts: no changeset, no version bump, no publish

---

## 10. What the production audit found

Four findings, all fixed. Each was invisible until a bot met real traffic, which is why an
audit rather than a feature list was the right instrument.

**P1 — updates were delivered strictly sequentially.** The polling loop awaited each handler
before starting the next, so one handler waiting on a database was the throughput of the whole
bot, and the next `getUpdates` waited behind it too. The documentation had promised concurrency
since before there was any.

Fixed by a scheduler that is concurrent across chats and sequential within one: unrelated
conversations no longer wait for each other, and two messages from the same person are still
answered in the order they were sent — the one reordering a user actually notices. Bounded by
`poll({ concurrency })`, default 16, because a batch of a hundred slow handlers opening a
hundred database connections is how a bot takes down what it depends on.

**P2 — shutdown could cut off handlers the last batch had started.** With sequential delivery
the loop was inside the handler, so stopping the loop stopped the work. With concurrency it is
not, so `stop()` now drains the scheduler as well as cancelling the poll.

**P3 — the throttle swept idle windows on every call.** The first implementation walked every
tracked window per request: invisible at ten conversations, O(chats) per call at a hundred
thousand. Sweeping is now periodic, which keeps memory bounded without putting a scan on the
hot path.

**P4 — `allowedUpdates` could only be set on the client.** It is a `getUpdates` parameter, and
a reader looking for what a bot subscribes to looks at the call that starts it. Now accepted on
`poll()` as well, where it wins.

Two further checks came back clean and are recorded so they are not re-audited from scratch:
session persistence already degrades rather than throws when a store is unavailable, and
cancellation already reaches the in-flight long poll, the flood-wait sleep and now the throttle
queue.

---

## 8. Final comparison against puregram

Where this leaves the two, once the plan is done:

| Area | After this phase |
|---|---|
| Throttling | **Parity**, in core rather than a plugin |
| Streaming uploads | **Parity** |
| Inbound rate limiting | **Parity**, in core |
| Inline results | **Parity** on the common shapes |
| Storage adapters | **puregram ahead** — deliberate |
| Scenes | **puregram ahead** — deferred, not rejected |
| Media caching | **puregram ahead** — deliberate |
| Everything else | Yuigram at parity or ahead, per the previous audit |

The remaining deficit becomes a *packaging* deficit rather than a capability one, which is the
right shape: a developer can build all three in an afternoon against interfaces that exist,
and none of them blocks starting.

---

## 9. What we will not implement, and why

**Scenes and conversations, in this phase.** The design questions — where the position lives,
what happens when a scene is re-entered, how cancellation interacts with global commands,
whether scenes nest — deserve their own pass. Shipping a shallow version would fix the wrong
answers into the public API. `Router` plus sessions covers step-wise dialogue today.

**Storage adapters for Redis, SQLite or Postgres.** `KV` is `get`, `set`, `delete`, and an
optional `info`. An adapter is thirty lines the application writes against the client it
already configures. Shipping them means owning driver dependencies and a version matrix, and
the framework's storage contract exists precisely so it does not have to.

**Media caching.** A hook plus a `KV`, both of which ship. The part worth having an opinion
about is eviction, and there is no answer that suits a bot with ten files and a bot with ten
million.

**Pagination helpers.** The Bot API paginates almost nothing.

**Rich message builders.** Recent, narrow, and reachable through the generated types.

**A plugin package per capability.** Package count is not a health metric. Every capability
here rides an extension point that is public and documented, which is what makes an ecosystem
possible; publishing thirteen packages to prove it is not the same thing.


---

## 11. Post-audit remediation

The release audit found four defects, three of them introduced by the finalization work above.
All four are fixed; a fifth surfaced while verifying the third.

### The polling loop had no backpressure

`deliver()` scheduled work and returned, so the loop fetched at network speed regardless of
how far handlers had fallen behind — and the offset advanced at schedule time, so Telegram
kept handing over the next batch. A permanently full transport exhausted a 4 GB heap in about
fourteen seconds, and `concurrency: 1` failed in about one: there was no setting that restored
the bound.

The bound belongs to the **scheduler**, which is the only component that knows the depth. It
now states when it is full, and a producer waits on `whenReady()` — a promise resolved by
completions, not a poll of a counter. Two watermarks, because resuming at the level the
producer stopped at makes it fetch one update at a time forever.

The peak is roughly half the capacity plus one batch, since the check happens before a fetch
and a fetch returns a whole batch. Trimming the batch to fit was rejected: it trades a
bounded, predictable peak for more round trips. What matters is that the peak is a constant
rather than a function of uptime, and that is what the regression test asserts — by running
four times as long and requiring the peak not to grow.

Any ingestion source can wait on the same gate, which is what makes it usable by an MTProto
updates manager without a Bot-API-shaped hack.

### `stop({ timeout })` was not a deadline

The lifecycle drained tracked work under the timeout, then ran the stop hook — which waited
for handlers of its own, unbounded. Two clocks, and the second had no alarm.

There is now one deadline over the whole call. The stop hook receives its signal and is
**raced** against it: cooperative hooks return, and one that ignores the signal is held to the
promise anyway. A foundation other transports implement cannot assume every implementation
honours a signal, and the caller was given a deadline rather than a suggestion.

Work still running at the deadline is abandoned — nothing can cancel a promise — and
`stop()` returns `false` rather than reporting a clean shutdown it cannot vouch for.

### A retried stream upload sent nothing

Encoding happens per attempt, so a retry re-encoded the same source. `media.path()` was
already safe; `media.stream()` wrapped a stream that had been drained, and the second attempt
uploaded an empty file that Telegram accepted.

`media.stream()` now takes a factory as well as a stream. A factory is replayable. A bare
stream is marked single-use, and the encoder **claims** it when bytes are committed — refusing
the second claim with an error that names the file and says how to make the upload retryable.

The first design guarded the `data` getter and was wrong: choosing between the buffered and
streaming paths *reads* `data`, so inspection counted as consumption and the guard would have
rejected the first attempt. Separating inspection from consumption is the whole of the fix.

### The throttle leaked its FIFO chains

`sweep()` dropped a chat's window and left its queue chain behind, under a condition that
could never be true. The window count returned to zero, so the leak was invisible in it.
Fixed, and the chain count is now exposed so the invariant can be tested rather than measured
in bytes.

### New finding, found while verifying the third

The refusal above was reaching callers as a `NetworkError`. Encoding happens inside the
transport call, and `invoke` wrapped anything thrown there as "could not reach the Telegram
API" — false, and hiding the one message that says what to do. Errors the framework raised
deliberately now pass through unwrapped.
