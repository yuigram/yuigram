# Licensing

This document establishes what Yuigram may and may not reuse. It is a working engineering
analysis, not legal advice; the items marked **FLAG** should be reviewed by a lawyer before
the first public release.

---

## 1. Licence inventory

Verified against published package metadata and `LICENSE` files on 2026-08-19.

| Component | Version | Licence | Copyright holder |
|---|---|---|---|
| `puregram` | 3.7.0 | **MPL-2.0** | starkow |
| `@puregram/api` | 10.2.1 | **MPL-2.0** | starkow |
| `@puregram/api` schema JSON | 10.2 | MPL-2.0 (as part of the package) | starkow |
| `@mtcute/core` | 0.31.0 | **MIT** | alina sireneva |
| `@mtcute/tl` | 223.0.0 | **MIT** | alina sireneva |
| `@mtcute/tl-runtime` | 0.31.0 | MIT | alina sireneva |
| `@mtcute/node` | 0.31.0 | MIT | alina sireneva |
| `@mtcute/wasm` | 0.31.0 | MIT | alina sireneva |
| `@fuman/io` / `@fuman/net` / `@fuman/utils` | 0.0.21 | MIT | alina sireneva |
| `long` | 5.3.2 | **Apache-2.0** | Daniel Wirtz / dcodeIO |
| `better-sqlite3` | 12.x | MIT | Joshua Wise |
| `formdata-node` / `form-data-encoder` | 6.x / 4.x | MIT | Nick K. |
| `ark0f/tg-bot-api` schemas | rolling | **Apache-2.0 OR MIT** | ark0f |
| Telethon `errors.csv` | — | MIT | LonamiWebs |
| Telegram TL schema | layer 223 | *unstated* — see §5 | Telegram |
| Telegram Bot API documentation | 10.2 | *unstated* — see §5 | Telegram |

---

## 2. MPL-2.0: the constraint that shapes the project

puregram is Mozilla Public License 2.0. This is **file-level copyleft**, and it is
categorically different from MIT. The operative definition is §1.10:

> **"Modifications"** means any of the following:
> (a) any file in Source Code Form that results from an addition to, deletion from, or
> modification of the contents of Covered Software; or
> **(b) any new file in Source Code Form that contains any Covered Software.**

Clause (b) is the sharp edge. **A brand-new Yuigram file that contains any portion of
puregram source becomes a Modification, and therefore remains MPL-covered.** It cannot be
relicensed. Its source must be made available under §3.1, and under §3.2(a) that obligation
survives distribution in compiled form.

What MPL-2.0 *does* permit, via §3.3:

> You may create and distribute a Larger Work under terms of Your choice, provided that You
> also comply with the requirements of this License for the Covered Software.

So a mixed codebase is legal. An MIT-licensed Yuigram containing a handful of clearly
demarcated MPL files is a valid Larger Work. But it produces a package whose licence field
cannot honestly read `MIT`, whose per-file provenance must be tracked forever, and which
every downstream corporate legal review will stop on.

### What this means concretely

| Action | Permitted? | Consequence |
|---|---|---|
| Read puregram source to understand the Bot API | **Yes** | None. Facts and techniques are not copyrightable. |
| Reimplement an idea (schema-driven codegen, filter narrowing, promoted update kinds) | **Yes** | None, provided the expression is independent. |
| Depend on `puregram` as an npm package | **Yes** | No file contamination — it stays a separate MPL package. But see §3. |
| Copy a function body into a Yuigram file | **Yes, but** | That file becomes MPL forever. |
| Copy the `schema/10.2.json` IR | **Yes, but** | Contaminates whatever file it lands in; also avoidable — see §4. |
| Fork puregram and rename it | **Yes, but** | The entire result stays MPL, and it is explicitly out of scope for this project. |
| Relicense any puregram-derived file as MIT | **No** | Direct licence violation. |

### Decision

**Yuigram will contain no puregram-derived source.** Not because MPL is unacceptable, but
because the benefit is negligible and the cost is permanent.

