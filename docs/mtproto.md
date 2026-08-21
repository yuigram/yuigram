# MTProto Subsystem

Yuigram implements MTProto itself. This document is the implementation specification for that
subsystem — derived from Telegram's own protocol documentation, not from any existing client.

Reference point: **TL layer 223** — 2,315 schema entries, 552 error types.

**Position:** MTProto is not a dependency to be wrapped. It is a protocol to be implemented.
The engineering is substantial and is budgeted for; see [feasibility.md](feasibility.md).

---

## 1. Sources and method

The implementation is built **specification-first**:

| Source | Role |
|---|---|
| `core.telegram.org/mtproto/*` | **Normative.** Protocol description, auth key generation, security guidelines, transports, TL |
| `core.telegram.org/api/*` | **Normative.** Updates, datacenters, files, file references, SRP, PFS |
| `core.telegram.org/schema` | **Normative.** TL schema, layer-tagged |
| Existing clients (mtcute, Telethon, TDLib) | **Disambiguation only.** Consulted where the specification is silent or ambiguous, to learn *what Telegram actually does* |

This ordering is deliberate and matters for two reasons beyond preference.

**Correctness.** The specification states the invariants; a client implementation states one
author's reading of them. Where the two differ, the specification plus observed server
behaviour is the better authority.

**Independence.** Code written from a specification is independent work. Code written by
closely following another implementation is a derivative of it, whatever the licence permits.
Since independence is the objective, the specification is the input.

Where behaviour is genuinely undocumented — and there is a real amount of it, particularly
around error recovery and peer edge cases — the approach is: observe the server, write a test
that captures the behaviour, and record the finding in `docs/protocol-notes/`. Consulting
another client to understand *what* to test is legitimate; transcribing *how* it implements
the fix is not.

---

## 2. Subsystem structure

```
mtproto/
├── crypto/       AES-IGE, RSA+padding, factorization, primality, SRP, KDF
├── tl/           schema parser, code generator, binary codec runtime
├── transport/    framing (abridged/intermediate/padded/full), obfuscation
├── auth/         DH handshake, PFS temp keys, sign-in flows, 2FA
├── session/      msg_id, seq_no, acks, salts, containers, RPC lifecycle
├── network/      connection pool, DC map, migration, media/CDN routing
├── storage/      auth keys, salts, DC options, peers, update state
├── updates/      pts/qts/seq state machine, gap detection, difference recovery
├── peers/        access_hash lifecycle, min peers, resolution
├── files/        chunked upload/download, file references, CDN
└── normalize/    TL updates -> Yuigram events
```

Ordered bottom-up by dependency. Each layer is independently testable, which is the property
that makes the whole thing tractable.

---

## 3. Cryptography

Everything the protocol needs, and where it comes from.

| Primitive | Source | Notes |
|---|---|---|
| SHA-1, SHA-256, SHA-512 | `node:crypto` | Free |
| PBKDF2-HMAC-SHA512 | `node:crypto` | Used by SRP, 100,000 iterations |
| AES-256-CTR | `node:crypto` | Transport obfuscation |
| **AES-256-IGE** | **Own implementation** | Not in any standard library. ~100 lines over `aes-256-ecb`. |
| Modular exponentiation | Native `BigInt` | Removes the `long` dependency entirely |
| **RSA with Telegram padding** | **Own implementation** | Two schemes — see §3.2 |
| **PQ factorization** | **Own implementation** | Pollard's rho / Brent |
| **Miller-Rabin** | **Own implementation** | Safe-prime validation |
| **SRP 6a** | **Own implementation** | Telegram's variant — see §3.3 |
| CSPRNG | `crypto.randomBytes` | Mandatory for DH secrets |

### 3.1 AES-IGE

Infinite Garble Extension. Not in OpenSSL's public interface, not in `node:crypto`. Built
over ECB:

```
encrypt block i:  c[i] = E(m[i] XOR c[i-1]) XOR m[i-1]
decrypt block i:  m[i] = D(c[i] XOR m[i-1]) XOR c[i-1]
```

