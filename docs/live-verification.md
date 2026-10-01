# Live verification

Everything else in this repository is verified without Telegram: a mock Bot API transport, a
stand-in datacenter that speaks the real protocol over real sockets, a browser page and the
runtime matrix against that datacenter. What none of them can show is that Telegram itself
agrees. This is the checklist for finding out, and `tools/live` is the harness that runs it.

**It has not been run.** Every step below is prepared and exercised offline against stand-ins;
none has reached Telegram. A record of a real run goes at the end of this document, with the
revision it was made at.

---

## 1. What each step does to the account

The steps are kept apart by what they change, and each needs a variable of its own set to `1`.
Nothing runs because something else did.

| Step | Command | Changes on Telegram's side | Opt-in |
| --- | --- | --- | --- |
| Sign in | `login` | **Creates an authorization**: a new long-lived key, and a new entry among the account's active sessions. The code Telegram sends is a login message in the account's service chat. | `YUIGRAM_LIVE_ALLOW_LOGIN=1` |
| Bot reads | `live` | Nothing. `getMe`, `getWebhookInfo`, `getMyCommands`. | none beyond naming the check |
| Session checks | `live` | **Not read-only.** Connecting as the account binds a new temporary key and records this client — application id, device, system — in the account's active sessions. No message is sent, edited or deleted. | `YUIGRAM_LIVE_ALLOW_SESSION=1` |
| Writes | `live` | Sends, edits and deletes in the chats named, and undoes each. | `YUIGRAM_LIVE_ALLOW_WRITES=1`, and `YUIGRAM_LIVE_ALLOW_SESSION=1` for account writes |
| Sign out | `logout` | **Ends the authorization** the session string holds; the string is useless afterwards. | `YUIGRAM_LIVE_ALLOW_LOGOUT=1` |

## 2. Before running

**Pick one environment and keep everything in it.** Telegram runs a separate test environment
with its own accounts, chats and bots, and nothing crosses between it and production: a test
account cannot join a production group, and a production bot cannot write to a test one. One
variable, `YUIGRAM_LIVE_TEST_NETWORK`, puts both the account and the bot on the test environment;
unset, both are on production.

| | Test environment (`YUIGRAM_LIVE_TEST_NETWORK=1`) — preferred | Production (unset) |
| --- | --- | --- |
| Bot API | `https://api.telegram.org/bot<token>/test/<method>`, with a token from the test environment's @BotFather | `https://api.telegram.org/bot<token>/<method>`, with an ordinary token |
| MTProto | the test datacenters' addresses and server key, as Telegram's MTProto documentation publishes them | the production addresses and key |
| Accounts | disposable `+99966 X YYYY` numbers (below) | a real number, and a real account |
| What a run changes | the test environment only | real accounts and chats |

| Need | Why |
| --- | --- |
| A **test account**, never a person's own | Every account step acts as it. |
| A **bot** made with the chosen environment's @BotFather | The bot checks call the Bot API with its token. |
| A **public group** in the same environment, with a username, holding both | The update check has the bot write there where the account hears it; the mention check writes there as the account. Both chat variables name it by `@username`, which both clients resolve. |
| **Telegram's server keys** for that environment, as PEM | An account refuses a datacenter whose key it does not hold — at the first call, with an error naming the fingerprints offered. |
| An **application id and hash** | From my.telegram.org; the same pair serves both environments. |
| A **second test account** that a person operates in an official client, for one step | The reader's stop: the person taps stop on a stream into their private chat with the test account. Named by `@username`. |

**Test environment accounts.** Telegram's documentation describes test numbers of the form
`+99966 X YYYY` — `X` the datacenter, `YYYY` any four digits — which need no SIM: the login code
is `X` repeated five times, and the account may have to be registered on first use with an
official client signed in to the test environment, since `login` does not register numbers. The
group and the bot's membership in it are set up the same way, from that client.

`login` asks for that code at the terminal like any other. Only `account.startTest()` builds one,
and only for a reserved number: `X` repeated to the length Telegram states when it sends the code,
or five times where the answer states no length. A stated length outside 1–16 is refused before a
sign-in attempt is spent. That rule is checked against recorded answers only; that the test
datacenters state five, and accept the code built from it, needs a run against them.

