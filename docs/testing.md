# Testing Architecture

Testing is not a phase in this project. For an independently-implemented protocol stack it is
the mechanism by which correctness is *established*, because the alternative — discovering
defects from user reports — is unacceptable for a library holding account credentials and
delivering messages.

The governing constraint:

> **The two hardest subsystems cannot be validated against the live Telegram network**, because
> the conditions that break them occur rarely and unpredictably in production. They can only be
> validated against a server we control.

This is why mock servers are deliverables with their own budget rather than test scaffolding,
and why they are built *before* the code they exercise.

---

## 1. The shape of the suite

```
                       ┌───────────────────────┐
                       │  live network (few)   │  smoke, opt-in, real credentials
                    ┌──┴───────────────────────┴──┐
                    │   test datacenters           │  auth, sign-in, migration
                 ┌──┴──────────────────────────────┴──┐
                 │      mock servers                   │  session layer, updates,
                 │      (Bot API + MTProto)            │  files, error recovery
            ┌────┴─────────────────────────────────────┴────┐
            │            integration (in-process)            │  dispatch, routing,
            │                                                │  middleware, sessions
      ┌─────┴────────────────────────────────────────────────┴─────┐
      │                      unit + property                        │  crypto, TL codec,
      │                                                             │  filters, storage
      └─────────────────────────────────────────────────────────────┘
                            type tests, run by tsc
```

Inverted from the usual advice in one respect: the mock-server tier is unusually large, because
that is where this project's risk actually lives.

---

## 2. Layer by layer

### 2.1 Cryptography — known-answer vectors

Every primitive is verified against published test vectors **before any code depends on it**.
This is a hard gate in the build order ([mtproto.md](mtproto.md) §12, stage 1).

| Primitive | Verification |
|---|---|
| AES-256-IGE | Known-answer vectors; encrypt/decrypt round-trip; block-boundary cases; the IV-split behaviour at `c[-1]`/`m[-1]` |
| RSA `rsa_pad` | Fixed-input vectors; the retry path when the padded value is not less than the modulus |
| RSA legacy padding | Fixed-input vectors |
| PQ factorization | Known `pq` values with known factors; assert `p < q`; timing bound |
| Miller-Rabin | Known primes and composites, including Carmichael numbers |
| Safe-prime validation | Telegram's well-known `dh_prime` passes; deliberately unsafe primes are rejected |
| SRP | Vectors derived from a fixed password, salts and server values; `M1` reproducibility |
| KDF (`aes_key`/`aes_iv`) | Fixed `auth_key` + `msg_key`, both directions (`x=0` and `x=8`) |

A cryptographic primitive without vectors is treated as unimplemented, regardless of whether
it appears to work.

### 2.2 TL codec — property tests

The codec is the widest surface in the project and the most mechanically checkable.

**Generated round-trip test across all 2,315 constructors:**

```
for each constructor C in schema:
    value   = synthesize(C)          -- schema-driven, deterministic
    encoded = write(value)
    decoded = read(encoded)
    assert deepEqual(value, decoded)
    assert write(decoded) == encoded  -- canonical encoding
```

The synthesizer is driven by the schema itself, so a new TL layer automatically extends
coverage. Cases it must generate deliberately, because they are where naive codecs break:

- flags with **every** bit combination for constructors carrying conditional fields
- `flags.N?true` fields — present in the flag, **zero bytes on the wire**
- bare vs boxed at every nesting depth
- bare vectors inside boxed structures
- empty vectors, and vectors of vectors
- strings at the 253/254 length boundary, with each padding length 0–3
- `int128`/`int256` byte-order fidelity
- `long` values exceeding `Number.MAX_SAFE_INTEGER` (the `BigInt` correctness case)
- gzip-packed payloads

**Fuzzing the reader** is a separate obligation: malformed input must produce a typed error,
never an unbounded allocation, never a hang, never a crash. The reader is a parser facing
attacker-influenced bytes.

### 2.3 Core framework — in-process integration

`core` has no transport dependency, so its tests need no network and no fixtures beyond
synthetic updates:

- middleware ordering across priority bands, with the reserved handler slot
- `next()` semantics: skipping, short-circuiting, double-calling
- error propagation outward through the onion
- filter composition (`and`/`or`/`not`) and the `kinds` fast path
- router installation, prefixing, match order
- session keying, lazy load, dirty tracking, concurrent-update serialization
- storage contract conformance
- lifecycle: start, drain, stop under in-flight load
- plugin install ordering, cycle and missing-dependency errors

