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
| Storage — `web()`, over `localStorage` | expected⁵ | expected | expected | no | **run** |
| MTProto — accounts, in full | **run** | expected | expected | expected⁶ | **run**⁷ |

¹ Telegram's Bot API does not send CORS headers, so a browser page cannot call it directly. The
code runs; the request is what the browser refuses. This matters for embedding Yuigram in a
bundle that also runs elsewhere, not for building a bot that runs in a tab.

² Long-polling needs a process that outlives a request. An edge function does not have one, which
is why webhooks exist.

³ Deno needs `--allow-read` and `--allow-write` for the directory in question.

⁴ Needs `node:crypto`'s `scrypt` and `createCipheriv`. `crypto.subtle` offers no scrypt, so a
browser is given a store that says so rather than one that writes an envelope a server could not
open. Some worker platforms provide a subset of `node:crypto` behind a compatibility flag; whether
these particular functions are in it is a property of the platform rather than of this package,
and is not claimed here.

⁵ The store works wherever a `Storage` is passed to it, which under Node means one supplied by the
caller. The default reaches `localStorage` and says so when there is none.

⁶ A worker resolves the same substitutions a browser does, and the bundle reaches no Node built-in.
Nothing has been executed on one; §5 says what that leaves.

⁷ Executed, and broken down step by step in §5. What needs an authorized session is marked there
as not run rather than claimed.

---

## 2. What "run" and "expected" mean

The distinction is the point of this table, and it is not decoration.

**run** — executed on this runtime. Node 22 by the test suite; a browser by `tools/browser`, which
serves the framework to one and reports what it did. §5 breaks the browser column down step by
step, because "it runs in a browser" is too coarse a claim to be worth much.

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

## 4. MTProto away from a server

MTProto runs on Node, Bun and Deno because all three provide `node:crypto`, `node:net` and
`node:zlib`. A browser and an edge worker provide none of the three. That gap is now closed, by
shipping a second implementation of everything the web platform does not have and letting the
`browser` field in each `package.json` choose between them.

### 4.1 What a browser gets instead

| Published module | Substituted with | What the replacement is |
| --- | --- | --- |
| `@yuigram/mtproto` `crypto/backend.js` | `crypto/backend.browser.js` | AES-256 and the three digests in TypeScript; randomness from `crypto.getRandomValues`; PBKDF2 from `crypto.subtle` |
| `@yuigram/mtproto` `network/connect.js` | `network/connect.browser.js` | A WebSocket connector rather than a TCP one |
| `@yuigram/mtproto` `session/gunzip.js` | `session/gunzip.browser.js` | DEFLATE and the gzip wrapper in TypeScript, decompressing only |
| `@yuigram/core` `storage/file.js` | `storage/file.browser.js` | An error naming what is missing. `web()` is the store a browser has |
| `@yuigram/core` `storage/encrypted.js` | `storage/encrypted.browser.js` | An error. The envelope is keyed by scrypt, which `crypto.subtle` does not offer |
| `@yuigram/bot-api` `files-node.js` | `files-node.browser.js` | An error for the two download paths that need a filesystem; the rest of a download is unchanged |

The substitution is a build-time decision rather than a runtime probe. A probe would have to be
asynchronous, would leave a `node:crypto` specifier in the bundle for a bundler to fail on, and
would put a branch on a path that runs for every message.

**It is checked rather than asserted.** The `bundle/browser-builtins` benchmark bundles a program
with an account in it for a browser and counts the Node built-ins in the graph. The budget is
zero, and the build fails naming any that come back.

### 4.2 Why the contract is synchronous

The question was never which primitives exist. It was which call sites depend on getting an answer
without waiting, because that is what an asynchronous boundary would change. Traced over the tree:

| Consumer | Primitive and mode | State and chunking | Awaits |
| --- | --- | --- | --- |
| `message/encrypted.ts` | AES-256-IGE, both ways | Per message; key and IV derived per message | no |
| `auth/handshake.ts` | AES-256-IGE, SHA-1, modular exponentiation, PQ factorization | Per handshake step | no |
| `auth/bind.ts` | AES-256-IGE encrypt | Once per temporary-key binding | no |
| `transport/obfuscation.ts` | AES-256-CTR | **Two long-lived streams per connection**, advanced by every packet in both directions | no |
| `files/cdn.ts` | AES-256-CTR, SHA-256 | Counter derived from the chunk's offset | no |
| `files/upload.ts` | MD5 | Accumulated over a whole file | no |
| `auth/keys.ts` | SHA-1 | Once per key fingerprint | no |
| `session/inbound.ts` | gzip | In the middle of flattening a container | no |
| `auth/password.ts`, `security/password.ts` | SRP, PBKDF2-HMAC-SHA512 | Once per sign-in or password change | **yes** |

Two rows decided it, and neither is the one that looks hardest.

**The transport obfuscation is a stream cipher, not per-message encryption.** It opens two counter
streams when a connection opens and advances them with every packet, in both directions, for the
life of the connection. `crypto.subtle` has no stateful cipher object: `encrypt` is one-shot. That
much could be rebuilt — owning an explicit counter is a matter of keeping state, not of what the
platform exposes — but it would mean an `await` per packet on the hot path, in a layer where
ordering and backpressure are the whole job.

**IGE needs the raw block cipher, and `crypto.subtle` exposes no way to encrypt a single block.**
AES-ECB is absent from the standard. The usual workaround, a one-block AES-CBC with a zero IV, is
asynchronous — a promise per sixteen bytes. So a block cipher has to be in the package regardless
of what else is decided.

Once it is there, deriving a message key through an awaited digest buys nothing and costs an
`await` on every message. So everything is synchronous except the one primitive where waiting is
both unavoidable and worth it.