The session string, the token and the api hash are secrets; the phone number is treated as one.
Keep them in a file outside the repository, readable only by its owner, and load it into the
shell that runs the steps — never in shell history, a ticket or a message, and never pasted into
a conversation. The code and the password are **never** variables: `login` asks for them at the
terminal, and the password is read without being echoed.

## 3. The variables

| Variable | For | Secret |
| --- | --- | --- |
| `YUIGRAM_LIVE_CHECKS` | Comma-separated check ids for `live`. **Nothing runs without it**, and there is no "all". | no |
| `YUIGRAM_LIVE_ALLOW_SESSION` | `1` to allow checks that connect as the account. | no |
| `YUIGRAM_LIVE_ALLOW_WRITES` | `1` to allow checks that send, edit or delete. A write check must also be named. | no |
| `YUIGRAM_LIVE_ALLOW_LOGIN` | `1` to run `login`. | no |
| `YUIGRAM_LIVE_ALLOW_LOGOUT` | `1` to run `logout`. | no |
| `YUIGRAM_LIVE_BOT_TOKEN` | The bot's token, from the chosen environment's @BotFather. | yes |
| `YUIGRAM_LIVE_BOT_CHAT` | Where the bot may write: the group, as `@username`. | no |
| `YUIGRAM_LIVE_API_ID`, `YUIGRAM_LIVE_API_HASH` | The application's id and hash. | the hash |
| `YUIGRAM_LIVE_PHONE` | The test account's number, for `login`. | yes |
| `YUIGRAM_LIVE_SESSION_OUT` | Where `login` writes the session. Must not exist; created readable by its owner only. | the file is |
| `YUIGRAM_LIVE_SESSION` | The session string, for `live` and `logout`. | yes |
| `YUIGRAM_LIVE_SESSION_FORMAT` | `portable` (default) or `tl-v3`, for both writing and reading it. | no |
| `YUIGRAM_LIVE_SERVER_KEYS` | Path to the server keys PEM. | no |
| `YUIGRAM_LIVE_DC` | `id@host:port` of the account's datacenter. Required for `login`, and for a `portable` session, which carries no address. | no |
| `YUIGRAM_LIVE_TEST_NETWORK` | `1` to put the account **and** the bot on the test environment; the keys, addresses and token must then be the test environment's. | no |
| `YUIGRAM_LIVE_ACCOUNT_CHAT` | Where the account may write besides its Saved Messages: the same group, as `@username`. | no |
| `YUIGRAM_LIVE_READER` | The second test account's `@username`, for `account.stream-stop`. | no |

An account for `live` is configured when id, hash, session and keys are all set; half of them is an
error naming what is missing, never a value. A check needing something not configured, or not
allowed, is refused with the reason, not skipped silently.

## 4. Running, in order

The smallest useful first run, in the order that keeps each step's effect small. The settings go
in a file outside the repository once, so each step adds only what it allows and names:

```bash
# ~/yuigram-live.env — chmod 600; never committed, never pasted anywhere
YUIGRAM_LIVE_TEST_NETWORK=1
YUIGRAM_LIVE_API_ID=…
YUIGRAM_LIVE_API_HASH=…
YUIGRAM_LIVE_SERVER_KEYS=/path/to/test-keys.pem
YUIGRAM_LIVE_DC=2@…:443
YUIGRAM_LIVE_PHONE=+99966…
YUIGRAM_LIVE_SESSION_OUT=/path/outside/the/repository/session.txt
YUIGRAM_LIVE_BOT_TOKEN=…
YUIGRAM_LIVE_BOT_CHAT=@the_test_group
YUIGRAM_LIVE_ACCOUNT_CHAT=@the_test_group
YUIGRAM_LIVE_READER=@the_second_test_account
```

```bash
set -a; . ~/yuigram-live.env; set +a
```

