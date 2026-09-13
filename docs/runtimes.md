# Runtimes

Where Yuigram runs, how that is established, and what would have to change for the places it does
not.

---

## 1. What runs where

| Capability | Node 22+ | Bun | Deno | Workers / Edge | Browser |
| --- | --- | --- | --- | --- | --- |
| Bot API — Fetch-shaped webhook | **run** | expected | expected | expected | n/a |
| Bot API — sending, and every method | **run** | expected | expected | expected | expected¹ |
| Bot API — long-polling | **run** | expected | expected | n/a² | expected¹ |
| Bot API — files by `Blob` or stream | **run** | expected | expected | expected | expected¹ |
| Bot API — files by filesystem path | **run** | expected | expected³ | no | no |
| Entities — reading messages, users, chats | **run** | expected | expected | expected | expected |
| Formatting — HTML and Markdown, both ways | **run** | expected | expected | expected | expected |
| Storage — `memory()` | **run** | expected | expected | expected | expected |
| Storage — `file()` | **run** | expected | expected³ | no | no |
| Storage — `encrypted()` | **run** | expected | expected | no⁴ | no |
| MTProto — accounts, in full | **run** | expected | expected | **no** | **no** |

¹ Telegram's Bot API does not send CORS headers, so a browser page cannot call it directly. The
code runs; the request is what the browser refuses. This matters for embedding Yuigram in a
bundle that also runs elsewhere, not for building a bot that runs in a tab.

² Long-polling needs a process that outlives a request. An edge function does not have one, which
is why webhooks exist.

³ Deno needs `--allow-read` and `--allow-write` for the directory in question.

⁴ Needs `node:crypto`'s `scrypt` and `createCipheriv`. Some worker platforms provide a subset of
`node:crypto` behind a compatibility flag; whether these particular functions are in it is a
property of the platform rather than of this package, and is not claimed here.

---

## 2. What "run" and "expected" mean

The distinction is the point of this table, and it is not decoration.

**run** — executed on this runtime, by the test suite. Node 22 is the only such runtime today.

**expected** — inferred from the complete list of platform APIs the code reaches, checked against
what the runtime documents. It is a reasoned prediction, not a result. Bun and Deno are not
installed on the machine these measurements were taken on, so nothing in those columns has been
executed, and this document does not pretend otherwise.

### 2.1 How the Node-reach is measured

Every entry point is bundled with each `node:` specifier marked external, and the bundler's own
accounting says which ones survive tree-shaking. That turns "does this run without Node" into
something mechanical rather than a reading of the source:

| Program | Node built-ins it reaches |
| --- | --- |
| Bot, long-polling | none |
| Bot, webhook | none |
| Bot, sending only | none |
| Entities only | none |
| Formatting only | none |
| `memory()` | none |
| `file()` | `node:crypto`, `node:fs/promises`, `node:path` |
| `Account`, in full | `node:crypto`, `node:fs/promises`, `node:net`, `node:path`, `node:zlib` |

### 2.2 And how it is held

A measurement taken once is a fact about one afternoon. `tools/bench/test/portability.test.ts`
builds the bot-only bundle and evaluates it in a context holding only what the web platform
guarantees — no `process`, no `Buffer`, no `require`, no `node:` anything — then builds a client,
answers a webhook including the secret comparison, formats markup, reads a message and keeps
state in memory storage. Anything that reaches for Node finds nothing, exactly as it would on a
worker.

It is a floor rather than a proof: only code that executes there is checked, and a Node reach
inside a branch nothing takes would go unnoticed. The polling loop in particular is not exercised,
because doing so means making requests.

---

## 3. The Bot API needs nothing but `fetch`

That is now true, and it was not.

The subsystem reached into `node:crypto` in exactly one place: `timingSafeEqual`, comparing the
webhook secret. One import, for one function, and it made every bundle containing a bot
unloadable on any runtime without `node:crypto` — including the platforms
[`webhook/web.ts`](../packages/bot-api/src/webhook/web.ts) names in its own documentation as the
reason that adapter exists.

The comparison is now written out: encode both secrets, return early on a length mismatch, then
read every byte of both and branch on none of them. Eight lines, no import.
[security.md](security.md) §10 records that it is no longer `node:crypto`'s implementation and why
the property still holds.

Everything else was already portable, some of it deliberately. The file helpers reach the
filesystem through `await import('node:fs')` inside the functions that need it, so a program that
never sends a file from a path never pulls it in — which is why the table above shows no built-in
for a bot that sends a `Blob`.

---

## 4. What MTProto would need elsewhere

MTProto runs on Node, Bun and Deno because all three provide `node:crypto`, `node:net` and
`node:zlib`. Workers and browsers provide none of the three, and the gap is not one change:

| What it uses | Why the web platform is not a drop-in |
| --- | --- |
| AES-256-ECB, for the IGE mode Telegram encrypts with | WebCrypto has no ECB mode at all. It can be emulated a block at a time with AES-CBC and a zero IV, but WebCrypto is asynchronous, and a promise per 16 bytes is not a transport. |
| SHA-1 and SHA-256 | `crypto.subtle.digest` exists and is asynchronous. The call sites are synchronous throughout the session layer. |
| PBKDF2, for two-factor sign-in | `crypto.subtle.deriveBits` exists and is asynchronous. |
| Random bytes | `crypto.getRandomValues` is synchronous and present everywhere. This one is already portable. |
| Raw TCP | Browsers have no TCP at all. Telegram serves web clients over WebSocket, so this is a second transport rather than a shim. |
| gzip, for compressed answers | `DecompressionStream('gzip')` exists and is asynchronous. |

