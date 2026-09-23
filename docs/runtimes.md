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

**What a worker would have to do**, recorded so the work is not redesigned from scratch later:

- **Take the check, not the connection.** The only thing worth moving is the primality test: a
  2048-bit modulus in, a verdict out. Everything else about the handshake stays where it is,
  because moving the connection would put a socket, a store and a log behind a message channel.
- **Be optional, and detected rather than assumed.** A `Worker` exists in a browser and in some
  edge runtimes and not in others, and a bundle must not reach for one that is not there. No
  worker means the check runs where it runs now.
- **Be one module, loaded when a prime is first checked.** The startup budget in
  [performance.md](performance.md) §2 is the reason: a worker nobody needs must not be in the
  graph a program pays for by importing the framework.
- **Answer the same question the same way.** A verdict from a worker and a verdict from the main
  thread have to be the same verdict, so the test itself stays one implementation called from two
  places rather than two implementations.
- **Cache the answer, not the worker.** The result is already cached per prime; a worker that
  outlived the check would hold memory for something paid once per prime per process.
- **Say what it is for.** A refusal from a worker means the datacenter published a prime that
  fails the test — a security answer, not a transport one — so it must not be reported as a
  worker failure. A worker that cannot start is a worker that is not used, not a connection that
  fails.

Until that exists, the five seconds are real, they are paid on the first connection in a browser,
and this document says so rather than describing a plan as a property.

An application that hosts the whole account in a worker (§6) has already moved them: the check
runs on the worker's thread along with everything else, and the page stays responsive while it
does. The first connection still takes five seconds. What changes is who waits.

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
| Two accounts share one store without colliding | **run** | expected | expected | expected | **run** |
| A second run of one account is refused | **run** | expected | expected | expected | **run** |
| Stopping closes what was held | **run** | expected | expected | expected | **run** |
| Against Telegram itself | **not run**³ | **not run**³ | **not run**³ | **not run**³ | **not run**³ |

¹ The browser check talks to a datacenter over a real socket instead, which is a stronger claim
than the same peer reached in-process.

² An account ingests updates from a connection only once it is signed in — there is a place in the
update stream to keep, and an account with no authorization has none. Signing in needs credentials
this check does not have. The dispatch half is run in a browser; the ingestion half is not.

³ No credentials. Nothing in this repository has been pointed at Telegram's production network.

**Bun and Deno remain unexecuted.** Neither is installed on the machine this was developed on, so
every mark in those columns is inference from what the code reaches rather than a run. The
substitution table in §4.1 is what the inference rests on; §5.2 says what it does not cover.

### 5.1 How the browser column was established

`pnpm --filter @yuigram/browser-check serve` bundles the framework for a browser — with the
substitutions the packages declare, read from their own `package.json` rather than written into
the tool — serves it as a page, and answers the WebSocket the page opens with the same mock
datacenter the test suite uses. Nothing in the page is mocked: the cryptography is the page's, the
store is the origin's `localStorage`, and the connection is a real `WebSocket`.

The page reports what it did rather than only whether it passed, because a check that silently did
nothing would otherwise read as a pass. Nineteen checks, all passing in Chrome.

Two of those are about storage ownership, and they run against real `localStorage` rather than a
stand-in. That matters here more than elsewhere: a browser gives an origin one store, so two
accounts in a page share it whether or not they meant to, and what keeps them apart has to hold on
the storage the page actually has. The page also checks that the account it ran holds its keys
under its own area rather than at the root of the store.

Running it found three things the build could not: `process.version` read at module scope, which
made importing the framework throw in a browser before anything could run; `Buffer` doing the hex
and base64 on four live paths; and the five-second prime validation above.

### 5.2 What is still inference

- **Bun and Deno have not been executed against.** Neither is installed on the machine these
  measurements come from. Their columns are inference from the API list, and the browser result
  raises the confidence without replacing it: both provide `node:crypto`, so both take the
  platform path rather than the one that was just exercised.
- **No edge platform has been executed against** — Cloudflare Workers, Vercel Edge. They resolve the same substitutions a
  browser does, which is what the `bundle/browser-builtins` benchmark holds, but a bundle that
  reaches nothing forbidden is not a program that ran.
- **The long-polling loop is not exercised off Node**, only bundled.

Closing any of these means running against that runtime in continuous integration, which is the
honest way to turn an "expected" into a "run".


---

## 6. An account in a worker