| # | Step | Command | Expected |
| --- | --- | --- | --- |
| 1 | List the checks; connects to nothing | `pnpm --filter @yuigram/live live --list` | every check with its tier and needs, then the variables; exit 0 |
| 2 | **Sign in** — creates an authorization | `YUIGRAM_LIVE_ALLOW_LOGIN=1 pnpm --filter @yuigram/live login` | `a code was sent to the account`, `code: ` (and a hidden `password: ` if the account has one), then `signed in; the session (N characters) was written to …`; exit 0 |
| 3 | Load the session, printing nothing | `export YUIGRAM_LIVE_SESSION="$(cat "$YUIGRAM_LIVE_SESSION_OUT")"` | no output |
| 4 | Connection and identity | `YUIGRAM_LIVE_ALLOW_SESSION=1 YUIGRAM_LIVE_CHECKS=account.connect,account.identity pnpm --filter @yuigram/live live` | `PASSED account.connect` with `this_dc N`; `PASSED account.identity` with `id …NNN, bot false` |
| 5 | Session restoration, in a new process | `YUIGRAM_LIVE_ALLOW_SESSION=1 YUIGRAM_LIVE_CHECKS=account.session,account.connect pnpm --filter @yuigram/live live` | `PASSED account.session` with `same key true`; `PASSED account.connect`. In an official client, the account's active sessions still show one entry for this application — the session was restored, not created again |
| 6 | Bot reads | `YUIGRAM_LIVE_CHECKS=bot.identity,bot.webhook,bot.commands pnpm --filter @yuigram/live live` | `PASSED bot.identity` with `is_bot true, username present true`; the other two `PASSED` |
| 7 | Messaging and incoming updates | `YUIGRAM_LIVE_ALLOW_SESSION=1 YUIGRAM_LIVE_ALLOW_WRITES=1 YUIGRAM_LIVE_CHECKS=bot.message,account.saved,bot-account.update pnpm --filter @yuigram/live live` | `sent message N`, `edited`, `deleted true`; `sent true, newest is it true`; `heard true` — each `PASSED` |
| 8 | Upload and download | `YUIGRAM_LIVE_ALLOW_SESSION=1 YUIGRAM_LIVE_ALLOW_WRITES=1 YUIGRAM_LIVE_CHECKS=bot.file,account.file pnpm --filter @yuigram/live live` | both `PASSED` with `uploaded 4000 bytes, downloaded 4000, identical` |
| 9 | Mention, draft, stream stopped by abort | `YUIGRAM_LIVE_ALLOW_SESSION=1 YUIGRAM_LIVE_ALLOW_WRITES=1 YUIGRAM_LIVE_CHECKS=account.mention,account.draft,account.stream pnpm --filter @yuigram/live live` | `sent true, read back true`; `draft kept`, `draft cleared`; `drafts N, aborted true, messages M` — each `PASSED` |
| 10 | Stream stopped by its reader — a person taps stop within 60 seconds | `YUIGRAM_LIVE_ALLOW_SESSION=1 YUIGRAM_LIVE_ALLOW_WRITES=1 YUIGRAM_LIVE_CHECKS=account.stream-stop pnpm --filter @yuigram/live live` | `streaming; the reader has 60 seconds to tap stop`, then `drafts N, stopped true, messages 0` and `PASSED`; nobody stopping it is `FAILED` with `expected: the reader stopped the stream` |
| 11 | **Sign out** — ends the authorization | `YUIGRAM_LIVE_ALLOW_LOGOUT=1 pnpm --filter @yuigram/live logout` | `signed out; the authorization the session held is ended, and the string is now useless`; exit 0 |
| 12 | Remove the session | `rm "$YUIGRAM_LIVE_SESSION_OUT"; unset YUIGRAM_LIVE_SESSION` | no output; then §6's checks by hand |

A step that fails stops the sequence there: the report names what was observed, and a step after
it would be checking something the failure already put in doubt.

Each `live` check prints one line — `PASSED`, `FAILED` or `REFUSED`, its id and its time — and what
it observed, scrubbed. The exit code is `0` only when every named check passed, `1` when one
failed or was refused, and `2` when nothing could be run. `login` and `logout` exit `2` when
refused before connecting and `1` when they fail after.

## 5. The checks

