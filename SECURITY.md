# Security Policy

Yuigram handles Telegram credentials. A leaked bot token compromises a bot; **a leaked MTProto
session compromises a person's entire Telegram account**. Reports are treated accordingly.

## Reporting a vulnerability

**Do not open a public issue.**

Use [GitHub's private vulnerability reporting](https://github.com/yuigram/yuigram/security/advisories/new)
on this repository.

Please include:

- what the issue is, and which package and version it affects
- how to reproduce it, ideally as a minimal test case
- what an attacker gains
- any suggested fix

Never include real credentials in a report. If a reproduction requires a session or token, say
so and describe the shape of the data rather than pasting it.

## Response

| Stage | Target |
|---|---|
| Acknowledgement | 72 hours |
| Initial assessment | 7 days |
| Fix or mitigation plan | 30 days for high severity |

Fixes are released before public disclosure. Reporters are credited in the advisory unless they
prefer otherwise.

## Scope

In scope:

- cryptographic implementation flaws (AES-IGE, RSA padding, SRP, the key derivations)
- missing or bypassable protocol validation
- leakage of tokens, session material, auth keys or `api_hash` through logs, errors or
  serialization
- authentication and authorization flaws in framework code
- injection, path traversal, SSRF or unsafe deserialization reachable from Telegram input
- denial of service reachable from a single malicious update

Out of scope:

- vulnerabilities in Telegram's own services — report those to Telegram
- issues requiring an already-compromised host
- misuse of the framework in ways the documentation warns against
- account bans resulting from Telegram's own policy enforcement

## For users of Yuigram

A few things worth stating explicitly, because they are the failure modes that actually occur:

**A session string is equivalent to being logged in.** It is not a configuration value. It does
not belong in a repository, a screenshot, a chat message, or a bug report.

**Session files are created with `0600` permissions.** Yuigram warns if it finds wider
permissions. Encryption at rest is available and off by default.

**Callback data is attacker-controlled.** Authorization decisions must use the sender's id,
never the callback payload.

**Obtain your own `api_id` and `api_hash`** from [my.telegram.org](https://my.telegram.org).
Yuigram ships no credentials, and shared credentials produce `API_FLOOD`.

**Userbots carry ban risk.** Telegram monitors unofficial client usage and bans accounts used
for flooding, spamming or faking counters. Use a secondary account for development.
