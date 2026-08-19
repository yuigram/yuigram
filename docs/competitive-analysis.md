# Competitive Analysis

The existing landscape, and an honest answer to the question that decides whether this project
is worth building:

> **Why would a developer choose Yuigram over what already exists?**

---

## 1. The market

npm downloads, month ending 2026-08-18:

| Package | Downloads/month | Scope | Licence | Status |
|---|---:|---|---|---|
| `grammy` | 16,010,590 | Bot API | MIT | Active, dominant |
| `telegraf` | 1,474,879 | Bot API | MIT | Maintained, legacy-leaning |
| `telegram` (GramJS) | 1,086,253 | MTProto | MIT | **Archived 2026-07-14** |
| `node-telegram-bot-api` | 904,403 | Bot API | MIT | Maintained, dated design |
| `teleproto` | 82,863 | MTProto | MIT | Active — GramJS successor |
| `@mtcute/core` | 59,573 | MTProto | MIT | Active |
| `@mtcute/node` | 46,768 | MTProto | MIT | Active |
| `gramio` | 14,551 | Bot API | MIT | Active, newer |
| `puregram` | 4,972 | Bot API | MPL-2.0 | Active |
| `tgsnake` | 513 | MTProto | MIT | Low activity |

Two structural facts:

**The Bot API layer is settled.** grammY has roughly 11× its nearest competitor and 3,200×
puregram. It is well documented, well maintained, plugin-rich, and multi-runtime.

**The MTProto layer is not.** GramJS — still serving over a million downloads a month — was
archived on 2026-07-14 and is read-only. Its users are on an unmaintained library, and the
successor (`teleproto`) is a young fork carrying a codebase that was, by general reputation,
already the less-clean of the two mature options.

---

## 2. Head-to-head

| | grammY | Telegraf | puregram | GramJS | teleproto | mtcute | GramIO | **Yuigram** |
|---|---|---|---|---|---|---|---|---|
| **Bot API** | Excellent | Good | Excellent | ✗ | ✗ | via MTProto | Excellent | Target: excellent |
| **MTProto** | ✗ | ✗ | ✗ | Good | Good | Excellent | Target: good |
| **Both, one framework** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **Yes** |
| **Typing quality** | Excellent | Fair | Excellent | Fair | Fair | Good | Excellent | Target: excellent |
| **Generated types** | Yes | Partial | Yes | Yes (TL) | Yes (TL) | Yes (TL) | Yes | Yes, both |
| **Middleware** | Excellent | Good | Good | ✗ | ✗ | ✗ | Good | Target: excellent |
| **Filters/routing** | Good | Fair | Excellent | ✗ | ✗ | ✗ | Good | Target: excellent |
| **Sessions** | Plugin | Built-in | Plugin | ✗ | ✗ | ✗ | Plugin | Plugin |
| **Multi-client app** | ✗ | ✗ | ✗ | Manual | Manual | Manual | ✗ | **Yes** |
| **Runtime deps** | Few | Several | 3 | Several | Several | Several | Few | Target: 0 for Bot API |
| **Docs** | Excellent | Good | Good | Fair | Fair | Good | Good | Must be excellent |
| **Community** | Large | Large | Small | Large | Growing | Moderate | Small | None |
| **Licence** | MIT | MIT | MPL-2.0 | MIT | MIT | MIT | MIT | MIT |
| **Maintenance** | Active | Active | Active | **Archived** | Active | Active | Active | — |

### Notes on individual projects

**grammY** is the benchmark. Excellent types, a strong plugin ecosystem, genuinely good
documentation, multi-runtime support. Its one structural gap is MTProto, and its position is
that MTProto is out of scope — a defensible choice that leaves the gap open.

**Telegraf** is the incumbent that grammY displaced. Still widely used, simpler middleware
model, weaker typing. Largely a migration source at this point.