#### The decision, as a table

| | Design A — synchronous contract, own AES | Design B — asynchronous contract over `crypto.subtle` |
| --- | --- | --- |
| IGE | Available: the block cipher is in the package | **Not available.** No single-block operation is exposed |
| Stateful CTR | Available: the stream owns its counter | Available, by owning an explicit counter — but one `await` per packet |
| Digests on the message path | Synchronous | `await` in the middle of building every message |
| PBKDF2 | Delegated to the platform, asynchronous | Asynchronous |
| Blast radius | One module per primitive | `await` pushed into the transport's packet path and the session's message path, where sequence-number ownership, concurrent sends and disposal-while-pending live |
| Speed on a server | Native, unchanged | Native |
| Speed in a browser | 13–20× slower than native | Native for what it can do, and it cannot do the two that matter |
| Timing behaviour | Table-driven AES is not constant-time; stated in the module and not claimed otherwise | Native, and constant-time where the platform is |

Design A, then. Other mature MTProto clients make the same split, which is corroboration
rather than a reason.

### 4.3 What it costs

Measured on the machine these figures come from, against `node:crypto` on the same input:

| | Portable | The platform | Ratio |
| --- | --- | --- | --- |
| AES-256, table-driven | 117 MiB/s | 1582 MiB/s | 13.5× |
| SHA-256 | 115 MiB/s | 1910 MiB/s | 16.6× |
| SHA-1 | 108 MiB/s | 2259 MiB/s | 20.9× |
| MD5 | 436 MiB/s | 884 MiB/s | 2.0× |

A 4 KiB message costs about 0.08 ms of cryptography in the portable path against about 0.005 ms
natively. Messaging is unaffected. Bulk file transfer is where the difference becomes the limiting
factor, and it is also the one place a wait is natural, because a download is already chunked and
already waiting on the network.

**One figure is worse than the ratios suggest.** Validating the prime a datacenter publishes is a
Miller-Rabin test on a 2048-bit number: native `BigInt` arithmetic in a browser, and about **five
seconds**. The result is cached per prime, so it is paid once — but it is paid at the worst moment,
on the first connection, and a page that appears to hang for five seconds is a page that looks
broken. A worker is the obvious place to put it and nothing does that yet.

**Timing.** The portable AES is table-driven, and table lookups indexed by key-dependent bytes are
the classic cache-timing side channel. The module says so. Nothing here claims constant-time
behaviour, and passing tests would not establish it if it did.

---

## 5. What has actually been run

The point of this document is the difference between run and expected, so the browser column is
broken down rather than given a single mark.

| Step | Node 22 | Bun | Deno | Workers / Edge | Browser |
| --- | --- | --- | --- | --- | --- |
| The module graph loads | **run** | expected | expected | expected | **run** |
| Crypto against published vectors | **run** | expected | expected | expected | **run** |
| Both backends agree byte for byte | **run** | n/a | n/a | n/a | n/a |
| Protocol over a fake transport | **run** | expected | expected | expected | n/a¹ |
| A real socket carries bytes both ways | **run** | expected | expected | expected | **run** |
| The key exchange completes over one | **run** | expected | expected | expected | **run** |
| An account negotiates and binds a temporary key | **run** | expected | expected | expected | **run** |
| An encrypted call is answered | **run** | expected | expected | expected | **run** |
| An update is normalized and dispatched | **run** | expected | expected | expected | **run** |
| The datacenter pushes one down the session | **run** | expected | expected | expected | **run** |
| Updates ingested from the wire and routed | **run** | expected | expected | expected | **not run**² |
| A session survives in storage | **run** | expected | expected | expected | **run** |
| Stopping closes what was held | **run** | expected | expected | expected | **run** |
| Against Telegram itself | **not run**³ | **not run**³ | **not run**³ | **not run**³ | **not run**³ |

¹ The browser check talks to a datacenter over a real socket instead, which is a stronger claim
than the same peer reached in-process.

² An account ingests updates from a connection only once it is signed in — there is a place in the
update stream to keep, and an account with no authorization has none. Signing in needs credentials
this check does not have. The dispatch half is run in a browser; the ingestion half is not.

³ No credentials. Nothing in this repository has been pointed at Telegram's production network.

### 5.1 How the browser column was established

`pnpm --filter @yuigram/browser-check serve` bundles the framework for a browser — with the
substitutions the packages declare, read from their own `package.json` rather than written into
the tool — serves it as a page, and answers the WebSocket the page opens with the same mock
datacenter the test suite uses. Nothing in the page is mocked: the cryptography is the page's, the
store is the origin's `localStorage`, and the connection is a real `WebSocket`.

The page reports what it did rather than only whether it passed, because a check that silently did
nothing would otherwise read as a pass. Seventeen checks, all passing in Chrome.

Running it found three things the build could not: `process.version` read at module scope, which
made importing the framework throw in a browser before anything could run; `Buffer` doing the hex
and base64 on four live paths; and the five-second prime validation above.

### 5.2 What is still inference

- **Bun and Deno have not been executed against.** Neither is installed on the machine these
  measurements come from. Their columns are inference from the API list, and the browser result
  raises the confidence without replacing it: both provide `node:crypto`, so both take the
  platform path rather than the one that was just exercised.
- **No worker or edge platform has been executed against.** They resolve the same substitutions a
  browser does, which is what the `bundle/browser-builtins` benchmark holds, but a bundle that
  reaches nothing forbidden is not a program that ran.
- **The long-polling loop is not exercised off Node**, only bundled.

Closing any of these means running against that runtime in continuous integration, which is the
honest way to turn an "expected" into a "run".
