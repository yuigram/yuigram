# Security

Threat model, secret handling, and the security-relevant obligations of a framework that
holds Telegram credentials.

Yuigram handles two classes of credential with very different blast radii. A leaked bot token
compromises a bot. **A leaked MTProto session compromises a person's entire Telegram account** —
their messages, their contacts, their identity. That asymmetry drives most of what follows.

---

## 1. Assets

| Asset | Sensitivity | Impact if compromised |
|---|---|---|
| **MTProto session / auth keys** | **Critical** | Full account takeover. Read all history, impersonate, no password needed, may not be visible to the victim. |
| `api_hash` | High | Impersonation of the application; rate-limit and reputation abuse |
| Bot token | High | Full bot control; token holders can also read whatever the bot can |
| 2FA password | **Critical** | Combined with a session, defeats recovery |
| Login codes | **Critical** | Short-lived but sufficient to take an account |
| Framework session data | Varies | Application-specific |
| Peer cache | Medium | Discloses the account's social graph |

---

## 2. Secrets in logs

The most common real-world leak is a token in a log aggregator, not a cryptographic break.

**Never logged, at any level, including `debug`:** bot tokens, `api_hash`, auth keys, session
strings, login codes, 2FA passwords, SRP parameters, `access_hash` values.

Redaction is applied structurally rather than by the caller remembering:

```ts
// Token-shaped strings are masked wherever they appear.
log.debug('calling %s', url)
// -> https://api.telegram.org/bot123456:***REDACTED***/sendMessage
```

Implementation requirements:

- A redaction pass over every log record, matching known secret shapes (bot-token pattern,
  32-hex `api_hash`, base64 session strings) and known field names.
- Secrets held as non-enumerable properties so `JSON.stringify(client)` and console
  inspection cannot expose them.
- `toString()` / `inspect` overrides on credential-bearing objects returning a masked form.
- Errors scrubbed before they reach a handler — a `NetworkError` must not carry the request
  URL with the token in it.

The last point is easy to miss and is where tokens usually escape: not from logging code, but
from an unhandled error whose `.url` or `.config` is serialized by a crash reporter.

---

## 3. Session storage

MTProto session material is the highest-value asset in the system.

| Control | Default | Rationale |
|---|---|---|
| File permissions `0600` | **On** | Costs nothing; prevents the most common local exposure |
| Warn on wider permissions | **On** | Detects a session copied or checked out carelessly. The directory rather than the file: nothing reaches a file whose directory denies it |
| Encryption at rest | **Off**, opt-in | A mandatory passphrase pushes users to store the key beside the file, achieving nothing. Available and documented. |
| Exclusive lock | **Not yet implemented** | Two clients on one session corrupt both — fail loudly. Outstanding: see §3.1 |
| Never in `git` | Documented + a `.gitignore` in every template, held by the `templates-ignore-secrets` invariant | The realistic leak path. A template is copied whole, so the root ignore file protects nothing once it has been copied |

When enabled, encryption is AES-256-GCM with scrypt key derivation — authenticated, so
tampering fails cleanly instead of producing confusing protocol errors.

### 3.1 The exclusive lock is not implemented

The row above states a requirement, not a behaviour that ships. It is recorded here rather
than quietly dropped, because the reason it has not been built is a decision nobody has taken
rather than work nobody has done.

`storage.md` §4 and [sessions.md](sessions.md) §3 both say the file driver takes the lock. But
`file()` is the generic key-value driver, and framework storage is legitimately shared between
processes — several webhook workers behind one store is a supported deployment, and an
unconditional lock would break it. Scoping the lock to MTProto session storage instead means
either an option on `file()` or a lock the account owns, and neither document says which.

A lock also has to be released, and `KV` has no `close`. The account has a lifecycle and could
release one, but it only owns the store on the `Account.fromSession` path — a store passed to
the constructor stays the caller's, which this document and the implementation both say. So
releasing it would be an ownership transfer nothing has agreed to.

Resolving this means choosing between adding a lifecycle method to the central storage
contract and moving the lock off the file driver, which contradicts the wording in two other
documents. Both are architectural decisions, so the requirement stays open and explicit.

