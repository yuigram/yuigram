# Feasibility

An honest engineering assessment of building Yuigram as a fully independent framework, followed
by the executive summary.

Assumptions throughout: **one experienced TypeScript engineer**, working consistently, with
prior framework experience but no prior MTProto implementation experience. Ranges are given
rather than point estimates, because point estimates on work of this shape are fiction.

"Consistently" means roughly 20–30 focused hours per week — the realistic sustained rate for a
long-running project. Full-time figures are roughly half the elapsed time.

**Scope premise:** Yuigram implements the Bot API and MTProto itself. There is no wrapped
library, no adapter, and no third-party Telegram runtime dependency. Development time is not
the primary constraint; correctness and independence are.

---

## 1. Complexity by subsystem

| Subsystem | Complexity | Basis |
|---|---|---|
| Logging | Low | A level filter and a redaction pass |
| Errors | Low | A class hierarchy with preserved originals |
| Storage (KV) | Low | Four methods and two drivers |
| HTTP client | Low | `fetch` plus timeouts and retries |
| Plugin system | Low–Medium | Topological sort; the typing is the fiddly part |
| Middleware / dispatch | Medium | The runtime is thirty lines; priorities and scoping add the rest |
| **Filters (typed)** | **Medium–High** | The runtime is trivial; `Filter<Base, Mod>` inference is genuinely hard TypeScript |
| Sessions | Medium | Keying, lazy loading, dirty tracking, concurrency |
| Bot API polling | Medium | Offset, backoff, deduplication |
| Bot API webhooks | Medium | Secret validation, framework adapters, response timing |
| **Bot API codegen** | **High** | HTML scraping, prose type inference, emitters, permanent fragility |
| Files (Bot API) | Medium | Multipart and streaming |
| Context model | Medium–High | Transport-specific construction with a shared contract |
| Event normalization (Bot API) | Medium–High | ~60 kinds, with generated service-message promotion |
| **MTProto crypto** | **High** | AES-IGE, two RSA paddings, factorization, Miller-Rabin, SRP — all from scratch |
| **TL parser + generator** | **High** | Grammar, flags, conditional `true`, bare/boxed, 2,315 entries |
| TL codec runtime | Medium | Well-defined once the generator is right |
| MTProto transport | Medium | Four framings plus AES-CTR obfuscation |
| **MTProto auth handshake** | **High** | Multi-step, security-critical, every validation load-bearing |
| **MTProto session layer** | **High** | msg_id/seq_no rules, acks, salts, containers, clock skew, RPC lifecycle |
| MTProto storage | Medium | Auth keys, salts, DC options, indexed peers, update state |
| MTProto DC pool + migration | Medium–High | Per-DC keys, four migration errors, media/CDN routing, connection pools |
| Sign-in flows | Medium | Phone, QR, bot, 2FA via SRP |
| **MTProto updates manager** | **Extreme** | pts/qts/seq gap recovery; failures are silent and production-only |
| **MTProto peer layer** | **Very High** | `access_hash` lifecycle, `min` peers, username resolution |
| MTProto files | High | Chunked parallel transfer, alignment rules, CDN, reference refresh |
| **Deterministic mock MTProto server** | **High** | Prerequisite for testing the two hardest subsystems |
| High-level MTProto surface | **Very High** | Scope-defined; mtcute spends ~23,000 LOC here |
| Testing infrastructure | Medium–High | Mock Bot API is easy; the MTProto mock server is not |
| Documentation | Medium (but large) | Not hard, just a great deal of it |

---

## 2. Effort estimates

### Proof of concept

*Scope: prove the framework model — one bot and one user client sharing middleware. The MTProto
side reaches only as far as a completed auth handshake against a test DC.*

**8–12 weeks**

Longer than a wrapper-based proof of concept, because the handshake requires the crypto
primitives, the TL codec and the transport to exist first. That is the point: the proof of
concept proves the real thing works, not that a dependency works.

### Bot API release (v0.1)

*Scope: complete Bot API subsystem, full framework core, testing, documentation.*

**6–8 months** (matching Phases 1–4 of [roadmap.md](roadmap.md))

| Component | Estimate |
|---|---|
| Foundations and CI invariants | 3–4 weeks |
| Core (dispatch, middleware, filters, context, errors, logging, plugins) | 6–9 weeks |
| Bot API codegen (scraper, IR, emitters) | 5–8 weeks |
| Bot API runtime (HTTP, polling, webhooks, files, normalization) | 5–7 weeks |
| Sessions and storage | 3–4 weeks |
| Testing infrastructure (mock Bot API) | 3–4 weeks |
| Documentation and examples | 4–6 weeks |