### 2.4 Type tests

Inference quality is a feature, so it is asserted rather than hoped for. Run by `tsc`, failing
the build on regression:

```ts
expectTypeOf(handler).parameter(0).toHaveProperty('text').toEqualTypeOf<string>()
//                                 ^ after f.text() — not string | undefined

expectTypeOf(bot.on).parameter(0).not.toMatchTypeOf<'mtproto:typing'>()
//                                 ^ MTProto events unavailable on Bot
```

Covering: filter narrowing through composition, `Modify<Base, Mod>` surviving chained access,
event-map correctness per client type, plugin type accumulation via `.extend()`, and
`event.transport` discrimination narrowing `event.client`.

---

## 3. Mock servers

### 3.1 Mock Bot API server

Straightforward, because the Bot API is stateless HTTP. Serves `getUpdates`/webhook delivery,
records outgoing calls, and returns scripted responses.

```ts
const { bot, send, calls } = mockBot()
bot.onCommand('start', (message) => message.reply('hi'))

await send.command('start', { from: { id: 1 } })
expect(calls.last('sendMessage')).toMatchObject({ text: 'hi' })
```

It drives the **real** dispatch pipeline, so tests exercise actual middleware, filters and
routing rather than a stand-in. It must be able to inject: `429` with `retry_after`, 5xx,
malformed JSON, network failure mid-request, duplicate `update_id`, and update types absent
from the installed schema.

This mock ships publicly as `yuigram/testing`, because users need it to test their own bots.

### 3.2 Deterministic mock MTProto server

**The highest-leverage artifact in the entire plan.** Budgeted at 4–6 weeks and built before
the session layer ([roadmap.md](roadmap.md) Phase 7a).

It speaks real MTProto — transport framing, obfuscation, the handshake, encrypted messages —
against a fixed auth key, with a deterministic clock and seeded randomness so every run is
reproducible.

**Conditions it must inject on demand:**

| Category | Injectable conditions |
|---|---|
| Session layer | `bad_server_salt`; `bad_msg_notification` (each error code: 16, 17, 18, 19, 20, 32, 33, 34, 35, 48, 64); `new_session_created` mid-stream |
| Delivery | dropped acknowledgements; out-of-order delivery; duplicated messages; delayed responses; connection drop mid-RPC |
| Encoding | containers with mixed content; gzip-packed payloads; deeply nested structures |
| Time | clock skew forward and backward, past the ±30 s / ±300 s `msg_id` rejection window |
| Updates | gaps in `pts`/`qts`/`seq`; reordering within the 0.5 s tolerance; `updatesTooLong`; `differenceTooLong`; paginated `getChannelDifference` that requires several rounds to reach `final`; `CHANNEL_PRIVATE` |
| Peers | `min` peers; peers referenced but absent from `users`/`chats`; `access_hash` rotation |
| Files | `FILE_MIGRATE_X`; `FILE_REFERENCE_EXPIRED`; CDN redirect with valid and **invalid** hashes; partial chunk delivery |
| Migration | `PHONE_MIGRATE_X`, `NETWORK_MIGRATE_X`, `USER_MIGRATE_X` |
| Rate limits | `FLOOD_WAIT_N`, `SLOWMODE_WAIT_N`, `FLOOD_PREMIUM_WAIT_N` |

Each of these corresponds to a real production condition that a client which ignores it will
handle incorrectly. Writing the list is itself a design exercise: it is the specification of
what "correct" means for the session and updates layers.

The mock server is **internal**, not published — it exists to test Yuigram, not user code.

### 3.3 Why the ordering is non-negotiable

An updates manager written first and tested afterwards gets tested against the behaviour it
happens to have. The gap algorithm has branches that a well-behaved server never exercises:
the `local_pts + pts_count > pts` duplicate path, the postponement queue, the difference
pagination loop, the no-dispatch index. Without a server that can produce those conditions
deliberately, those branches ship unverified — and they are precisely the branches that run
during the incidents users report.

---

## 4. Test datacenters

Telegram operates test DCs, reachable in test mode. They cover what mocks cannot: **real server
behaviour**.