with `c[-1] = iv[0..16]` and `m[-1] = iv[16..32]`. Validated against known-answer vectors
before anything is built on top of it.

### 3.2 RSA padding

Telegram uses two schemes, selected by which server key fingerprint matched:

**`rsa_pad`** (current keys): pad the payload to 192 bytes with random data; reverse the byte
order; SHA-256 with a random temporary key; AES-256-IGE encrypt with a zero IV; XOR-adjust the
temp key; RSA-encrypt the 256-byte result. If the result is not less than the modulus, retry
with fresh randomness.

**Legacy** (old keys): SHA-1 of the payload, prepended, padded with random bytes to 255, then
raw RSA.

### 3.3 SRP for 2FA

Telegram's variant, `passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow`:

```
H(data)          = SHA256(data)
SH(data, salt)   = H(salt | data | salt)
PH1(pw, s1, s2)  = SH(SH(pw, s1), s2)
PH2(pw, s1, s2)  = SH(PBKDF2-SHA512(PH1(pw, s1, s2), s1, 100000), s2)
x                = PH2(password, salt1, salt2)

v    = g^x mod p
k    = H(p | g)
a    = random 2048-bit
g_a  = g^a mod p
u    = H(g_a | g_b)
k_v  = (k * v) mod p
t    = (g_b - k_v) mod p          -- positive modulo
s_a  = t^(a + u*x) mod p
k_a  = H(s_a)
M1   = H(H(p) XOR H(g) | H(salt1) | H(salt2) | g_a | g_b | k_a)
```

Sent as `InputCheckPasswordSRP { srp_id, A: g_a, M1 }`.

**Mandatory before use:** validate that `p` is a safe prime and `g` generates the correct
subgroup — the same checks as §5.2. Skipping them on the password path is a real
vulnerability, not a shortcut.

### 3.4 Server RSA keys

Taken from Telegram's **published MTProto documentation**, matched by fingerprint at runtime.

Deliberately **not** extracted from Telegram Desktop or Android source, both of which are
GPL-licensed. The keys are public data and the documentation is a clean source; there is no
reason to acquire them from a copyleft codebase. See [licensing.md](licensing.md) §5.

---

## 4. TL: schema, codegen and codec

### 4.1 Grammar

```
name#id  arg:Type  arg2:flags.3?Type  = ResultType;
```

The parser must handle:

| Feature | Rule |
|---|---|
| Constructor id | `CRC32` of the canonical signature with `;` and parentheses removed — computed, then verified against any explicit `#id` |
| **Flags** | `flags:#` declares a bitfield; `field:flags.N?T` is present only when bit `N` is set |
| **Conditional `true`** | `field:flags.N?true` occupies **no bytes** — the flag bit *is* the value |
| Bare vs boxed | `%Type` or a lowercase constructor reference omits the leading constructor id |
| Vectors | `Vector<T>` is boxed with id `0x1cb5c415`; bare vectors omit it |
| Namespaces | `messages.sendMessage` — dotted, must map to nested TypeScript namespaces |
| Generic functions | `invokeWithLayer`, `invokeAfterMsg` — need special handling |

The two that break naive parsers are conditional `true` (a field that serializes to nothing)
and bare vectors inside otherwise-boxed structures. Both are covered by round-trip tests
against the full schema.

### 4.2 Binary format

| Type | Encoding |
|---|---|
| `int` | 4 bytes, little-endian |
| `long` | 8 bytes, LE — **native `BigInt`**, not a `Long` class |
| `int128` / `int256` | 16 / 32 raw bytes |
| `double` | 8 bytes, IEEE-754 LE |
| `string` / `bytes` | len ≤ 253: `[len][data][pad to 4]`; len ≥ 254: `[0xFE][len:3][data][pad to 4]` |
| `Vector<T>` | `[0x1cb5c415][count:4][items…]` |
| boxed | `[constructor_id:4][fields…]` |
| bare | `[fields…]` |

