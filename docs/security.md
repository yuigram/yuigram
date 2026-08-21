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
| Warn on wider permissions | **On** | Detects a session copied or checked out carelessly |
| Encryption at rest | **Off**, opt-in | A mandatory passphrase pushes users to store the key beside the file, achieving nothing. Available and documented. |
| Exclusive lock | **On** | Two clients on one session corrupt both — fail loudly |
| Never in `git` | Documented + `.gitignore` in every template | The realistic leak path |

When enabled, encryption is AES-256-GCM with scrypt key derivation — authenticated, so
tampering fails cleanly instead of producing confusing protocol errors.

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
| MTProto server keys | Compiled in, sourced from Telegram's published MTProto documentation, verified by fingerprint |
| DH parameter validation | Full safe-prime check on every handshake. Not optional, not skippable. |
| `g_a`/`g_b` range checks | Enforced — omitting them is a known MTProto weakness |
| Nonce equality checks | Enforced at every handshake step |
| Constant-time comparison | For every hash, MAC and key comparison |

The DH validation deserves emphasis: it is expensive and it is tempting to skip or cache
carelessly. mtcute caches the *result* for a known-good prime, which is the correct
optimization — cache the verification outcome, never bypass the verification.

---

## 6. Handling untrusted input

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

## 7. Account-ban exposure — a product-level risk

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

## 8. Supply chain

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

## 9. Defaults

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

## 10. Pre-release checklist

Checked before each release. An item is ticked only when a test holds it, not when it was
looked at once.

### Bot API — closed for 0.1.0

- [x] No secret reachable via `JSON.stringify` of any public object — `secret-exposure.test.ts`
      walks the client, the transport and a context, and serializes each
- [x] Redaction verified against tokens, `api_hash`, session strings, auth keys — `log.test.ts`
- [x] Errors scrubbed of URLs containing tokens — `download.test.ts`, `fetch-client.test.ts`
- [x] Constant-time comparison everywhere a secret is compared — the webhook secret is the only
      one the Bot API has, and uses `timingSafeEqual`
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

### MTProto — open until the subsystem exists

- [ ] Crypto primitives validated against known-answer vectors
- [ ] DH validation cannot be bypassed by configuration
- [ ] TL decoder fuzzed for bounds and allocation limits
- [ ] Ban-risk warning present in MTProto documentation
- [ ] Session encryption at rest, and a permission warning when a session file is too open