The Bot API subsystem is the part of Yuigram that would be tempting to copy, and it is
precisely the part that does not need copying. At the transport level the Bot API is HTTPS
with JSON and multipart bodies; the difficulty is in the *types*, and the types are
generated from a schema. Generating them from an independently-licensed schema (§4) yields
an unencumbered result with no more effort than adapting someone else's.

puregram will be used as **reference material only** — for cross-checking edge-case
behaviour and validating the generator's output against a known-good implementation. Where a
specific insight is taken, it will be credited in `NOTICE.md` as an acknowledgement, not as
a licence obligation.

---

## 3. MIT: mtcute

mtcute is MIT throughout, including `@mtcute/tl` and its transitive `@fuman/*` and
`@mtcute/*` dependencies. MIT permits use, copying, modification, merging, publication,
distribution, sublicensing and sale, with one obligation:

> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.

MIT would permit Yuigram to depend on mtcute, vendor parts of it with attribution, or copy
from it freely. **None of these is used.**

| Option | Permitted by MIT? | Yuigram's position |
|---|---|---|
| Depend on `@mtcute/core` at runtime | Yes | **Not used.** The implementation must belong to Yuigram. |
| Vendor protocol modules with attribution | Yes | **Not used.** Vendored code is maintained code that Yuigram did not write. |
| Copy or closely translate source | Yes, with notice | **Not used.** |
| **Read it to understand the protocol** | Yes, unrestricted | **This is the only use.** |

The decision is not driven by licence risk — MIT poses none. It is driven by the project's
objective: Yuigram's MTProto stack is written from Telegram's specification, so the code that
ships is Yuigram's own work.

### The derivative-work gradient

There is a distinction worth stating precisely, because "MIT allows it" answers a narrower
question than the one that matters here.

Reading an implementation and reproducing its structure closely produces a derivative of that
implementation, regardless of what the licence permits. Reading a *specification* and
implementing it produces independent work, even when the result resembles other correct
implementations — because correct solutions to the same specified problem converge.

Yuigram's method, set out in [mtproto.md](mtproto.md) §1, keeps the work on the right side of
that line:

- **Telegram's specification is the input.** Every algorithm in [mtproto.md](mtproto.md) — the
  handshake, the KDF, the message format, the gap algorithm, the file alignment rules, SRP —
  came from `core.telegram.org`, and each section cites its source.
- **Other clients are consulted to answer "what does the server actually do?"**, where the
  specification is silent. That is factual knowledge about a third party's system, not
  expression.
- **No file is written with another implementation open beside it.** Findings from
  disambiguation are recorded as protocol notes and tests, then implemented from the notes.

Convergent structure is expected and unproblematic: any correct MTProto client has a session
layer that tracks acknowledgements and a peer cache keyed by `access_hash`, because the
protocol requires both. Similarity that arises from the problem is not derivation. Similarity
that arises from transcription is.

**Practical consequence:** no attribution obligation to mtcute is triggered, because no mtcute
code is used. mtcute is credited in `NOTICE.md` as a reference and as prior art in the
ecosystem — an acknowledgement of engineering debt, not a licence requirement.

### `long` (Apache-2.0)

Apache-2.0 is permissive but adds obligations MIT does not: preservation of `NOTICE` file
contents if one exists, a statement of changes if the file is modified, and an explicit
patent grant. **Not used** — native `BigInt` covers 64-bit integers and modular exponentiation
on Node 22, so the dependency and its obligations disappear entirely.

### `long` (Apache-2.0)

Apache-2.0 is permissive but adds obligations MIT does not: preservation of `NOTICE` file
contents if one exists, a statement of changes if the file is modified, and an explicit
patent grant. It is compatible with MIT distribution. If Yuigram uses BigInt directly rather
than a `Long` class — which modern Node makes practical — the dependency disappears
entirely. **Recommendation: avoid `long`, use native `BigInt`.**

---

