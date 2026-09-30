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

| Need | Why |
| --- | --- |
| A **test account**, never a person's own | Every account step acts as it. Telegram's test network is preferred: its accounts are disposable and its datacenters are separate from production. |
| A **test bot** from @BotFather | The bot checks call the Bot API with its token. For the test network, a bot made with the test network's @BotFather. |
| A **test group** holding both | The update check has the bot write where the account can hear it; the mention check writes there as the account. |
| **Telegram's server keys**, as PEM | Published in Telegram's MTProto documentation, for production and for the test network separately. An account refuses a datacenter whose key it does not hold — at the first call, with an error naming the fingerprints offered. |
| An **application id and hash** | From my.telegram.org. |

**Test network accounts.** Telegram's documentation describes test-network numbers of the form
`+99966 X YYYY` — `X` the datacenter, `YYYY` any four digits — which need no SIM: the login code
is `X` repeated five times, and the account may have to be registered on first use with an
official client, since `login` does not register numbers. Prefer one of these to a real number.

The session string, the token and the api hash are secrets; the phone number is treated as one.
Keep them in the shell's environment for one command or in a file outside the repository — never
in shell history, a ticket or a message. The code and the password are **never** variables:
`login` asks for them at the terminal, and the password is read without being echoed.

## 3. The variables

| Variable | For | Secret |
| --- | --- | --- |
| `YUIGRAM_LIVE_CHECKS` | Comma-separated check ids for `live`. **Nothing runs without it**, and there is no "all". | no |
| `YUIGRAM_LIVE_ALLOW_SESSION` | `1` to allow checks that connect as the account. | no |
| `YUIGRAM_LIVE_ALLOW_WRITES` | `1` to allow checks that send, edit or delete. A write check must also be named. | no |
| `YUIGRAM_LIVE_ALLOW_LOGIN` | `1` to run `login`. | no |
| `YUIGRAM_LIVE_ALLOW_LOGOUT` | `1` to run `logout`. | no |
| `YUIGRAM_LIVE_BOT_TOKEN` | The test bot's token. | yes |
| `YUIGRAM_LIVE_BOT_CHAT` | Where the bot may write: the test group, or the operator's private chat with the bot. | no |
| `YUIGRAM_LIVE_API_ID`, `YUIGRAM_LIVE_API_HASH` | The application's id and hash. | the hash |
| `YUIGRAM_LIVE_PHONE` | The test account's number, for `login`. | yes |
| `YUIGRAM_LIVE_SESSION_OUT` | Where `login` writes the session. Must not exist; created readable by its owner only. | the file is |
| `YUIGRAM_LIVE_SESSION` | The session string, for `live` and `logout`. | yes |
| `YUIGRAM_LIVE_SESSION_FORMAT` | `portable` (default) or `tl-v3`, for both writing and reading it. | no |
| `YUIGRAM_LIVE_SERVER_KEYS` | Path to the server keys PEM. | no |
| `YUIGRAM_LIVE_DC` | `id@host:port` of the account's datacenter. Required for `login`, and for a `portable` session, which carries no address. | no |
| `YUIGRAM_LIVE_TEST_NETWORK` | `1` when the account, keys and addresses are the test network's. | no |
| `YUIGRAM_LIVE_ACCOUNT_CHAT` | Where the account may write besides its Saved Messages: the test group. | no |

An account for `live` is configured when id, hash, session and keys are all set; half of them is an
error naming what is missing, never a value. A check needing something not configured, or not
allowed, is refused with the reason, not skipped silently.

## 4. Running, in order

List what exists, touching nothing:

```bash
pnpm --filter @yuigram/live live --list
```

**Sign in.** Creates an authorization. Prompts for the code, and for the password if the account
has one; writes the session to `YUIGRAM_LIVE_SESSION_OUT` and prints only its length.