### MTProto subsystem

*Scope: the complete protocol stack, built bottom-up per [mtproto.md](mtproto.md) §12.*

**14–21 months**

| Stage | Estimate |
|---|---|
| Crypto primitives (AES-IGE, RSA padding, factorization, Miller-Rabin, SRP) | 4–6 weeks |
| TL parser, generator, codec runtime | 6–10 weeks |
| Transport framings + obfuscation | 3–4 weeks |
| Auth handshake + all mandatory security checks | 4–6 weeks |
| Session layer (msg_id, seq_no, acks, salts, containers, recovery) | 8–12 weeks |
| MTProto storage (auth keys, salts, indexed peers, update state) | 3–4 weeks |
| DC pool, migration, connection pools | 4–6 weeks |
| Sign-in flows (phone, 2FA, bot, QR, resume) | 3–4 weeks |
| Peer layer (`access_hash`, `min` peers, resolution) | 4–6 weeks |
| **Deterministic mock server** | **4–6 weeks** |
| **Updates manager** | **10–16 weeks** |
| Files (chunked transfer, CDN, reference refresh) | 6–8 weeks |
| Normalizer (TL updates → Yuigram events) | 3–4 weeks |

The mock server is listed as a deliverable in its own right because the two hardest subsystems
cannot be validated without it.

### Unification and hardening

**7–11 months**

| Component | Estimate |
|---|---|
| `App` container, cross-client handlers, unified context | 6–8 weeks |
| High-level MTProto surface (initial useful breadth) | 10–16 weeks |
| Production hardening, storage drivers, throttling | 8–12 weeks |
| Benchmarks, security review, performance budgets | 4–6 weeks |

### v1.0

**3–5 months** — API stability, complete documentation, migration guides, plugin foundations,
independent security review.

### Totals

| Milestone | Elapsed (part-time) | Elapsed (full-time) |
|---|---|---|
| Proof of concept | 2–3 months | 1–1.5 months |
| Bot API release (v0.1) | 6–8 months | 3–4 months |
| MTProto stack complete | +14–21 months | +7–10.5 months |
| Unification + hardening | +7–11 months | +3.5–5.5 months |
| Unified MVP (v0.5) | 21–31 months | 11–16 months |
| **v1.0** | **28–42 months** | **14–21 months** |

These figures assume the protocol stack is built correctly rather than quickly, with the
testing discipline in [mtproto.md](mtproto.md) §12 applied at every stage. They are longer than
the wrapper route by roughly 12–18 months, which is the price of the stated objective.

---

## 3. Code volume

Estimated hand-written lines, excluding generated output and excluding tests:

| Component | LOC | Reference point |
|---|---:|---|
| Core framework | 3,000–5,000 | puregram's runtime is ~92 modules |
| Bot API runtime | 2,500–4,000 | |
| Bot API codegen tooling | 2,000–3,500 | Scraper plus emitters |
| MTProto crypto | 1,000–1,800 | AES-IGE, RSA padding, factorization, SRP |
| TL parser + generator | 2,000–3,000 | |
| TL codec runtime | 600–1,000 | |
| MTProto transport | 400–700 | Four framings plus obfuscation |
| MTProto auth | 700–1,100 | Handshake plus validation |
| MTProto session layer | 1,500–2,500 | mtcute's equivalent file is 1,572 lines |
| MTProto network / DC pool | 800–1,400 | mtcute: ~650 lines |
| MTProto storage | 800–1,400 | Driver/repository/service |
| **Updates manager** | **1,500–2,500** | mtcute: ~1,700 lines |
| Peer layer | 1,000–1,800 | |
| Files | 1,000–1,600 | |
| Normalizer | 800–1,400 | |
| High-level MTProto surface | 5,000–15,000 | Demand-driven; mtcute spends ~23,000 |
| Storage and sessions (framework) | 1,000–2,000 | |
| Testing infrastructure incl. mock server | 4,000–7,000 | |
| **Hand-written total** | **~30,000–56,000** | |

Generated output, compiled rather than written:

| Artifact | Size | Reference |
|---|---|---|
| Bot API types and methods | 400–700 KB of `.d.ts` | `@puregram/api`: ~640 KB |
| TL types | 1.5–2 MB of `.d.ts` | `@mtcute/tl`: 1.96 MB |
| TL codecs | 500–800 KB | `@mtcute/tl`: 695 KB |

Tests: 1.5–2× hand-written source for a library holding credentials and implementing
cryptography. Documentation: 150–300 pages equivalent.