| Check | Tier | Does | A pass looks like |
| --- | --- | --- | --- |
| `bot.identity` | read | `getMe` | `is_bot true`, a username |
| `bot.webhook` | read | `getWebhookInfo` | an answer; whether a webhook is set is reported, never changed |
| `bot.commands` | read | `getMyCommands` | a list, possibly empty |
| `account.connect` | session | connect with the session, `help.getConfig` | a configuration naming a datacenter; no new long-lived key (the session carried one) |
| `account.identity` | session | the account reads its own user | an identifier, shortened; whether it is a bot |
| `account.dialogs` | session | walk at most one conversation | at most one, no error |
| `account.session` | session | export the session in both layouts and read each back | both carry the same key and datacenter; only lengths are printed |

Writes register the undoing of what they did before doing the next thing, and every undo runs —
newest first — whether the check passed, failed or threw. A failed undo fails the check.

| Check | Writes where | Does | A pass looks like | Leaves behind |
| --- | --- | --- | --- | --- |
| `bot.message` | the bot chat | send, edit, delete one message | a message id; the edit and the deletion accepted | nothing |
| `account.saved` | Saved Messages | send one message, read the newest back, delete | the newest is the one sent | nothing |
| `account.draft` | Saved Messages | keep a draft, clear it | both accepted | nothing |
| `account.mention` | the account chat | send a message mentioning the account's own username, read it back | it reads back as sent | nothing |
| `account.stream` | Saved Messages | stream text as drafts, then abort before the end | drafts shown; the result says aborted | nothing: anything it sent is deleted |
| `account.stream-stop` | the reader's private chat | stream a piece every two seconds for up to a minute, which the reader may stop | `stopped true` | nothing: anything it sent is deleted |
| `bot.file` | the bot chat | send a fixed 4,000-byte file as a document, download it with `bot.download`, compare | `uploaded 4000 bytes, downloaded 4000, identical` | nothing: the message is deleted |
| `account.file` | Saved Messages | upload the same file, send it as a document, download it from the sent message, compare | `uploaded 4000 bytes, downloaded 4000, identical` | nothing: the message is deleted |

The file is made by the harness — a fixed byte pattern named `yuigram-live-check.bin` — so
nothing from the operator's machine is uploaded. Deleting the message is the cleanup and is not
excused if it fails: a failed deletion fails the check and is reported after the failure that
came first, which stays the first thing reported. The checks have been exercised offline against
stand-ins (`tools/live/test/live.test.ts`: refusal without the opt-ins, the round trip, a byte
mismatch, a deletion that fails after a mismatch, a send that names no message); they are
prepared, not verified, until a run is recorded below.
| `bot-account.update` | the bot chat | the bot writes; the account, a member there, must hear it | a message event with the text within 20 seconds | nothing |

## 6. Redaction and cleanup

Every line the harness prints passes through a scrubber holding each secret it was given — the
token, the api hash, the session, the phone number — and anything shaped like a token or a key;
user and chat identifiers are shortened to their last three digits. `login` prints the session's
length and path, never the session. An error from Telegram is printed scrubbed.

Cleanup on Telegram's side is best-effort. Every undo runs whatever the check did, but an undo
is itself a request, and one refused or lost leaves the thing it was undoing in place; the report
says so, and the steps below are how it is found.

Afterwards:

- run `logout`, which ends the authorization `login` created, then delete the session file;
- check the account's active sessions in an official client for anything left, and end it there;
- check the bot chat, the account chat and Saved Messages by hand for anything left behind —
  including `yuigram-live-check.bin` documents, should a deletion have failed;
- delete the login code message in the account's service chat, if the account is kept.

## 7. What still needs a person

Some behaviour has no automatic counterpart, because it is somebody else's action:

- **A reader stopping a stream.** `account.stream-stop` starts the stream and judges it; the
  stop itself is a person tapping it in their client while the drafts arrive. Nothing is sent
  when it stops, because the check leaves `keepOnStop` off.
- **The code, the password and a QR login** are each a person at a phone; `login` asks for the
  first two and does not do the third.
- **Mentions by somebody else**, payments, and anything that costs money.

## 8. The record

For a run, record here: the date, the revision, the network (test or production), the steps and
checks run, and the output as printed.

| Date | Revision | Network | Steps and checks | Result |
| --- | --- | --- | --- | --- |
| — | — | — | — | not yet run |