```bash
YUIGRAM_LIVE_ALLOW_LOGIN=1 YUIGRAM_LIVE_API_ID=… YUIGRAM_LIVE_API_HASH=… YUIGRAM_LIVE_SERVER_KEYS=… YUIGRAM_LIVE_DC=… YUIGRAM_LIVE_TEST_NETWORK=1 YUIGRAM_LIVE_PHONE=… YUIGRAM_LIVE_SESSION_OUT=… pnpm --filter @yuigram/live login
```

Expected: `a code was sent to the account`, the prompts, then `signed in; the session (N
characters) was written to …`. A number with no account is refused rather than registered.

**Bot reads.** Change nothing.

```bash
YUIGRAM_LIVE_CHECKS=bot.identity,bot.webhook,bot.commands YUIGRAM_LIVE_BOT_TOKEN=… pnpm --filter @yuigram/live live
```

**Session checks.** Connect as the account; no messages.

```bash
YUIGRAM_LIVE_ALLOW_SESSION=1 YUIGRAM_LIVE_CHECKS=account.connect,account.identity,account.dialogs,account.session YUIGRAM_LIVE_API_ID=… YUIGRAM_LIVE_API_HASH=… YUIGRAM_LIVE_SESSION=… YUIGRAM_LIVE_SERVER_KEYS=… YUIGRAM_LIVE_DC=… YUIGRAM_LIVE_TEST_NETWORK=1 pnpm --filter @yuigram/live live
```

**Writes.** Named one by one, with the chats they write to.

```bash
YUIGRAM_LIVE_ALLOW_SESSION=1 YUIGRAM_LIVE_ALLOW_WRITES=1 YUIGRAM_LIVE_CHECKS=bot.message,account.saved,account.draft,account.mention,account.stream,bot-account.update YUIGRAM_LIVE_BOT_TOKEN=… YUIGRAM_LIVE_BOT_CHAT=… YUIGRAM_LIVE_ACCOUNT_CHAT=… YUIGRAM_LIVE_API_ID=… YUIGRAM_LIVE_API_HASH=… YUIGRAM_LIVE_SESSION=… YUIGRAM_LIVE_SERVER_KEYS=… YUIGRAM_LIVE_DC=… YUIGRAM_LIVE_TEST_NETWORK=1 pnpm --filter @yuigram/live live
```

**Sign out.** Ends the authorization `login` created.

```bash
YUIGRAM_LIVE_ALLOW_LOGOUT=1 YUIGRAM_LIVE_API_ID=… YUIGRAM_LIVE_API_HASH=… YUIGRAM_LIVE_SESSION=… YUIGRAM_LIVE_SERVER_KEYS=… YUIGRAM_LIVE_DC=… YUIGRAM_LIVE_TEST_NETWORK=1 pnpm --filter @yuigram/live logout
```

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
| `bot-account.update` | the bot chat | the bot writes; the account, a member there, must hear it | a message event with the text within 20 seconds | nothing |

## 6. Redaction and cleanup

Every line the harness prints passes through a scrubber holding each secret it was given — the
token, the api hash, the session, the phone number — and anything shaped like a token or a key;
user and chat identifiers are shortened to their last three digits. `login` prints the session's
length and path, never the session. An error from Telegram is printed scrubbed.

Afterwards:

- run `logout`, which ends the authorization `login` created, then delete the session file;
- check the account's active sessions in an official client for anything left, and end it there;
- check the bot chat, the account chat and Saved Messages by hand for anything left behind;
- delete the login code message in the account's service chat, if the account is kept.

## 7. What still needs a person

Some behaviour has no automatic counterpart, because it is somebody else's action:

- **A reader stopping a stream.** `account.stream` stops by abort. Stopping from the reader's side
  means a person tapping stop in a Telegram client while a stream into their chat runs; record
  whether the stream reported `stopped` and whether `keepOnStop` kept the text.
- **The code, the password and a QR login** are each a person at a phone; `login` asks for the
  first two and does not do the third.
- **Mentions by somebody else**, payments, and anything that costs money.

## 8. The record

For a run, record here: the date, the revision, the network (test or production), the steps and
checks run, and the output as printed.

| Date | Revision | Network | Steps and checks | Result |
| --- | --- | --- | --- | --- |
| — | — | — | — | not yet run |