### 4.3 Generation pipeline

```
core.telegram.org/schema (layer N)
        │
   [ own TL parser ]
        │
   tl/schema.<layer>.json         committed, layer-tagged
        │
   [ emitters ]
        ├─> types.d.ts       split by TL namespace (see performance.md §5)
        ├─> reader.ts        constructor id -> deserializer
        ├─> writer.ts        constructor id -> serializer
        └─> errors.ts        552 typed error classes
```

Schema snapshots are committed, so builds are reproducible offline and a layer bump is a
reviewable diff.

**Verification:** every constructor round-trips (serialize → deserialize → deep-equal) as a
generated test. With 2,315 entries, this is the only realistic way to know the codec is
correct, and it catches flag-handling bugs immediately.

---

## 5. Authorization

### 5.1 DH handshake

Per `core.telegram.org/mtproto/auth_key`:

```
1.  client -> req_pq_multi{nonce:int128}
2.  server -> resPQ{nonce, server_nonce, pq, server_public_key_fingerprints}
3.  client    factorize pq = p*q  (p < q)
4.  client    build p_q_inner_data_dc{pq,p,q,nonce,server_nonce,new_nonce:int256,dc}
5.  client    encrypted_data = RSA_PAD(serialize(inner), server_key)
6.  client -> req_DH_params{nonce, server_nonce, p, q, fingerprint, encrypted_data}
7.  server -> server_DH_params_ok{nonce, server_nonce, encrypted_answer}
8.  client    tmp_aes_key/iv from new_nonce + server_nonce   (below)
              decrypt AES-IGE -> [sha1:20][server_DH_inner_data][padding]
9.  client    validate dh_prime, g, g_a                       (§5.2 — mandatory)
10. client    b = random 2048-bit;  g_b = g^b mod dh_prime
11. client -> set_client_DH_params{nonce, server_nonce, encrypted(client_DH_inner_data)}
12. server -> dh_gen_ok | dh_gen_retry | dh_gen_fail
13. both      auth_key = g_a^b mod dh_prime
```

Key derivation for step 8:

```
tmp_aes_key = SHA1(new_nonce | server_nonce) | SHA1(server_nonce | new_nonce)[0..12]
tmp_aes_iv  = SHA1(server_nonce | new_nonce)[12..20] | SHA1(new_nonce | new_nonce)
              | new_nonce[0..4]
```

Derived identifiers:

```
auth_key_id       = SHA1(auth_key)[12..20]      -- low 64 bits
auth_key_aux_hash = SHA1(auth_key)[0..8]        -- high 64 bits
new_nonce_hash{n} = SHA1(new_nonce | n | auth_key_aux_hash)[4..20]   -- n in {1,2,3}
server_salt       = new_nonce[0..8] XOR server_nonce[0..8]
```

### 5.2 Mandatory security checks

From `core.telegram.org/mtproto/security_guidelines`. **None of these is optional and none is
configurable off** — a switch that disables a security check is a switch that ends up disabled
in production.

**DH parameters:**
- `dh_prime` is prime **and** `(dh_prime-1)/2` is prime (safe prime), via Miller-Rabin
- `2^2047 < dh_prime < 2^2048`
- `g` generates a subgroup of prime order `(p-1)/2`, checked by the `g`-specific congruence
  (`p mod 8 = 7` for `g=2`, `p mod 3 = 2` for `g=3`, and so on)
- `1 < g, g_a, g_b < dh_prime - 1`
- additionally `2^1984 < g_a, g_b < dh_prime - 2^1984`
- **cache the validation result** for a known-good prime; cache the outcome, never bypass the
  check

**Handshake integrity:**
- first 20 bytes of the decrypted answer equal `SHA1` of the remainder without padding
- `nonce`, `server_nonce`, `new_nonce` match the values from this protocol run
- `pq` is composite (reject a prime `pq`)
- DH secrets `a`, `b` come from a CSPRNG