---

## 4. Risks

### Technical

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| **Updates manager correctness** | **High** | **Severe** | Mock server built first; every branch of the gap algorithm tested explicitly; recorded-session replay |
| **Session-layer silent message loss** | High | **Severe** | Mock server injects `bad_server_salt`, `bad_msg_notification`, `new_session_created`; ack tracking verified |
| Crypto implementation error | Medium | **Severe** | Known-answer vectors before anything builds on a primitive; constant-time comparison; mandatory checks non-bypassable |
| TL codec edge cases (flags, conditional `true`, bare vectors) | High | Medium | Round-trip test across all 2,315 constructors, generated |
| Peer / file-reference long tail | **High** | Medium | Explicit peer model and origin tracking from day one, not retrofitted |
| Bot API scraper breaks | Medium | Low | Committed schema; a break fails CI, not user builds |
| `Filter<Base, Mod>` inference does not hold at scale | Medium | Medium | Prototype the typing in week one; type tests from the start |
| Generated `.d.ts` degrades editor performance | Medium | Medium | Split by namespace; measured budget |
| Undocumented server behaviour | **High** | Medium | Test-DC experimentation; findings recorded in `docs/protocol-notes/` |

### Maintenance

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| **Maintainer burnout over a multi-year build** | **High** | **Severe** | Bottom-up staging so each layer completes and stays done; a shippable Bot API release at month 6–8; automation of everything recurring |
| Telegram release cadence | Certain | Medium | Codegen makes a Bot API release a review task; TL layer bumps are reviewable diffs |
| Two protocol surfaces to track, one person | Certain | High | Automate schema regeneration; accept lag on the high-level surface, never on the protocol |
| Bus factor of one | Certain | High | Documented architecture; protocol notes committed; no undocumented cleverness |

### Licensing

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Accidental MPL contamination from puregram | Low | **Severe** | Zero-copy policy; CI similarity tripwire |
| Derivative-work exposure from close mtcute reading | Low–Medium | Medium | Specification-first method ([mtproto.md](mtproto.md) §1); mtcute consulted for disambiguation, not transcription |
| Copyleft via a transitive dependency | Low | High | Licence gate in CI; near-zero dependency budget makes this nearly moot |
| Telegram documentation text reuse | Certain | Low | Attributed, source-linked; flagged for legal review |

### Security

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Session-material leak through logs or errors | Medium | **Severe** | Structural redaction; non-enumerable secrets; error scrubbing |
| Cryptographic weakness from an implementation slip | Medium | **Severe** | Mandatory checks non-configurable; known-answer vectors; independent review before 1.0 |
| A user loses their Telegram account | Medium | **Severe (for them)** | Documentation duty of care; conservative defaults; no bulk-abuse conveniences |

### Performance

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Unbounded peer cache in long-running processes | **High** | Medium | Bounded LRU over persistent storage — designed in, not retrofitted |
| Pure-JS AES-IGE too slow for large transfers | Medium | Low | Correctness first; optional WASM acceleration later |
| Generated code inflates cold start | Medium | Low | Lazy codec tables; subpath exports |

---

## 5. Blockers

Nothing found makes the project impossible. Four things could make it impractical, and all
four are planning failures rather than technical ones:

1. **Building the updates manager before the mock server exists.** It cannot be validated
   against the live network, because the interesting cases occur rarely and unpredictably.
   Written without a mock server, it will appear to work and will lose messages in production.
2. **Building top-down instead of bottom-up.** A defect in the crypto or codec layer surfaces
   as an inexplicable failure six layers up. Each layer must be verified before the next
   begins.
3. **Treating documentation as a post-1.0 task.** puregram's adoption outcome is the evidence.
4. **Unbounded scope in the high-level MTProto surface.** mtcute spends ~23,000 LOC there and
   it is still incomplete, because it is unbounded by nature. `user.raw` is the answer to
   "method X is missing" until demand justifies a wrapper.

The distinction in item 4 is worth restating: **depth of the protocol implementation is
non-negotiable; breadth of convenience wrappers is a scheduling decision.** Controlling scope
at the top is not the same as reducing scope at the bottom.

---

## 6. Strategy

```
Own the architecture              from the first commit
Own the public API                from the first commit
Own the Bot API implementation    from the first commit
Own the MTProto implementation    built bottom-up, specification-first
```

No third-party Telegram runtime dependency at any stage.

Two properties make a multi-year independent build tractable rather than merely long:

**The protocol is documented.** Every algorithm in [mtproto.md](mtproto.md) came from
Telegram's own specification — the handshake, the KDF, the message format, the gap algorithm,
the file alignment rules, SRP. Nothing needs reverse-engineering. This is the single most
important feasibility fact about the project.

**Test datacenters exist.** Telegram operates test DCs, so the handshake, session layer,
sign-in flows and DC migration can be developed against real servers using test-only accounts,
without risking a real account or waiting on production traffic.

The Bot API subsystem completes early and stays complete, which means the project has a real,
shippable artifact at month 6–8 and does not spend its entire first year with nothing to show.
That is delivery sequencing of fully-owned code, not a shortcut.

---

## 7. Executive summary

**1. Is Yuigram technically feasible?**
Yes. Every component is documented and has been implemented before in other languages and
runtimes. The Bot API is straightforward. MTProto is difficult but fully specified by
Telegram, with test datacenters available for development. The risk is sustained effort and
testing discipline, not possibility.

**2. Is it realistically achievable by one developer?**
Yes, over 28–42 months part-time or 14–21 months full-time. The Bot API release arrives at
month 6–8. The MTProto stack is 14–21 months of that total. This is a multi-year commitment,
which the project has explicitly accepted.

**3. What is the true MVP?**
Complete Bot API support (all 185 methods, generated), the full framework core, and Yuigram's
own MTProto stack through the updates manager and file transfer — both clients in one `App`
with shared middleware, plus testing infrastructure and documentation. The high-level MTProto
convenience surface is deliberately narrow at MVP, with `user.raw` covering the rest.

**4. What is the hardest part?**
The MTProto updates manager. Gap reconciliation across `pts`/`qts`/`seq` and per-channel boxes,
where errors are silent, intermittent and only appear under production traffic. It is preceded
by a deterministic mock server for exactly this reason. Second hardest is the session layer,
for the same class of failure; third is the peer/`access_hash` layer, for its unbounded tail.

**5. How much code will likely be required?**
30,000–56,000 hand-written lines, plus roughly 2.5–3 MB of generated code. Tests add 1.5–2×.

**6. How much can reasonably be reused or referenced?**
No source is reused. Telegram's specification is the input. Existing implementations —
mtcute, Telethon, TDLib — are consulted only to disambiguate where the specification is silent,
which is a legitimate and necessary use of published engineering knowledge. Ideas that are not
copyrightable (schema-driven codegen, filter narrowing, promoted update kinds, driver/
repository/service layering) are adopted with independent implementations.

**7. What must be implemented independently?**
Everything. The public API, client model, event taxonomy, context, middleware, filters,
routing, sessions, storage, errors, logging, plugins, the entire Bot API subsystem with its
code generation, and the entire MTProto stack — crypto, TL parser and generator, codec,
transport, auth, session layer, DC pool, storage, updates manager, peers, files.

**8. How difficult is a proper MTProto implementation?**
Very. 14–21 months part-time for one engineer to reach production quality, with the last 20% —
peer edge cases, file references, update gaps under real traffic — taking longer than the first
80%. AES-IGE must be hand-written; the handshake is security-critical at every step; the
updates manager fails silently when wrong. It is difficult, documented, and bounded.

**9. How should Bot API and MTProto coexist?**
Sharing everything above the update normalizer — dispatch, filters, middleware, context
contract, sessions, storage, errors, logging — and nothing below it. Two client types (`Bot`,
`Account`), never one with a discriminant. Divergence is carried by the type system, never by
documentation. See [unified-model.md](unified-model.md).

**10. What should the public API look like?**
`new Bot(token)`, `new Account({ apiId, apiHash, session })`, both optionally held by an `App`
with shared middleware. Everything from `import … from 'yuigram'`. Honest types: a member
exists only where it works. See [api-design.md](api-design.md).

**11. How should sessions work?**
As two separate abstractions. Framework sessions are pluggable KV with configurable keying, and
degrade gracefully. MTProto authorization sessions are a structured driver/repository/service
store holding auth keys, temp keys, salts, DC options, an indexed peer cache and update
counters, and fail loudly. Merging them would be both a design and a security error. See
[sessions.md](sessions.md).

**12. How should raw API access work?**
Two separate, typed escape hatches — `bot.raw.*` over the Bot API, `user.raw.*` over TL — each
with an untyped `call()` for methods newer than the installed schema. Never merged; they are
different type universes. `user.raw` is also what keeps the high-level surface bounded without
limiting what users can do.