`exportSession()` returns a string that **is** a logged-in session. The documentation says
exactly that, in those words, at every mention. It is not a config value, it does not go in a
repository, and it must never be pasted into a chat for debugging — a habit that has cost
real accounts in this ecosystem.

---

## 4. Credential input

- Credentials come from arguments or the environment; Yuigram never reads a dotfile
  implicitly, because implicit credential discovery makes it unclear what a process is
  actually using.
- Malformed tokens fail fast with a message that does not echo the token.
- Interactive sign-in callbacks (`code`, `password`) are invoked only when genuinely needed,
  and their return values are used and released rather than retained.
- 2FA passwords are consumed by the SRP computation and never stored, in memory or otherwise,
  beyond the call.

---

## 5. Network

| Concern | Control |
|---|---|
| TLS verification | Always on. No option to disable — a flag that disables certificate checking is a flag that will be found in production. |
| `apiBaseUrl` override | Permitted for local Bot API servers; warn loudly when it is not `api.telegram.org` and not `localhost` |
| Proxies | Supported explicitly, never picked up from ambient environment variables without opt-in |
| MTProto server keys | Supplied by the application from Telegram's published MTProto documentation (`serverKeysFromPem`), never compiled in, and checked by fingerprint; a datacenter offering a key the account does not hold is refused |
| DH parameter validation | Full safe-prime check on every handshake. Not optional, not skippable. |
| `g_a`/`g_b` range checks | Enforced — omitting them is a known MTProto weakness |
| Nonce equality checks | Enforced at every handshake step |
| Constant-time comparison | For every hash, MAC and key comparison |

The DH validation deserves emphasis: it is expensive and it is tempting to skip or cache
carelessly. mtcute caches the *result* for a known-good prime, which is the correct
optimization — cache the verification outcome, never bypass the verification.

### Delivery nodes

A datacenter may answer a request for a file by naming a machine Telegram does not operate. The
node holds the file encrypted and is told nothing about the account asking for it, but a client
that goes there is fetching bytes from somewhere outside Telegram, and that is a decision about
trust rather than about speed.

It is offered only to a client that says it can accept one, and **an account does not say so
unless the caller asked**. `download({ …, cdn: true })` is the whole of the opt-in; without it a
datacenter that would rather redirect still serves the file, so the default costs nothing.

Four rules hold the boundary, and each is this client's rather than the node's — a guarantee
that depends on the far end declining what it should never have been offered is not one:

| Rule | Why |
|---|---|
| A node is recognised by the **address list**, never by the redirection | A redirection is a claim somebody else made. The `cdn` flag is Telegram's own statement about which machines it does not operate |
| A node gets **its own authorization and nothing else** | No temporary key is vouched for there, and the long-lived key this account authorizes with never travels to one |
| A node may be asked `upload.getCdnFile` and `upload.getCdnFileHashes` — **nothing else** | Checked against a list before anything is sent |
| `account.reach()` **refuses** a node outright | The escape hatch exists for a method that must go to a particular datacenter, and a node answers none of them |

A redirection naming a datacenter the address list does not describe as a node is refused rather
than attempted: there is nowhere to go, and a client that tried would wait on an address it does
not have.

What does reach a node is the Diffie-Hellman handshake, the description every MTProto connection
opens with, and requests for byte ranges. What comes back is checked against the hashes published
for it before a single byte is handed to the caller — `mtproto.md` §11.

---

## 6. The cipher a browser gets, and what it does not promise

A browser has no AES. `crypto.subtle` cannot help with the two modes MTProto
needs — it exposes no single-block operation, so IGE cannot be built on it, and
its counter mode has no object that keeps its place — so the cipher is in the
package, in TypeScript, and `docs/runtimes.md` §4.2 records why. This section is
about what that costs, because it costs something real.

### 6.1 The implementation is not constant-time

The portable AES is table-driven: four 256-entry tables, indexed by bytes of the
round state, which is a function of the key. **Where a table entry lands in the
cache depends on the key**, and how long a lookup takes depends on where it
landed. That is the classic cache-timing side channel against software AES, and
it has been used to recover keys in practice.

Nothing about the tests changes this. Every published vector can pass while the
timing leaks, which is exactly why the surviving mutant in
`crypto-backend.test.ts` — replacing the constant-time comparison with one that
returns early — stays a survivor. No functional test can kill it, and killing it
by other means would be the test asserting something it did not establish.

