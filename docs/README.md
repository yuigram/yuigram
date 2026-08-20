# Yuigram — Architecture & Design

Decision records: why Yuigram is built the way it is, and what it is being built towards.

## What is implemented

The **Bot API subsystem is complete and shipped**. Where a document describes it — polling and
webhooks in [bot-api.md](bot-api.md), dispatch and errors in [middleware.md](middleware.md),
typing in [sessions.md](sessions.md) — it describes running code, and the behaviour is pinned
by tests.

**MTProto is not implemented.** Neither is the `App` container that holds several clients, nor
anything that depends on it. [api-design.md](api-design.md) is labelled the *proposed* API and
shows the whole target, including parts that do not exist yet — `Account`, `App`, `Router`, the
`f` filter namespace and the `media` helpers among them. [naming.md](naming.md) records naming
decisions for that target, not an inventory of what ships.

The rule when reading: anything involving a bot and only a bot exists today; anything involving
a user account, several clients, or the `f`/`media` namespaces is design. The
[roadmap](roadmap.md) says when each part arrives, and nothing described anywhere here is a
stub — unimplemented means absent, not hollow.

## The premise

Yuigram is an independent TypeScript framework with first-class support for both the Telegram
Bot API and MTProto.

**Independent means implemented, not wrapped.** Yuigram does not depend on puregram, mtcute,
grammY or any other Telegram library — at any layer, at any phase. Both protocol stacks are
Yuigram's own work, built from Telegram's published specifications. Existing implementations
are reference material and a source of engineering knowledge; they are not building blocks.

```
existing implementations  ──>  study how the problems are solved
Telegram specifications   ──>  the normative input
                               │
                          design our own architecture
                               │
                          implement it ourselves
                               │
                            Yuigram
```

The one command a user runs is `npm install yuigram`. Nothing else comes with it.

## Read in this order

| # | Document | What it answers |
|---|----------|-----------------|
| 1 | [research.md](research.md) | How puregram, mtcute and the Telegram APIs are actually built |
| 2 | [licensing.md](licensing.md) | What may be reused, what may only be read, and why |
| 3 | [bot-api.md](bot-api.md) | Scope and implementation plan for the Bot API subsystem |
| 4 | [mtproto.md](mtproto.md) | **The MTProto implementation specification** |
| 5 | [unified-model.md](unified-model.md) | What can and cannot be unified between the two |
| 6 | [architecture.md](architecture.md) | The proposed system architecture |
| 7 | [api-design.md](api-design.md) | The proposed public API |
| 8 | [events.md](events.md) | Event taxonomy and dispatch |
| 9 | [middleware.md](middleware.md) | Middleware, filters and routing |
| 10 | [sessions.md](sessions.md) | Framework sessions vs. authorization sessions |
| 11 | [storage.md](storage.md) | Storage abstraction |
| 12 | [codegen.md](codegen.md) | The two owned generators, and how Telegram is tracked |
| 13 | [testing.md](testing.md) | How correctness is established, and the mock servers |
| 14 | [security.md](security.md) | Threat model, secret handling, own-crypto controls |
| 15 | [performance.md](performance.md) | Performance characteristics and budgets |
| 16 | [competitive-analysis.md](competitive-analysis.md) | The market, and why Yuigram has a reason to exist |
| 17 | [naming.md](naming.md) | Package and import naming |
| 18 | [feasibility.md](feasibility.md) | Honest engineering assessment + executive summary |
| 19 | [roadmap.md](roadmap.md) | Phased delivery plan |

Plus [protocol-notes/](protocol-notes/) — the working record of observed server behaviour that
the specification does not cover. Empty until implementation begins.

The executive summary is at the end of [feasibility.md](feasibility.md).

## The three decisions that shape everything else

**The unifiable layer is thin, and that is fine.** Everything above the update normalizer —
dispatch, filters, middleware, context contract, sessions, storage, errors, logging — is shared
completely. Everything below it is written twice, because the Bot API and MTProto genuinely are
two different systems. See [unified-model.md](unified-model.md).

**MTProto is built bottom-up, specification-first.** Crypto, then TL, then transport, then
auth, then the session layer, then peers and files, and the updates manager last — each layer
verified before the next begins. The deterministic mock server is written *before* the
subsystems it tests. See [mtproto.md](mtproto.md) §12.

**Independence is enforced by CI, not by intention.** A dependency allowlist fails the build if
any Telegram library enters the tree; a declaration scan fails it if any foreign type reaches
the public API. See [architecture.md](architecture.md) §10 and [licensing.md](licensing.md) §9.

## Timeline

| Milestone | Part-time | Full-time |
|---|---|---|
| Bot API release (v0.1) | 6–8 months | 3–4 months |
| Unified MVP (v0.5) | 21–31 months | 11–16 months |
| v1.0 | 28–42 months | 14–21 months |

This is a multi-year build. That cost is accepted deliberately: the objective is a framework
whose implementation belongs to Yuigram, and there is no shorter route to it.

## Status

Research phase: **complete, pending review.**
Implementation: **not started, and must not start until this material is approved.**

All measurements were taken from published package artifacts on 2026-08-19 against
puregram 3.7.0 / @puregram/api 10.2.1, @mtcute/core 0.31.0 / @mtcute/tl 223.0.0, Bot API 10.2
and TL layer 223. Protocol details are cited from `core.telegram.org` as of the same date.