**Every encrypted message:**
- recompute and compare `msg_key`, **even when an earlier error occurred** — this is a timing
  and oracle concern, so the check runs unconditionally
- decrypted length ≤ plaintext size; padding within 12–1024; length divisible by 4 and
  non-negative
- `session_id` matches an active session
- `msg_id` parity correct for direction; not a duplicate; not lower than recently seen
- reject `msg_id` more than 30 s in the future or 300 s in the past

On any failure: **discard the message entirely** and reconnect.

All comparisons on secret-derived material use constant-time equality.

### 5.3 Perfect forward secrecy

Temporary auth keys via `p_q_inner_data_temp_dc` with `expires_in`, bound to the permanent key
with `auth.bindTempAuthKey`. Re-negotiated before expiry. Per DC, indexed, with expiry stored.

### 5.4 Sign-in flows

| Flow | Path |
|---|---|
| Phone | `auth.sendCode` → `auth.signIn` → `auth.checkPassword` (if 2FA) |
| Bot | `auth.importBotAuthorization` |
| QR | `auth.exportLoginToken` → poll / `updateLoginToken` → `auth.importLoginToken` |
| Session resume | Load auth key from storage; no handshake needed |

`PHONE_MIGRATE_X` and `NETWORK_MIGRATE_X` during sign-in redirect to another DC (§8).

---

## 6. Session layer

The encrypted message layer, per `core.telegram.org/mtproto/description`.

### 6.1 Message format

```
outer:   [auth_key_id:8][msg_key:16][encrypted_data:…]

msg_key = SHA256( auth_key[88+x .. 120+x] | plaintext )[8..24]      -- middle 128 bits

sha256_a = SHA256(msg_key | auth_key[x .. x+36])
sha256_b = SHA256(auth_key[40+x .. 76+x] | msg_key)
aes_key  = sha256_a[0..8]  | sha256_b[8..24]  | sha256_a[24..32]
aes_iv   = sha256_b[0..8]  | sha256_a[8..24]  | sha256_b[24..32]
                                        x = 0 client->server, x = 8 server->client

plaintext: [salt:8][session_id:8][msg_id:8][seq_no:4][length:4][body][padding:12..1024]
```

Padding is random, 12–1024 bytes, total length divisible by 16.

### 6.2 Message identifiers

`msg_id ≈ unixtime * 2^32`, monotonically increasing, with the low 32 bits carrying the
fractional second and never zero.

| Origin | `msg_id mod 4` |
|---|---|
| Client | 0 |
| Server response | 1 |
| Server-initiated | 3 |

`seq_no` is `2 × (content-related messages sent before this one)`, `+1` if this message is
itself content-related. Getting this wrong causes the server to silently drop messages, so it
is covered by explicit tests.

Time offset is learned from `server_DH_inner_data.server_time` and from
`bad_msg_notification`, and applied to every subsequent `msg_id`. **Never trust the local
clock** — a user with a skewed clock is a common, real condition.

### 6.3 What the session must handle

| Message | Response |
|---|---|
| `rpc_result` | Route to the pending request; unwrap `gzip_packed`; map `rpc_error` |
| `msg_container` | Unpack and process recursively |
| `msgs_ack` | Mark sent messages acknowledged |
| `bad_server_salt` | Adopt the new salt, resend — happens roughly hourly |
| `bad_msg_notification` | Correct time offset or seq_no by error code, resend |
| `new_session_created` | Reset session state, adopt salt, notify updates layer of a possible gap |
| `pong` | Liveness, RTT measurement |
| `msgs_state_req` / `msgs_state_info` | Delivery reconciliation |
| `future_salts` | Prefetch upcoming salts |
| `gzip_packed` | Transparent decompression, bounded |
| `updates*` | Forward to the updates manager |

Outgoing responsibilities: acknowledgement tracking with resend, batching into containers,
`invokeAfterMsg` chaining for ordered calls, per-request timeout and cancellation, and
resend-on-reconnect for unacknowledged messages.