What is and is not claimed:

| | |
| --- | --- |
| The comparison in `constantTimeEqual` | Reads every byte and accumulates the differences with `\|`, so the work does not depend on where or whether two values differ. The **algorithm** is constant-time; whether the engine compiles it that way is not something this repository can establish, and is not claimed. |
| The platform backend's comparison | `node:crypto`'s `timingSafeEqual`, which is the platform's own claim rather than this repository's. |
| The portable AES | **Not constant-time, and not claimed to be.** Stated in the module and here. |
| The portable digests | No key-dependent table indices; a digest has no key. Nothing to leak. |
| `modPow` | Square-and-multiply, branching on exponent bits. The exponents it is used with — DH secrets, RSA public exponents — make this worth naming, and §6.3 says what follows. |

### 6.2 Who can see the timing

A cache-timing attack needs an observer that can measure the victim's cache
behaviour. In a browser that means code running on the same machine, and the
mitigations that followed Spectre are what stand between it and a usable clock:

- `performance.now()` is coarsened, and the coarsening is per-context.
- `SharedArrayBuffer` — the usual way to build a fine-grained timer — requires
  cross-origin isolation, which a page must opt into with headers.
- A page on a different origin cannot read this page's memory or its cache lines
  directly; it has to infer them.

That is a real obstacle rather than a guarantee. The honest statement is that
**a browser is a hostile place to run software AES, and the mitigations are
someone else's and can change**.

### 6.3 What this means for a release

The exposure is not the same everywhere, and the difference is worth being
precise about:

| Where | Cipher | Exposure |
| --- | --- | --- |
| Node, Bun, Deno | `node:crypto`, which is the platform's AES and uses the processor's own instructions | The platform's problem, and AES-NI is constant-time by construction |
| A browser or worker | The portable AES | The side channel above, against whatever else the machine is running |

So: **the portable cipher is a fit for a browser page the person running it
controls, and is not a fit for a page that also runs untrusted code.** A page
that embeds third-party scripts is a page where an attacker is already inside
the origin — at which point they can read the authorization key straight out of
storage (§3) and do not need a timing attack at all. That is the sharper point:
in a browser, the side channel is not the weakest thing about holding a key.

The alternatives, and why each was not taken:

| | |
| --- | --- |
| A WebAssembly AES | Fast and closer to constant-time. It is a binary artifact to vendor and to trust, and this repository's dependency policy admits neither an npm runtime dependency nor a vendored blob. Not ruled out on merit — ruled out by a policy that would have to change first, deliberately. |
| `crypto.subtle` for the block cipher | Cannot be done: it exposes no way to encrypt a single block, and IGE needs one. `docs/runtimes.md` §4.2. |
| Refusing to run in a browser | What the package did before, and it makes the question moot by making the feature absent. |

**Release position.** Browser support ships with this limitation stated, in the
module, here, and in `docs/runtimes.md`. It is not a blocker for a page whose
scripts are all the developer's own. A deployment that cannot make that
statement about its page should run the account on a server and talk to it, and
that is the recommendation rather than a footnote.

---

## 7. Handling untrusted input

Every update is attacker-controlled. A user chooses their own display name, filename, caption
and callback data.

| Vector | Control |
|---|---|
| **Path traversal** via filenames | Never use a Telegram-supplied filename as a path. `download(target, dest)` requires the caller to supply the destination; helper functions sanitize and confine to a base directory. |
| **SSRF** via user-supplied URLs | The framework never fetches a URL found in an update. `media.url()` is caller-supplied by construction. |
| **Deserialization** | TL decoding is bounds-checked with explicit length limits; a malformed constructor is an error, never an allocation of attacker-chosen size. |
| **Resource exhaustion** | Message size caps, container count caps, decompression bounds on gzipped TL payloads. |
| **Injection into formatting** | Entity-based formatting by default; `parse_mode` helpers escape their inputs. |
| **Callback-data spoofing** | Callback data is attacker-controlled — documented as such. Authorization decisions must use `query.sender.id`, never the callback payload. Signed callback data is offered as a plugin. |
| **Webhook forgery** | `secret_token` validated on every request, compared in constant time. Requests without it are rejected, not merely logged. |
| **Webhook body size** | Bounded before parsing. |