**13. How can Yuigram avoid becoming a wrapper?**
By not depending on one. Yuigram implements both protocols itself; there is no Telegram runtime
dependency to wrap. The CI invariant that no foreign identifier may appear in a published
declaration file remains in place as a regression guard, and the near-zero dependency budget
makes the property verifiable by inspection.

**14. What are the licensing constraints?**
puregram is MPL-2.0 — file-level copyleft; copying any fragment permanently binds the receiving
file. Policy: zero reuse, reference only. mtcute is MIT and may be read freely; it is used for
disambiguation, not transcription, so no attribution obligation is triggered — but the
specification-first method is what keeps the work genuinely independent. Server RSA keys come
from Telegram's published documentation, never from its GPL client source. Yuigram ships MIT.
Two items are flagged for legal review: verbatim Telegram documentation text in generated
JSDoc, and the unstated licence status of the TL schema. See [licensing.md](licensing.md).

**15. What are the security risks?**
Highest: leakage of MTProto session material, which is equivalent to full account takeover.
Mitigated by structural log redaction, non-enumerable secrets, error scrubbing, `0600` session
files and optional encryption at rest. Also material: implementing cryptography directly, which
is mitigated by known-answer vectors, non-bypassable protocol validation and an independent
review before 1.0. Plus callback data trusted for authorization, path traversal via
Telegram-supplied filenames, and the product-level risk that users get their accounts banned.
See [security.md](security.md).

**16. What are the infrastructure costs?**
Effectively zero. GitHub, npm, GitHub Actions and documentation hosting are all free for a
public open-source project.

| Stage | Mandatory | Optional |
|---|---|---|
| Development | $0 | Domain ~$12/yr; test phone numbers ~$5–20 one-off |
| Open-source release | $0 | Domain ~$12/yr |
| Small community | $0 | ~$12–60/yr |
| Growing project | $0 | ~$50–200/yr if CI exceeds free tiers |
| Large project | $0–$400/yr | CI minutes, docs hosting |

No VPS is required at any stage — Yuigram is a library. The only genuinely unavoidable cost is
a Telegram account and phone number for MTProto integration testing, and a secondary account is
strongly advised given the ban risk. Telegram's test datacenters cover most development without
touching a real account.

**17. What requires ongoing maintenance?**
Bot API schema regeneration (automated; roughly monthly review), TL layer updates (automated
parse, manual review, roughly quarterly), the high-level MTProto surface (continuous,
demand-driven), peer and file-reference edge cases (continuous, bug-driven), protocol-behaviour
notes, dependency audits, and documentation. Code generation is what keeps the first two from
consuming the project.

**18. What is the realistic timeline to MVP?**
Bot API release at 6–8 months. Full unified MVP with the complete MTProto stack at
**21–31 months** part-time; 11–16 months full-time.

**19. What is the realistic timeline to v1.0?**
**28–42 months** part-time; 14–21 months full-time.

**20. Is the project worth building?**

**Yes, on the terms the project has set — and the terms matter more than the answer.**

The capability gap is real and specific. No TypeScript framework unifies Bot API and MTProto.
No framework offers middleware, filters, routing and sessions over MTProto at all. No framework
models an application as several clients rather than one. GramJS's archival on 2026-07-14 left
a million-downloads-a-month installed base without a maintained home, and mtcute — the strongest
remaining option — is a client library rather than a framework, maintained by one person. These
are capability gaps, not taste differences, and capability gaps are the only kind that move a
settled market.

The costs are equally real and should not be softened. MTProto is roughly two thirds of the
engineering for a minority of the market. grammY has won the Bot API layer decisively, so that
half of the work buys credibility rather than users. puregram is a direct precedent worth
keeping in view: technically excellent, current, well-designed, and at 4,972 downloads a month
against grammY's 16 million. Quality alone does not move this market, so distribution and
documentation have to be treated as first-class deliverables rather than afterthoughts.

What makes the independent route defensible rather than merely ambitious is that the difficulty
is **bounded and documented**. Telegram publishes the handshake, the message format, the KDF,
the gap algorithm, the file alignment rules and SRP. Test datacenters exist. The protocol is
not a moving target in the way an undocumented reverse-engineered one would be. This is a large
amount of well-specified work, not an open-ended research problem — and that distinction is
what separates a project that finishes from one that does not.

The recommendation is to proceed, bottom-up, with the testing discipline in
[mtproto.md](mtproto.md) §12 treated as non-negotiable. The single highest-leverage decision in
the entire plan is building the deterministic mock server **before** the updates manager. Every
other risk in this document is ordinary engineering risk. That one is the difference between a
framework people can trust with production traffic and one that quietly loses their messages.