`yuigram/worker` hosts an account on another thread and gives the thread that attached a proxy
for it. It is a separate entry point: importing `yuigram` creates no worker, installs no listener
and loads none of it, and the Bot API bundle does not reach it at all.

```ts
// worker.ts — owns the account
import { serveAccounts } from 'yuigram/worker'
serveAccounts({ create: (name, restore) => Account.fromString(restore ?? stored, { name, ... }) })

// page.ts — holds a port
import { attachAccount, openSharedWorker } from 'yuigram/worker'
const me = await attachAccount(openSharedWorker('/worker.js', { type: 'module' }), { account: 'me' })
me.on('message', (event) => event.reply('seen'))
```

[examples/15-worker](../examples/15-worker) is the same in Node, with a `worker_threads` worker.

### 6.1 Who owns what

**The host owns the accounts.** A caller names an account; it never supplies one. The host makes
each name once, through the factory it was given, however many callers ask at the same moment —
the second waits on the first one's factory call rather than starting its own. That is the whole
of why an account is never connected twice by one host: there is only ever one of it, and
connecting an account that is already connecting joins the attempt in progress.

**A caller holds a port.** Everything it has is on the other side: the socket, the keys, the
store, the session. `restore` — a session string — is handed to the factory on the call that makes
the account and to nothing else; a caller attaching to an account that already exists has its
`restore` ignored rather than applied over a running session.

**Leaving and stopping are different things.**

| | What happens | Who is affected |
| --- | --- | --- |
| `detach()` | This caller's calls are aborted, its callbacks refused, its streams closed and its handles released | This caller only |
| `stop()` | The account stops | Every caller attached to it, each told `stopped` |
| The last caller detaches | Whatever `onLastDetached` says: `'keep'` (the default), `'stop'`, or a function that decides | The account |
| A caller falls silent | Released after `expireAfter` (60 s), and told `expired` if it is still listening | That caller only |
| The host goes away | Every waiting call fails with `HostUnavailableError`, and the caller is told `host-lost` | Every caller of that host |

A host is noticed as gone three ways: the worker's own `error` or `exit`, the port's `close`
where the platform has one, and silence — a caller pings every `pingEvery` (10 s) and gives up
after `hostTimeout` (30 s) without an answer. The last is the one that always works, because a
terminated browser worker sends nothing at all.

Released handles are released by kind. Staying online or watching a chat is stopped, because
nobody is left to stop it. A mini app is closed. A streaming draft and a takeout session are left
as they are: finishing either is a decision — sent or abandoned, succeeded or failed — and the
host does not make it for a caller that is no longer there.

A page that closes is released on `pagehide`, unless the page went into the back-forward cache
and may come back. Pass `releaseOnPageHide: false` to leave that to expiry.

### 6.2 Which worker where

| Worker | Node 22+ | Bun | Deno | Browser | Workers / Edge |
| --- | --- | --- | --- | --- | --- |
| Dedicated — `workerEndpoint(worker)` | **run** | expected | expected | **run** | no |
| Shared — `openSharedWorker(url)` | n/a | n/a | n/a | **run**¹ | no |
| A port handed over by hand — `portEndpoint(port)` | **run** | expected | expected | **run** | no |

¹ Chrome, two browsing contexts of one origin attached to one `SharedWorker`. Firefox and Safari
provide `SharedWorker` and have not been run. Where a platform has none, `openSharedWorker` throws
a `ConfigError` rather than starting a dedicated worker per page instead: that would quietly
connect the account once per page, which is exactly what a shared host exists to prevent.

In Node, the host passes `parentPort` as the scope to serve. In a browser it passes nothing, and
tells a shared worker from a dedicated one by the scope it finds itself in.

**A worker has no `localStorage`**, so `web()` is not a store an account in a worker can use. An
account hosted there keeps what it learns in `memory()` or in a store the application supplies,
and survives a restart through its session string: export it, keep it where the page can, and
pass it as `restore` next time. The browser check does exactly that.

### 6.3 What crosses, and how

**Only what is listed.** The methods a caller may call are a fixed table, generated from the
account's own surface and checked on the host by exact name. There is no property traversal and
no dispatch by arbitrary name: `constructor`, `__proto__`, `surround` and anything else not in
the table are refused as a `ValidationError`. Three properties may be read — `name`, `state` and
`connected` — and nothing else may.

A few parts of an account stay on the caller's side, because they are about the caller rather
than the account: registering handlers and middleware, `api` and `call` (built there over one
raw-call message), `withParams`, and the web and Node stream shapes of a download, which are made
there over the iterator.