**This layer is where silent message loss originates.** Omitting acknowledgement tracking or
`bad_msg_notification` handling produces a client that works in testing and drops messages in
production. It is built with a mock server that can inject each of these conditions
deliberately.

---

## 7. Transport

Four framings, per `core.telegram.org/mtproto/mtproto-transports`:

| Transport | Init | Frame |
|---|---|---|
| Abridged | `0xef` | `len/4 < 127`: `[len:1][payload]`; else `[0x7f][len:3][payload]` |
| Intermediate | `0xeeeeeeee` | `[len:4][payload]` |
| Padded intermediate | `0xdddddddd` | `[len:4][payload][pad:0..15]` |
| Full | — | `[len:4][seq:4][payload][crc32:4]` |

**Default: intermediate** — 4 bytes of overhead, no CRC to maintain, and the best-supported
option. Padded intermediate is available where traffic-shape obfuscation matters.

### Obfuscation

A 64-byte init packet, AES-256-CTR:

- bytes 0–55: random, avoiding sequences that collide with protocol identifiers
- bytes 56–59: transport tag
- bytes 60–63: DC id, signed 16-bit LE (MTProxy)

Encryption key/IV from bytes 8–40 and 40–56 of the payload; decryption key/IV from the same
offsets of the byte-reversed copy; both hashed with the proxy secret when one is used. The
packet encrypts itself, and bytes 56–63 of the ciphertext replace the plaintext at those
positions.

Transports sit behind an interface, so TCP, MTProxy, WebSocket and test transports are
interchangeable.

---

## 8. Network and datacenters

DC list from `help.getConfig` → `dcOption { id, ip_address, port, flags }`, with
`media_only`, `cdn`, `tcpo_only`, `static`. Bootstrap addresses are compiled in; the live list
replaces them after the first `getConfig`.

### Migration

| Error | Meaning | Action |
|---|---|---|
| `PHONE_MIGRATE_X` | Account belongs to DC X | Reconnect, restart sign-in there |
| `NETWORK_MIGRATE_X` | Network suggests DC X | Reconnect |
| `USER_MIGRATE_X` | Account moved | Reconnect, transfer authorization, retry |
| `FILE_MIGRATE_X` | File lives on DC X | Route this transfer to DC X |

Authorization transfer:

```
on current DC:  auth.exportAuthorization(dc_id) -> { id, bytes }
on target DC:   auth.importAuthorization(id, bytes)
```

Each DC keeps its own auth key, salts and temp keys.

### Connection pools

Per DC, sized by purpose — a single connection cannot serve interactive RPC and a multi-part
file transfer simultaneously without one starving the other:

| Pool | Count | Purpose |
|---|---|---|
| main | 1 | RPC and updates |
| upload | up to 8 | Parallel upload parts |
| download | up to 8 | Parallel download parts |
| download-small | 1–2 | Thumbnails, small media |

File-transfer connections use **separate `session_id` values over the same auth key**, as the
documentation recommends: they carry no updates and need no re-authorization, and they keep
bulk transfer from interfering with the update stream.

---

## 9. Updates

The hardest subsystem. Implemented directly from `core.telegram.org/api/updates`.

### 9.1 State

```
common box:   local_pts, local_qts, local_seq, local_date
per channel:  local_pts[channel_id]
```

Three independent sequence spaces: the common box (private chats and basic groups), one box
per channel/supergroup, and `qts` for secret chats and certain bot events.

### 9.2 Gap algorithm

For a `pts`-bearing update:

```
if      local_pts + pts_count == pts   -> apply;  local_pts = pts
else if local_pts + pts_count >  pts   -> ignore (already applied)
else                                   -> GAP: postpone, recover
```

For top-level `seq`:

```
if      seq_start == 0                 -> apply immediately (unordered)
else if local_seq + 1 == seq_start     -> apply;  local_seq = seq
else if local_seq + 1 >  seq_start     -> ignore
else                                   -> GAP: recover
```