**puregram** is technically excellent and commercially marginal. Its filter typing and codegen
are the best in the Bot API space; 4,972 downloads/month is the market's verdict on
distribution rather than on quality. **This is the most important cautionary data point in this
document**: technical superiority did not produce adoption. See §5.

**GramJS** was the default JavaScript MTProto library. Archived 2026-07-14. Its million monthly
downloads represent a large installed base that now needs somewhere to go.

**teleproto** is the continuation of GramJS. Active, growing (83k/month), and inherits both
GramJS's users and its design.

**mtcute** is the strongest MTProto implementation in the ecosystem — thoughtful architecture,
clean layering, good typing, actively maintained. Its limitations are its narrow high-level
ergonomics compared with a bot framework, a small community, and a bus factor of one.

**GramIO** is the newest serious Bot API entrant — type-safe, multi-runtime, scaffolding-first.
At 14.5k/month it demonstrates that entering the Bot API market late is possible but slow.

---

## 3. The gap

**No JavaScript or TypeScript framework provides first-class Bot API and MTProto support in a
single coherent programming model.**

The claim was checked against every project above. mtcute can authenticate with a bot token
over MTProto, but that is bot-over-MTProto, not the Bot API, and it does not give a bot
framework's ergonomics. grammY explicitly excludes MTProto.

Today, building an application that needs both means:

```ts
import { Bot } from 'grammy'
import { TelegramClient } from '@mtcute/node'

// Two frameworks. Two mental models. Two middleware systems — or one and a half,
// because mtcute has no middleware. Two session concepts. Two error taxonomies.
// Any shared logic is written twice, or wrapped by hand.
```

This is a real and common shape of application:

- A bot with an assistant account that can read history the bot cannot see
- A bot needing files over 50 MB, using a user client for transfer
- Moderation tools where the bot acts and a user account observes
- Analytics collecting from channels the bot cannot join
- Migration or archival tooling
- Userbots that also expose a bot interface

None of it is exotic. All of it is currently glued together by hand.

---

## 4. The honest case for Yuigram

### Where the case is strong

1. **The unification is genuinely unserved.** Not a marginal improvement on a solved problem —
   a capability no framework in this language provides.
2. **The MTProto layer is unsettled.** GramJS's archival left a million-downloads-a-month
   installed base looking for a direction. That is a rare opening.
3. **A framework model applied to MTProto is new.** mtcute is an excellent *client library*;
   nobody offers middleware, filters, routing and sessions over MTProto. Userbot authors
   currently hand-roll all of it.
4. **The multi-client application model is unserved.** Every existing framework assumes one
   client is the application. Running a bot and three user accounts with shared middleware
   requires manual orchestration everywhere.
5. **Being the second mover on schema-driven codegen is an advantage.** The technique is
   proven; adopting it from the start avoids the migration cost the incumbents paid.

### Where the case is weak

1. **grammY has won the Bot API layer.** Nobody will switch for a marginally nicer filter API.
   Bot API support is table stakes for credibility, not a differentiator.
2. **puregram proves quality does not sell itself.** Excellent engineering, 4,972
   downloads/month. Distribution, documentation and community are the constraint, and they are
   not solved by writing better code.
3. **MTProto is 80% of the cost for a minority of users.** Most Telegram developers only ever
   need a bot. The expensive half of Yuigram serves the smaller half of the market.
4. **Maintenance burden is permanent and doubled.** Both APIs change. mtcute and grammY each
   have a maintainer plus contributors; Yuigram proposes to track both with one.
5. **Bus factor of one.** So is mtcute's — but mtcute is already established. A new project
   with a single maintainer has to earn trust it does not yet have.
6. **Fragmentation argument.** "Another Telegram framework" is a fair criticism, and the
   answer has to be the capability gap, not a preference for a different API style.

---

## 5. What the puregram data point means

This deserves separate treatment because it is the most directly relevant evidence available.

puregram is, on the technical merits, at least the equal of grammY: better filter typing,
comparable codegen, a lean dependency budget, current with Bot API 10.2 within days of
release. It has 0.03% of grammY's downloads.

