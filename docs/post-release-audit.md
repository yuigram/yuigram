# Post-Release Audit

An assessment of Yuigram after `0.1.0`, written against the repository as it stands rather than
against intent.

---

## 1. Executive Summary

**The implementation below the public API is sound. The public API is not, and `0.1.0` should
not have been published in its current shape.**

That is a judgement about sequencing, not about the work. The dispatch layer, filter algebra,
session serialization, error taxonomy, generated Bot API surface, invariant CI and testing
harness are genuinely good — several are better than what the reference implementations ship.
696 tests pass, CI is green, the published packages have zero runtime dependencies and carry
provenance.

But the surface a user actually touches has two structural defects that make it unfit to freeze,
and one open security alert. Publishing before settling the API means the first breaking change
lands at `0.2.0`, days after release.

**Where the difficulty actually is.** Studying mature implementations, rebuilding independently
and then combining Bot API and MTProto is the right *what*. It misplaces the *where*: the
difficulty is not reproducing functionality. It is deciding what the two protocols may share
without lying about their differences, and expressing that decision in a type system.
`unified-model.md` does that analysis correctly. The API then fails to honour it: a single
`Context` for twenty-six update kinds is precisely the fake abstraction that document forbids,
applied to events instead of to transports.

**Should the project continue on this foundation?** Yes. The foundation is the layer under the
API, and it is worth keeping. What needs rewriting is the client surface — perhaps 1,200 lines
of the roughly 4,600 hand-written lines. That is a rewrite of the front door, not of the house.

**Should the repository be reset?** No. Reasoning in §6.

---

## 2. Critical Problems

### C1 — Open secret scanning alert: Telegram Bot Token

**What is wrong.** GitHub secret scanning has an **open** alert of type *Telegram Bot Token*.

**Evidence.**

```
gh api repos/yuigram/yuigram/secret-scanning/alerts
→ open  [Telegram Bot Token]

Locations:
  packages/core/test/log.test.ts:18
  packages/bot-api/test/fetch-client.test.ts:14
  packages/bot-api/test/bot.test.ts:16
  packages/bot-api/test/download.test.ts:18
  packages/bot-api/test/secret-exposure.test.ts:21

Value: a fabricated token of the form <9 digits>:<34 characters>
Present in 7 of 51 commits; first introduced by 79e5d8f
```

The string is fabricated and has never been a real credential. But it is shaped like one
convincingly enough that GitHub's partner-pattern matcher classified it, and for public
repositories **GitHub forwards such detections to the provider**. Telegram was notified about a
token that does not exist.

There is an additional irony worth recording: the commit that introduced it is
`feat(core): add error hierarchy and logging with secret redaction`, and one of the files
carrying it is `secret-exposure.test.ts` — the test asserting that credentials never escape.

**Why it matters.** A framework that handles Telegram credentials cannot ship with an open
credential alert. A prospective user checks the Security tab; "1 open alert" costs more trust
than the underlying issue deserves. It also trains the maintainer to ignore that tab.

**Contained blast radius, verified.** The token is **not** in the published npm packages — tests
are excluded by `files`. Users installing `yuigram` never receive it.

**Action taken (Phase 1).**
1. Every fixture now reads `0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000`. A single-digit id sits
   far outside the range partner scanners treat as a bot token, and the secret half says in
   words what it is.
2. The same applied to the second, less convincing fixture in `mock-bot.ts`,
   `allowed-updates.test.ts` and `bench-dispatch.mjs`.
3. One exception, deliberately: the redaction tests in `log.test.ts` need a fixture that
   *matches* the redaction pattern, or they would pass while redaction was broken. Theirs uses
   a seven-digit id — inside Yuigram's own `\d{6,}` pattern, outside the 8-10 digit window
   scanners match on — and is commented to say so.
4. Remaining: close the alert as *Used in tests*, which requires repository admin access.
5. History is **not** rewritten. Reasoning in §6.

**Breaking change:** no.

**Severity: CRITICAL** — it is the one item that is unambiguously wrong today.

---

### C2 — One `Context` for every update kind

**What is wrong.** A single context type serves twenty-six update kinds, so every field that is
not universal is optional — including fields that are guaranteed present for the event the
handler was registered for.

**Evidence** — compiled against the published `0.1.0`:

```ts
bot.on('message', (ctx) => {
  const t: string = ctx.text   // Type 'string | undefined' is not assignable to type 'string'
})
bot.on('callback_query', (ctx) => {
  const d: string = ctx.data   // Type 'string | undefined' is not assignable to type 'string'
})
```