Used from build stage 4 onward for the auth handshake, session RPC, sign-in flows (phone, 2FA,
bot, QR), DC migration and file transfer.

| Property | Consequence |
|---|---|
| Real protocol behaviour | Validates the implementation against the actual server, not our reading of the spec |
| Test-only accounts | No real account at risk; test-mode phone numbers follow a documented pattern |
| Separate DC space | Test-DC sessions are not valid on production |
| Not deterministic | Cannot replace mock servers — used alongside them, never instead |

Test-DC runs are a **separate CI job**, allowed to be slower and permitted to fail without
blocking a pull request, because they depend on an external service. A failure there opens an
investigation; it does not stop a merge.

---

## 5. Recorded-session replay

Live-network sessions are captured — decrypted frames plus timing — and replayed
deterministically against the session and updates layers.

This is how genuinely rare production conditions become permanent regression tests. When a user
reports lost messages, the goal is to obtain a recording, add it to the corpus, and make it a
test that fails before the fix and passes after.

Recordings are **scrubbed before commit**: no auth keys, no session material, no message
content, no real user identifiers. What is kept is the structural shape — constructor
sequence, `pts` values, timing, error codes. A recording that cannot be scrubbed is not
committed.

---

## 6. What cannot be tested, and the compensation

Honest accounting of the gaps:

| Gap | Compensation |
|---|---|
| Undocumented server behaviour | Test-DC experimentation; findings recorded in `docs/protocol-notes/` and turned into mock-server conditions |
| Real-world flood-limit thresholds | Conservative defaults; documented as observed rather than specified |
| Long-running peer-cache growth | Soak test with a synthetic high-volume update stream |
| Cryptographic soundness of our own implementation | Known-answer vectors, plus an independent security review as a 1.0 release gate — testing shows presence of correctness on known inputs, not absence of weakness |
| Telegram changing behaviour without notice | Scheduled test-DC smoke runs; schema drift detection ([codegen.md](codegen.md) §6) |

The crypto row deserves emphasis. Test vectors prove the implementation matches the algorithm.
They do not prove the implementation is free of side-channel or misuse weaknesses. That is what
the external review is for, and it is why it is a release gate rather than an optional extra.

---

## 7. CI structure

| Job | Trigger | Blocking | Runtime target |
|---|---|---|---|
| Lint + format | every push | yes | < 1 min |
| Typecheck + type tests | every push | yes | < 3 min |
| Unit + property | every push | yes | < 5 min |
| TL round-trip (all constructors) | every push | yes | < 2 min |
| Integration (mock servers) | every push | yes | < 5 min |
| Architecture invariants | every push | yes | < 1 min |
| Dependency + licence gate | every push | yes | < 1 min |
| Fuzzing (TL reader) | nightly | no | 30 min |
| Test-DC smoke | nightly | no | 10 min |
| Recorded-session replay | every push | yes | < 3 min |
| Benchmarks + regression thresholds | every push | yes | < 5 min |
| Schema drift detection | daily | no (opens a PR) | — |
| Soak test | weekly | no | hours |

The blocking set must stay under about fifteen minutes. A slow required suite gets bypassed,
and a bypassed suite is worse than no suite because it produces false confidence.

---

## 8. Coverage policy

Line coverage is tracked but is not the target, because it rewards testing easy code.

Meaningful targets instead:

| Area | Requirement |
|---|---|
| Crypto primitives | 100% of branches, plus vectors |
| TL codec | Every constructor round-trips |
| **Updates gap algorithm** | **Every branch has a named test** |
| Session-layer error handling | Every injectable condition from §3.2 |
| Peer resolution | Every path including `min` and failure |
| Public API | Every documented example compiles and runs |

That last row is a documentation guarantee: every code sample in `docs/` and in the
documentation site is extracted and compiled in CI. Documentation that does not compile is a
bug, and it is the most common kind of documentation bug.

---

## 9. Principles

1. **The mock server precedes the layer it tests.** Non-negotiable for session and updates.
2. **Crypto without vectors is unimplemented.**
3. **Tests exercise the real pipeline**, not a parallel simplified one.
4. **Determinism**: seeded randomness, injectable clocks, no sleeps, no flakes. A flaky test is
   deleted or fixed the day it flakes.
5. **A bug report becomes a test before it becomes a fix.**
6. **Documentation examples are tests.**
7. **The blocking suite stays fast.** Slow checks move to nightly.