## 4. Schema provenance — the clean path

The Bot API schema is the one artifact where source choice materially changes Yuigram's
licence position.

| Source | Licence | Assessment |
|---|---|---|
| `@puregram/api/schema/*.json` | MPL-2.0 | **Do not use.** Contaminates. |
| `ark0f/tg-bot-api` custom v2 / OpenAPI | **Apache-2.0 OR MIT** | **Preferred fallback.** Regenerated nightly and on upstream commits. Dual licence lets Yuigram take the MIT arm. |
| Yuigram's own scraper over `core.telegram.org` / `corefork.telegram.org` | see §5 | **Preferred primary.** Full control, no third-party dependency, `corefork` lead time. |

**Recommendation: build an independent scraper, and use `ark0f` as a cross-check in CI.**

Running both and diffing them is worth more than either alone: an unexplained divergence is
a high-signal alarm that either Telegram restructured the documentation or the parser
regressed. The cost is one extra CI step.

---

## 5. Telegram's own materials — **FLAG**

Telegram publishes no explicit licence for either the Bot API documentation or the TL
schema. Every client library in every language relies on them regardless, and Telegram
actively encourages third-party clients. But the position is worth stating honestly rather
than assuming.

| Artifact | Status | Assessment |
|---|---|---|
| Bot API method and type **names, shapes, parameters** | Facts / interface specification | Not copyrightable as such. Safe. |
| Bot API **prose descriptions**, copied verbatim into JSDoc | Telegram's authored text | **FLAG.** Universal industry practice; low practical risk; still technically Telegram's expression. |
| TL schema (`.tl` files, layer 223) | Interface definition | Same reasoning as the Bot API surface. Universally reused. Safe in practice. |
| **Server RSA public keys** | Public keys — data, not code | Safe. Published in Telegram's own MTProto documentation; take them from there, **not** from Telegram Desktop or Android source. |
| Telegram client source (Desktop / Android) | **GPL-family** | **Do not read, port, or copy.** Copying would force GPL onto Yuigram. mtcute notes its RSA keys were "manually extracted from Telegram for Android source" — Yuigram will use the published documentation instead, to avoid inheriting that question. |
| Telethon `errors.csv` | MIT | Safe with attribution, if used for the MTProto error table. |

Two concrete mitigations for the verbatim-description flag:

1. Store descriptions in the generated schema as an attributed field, with a source URL per
   entry, so provenance is machine-readable rather than laundered.
2. Emit a short link to the official documentation page in each generated JSDoc block
   alongside the description, exactly as Telegram's own `documentationLink` field supports.

Neither is legally decisive, but both keep provenance visible, which is the standard this
project holds itself to: third-party provenance is disclosed, never hidden.

---

## 6. Reuse matrix

| Component | Source | Licence | Reuse? | Modify? | Redistribution | Attribution | Source disclosure | Other obligations |
|---|---|---|---|---|---|---|---|---|
| Bot API runtime (transport, dispatch) | puregram | MPL-2.0 | **No** (policy) | — | — | — | — | Reference only |
| Bot API generated types | @puregram/api | MPL-2.0 | **No** (policy) | — | — | — | — | Reference only |
| Bot API schema IR | @puregram/api | MPL-2.0 | **No** | — | — | — | — | Replaced by own scraper |
| Bot API schema (alternative) | ark0f/tg-bot-api | Apache-2.0 OR MIT | **Yes** | Yes | Free | Notice under chosen arm | No | Take the MIT arm |
| MTProto protocol core | @mtcute/core | MIT | **No** (policy) | — | — | — | — | Study only — §3 |
| TL schema + codecs | @mtcute/tl | MIT | **No** (policy) | — | — | — | — | Study only; own parser and generator |
| MTProto error table | Telethon errors.csv | MIT | **No** (policy) | — | — | — | — | Errors generated from Telegram's own schema and observed responses |
| 64-bit integers | long | Apache-2.0 | **No** | — | — | — | — | Native `BigInt` instead |
| Crypto primitives | `node:crypto` | Node core | Yes | — | Free | None | No | SHA-1/256/512, PBKDF2, AES-CTR, CSPRNG |
| AES-IGE, RSA padding, SRP, factorization | **own implementation** | — | — | — | — | — | — | No library provides these |
| SQLite driver | better-sqlite3 | MIT | Yes, optional adapter | Yes | Free | Notice | No | Keep out of core — native build step |
| Multipart encoding | native `FormData` / `Blob` | Node core | Yes | — | Free | None | No | No `formdata-node` dependency |
| TL schema definitions | Telegram | unstated | Yes (practice) | Yes | — | Cite source | No | **FLAG** §5 |
| Bot API descriptions | Telegram | unstated | Yes (practice) | Yes | — | Cite source URL | No | **FLAG** §5 |
| Server RSA public keys | Telegram MTProto docs | unstated (data) | Yes | No | — | Cite doc URL | No | Never from GPL client source |
| Telegram client source | Telegram | GPL-family | **No** | — | — | — | — | Do not read or port |