**Why it matters.** This is the defect behind the `?? 'Say something.'` in the README's own
example. It is not defensive code; it is the developer re-establishing at runtime what they
declared at registration. It appears in *every* handler, teaches users that the types cannot be
trusted, and forfeits the single advantage a TypeScript-first framework claims.

It compounds: `ctx.message` is `Message | undefined`, so reading a photo costs two provably
unnecessary optional hops plus a dead branch.

**Recommended action.** Event-specific context types, selected by the registration, generated
from the schema. Full design in [api-decisions.md](api-decisions.md) §1–2.

**Breaking change:** yes. **Severity: CRITICAL.**

---

### C3 — `new Bot(token)` cannot express three client kinds

**What is wrong.** The constructor takes a positional string. It names neither the credential
nor the transport, and accommodates one of the three clients the project must support.

**Evidence.** `packages/bot-api/src/bot.ts:135` — `constructor(token: string, options: BotOptions = {})`.
The roadmap requires Bot API bots, MTProto bots and MTProto user accounts. Nothing in the
constructor distinguishes them; adding them means overloads or a widening options bag.

**Why it matters.** This blocks the project's defining feature. Yuigram's reason to exist is
that Bot API and MTProto live in one coherent framework — and the entry point cannot currently
say which one you are holding.

**Recommended action.** Named constructors returning distinct types:
`Bot.fromToken` · `Bot.fromMtproto` · `Account.fromSession`. See
[api-decisions.md](api-decisions.md) §3.

**Breaking change:** yes. **Severity: CRITICAL.**

---

## 3. API Problems

Fully documented in [api-review.md](api-review.md); summarised here with severity.

| # | Problem | Severity | Breaking |
|---|---|---|---|
| A1 | Single context type (= C2) | CRITICAL | yes |
| A2 | `new Bot(token)` (= C3) | CRITICAL | yes |
| A3 | `start()` cannot name the mechanism — polling? webhook? MTProto connect? A webhook bot never calls it at all | HIGH | yes |
| A4 | `on('message')` does not narrow — the string is not a type-level input | HIGH | yes |
| A5 | `ctx` names a framework construct; `Context` models nothing because it is a union of everything | MEDIUM | yes |
| A6 | Mixed vocabulary: `on`, `once`, `off`, `command`, `text`, `callback`, `use`, `catch`, `extend` — five word classes for one concept | MEDIUM | yes |
| A7 | `catch` borrowed from `try/catch`, where it means something else | LOW | yes |
| A8 | `callback` collides with JavaScript's own meaning | LOW | yes |
| A9 | 45 of 78 public exports appear nowhere in docs, examples or README | MEDIUM | no |

On A9 specifically: every export is a compatibility promise. Shipping `encodeRequest`,
`hasUpload`, `createContext`, `normalizeUpdate`, `toError`, `resolveInstallOrder` at the top
level commits the project to them forever, for symbols no documented workflow uses. They should
either be documented as the extension surface they are, or moved behind a subpath.

**Would I put the current minimal example on the front page?** No. It contains a `??` that
exists only because the framework did not use information it was given.

---

## 4. Architecture Problems

The architecture is in better shape than the API, and most of it should survive.

### What is right

- **The seam is in the correct place.** `unified-model.md` puts the transport boundary at the
  normalized update: everything above (dispatch, filters, middleware, sessions, storage,
  errors, logging) is shared; everything below is written twice. This is the correct analysis
  and CI enforces it.
- **Layer boundaries are mechanical**, not conventional — `core` cannot import a transport, and
  the transports cannot import each other. The build fails otherwise.
- **Generated surface is regenerable**, from a committed schema snapshot, with drift detection.

### What is wrong

**AR1 — The event model contradicts the architecture (MEDIUM, breaking).** The architecture is
careful never to pretend two transports are the same thing, then the context layer pretends
twenty-six event kinds are the same thing. The same discipline applied one level up would have
prevented C2: the fake-abstraction rule was applied to transports and not to events.

**AR2 — `@yuigram/mtproto` is an empty package in the tree (LOW, not breaking).** It exports
one constant. It is `private` and unpublished, so it costs users nothing, and it does hold the
architectural boundary in place. Defensible, but it should be reviewed if MTProto work does not
begin soon: an empty package that sits for a year reads as abandonment rather than intent.

**AR3 — Context extension via type parameters is right but under-explained (LOW).** The decision
to use `Bot<C>` rather than declaration merging is correct and better than what most frameworks
do. It is barely visible in the documentation, so users will reach for the global-merge pattern
they know from elsewhere and find it silently does nothing.