The callback-data point is worth stating explicitly in user documentation, because the mistake
— trusting `callback_data` to identify who may perform an action — is common and produces a
straightforward privilege escalation.

---

## 8. Account-ban exposure — a product-level risk

From `core.telegram.org/api/obtaining_api_id`: Telegram monitors unofficial client usage and
states that accounts used for flooding, spamming or faking counters will be banned
permanently.

Yuigram makes writing userbots easy. That is the product. It also means **Yuigram's users can
lose their personal Telegram accounts**, and a framework that makes the risk easy to run into
without mentioning it has behaved badly regardless of what its licence disclaims.

Obligations accepted here:

1. MTProto documentation opens with a plain statement of ban risk.
2. Examples demonstrate conservative behaviour — rate limiting present, no mass messaging, no
   scraping patterns.
3. No convenience API for bulk operations that primarily serve abuse (mass invite, mass
   forward, contact harvesting).
4. Sensible built-in flood handling, so an accidental loop backs off rather than hammering.
5. Documentation recommends a secondary account for development.

This is a design constraint, not a disclaimer. It shapes which methods get first-class
wrappers.

---

## 9. Supply chain

**Zero runtime dependencies** across core, `bot-api` and `mtproto`. Node's built-ins cover
everything: `fetch`, `FormData` and `Blob` for the Bot API; `node:crypto` and native `BigInt`
for MTProto.

This is a security property, not a stylistic one. A library that holds Telegram session
credentials is a high-value target, and every transitive dependency is a path to those
credentials through an account compromise or a malicious release. An empty dependency tree
removes that entire class of attack.

- Native modules stay out of core; `better-sqlite3` lives behind an optional adapter.
- Lockfile committed; CI audits on every build and on a schedule.
- Releases published with npm provenance attestation, so artifacts are verifiably built from
  the tagged source.
- Publishing requires 2FA; automation tokens are granular and scoped.
- Dependency additions require explicit justification in review — the default answer is no.
- The dependency allowlist in [licensing.md](licensing.md) §9 fails the build if any Telegram
  library enters the tree at any depth.

### The trade-off this creates

Implementing cryptography rather than depending on it moves risk rather than removing it: a
supply-chain risk becomes an implementation risk. That trade is taken deliberately, and it is
only defensible with the controls it requires:

- **Known-answer vectors** for AES-IGE, RSA padding, SRP and factorization, verified before any
  code depends on the primitive.
- **No invented cryptography.** Every primitive implements a published, specified algorithm.
  Where Node provides one (SHA, PBKDF2, AES-CTR), Node's is used.
- **Non-bypassable protocol validation** — the checks in [mtproto.md](mtproto.md) §5.2 have no
  configuration switch.
- **Constant-time comparison** for every secret-derived value.
- **Independent security review** of the crypto and protocol layers before 1.0, treated as a
  release gate rather than a nice-to-have.

Owning the implementation means owning its correctness. That is the point, and the review gate
is what makes it a responsible position rather than an assertion.

---

## 10. Defaults

Security defaults are the ones that actually take effect, so they are chosen conservatively:

| Setting | Default | Reason |
|---|---|---|
| TLS verification | On, not disableable | — |
| Session file mode | `0600` | Free |
| Session encryption | Off | Usability; documented and available |
| Webhook secret validation | On when a secret is set; warn when not | Unauthenticated webhooks are a real exposure |
| Update deduplication | On | Prevents duplicated side effects |
| Log level | `info` | `debug` may contain sensitive structure |
| Flood auto-retry | Off | Silent hour-long sleeps are worse than an error |
| Redaction | On, always | Not configurable — an off switch would be used |

---

## 11. Pre-release checklist

Checked before each release. An item is ticked only when a test holds it, not when it was
looked at once. Where an item is a property of the code rather than of a single path — that no
option disables a check, say — the evidence names both the tests that hold the behaviour and
the surface that was read to establish there is no way round it.

### Bot API — closed for 0.1.0

- [x] No secret reachable via `JSON.stringify` of any public object — `secret-exposure.test.ts`
      walks the client, the transport and a context, and serializes each