**Values.** Structured cloning carries `bigint`, `Uint8Array`, `Date`, `Map`, `Set`, arrays and
plain objects as they are. It does not carry prototypes, and nothing here pretends it does. The
seventeen entity views — `MessageView`, `UserView`, `ChatView` and the rest — cross as the raw
value they read and are built again on arrival, which is sound because every one of them is a
function of its raw value and nothing else. Any other class instance, a function, a symbol or a
cycle is refused, naming where in the value it was.

**Errors** cross as name, message and their own data fields, without the stack. The framework's
own classes are built again as the same class — `ConfigError`, `ValidationError`, `NetworkError`,
`AuthError`, `SessionError`, `StorageError`, `PeerError`, `CancelledError`, `LifecycleError`,
`TelegramError`, and `FloodError` with its `retryAfter` — so `instanceof` works on the caller's
side. Anything else arrives as a `RemoteError` that keeps the host's name and fields.

**Functions** cross only where a method takes one: the prompts of `signIn` and `signInQr`, the
sink of `downloadTo`, the reader of an upload's source. Each becomes a token valid for that one
call; the host calls back across, and the token is revoked when the call ends. A function
anywhere else is refused, on both sides.

**Iterators** are pulled with credit: the caller asks for eight items at a time by default, and
the host sends no further ahead than it was asked. Leaving a `for await` early closes the
iterator on the host.

**Handles** — a streaming draft, an open mini app, a takeout session, the function that stops
staying online — cross as a handle with a fixed list of methods and the fields it had.

**Bytes.** What the host sends as bytes — a download's result, a chunk of a download stream,
what a sink is handed — is copied into a buffer allocated for the purpose and that buffer is
transferred, so the host never gives away memory it still reads. Bytes going the other way are
cloned.

**Cancellation.** An `AbortSignal` in the arguments is replaced by one the host controls.
Aborting rejects the call on the caller's side at once and aborts it on the host, which forgets
it. That bounds what an abort promises: the caller stops waiting, and the host stops what can
still be stopped. An operation already past its point of no return — a message the server has
already accepted — finishes, and its result is discarded.

### 6.4 Updates

The host is the account's application. It surrounds the account's dispatch with one middleware
that forwards each update, in the order the account delivered it, to every caller that asked for
updates; the caller normalizes it and runs its own handlers. Replies and other actions go back
across as calls.

Each caller has its own window. The host lets up to `window` (1024) unacknowledged updates out to
a caller and holds up to `backlog` (8192) more; the caller acknowledges as it handles them. A
caller whose backlog overflows is told `lagged` and released. That is deliberate: an update is
never silently dropped from the middle of a caller's stream, and a caller that has fallen that
far behind is told so and let go rather than kept on a stream with a hole in it.

A slow caller delays only itself, and a handler that throws is logged on its own side and never
reaches the host, so neither affects another caller of the same account. Updates are not replayed
to a caller that attaches later.

### 6.5 Secrets

Sign-in prompts run on the caller's side — that is where the person typing a code is — and the
answer crosses to the host as the result of a callback. The protocol logs no arguments, results
or callback values. `exportSession` returns the session string to the caller because that is what
the method is for; the host itself never logs it.

### 6.6 What has been run

- **Protocol** — a host and a caller at either end of a real `MessageChannel`, so every value is
  genuinely cloned, with the account talking to in-process datacenters. These establish how the
  protocol behaves, not that it runs anywhere in particular, and are not counted as runtime
  results here.
- **Node, `worker_threads`** — the host on another thread: calls, a `FloodError` with its wait, an
  update pushed down the session in the other thread, a file streamed in order, one account shared
  by two callers and made once, cancellation, and a terminated worker failing every waiting call.
- **A browser, a dedicated `Worker`** — the key exchange and an encrypted call in the worker over
  a real WebSocket, a pushed update dispatched on the page, cancellation leaving nothing pending,
  a call after a stop refused as `LifecycleError`, a session exported and restored in a new worker
  with the same key, and a terminated worker failing its calls.
- **A browser, a `SharedWorker`** — the page and a second browsing context attached to one host:
  one account made once, one long-lived key at the datacenter, one update handled in both, one
  context closed and released with nothing left behind while the other still works, a second
  account kept apart on the same host, and a stop reaching every caller.

Not run: Bun, Deno, Firefox, Safari, any mobile browser, and Telegram itself.