**No unnecessary abstractions were found.** Middleware, filters, sessions and storage each earn
their place, and each is used by the layer above it.

---

## 5. Security Problems

| # | Problem | Severity |
|---|---|---|
| S1 | Open secret scanning alert (= C1) | **CRITICAL** — fixtures replaced; alert awaits closing |
| S2 | A second credential-shaped fixture in three more files | HIGH — **fixed** |

**S2.** A second fixture in `mock-bot.ts`, `allowed-updates.test.ts` and `bench-dispatch.mjs`
was never flagged but repeated the same mistake: a test value shaped like a credential. Both
are now replaced, and the working tree contains no string a scanner will match.

### What is clean, verified

- **No real secrets anywhere in history.** All 385 blobs across every commit scanned against 13
  secret patterns: no npm, GitHub, AWS, Slack, Google or private-key material.
- **No PII.** The Apple private-relay address appears nowhere; no local filesystem paths.
- **Zero runtime dependencies**, so the dependency attack surface is empty. Dependabot reports
  no vulnerabilities.
- **Published packages carry provenance** (SLSA attestation verified on npm).
- **Token handling is genuinely careful**: held in a closure, unreachable by object walk or
  `JSON.stringify`, absent from every error message, with tests pinning each property.
- **npm publishing config is correct**: `files` allowlist, `access: public`, provenance,
  contents checked inside the tarball before publish.

The security *posture* is strong. The security *alert* is the problem, and it is a fixture
mistake rather than an exposure.

---

## 6. Repository Problems

### Whether to reset the repository

**Recommendation: keep the current repository. Do not reset.**

**Option A — clean the existing repository**

| | |
|---|---|
| History | 51 commits, all conventional, single author (`coupdev`) — verified across every blob |
| Contributors | Single author; `github-actions[bot]` was removed by rewriting one commit |
| Remaining debt | The fabricated token in 7 commits |
| Work required | Replace fixtures, close the alert, land the API redesign |

**Option B — new repository**

| | |
|---|---|
| Gains | The fabricated token leaves history |
| Costs | Destroys 51 commits of legitimate, well-written history; orphans the published `0.1.0`, whose npm page and provenance attestation both point at this repository; loses the release, tags, CodeQL baseline and all settings; requires re-linking npm trusted publishing |

**Why A wins, concretely.** The only thing a reset buys is removing a **fabricated** string that
was never a credential, grants access to nothing, and is absent from the published packages.
Every other reason to start a repository over — poor history, accidental commits, unnecessary
contributors, obsolete architecture — was checked and is **not present**.

The provenance point is decisive on its own: `yuigram@0.1.0` carries an SLSA attestation binding
it to this repository at a specific commit. Deleting the repository breaks that binding
permanently, and a broken attestation on a security-conscious framework is worse than a closed
false-positive alert.

**A middle path exists**: a targeted rewrite of the 7 affected commits with `git filter-repo`
rather than a new repository. It is still not worth doing, for a string that was never secret —
every rewrite invalidates each commit SHA anyone has referenced.

### Other repository issues

| # | Problem | Severity |
|---|---|---|
| R1 | Dependabot PR #1 open — merging it normally adds `dependabot[bot]` to contributors | MEDIUM |
| R2 | `docs/` has 23 documents; three are now design-history rather than current guidance | LOW |
| R3 | Examples 02, 03, 04, 09, 10 absent — honestly marked as pending, but the numbering gaps read as incomplete | LOW |

R1 has a clean fix: apply the change as a normal commit and close the PR unmerged.

---

## 7. Release Problems

**RL1 — `0.1.0` was released before the API was settled (HIGH).** Stated plainly, as asked: it
should not have been. Two structural defects were present at publish time, so the first breaking
change lands at `0.2.0` within days.

The damage is small and worth naming precisely, because the instinct to over-correct is the
bigger risk: `0.x` carries no stability promise, there are no dependents, and version `0.1.0`
costs nothing to leave in place. The release also produced real value — it is what made the API
problems concrete enough to act on, and it validated the entire publishing pipeline end to end.

**RL2 — Release automation was incomplete (MEDIUM, fixed).** Changesets created tags in the
runner but did not push them, and created no GitHub Release; both were completed by hand. This
will recur every release until diagnosed.

**RL3 — Release notes describe the framework, not the release (LOW).** Correct for a first
release. From `0.2.0` they must describe *changes*, with a migration section.

### What went right

Package metadata is complete; three subpaths resolve under `nodenext`, `bundler` and `node16`;
tarballs contain only `dist`, `src`, `LICENSE`, `README.md`; provenance is attached; the
published packages were installed into a clean project and exercised end to end.

