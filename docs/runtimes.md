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

The shape of the work is therefore: make the crypto layer's callers tolerate asynchrony, or
implement the block cipher in the repository. The second is worth noting, because it is not the
obvious choice and may be the better one — the project already implements AES-IGE, SRP,
Miller-Rabin and Telegram's RSA padding itself under the zero-dependency policy, and an in-repo
AES would be synchronous, would remove `node:crypto` from the cryptography entirely, and would
make every runtime the same. It would also be slower than the platform's, by an amount nobody has
measured. Neither path is started, and neither should be until someone wants MTProto in a browser
badly enough to pay for it.

---

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