### 4.1 Every consumer, and what each one assumes

The question is not which primitives exist. It is which call sites depend on getting an answer
without waiting, because that is what a provider boundary would change. Traced over the current
tree:

| Consumer | Primitive and mode | State and chunking | Synchronous today |
| --- | --- | --- | --- |
| `message/encrypted.ts` | AES-256-IGE, both ways | Per message; key and IV derived per message, no state kept | yes |
| `auth/handshake.ts` | AES-256-IGE, SHA-1, modular exponentiation, PQ factorization | Per handshake step | yes |
| `auth/bind.ts` | AES-256-IGE encrypt | Once per temporary-key binding | yes |
| `transport/obfuscation.ts` | AES-256-CTR | **Two long-lived cipher objects per connection**, advanced by every packet in both directions | yes |
| `files/cdn.ts` | AES-256-CTR, SHA-256 | Counter derived from the chunk's offset; one call per chunk | yes |
| `files/upload.ts` | MD5 | Accumulated over a whole file | yes |
| `auth/password.ts`, `security/password.ts` | SRP, PBKDF2-HMAC-SHA512, modular exponentiation | Once per sign-in or password change | yes |
| `auth/keys.ts` | SHA-1 (`node:crypto` directly) | Once per key fingerprint | yes |

Seventeen call sites across seven modules, plus two that reach `node:crypto` without going through
the crypto layer. **None of them awaits anything today.**

### 4.2 What that rules out

Two of those rows decide the architecture, and neither is the one that looks hardest.

**The transport obfuscation is a stream cipher, not per-message encryption.** It builds two
`aes-256-ctr` objects when a connection opens and advances them with every packet, in both
directions, for the life of the connection. WebCrypto has no stateful cipher object at all —
`crypto.subtle.encrypt` is one-shot. Reproducing this against WebCrypto means computing the
counter from the byte offset and awaiting a fresh one-shot call **per packet**, on the hot path,
in a layer where ordering and backpressure are the whole job.

**IGE needs the raw block cipher, which WebCrypto does not expose.** AES-ECB is absent from the
standard. The usual workaround — a single-block AES-CBC with a zero IV — is asynchronous, so it
turns the per-message cipher into a promise per sixteen bytes.

So an asynchronous provider does not, by itself, supply what is missing. It supplies waiting, and
the missing thing is a mode.

### 4.3 The decision

**The provider contract is synchronous.** A browser implementation therefore needs a synchronous
AES in the repository; WebCrypto can back only the paths where a single wait is already
acceptable — PBKDF2 at sign-in, and one-shot hashing during the handshake.

The alternative — making the boundary asynchronous — was rejected on the evidence above rather
than on taste. It would push `await` into the transport's packet path and the session layer's
message path, where packet ordering, sequence-number ownership, serialized use of a stateful
cipher, concurrent sends, and disposal-while-pending all live. That is a large amount of risk
bought in exchange for a mode WebCrypto still would not provide.

What it costs was measured, not assumed. A compact AES-256 block cipher was written, checked
against `node:crypto` on a known block, and timed against it:

| | Throughput |
| --- | --- |
| The platform's AES-256 | 978 MiB/s |
| A straightforward pure-JS AES-256 | 2.8 MiB/s |

That implementation is **deliberately naive** — byte-wise state, an allocation per block — and a
table-driven one is substantially faster, so the ratio is an upper bound on a naive approach
rather than the cost of doing it well. Two things follow. Messaging is unaffected either way: a
4 KB message costs about 1.4 ms even at the slow figure. Bulk file transfer is where it stops
being acceptable, and it is also the one place a wait is natural, because a download is already
chunked and already waiting on the network.

Table-driven AES is also the point at which cache-timing behaviour has to be argued rather than
assumed, and this document does not claim constant-time behaviour for anything not yet written.

### 4.4 The next executable action

Introduce the synchronous provider seam over the seventeen call sites, backed on Node, Bun and
Deno by exactly what they use today, so the change is behaviour-preserving and testable against
the existing vectors. That seam is the prerequisite for every browser step after it, and it is
the point at which a browser provider becomes an addition rather than a rewrite.

Nothing here is started. It is recorded as the next architectural step rather than as a gap that
could be closed in passing, and no package claims browser support meanwhile — one that advertised
it while unable to open a connection would be worse than one that does not.

## 5. What is not verified

Stated plainly, so the table above is not read as more than it is:

- **Bun and Deno have not been executed against.** Neither is installed on the machine these
  measurements come from. Their columns are inference from the API list.
- **No worker or edge platform has been executed against.** The portability check approximates one
  with a bare context; it is not Cloudflare, Deno Deploy or Vercel.
- **No browser has been executed against.** The CORS note in the table is a property of Telegram's
  servers, and is the reason a browser column is of limited interest for the Bot API anyway.
- **The polling loop is not exercised off Node**, only bundled.

Closing any of these means running the suite on that runtime in continuous integration, which is
the honest way to turn an "expected" into a "run".
