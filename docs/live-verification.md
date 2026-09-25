# Live verification

Everything else in this repository is verified without Telegram: a mock Bot API transport, a
stand-in datacenter that speaks the real protocol over real sockets, and a browser page against
that datacenter. What none of them can show is that Telegram itself agrees. This is the checklist
for finding out, and `tools/live` is the harness that runs it.

**It has not been run.** Every row below is a check prepared and exercised offline against
stand-ins; none has reached Telegram. A record of a real run goes at the end of this document,
with the revision it was made at.

---

## 1. Before running

| Need | Why |
| --- | --- |
| A **test account**, never a person's own | The account checks sign in with its session string, and the write checks send from it. Telegram's test network is preferred: its accounts are disposable and its datacenters are separate. |
| A **test bot** from @BotFather | The bot checks call the Bot API with its token. |
| A **test group** holding both | The update check has the bot write where the account can hear it. |
| **Telegram's server keys**, as PEM | Published in Telegram's MTProto documentation. The account refuses a datacenter whose key it cannot check; `--list` does not need them, the account checks do. |
| An **application id and hash** | From my.telegram.org, for the account. |

The session string, the token and the api hash are secrets. Keep them in a file outside the
repository or in the shell's environment for the one command, never in shell history, a ticket or
a message. The harness never prints them: every line it writes passes through a scrubber that
removes each one it was given and anything shaped like a token or a key, and user and chat
identifiers are shortened to their last three digits.

## 2. The variables

| Variable | For |
| --- | --- |
| `YUIGRAM_LIVE_CHECKS` | Comma-separated check ids. **Nothing runs without it**, and there is no "all". |
| `YUIGRAM_LIVE_ALLOW_WRITES` | `1` to allow checks that send, edit or delete. A write check must also be named. |
| `YUIGRAM_LIVE_BOT_TOKEN` | The test bot's token. |
| `YUIGRAM_LIVE_BOT_CHAT` | Where the bot may write: the test group, or the operator's private chat with the bot. |
| `YUIGRAM_LIVE_API_ID`, `YUIGRAM_LIVE_API_HASH` | The application's id and hash. |
| `YUIGRAM_LIVE_SESSION` | The test account's session string. |
| `YUIGRAM_LIVE_SESSION_FORMAT` | `portable` (default) or `tl-v3`. |
| `YUIGRAM_LIVE_SERVER_KEYS` | Path to the server keys PEM. |
| `YUIGRAM_LIVE_DC` | `id@host:port` of the account's datacenter, for a `portable` session, which carries no address. |
| `YUIGRAM_LIVE_TEST_NETWORK` | `1` when the account and addresses are the test network's. |
| `YUIGRAM_LIVE_ACCOUNT_CHAT` | Where the account may write besides its Saved Messages: the test group. |

An account is configured when id, hash, session and keys are all set; half of them is an error
naming what is missing. A check needing something not configured is refused, not skipped
silently.

## 3. Running

```bash
pnpm --filter @yuigram/live live --list
```

```bash
YUIGRAM_LIVE_CHECKS=bot.identity,account.connect pnpm --filter @yuigram/live live
```

Each check prints one line — `PASSED`, `FAILED` or `REFUSED`, its id and its time — and what it
observed, scrubbed. The exit code is `0` only when every named check passed, `1` when one failed
or was refused, and `2` when nothing could be run.

## 4. Read-only checks

Run these first. They change nothing.

| Check | Does | A pass looks like |
| --- | --- | --- |
| `bot.identity` | `getMe` | `is_bot true`, a username |
| `bot.webhook` | `getWebhookInfo` | an answer; whether a webhook is set is reported, never changed |
| `bot.commands` | `getMyCommands` | a list, possibly empty |
| `account.connect` | connect with the session, `help.getConfig` | a configuration naming a datacenter; no new long-lived key (the session carried one) |
| `account.identity` | the account reads its own user | an identifier, shortened; whether it is a bot |
| `account.dialogs` | walk at most one conversation | at most one, no error |
| `account.session` | export the session in both layouts and read each back | both carry the same key and datacenter; only lengths are printed |

## 5. Write checks

Only with `YUIGRAM_LIVE_ALLOW_WRITES=1`, and only when named. Each registers the undoing of what
it did before doing the next thing, and every undo runs — newest first — whether the check
passed, failed or threw. A failed undo fails the check.

| Check | Writes where | Does | A pass looks like | Leaves behind |
| --- | --- | --- | --- | --- |
| `bot.message` | the bot chat | send, edit, delete one message | a message id; the edit and the deletion accepted | nothing |
| `account.saved` | Saved Messages | send one message, read the newest back, delete | the newest is the one sent | nothing |
| `account.draft` | Saved Messages | keep a draft, clear it | both accepted | nothing |
| `account.mention` | the account chat | send a message mentioning the account's own username, read it back | it reads back as sent | nothing |
| `account.stream` | Saved Messages | stream text as drafts, then abort before the end | drafts shown; the result says aborted | nothing: anything it sent is deleted |
| `bot-account.update` | the bot chat | the bot writes; the account, a member there, must hear it | a message event with the text within 20 seconds | nothing |

## 6. What still needs a person

Some behaviour has no automatic counterpart, because it is somebody else's action:

- **A reader stopping a stream.** `account.stream` stops by abort. Stopping from the reader's side
  means a person tapping stop in a Telegram client while a stream into their chat runs; record
  whether the stream reported `stopped` and whether `keepOnStop` kept the text.
- **Signing in.** The harness starts from a session string. A phone code, a 2FA password and a QR
  login are each a person at a phone.
- **Mentions by somebody else**, payments, and anything that costs money.

## 7. The record

For a run, record here: the date, the revision, the network (test or production), the checks
named, and the harness output as printed. Check the bot chat and Saved Messages by hand afterwards
for anything left behind.

| Date | Revision | Network | Checks | Result |
| --- | --- | --- | --- | --- |
| — | — | — | — | not yet run |