---

## 8. Recommended Rewrite Areas

Rewrite, not patch:

| Area | Why | Approx. |
|---|---|---|
| **Client surface** (`bot.ts`) | Constructors, lifecycle verbs, registration vocabulary all change together | ~420 lines |
| **Context model** (`context.ts` + generated contexts) | Per-event types replace the union; this is the core fix | ~150 hand-written, plus generated |
| **Event registration typing** (`dispatcher.ts` signatures) | `on()` must narrow by kind; internals stay | ~80 lines of signature |
| **Examples** | Every example is written against the old surface | 5 files |
| **README + docs** | The front-page example is the artefact being fixed | — |

Patch, do not rewrite:

Test fixtures (S1/S2), the `permissions` block in `schema-drift.yml`, release automation (RL2).

---

## 9. What Should NOT Be Changed

Explicitly preserve. These are the parts that make the project worth continuing:

- **Dispatch core** — priority bands, reserved handler slot, per-pass double-`next` guard proven
  correct under concurrency.
- **Filter algebra** — `filter`/`and`/`or`/`not` with kind metadata; the merge rules are
  correct and non-obvious.
- **Service-message promotion** — a member join arrives as `chat_member_joined`, not a message
  to branch on. Better than the Bot API's own shape, and now deterministic.
- **Session serialization** — per-key queueing; the lost-update race cannot occur.
- **Error taxonomy** — preserves Telegram's code, description and retry data, with a documented
  three-way contract.
- **Log redaction** — structural, cannot be disabled, tuned to avoid the over-broad matching
  that gets redaction turned off.
- **Code generation** — committed schema snapshot, deterministic output, drift detection.
- **Architecture invariants in CI** — the independence claim is mechanical, not aspirational.
- **Testing harness** — drives the real pipeline with only the network replaced.
- **Package smoke test and contents check** — both caught real defects.
- **Zero runtime dependencies.**

The transport layer (polling, webhooks, adapters, downloads) is also sound and needs only the
surface renames.

---

## 10. Recovery Plan

Staged, because Phase 2 sets the surface every later phase is written against.

### Phase 1 — Security and repository cleanup
*Small, independent, no API impact. Can start immediately.*

- Replace all token-shaped fixtures with unmistakable placeholders (C1, S2)
- Close the secret scanning alert as *Used in tests*
- Apply Dependabot PR #1 as a normal commit; close the PR (R1)
- Fix `schema-drift.yml` permissions
- Diagnose why changesets did not push tags (RL2)

### Phase 2 — Public API redesign
*The gate. Everything after depends on it.*

- Approve or amend the direction in [api-decisions.md](api-decisions.md)
- **Type-level prototype first**: context types and `on()` narrowing, compiled but not wired.
  If the types do not come out clean, the API is wrong — and this is the cheap place to learn it
- Freeze the surface on paper, with worked examples for all three client kinds

### Phase 3 — Architectural corrections
- Generate per-event context types from the schema
- Make registration select the context type
- Apply the fake-abstraction rule to events as it was applied to transports (AR1)

### Phase 4 — Core implementation cleanup
- Rewrite the client surface against the frozen API
- Keep dispatch, filters, sessions, storage, errors unchanged
- Audit the 78 public exports; document or relocate the undocumented 45 (A9)

### Phase 5 — Tests and quality
- Port 696 tests to the new surface
- Add type-level tests asserting narrowing — the defect that shipped was type-level, and no
  type test existed to catch it
- Re-run smoke, contents check and benchmark

### Phase 6 — Documentation
- Rewrite README around the new minimal example
- Update all five examples
- Migration guide `0.1.0 → 0.2.0`
- Reconcile `api-design.md` with what actually ships

### Phase 7 — Release preparation
- Full audit re-run
- Verify tarballs, provenance, subpath resolution
- Changeset describing changes and migration

### Phase 8 — Next release
- Publish `0.2.0`
- Only then resume MTProto work

**Sequencing note.** Phase 1 is independent and worth doing this week regardless of what happens
to the API. Phase 2 is the decision point, and no implementation should start before it closes.

---

## Closing assessment

Yuigram is not a project that needs rescuing. It is a project whose front door was fitted before
the design was settled, on a house that is otherwise well built.

Planning the work as "reproduce the functionality, then combine the two protocols"
underestimates it, in a specific and recoverable way. The hard part is not reproducing
features. It is deciding what may be unified without lying, and encoding that decision in
types. That analysis exists and is correct. The API has not been brought into line with it yet.

Fixing that is a rewrite of roughly a quarter of the hand-written code, on top of a foundation
worth keeping.