`qts` behaves as `pts` with `qts_count` always 1.

### 9.3 Gap recovery

1. On a gap, **wait up to 0.5 s** — the documentation notes the server may simply have
   reordered, and the missing update often arrives. This avoids a difference call on every
   transient reorder.
2. If unresolved: `updates.getDifference` (common box) or
   `updates.getChannelDifference` (that channel).
3. Buffer incoming updates for the affected box while recovering.
4. Apply retrieved updates in order; drain the buffer; resume.
5. `getChannelDifference` paginates — repeat until the `final` flag is set.
6. `updatesTooLong` means the queue overflowed: run `getDifference` normally.
7. `differenceTooLong` means the box is too far behind: reset that box's state.
8. `CHANNEL_PRIVATE` means the channel is gone — stop trying, and invalidate only when an
   `updateChannel` arrives for it.

### 9.4 Deduplication

Updates already observed as RPC results must not be dispatched twice. A bounded
**no-dispatch index** of recently-applied message identities is consulted before emitting,
because `getDifference` legitimately returns messages already seen through the normal stream.

### 9.5 Testing

This subsystem cannot be validated against the live network — the interesting cases are
precisely the ones that occur rarely and unpredictably. It is therefore built against a
**deterministic mock server** able to produce, on demand: reordering, gaps, duplicates,
`updatesTooLong`, `differenceTooLong`, `CHANNEL_PRIVATE`, `new_session_created` mid-stream,
and channel `pts` divergence.

The mock server is written **before** the updates manager. That ordering is not optional; an
updates manager tested only against a well-behaved server is an updates manager that has not
been tested.

---

## 10. Peers and access hashes

MTProto identifies a peer by `(id, access_hash)`. The hash is **per-account and
non-derivable**: a client that has never encountered a peer cannot construct a reference to
it.

### Requirements

- Harvest peers from **every** update and RPC result that carries `users` / `chats` arrays.
- Persist to an indexed store — by id, by username, by phone.
- Handle **`min` constructors**: peers that arrive without a usable `access_hash`, valid only
  in the context they arrived in. They must never overwrite a full cached peer, and resolving
  them requires the context peer (`inputPeerUserFromMessage` and relatives).
- Resolve `@username` via `contacts.resolveUsername`, then cache.
- Surface an honest `PeerError` when a peer cannot be resolved — never fabricate a hash, and
  never silently fail.

The `min`-peer rule is the one most often got wrong: overwriting a good cached hash with a
`min` placeholder degrades the cache permanently and produces failures far from the cause.

---

## 11. Files

### Upload

| Rule | Value |
|---|---|
| `part_size % 1024 == 0` and `524288 % part_size == 0` | 512 KB recommended |
| < 10 MB | `upload.saveFilePart` |
| ≥ 10 MB | `upload.saveBigFilePart` |
| Unknown length (streams) | Always big-file path; `file_total_parts = -1` until the last part |
| Max parts | `upload_max_fileparts_default` / `_premium` from config |

### Download

`upload.getFile(location, offset, limit)`, with alignment rules:

| Mode | Offset | Limit | Constraint |
|---|---|---|---|
| Normal | divisible by 4 KB | divisible by 4 KB, divides 1 MB | must not straddle a 1 MB boundary |
| `precise` | divisible by 1 KB | divisible by 1 KB, ≤ 1 MB | same |

Route to the media DC when `dcOption.media_only` is available for the target DC.

### CDN

`upload.getFile` may return `upload.fileCdnRedirect { dc_id, file_token, encryption_key,
encryption_iv, file_hashes }`. Fetch from the CDN DC, decrypt with AES-CTR, and **verify the
SHA-256 hashes** — CDN nodes are not operated by Telegram, so hash verification is a
correctness and integrity requirement, not an optimization.

### File references

Per `core.telegram.org/api/file-references`, two tables are maintained:

```
file_id -> file_reference bytes
file_id -> origin  (message | story | webpage | profile photo | …)
```

On `FILE_REFERENCE_EXPIRED` / `FILE_REFERENCE_INVALID`: look up the origin, refetch it
(the message, the story, the profile), extract the refreshed reference, retry once.

This must be **automatic and invisible**. A user who has to catch a reference error and
manually refetch a message has been handed a protocol detail that the framework exists to
absorb.

---

## 12. Build order

Strictly bottom-up. Each stage is fully tested before the next begins, because a defect in a
lower layer is diagnosed from symptoms several layers up.

| # | Stage | Gate |
|---|---|---|
| 1 | Crypto primitives | Known-answer vectors for AES-IGE, RSA padding, SRP, factorization |
| 2 | TL parser + generator | Full schema parses; every constructor round-trips |
| 3 | Transport + obfuscation | Frames round-trip; connects to a test DC |
| 4 | Auth handshake | Real auth key obtained from Telegram's test DCs; all §5.2 checks enforced |
| 5 | Session layer | RPC against test DCs; mock server injects every error condition |
| 6 | Storage | Auth keys, salts, peers persist and reload |
| 7 | DC pool + migration | Migration errors handled; authorization transfers |
| 8 | Sign-in flows | Phone, 2FA, bot, QR, resume |
| 9 | Peers | Cache, `min` resolution, username resolution |
| 10 | **Updates manager** | **Mock server first**, then the manager against it |
| 11 | Files | Chunked transfer, CDN, reference refresh |
| 12 | Normalizer | TL updates → Yuigram events |

Telegram provides **test datacenters** (`149.154.167.40:443`, DC 2, reached with a test-mode
flag), which allow stages 4–8 to be developed against real servers using test-only accounts.
This is a significant de-risking opportunity and is used from stage 4 onward.

---

## 13. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Updates manager correctness** | **Extreme** | Deterministic mock server built first; recorded-session replay; every branch of §9.2 tested explicitly |
| **Session-layer message loss** | **High** | Mock server injects `bad_server_salt`, `bad_msg_notification`, `new_session_created`; ack tracking verified |
| Crypto implementation error | **High** | Known-answer vectors; constant-time comparison; no invented crypto; §5.2 non-bypassable |
| Peer / file-reference long tail | **High** | Explicit peer model from day one; origin tracking built in, not retrofitted |
| TL codec edge cases | Medium | Round-trip test over all 2,315 constructors |
| Protocol change by Telegram | Medium | Layer-tagged committed schemas; a layer bump is a reviewable diff |
| Undocumented server behaviour | **High** | Test-DC experimentation; findings recorded in `docs/protocol-notes/` |
| Generated `.d.ts` size | Medium | Split by TL namespace; measured budget |
| Account bans for users | High (product) | Documentation duty of care — see [security.md](security.md) §7 |

---

## 14. Honest assessment

A correct, independent MTProto implementation is **12–24 months of sustained work** to reach
production quality, and the last 20% — peer edge cases, file references, update gaps under
real traffic — takes longer than the first 80%.

That is the cost of the stated objective, and it is accepted rather than worked around. What
makes it tractable rather than merely long:

- **The protocol is fully documented.** Every algorithm in this document came from Telegram's
  own specification. Nothing here is reverse-engineered.
- **Test datacenters exist.** Stages 4–8 develop against real servers without risking a real
  account.
- **The layering is testable.** Crypto and TL are pure functions over bytes, verifiable
  exhaustively offline. The session and updates layers are verifiable against a mock server
  that can inject conditions the live network produces only rarely.
- **Scope is controlled at the top, not the bottom.** The protocol layers must be complete and
  correct. The *high-level surface* above them is demand-driven, with `user.api` covering
  everything not yet wrapped.

The distinction in that last point is the one that matters. Depth of the protocol
implementation is non-negotiable. Breadth of convenience wrappers is a scheduling decision.