---

## 7. Yuigram's own licence

**Recommendation: MIT.**

Rationale:

- It is what the entire competitive set uses — grammY, Telegraf, mtcute, GramJS, GramIO are
  all MIT. Corporate adoption is frictionless.
- puregram's MPL-2.0 is a genuine, if modest, adoption tax; matching it would import a
  disadvantage for no benefit.
- It keeps the plugin ecosystem unencumbered, which matters if `@yuigram/*` is to attract
  third-party contributions.
- With no third-party Telegram code in the tree, MIT is unconditionally clean — there is no
  inherited obligation to reconcile it against.

The only argument for MPL would be to prevent proprietary forks of Yuigram itself. For a
library whose value is in its ecosystem and maintenance cadence rather than its source, that
protection is not worth the adoption cost.

---

## 8. Compliance checklist before first publish

- [ ] `LICENSE` at repository root: MIT, correct copyright holder and year.
- [ ] `NOTICE.md` listing every third-party component, its licence, and its role, plus an
      acknowledgements section crediting puregram, mtcute, Telethon and TDLib as reference
      works — no code taken, engineering debt stated.
- [ ] **No third-party Telegram library in any `dependencies` field.** Enforced by CI (§9).
- [ ] `package.json` `license` field matches reality for every published package.
- [ ] No file contains puregram-derived or mtcute-derived source. Enforced by a CI check (§9).
- [ ] Generated schema records `source` URL and `fetchedAt` per release.
- [ ] Documentation states plainly that users must obtain their own `api_id`/`api_hash`, and
      links to `my.telegram.org`.
- [ ] `THIRD-PARTY-NOTICES` generated from the dependency tree as a release step.
- [ ] Legal review of the §5 flags before 1.0.

## 9. Enforcement

Provenance is easy to lose accidentally once the codebase is large, and independence claimed in
a document is worth less than independence a build can verify. Three CI guards:

1. **Dependency allowlist** — fail the build if any package resolves to a known Telegram
   library (`puregram`, `@puregram/*`, `mtcute`, `@mtcute/*`, `grammy`, `@grammyjs/*`,
   `telegraf`, `telegram`, `teleproto`, `gramio`, …) in any `dependencies` field, at any depth.
   This is the mechanical statement of the independence policy.
2. **Licence gate** — fail the build if any production dependency resolves to a licence outside
   the approved set (MIT / ISC / BSD / Apache-2.0 / CC0). With a near-empty dependency tree this
   is close to trivially satisfied, which is itself the point.
3. **Similarity tripwire** — a periodic job comparing Yuigram source against checkouts of
   puregram and mtcute for suspiciously long matching token sequences. Not a plagiarism
   detector; a tripwire that catches a copy-paste made under pressure. Its real function is to
   make "written from the specification" verifiable rather than asserted.

Guard 1 is the one that makes the difference between a policy and a property. A wrapper cannot
pass it.