The plausible causes:

- English-language documentation and community reach arrived later and smaller
- MPL-2.0 rather than MIT — a small but real friction in corporate adoption
- Entered a market where a good-enough incumbent already existed
- Nothing it offered was a *capability* difference, only a *quality* difference

**The lesson for Yuigram is direct: a quality difference does not move a settled market. A
capability difference might.** This is exactly why the unification thesis has to be the
product, and why "we also have a nicer Bot API" cannot be.

It follows that Yuigram's Bot API support must be excellent — because it is the cost of being
taken seriously — while the *reason to switch* has to be the thing nobody else does.

---

## 6. Positioning

Not: *"a better Telegram bot framework."* That market is closed.

Instead:

> **Yuigram is the framework for Telegram applications that need more than a bot.**
>
> One package, one programming model, one middleware system — across bots and user accounts.

Target users, in priority order:

1. Developers already running both a bot and a userbot, gluing two libraries together
2. Userbot authors who want a framework rather than a client library
3. Teams hitting Bot API limits (50 MB uploads, invisible chat history, no user-side actions)
4. GramJS users displaced by the archival, looking for a maintained option with better
   ergonomics
5. New projects that value a single coherent model over incumbency

Explicitly **not** the target: simple bots well served by grammY. Attempting to convert them
would be a slow, losing campaign against a better-resourced incumbent.

---

## 7. Adoption risks

| Risk | Severity | Mitigation |
|---|---|---|
| Demand for the combination is smaller than expected | **High** | Accepted rather than gated. The Bot API release at month 6–8 gathers real signal, which sets *priority* within the MTProto phases rather than whether they happen. |
| grammY adds MTProto | Medium | Unlikely — an explicit scope decision — but it would remove the differentiator entirely |
| mtcute adds a framework layer | Medium | Plausible; it is the natural next step for that project. Yuigram's answer is that owning both stacks allows a coherence a framework layered over a separate client cannot reach. |
| Distribution failure (the puregram outcome) | **High** | Documentation and English-language community from day one, not after 1.0 |
| **Maintainer burnout over a multi-year build** | **High** | Bottom-up staging so each layer completes and stays done; a real shipped artifact at month 6–8; automation of everything recurring |
| "Yet another framework" reception | Medium | Lead with the capability gap; never with API taste |

---

## 8. Verdict

**A real gap exists, and it is defensible.** No TypeScript framework unifies Bot API and
MTProto. Nobody offers a framework programming model — middleware, filters, routing, sessions —
over MTProto at all. Nobody models an application as several clients rather than one. And the
MTProto layer is unsettled: GramJS was archived on 2026-07-14 with over a million monthly
downloads still flowing to it.

**The gap costs more to fill than it first appears.** The MTProto stack is roughly two thirds
of the engineering for a minority of the market, and grammY has already won the Bot API layer,
so that half of the work buys credibility rather than users. puregram is the cautionary
precedent: technically excellent and at 0.03% of grammY's downloads.

**What makes the independent route defensible rather than merely ambitious** is that the
difficulty is bounded and documented. Telegram publishes the handshake, the message format,
the KDF, the gap algorithm, the file alignment rules and SRP. Test datacenters exist. This is a
large amount of well-specified work, not open-ended research — and that distinction separates a
project that finishes from one that does not.

Two conditions determine whether the effort converts into adoption:

1. **The unification has to be the product.** Positioned as "a better bot framework that also
   does MTProto", Yuigram competes head-on with a dominant incumbent on the axis where
   incumbents are strongest. Positioned as the framework for Telegram applications that need
   more than a bot, it competes where nothing else exists.
2. **Documentation and distribution are first-class deliverables.** The puregram data point is
   unambiguous: quality alone does not move this market.

Neither is an engineering problem, which is precisely why they are easy to under-resource while
the interesting protocol work is in front of you.

The full assessment is in [feasibility.md](feasibility.md) §7.