- [x] Redaction verified against tokens, `api_hash`, session strings, auth keys — `log.test.ts`
- [x] Errors scrubbed of URLs containing tokens — `download.test.ts`, `fetch-client.test.ts`
- [x] Constant-time comparison everywhere a secret is compared — the webhook secret is the only
      one the Bot API has. The comparison is written out in `webhook/handler.ts` rather than taken
      from `node:crypto`: length is checked first and separately, then every byte of both is read
      and none is branched on. That import was the one thing keeping the whole Bot API subsystem
      from running anywhere `fetch` exists, and it was worth one function — see
      [runtimes.md](runtimes.md) §3. The property under test is unchanged, and
      `webhook.test.ts` still tests it
- [x] Session files `0600`, and the store directory `0700` — `storage.test.ts`
- [x] Webhook secret comparison is constant-time — `webhook.test.ts`
- [x] Path-traversal test over download helpers — `secret-exposure.test.ts` covers `..` on both
      separators, URL schemes and null bytes
- [x] Hostile input cannot pollute prototypes, crash the pipeline, or reach a handler as though
      Telegram sent it — `hostile-input.test.ts`
- [x] Request bodies are bounded while being read — `webhook-adapters.test.ts`
- [x] `npm audit` clean; provenance enabled — zero runtime dependencies, and a CI licence gate
      for the day that changes
- [x] `SECURITY.md` with a disclosure address and response commitment

### MTProto — closed for the subsystem as built

- [x] Crypto primitives validated against known-answer vectors — AES-CTR against NIST SP
      800-38A F.5.5 (`crypto-ctr.test.ts`). The rest of the schedule has no published vectors
      to use, so each is checked against an independent reference rather than against itself:
      IGE drives the recurrence off the platform's raw AES-ECB, RSA is decrypted back by
      `node:crypto` with padding disabled, the key derivations are recomputed by direct
      slicing over `node:crypto` hashes, and SRP is answered by the other side of the protocol
      implemented from its published definition. 148 cases across nine suites
- [x] DH validation cannot be bypassed by configuration — `handshake.ts` validates the
      modulus, the generator and the server's public value before storing any of them, and
      re-checks the client's own public value and the shared secret. No option gates it:
      neither `HandshakeOptions` nor `DatacentersOptions` carries a switch, and the seams that
      exist replace the byte stream or the whole channel rather than disabling a check. The
      safe-prime memo caches refusals as well as acceptances, so it cannot be primed to skip
      one. Held end to end by `auth-handshake.test.ts`, which runs the real exchange against a
      peer injecting an unsafe modulus, a degenerate public value and an oversized modulus,
      and by the nineteen single-condition cases in `crypto-primes.test.ts`
- [x] TL decoder fuzzed for bounds and allocation limits — `tl-fuzz.test.ts` holds the
      property the session layer relies on: for any bytes, decoding produces a value or raises
      `TlReadError`, and nothing else escapes. Seeded, so a failure is reproducible; driven
      with uniform noise, with bodies behind a real constructor identifier, with hostile
      length and count fields written over every four-byte window, and with corrupted and
      truncated valid encodings. Both tables, including the one the plaintext handshake
      channel decodes with before any key exists
- [x] Ban-risk warning present in MTProto documentation — [mtproto.md](mtproto.md) opens with
      it, as §7 obligation 1 requires
- [x] No secret reachable via `JSON.stringify` of any public object, or by walking one —
      `secret-exposure.test.ts` covers the account, the surfaces it hands out and the context a
      handler is given, with a control proving the search finds a secret that is really there.
      It also records what the technique cannot see: a credential a closure captured, which is
      why the closures an account hands out are given the account rather than its secret
- [x] Hostile input cannot pollute prototypes or reach a handler as though it were real —
      `normalize.test.ts` drives a chosen `__proto__` and `constructor.prototype` through the
      seam, a message whose every field is the wrong type, and a constructor this build does
      not know. Nothing copies keys off an update, every field is read through a guard, and an
      unknown constructor is carried as raw rather than dispatched as a message
- [x] Session encryption at rest, and a permission warning when a session directory is too
      open — `encrypted()` wraps any adapter; `file()` checks the directory's mode the first
      time it opens one and warns through the caller's logger, which `Account.fromSession`
      supplies. `storage.test.ts` holds both, and `account.test.ts` holds the wiring on
      platforms where a mode means something
